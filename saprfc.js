module.exports = function(RED) {
	"use strict";

	var rfcPool = require('node-rfc').Pool;
	var async = require("async");

	function sapRFCNode(config) {
		RED.nodes.createNode(this, config);
		var node = this;

		this.nickname = config.nickname;
		this.host = config.host;
		this.client = config.client;
		this.systemNumber = config.systemNumber;
		this.sapRouter = config.sapRouter;
		this.lang = config.lang;

		try {
			this.pool = function(node) {
				var credentials = node.credentials || {};
				var systemConfig = {
					user: credentials.username,
					passwd: credentials.password,
					ashost: node.host || credentials.host,
					sysnr: node.systemNumber || credentials.systemNumber,
					client: node.client || credentials.client,
					lang: node.lang || credentials.lang || "EN",
				}

				var sapRouter = node.sapRouter || credentials.sapRouter;
				// create the saprouter property only if its defined in the config
				if (sapRouter) {
					systemConfig.saprouter = sapRouter;
				}

				return new rfcPool({
					connectionParameters: systemConfig
				});
			}(this);
		} catch (err) {
			console.error("[sapRFC:pool]: ", err);
		}

		// Build an async queue processor to limit the number of nodes submitting parallel requests to the pool
		// ToDo: Check to see if the performance improves when using more than 4 connections. If yes, make queue limit a configurable option.
		this.queue = async.queue(function(task, callback) {
			task.node.status({
				fill: "yellow",
				shape: "dot",
				text: "Connecting"
			});

			task.pool.acquire()
				.then(client => {
					return client.ping().then(isAlive => {
						if (isAlive === true) {
							return client;
						}
						throw new Error("Connection dead");
					}).catch(err => {
						task.node.status({
							fill: "yellow",
							shape: "dot",
							text: "Reconnecting"
						});
						
						if (typeof client.reopen === 'function') {
							return client.reopen().then(() => client);
						} else {
							// For node-rfc >= 2.x, a failed ping() triggers an internal auto-reconnect.
							// We ping a second time to see if that auto-reconnect succeeded.
							return client.ping().then(isAlive => {
								if (isAlive === true) return client;
								throw err;
							}).catch(() => {
								throw err;
							});
						}
					});
				})
				.then(client => {
					// insert the current queue length into the status start text
					task.status_start.text = `(${node.queue.length()}) ${task.status_start.text}`;

					// update the node's visual status
					task.node.status(task.status_start);

					client
						.call(task.rfc_name, task.rfc_structure)
						.then(res => {
							if (task.bapiCommit) {
								// Check for errors in the RETURN structure/table
								let hasError = false;
								if (res.RETURN) {
									let retArray = Array.isArray(res.RETURN) ? res.RETURN : [res.RETURN];
									hasError = retArray.some(r => r.TYPE === 'E' || r.TYPE === 'A');
								}

								if (hasError) {
									return client.call("BAPI_TRANSACTION_ROLLBACK").then(rollbackRes => {
										if (typeof res === "object" && res !== null) {
											res.BAPI_TRANSACTION_ROLLBACK = rollbackRes;
											res.bapiCommitStatus = "Rolled Back (Errors found)";
										}
										return res;
									});
								} else {
									return client.call("BAPI_TRANSACTION_COMMIT", { WAIT: "X" }).then(commitRes => {
										if (typeof res === "object" && res !== null) {
											res.BAPI_TRANSACTION_COMMIT = commitRes;
											res.bapiCommitStatus = "Committed";
										}
										return res;
									});
								}
							}
							return res;
						})
						.then(res => {
							// release the connection
							task.pool.release(client);

							// update the node status
							task.node.status(task.status_success);

							// process the result
							task.msg.payload = task.postProcessor(res);

							// send message to next node in flow
							if (task.send) {
								task.send(task.msg);
							} else {
								task.node.send(task.msg);
							}

							if (task.done) {
								task.done();
							}

							// advance the queue
							callback();
						})
						.catch(err => {
							console.error("[sapRFC:call] ", err);
							task.pool.release(client);

							task.node.status(task.status_error);

							task.msg.sapError = err;
							if (task.done) {
								task.done(err);
							} else {
								task.node.error(err, task.msg);
							}

							callback();
						});
				})
				.catch(err => {
					console.error("[sapRFC:pool.aquire] ", err);

					task.node.status({
						fill: "red",
						shape: "dot",
						text: "Connection Error"
					});

					task.msg.sapError = err;
					if (task.done) {
						task.done(err);
					} else {
						task.node.error(err, task.msg);
					}

					callback();
				});
		}, 4);

	}

	RED.nodes.registerType("saprfc-config", sapRFCNode, {
		credentials: {
			username: {
				type: "text"
			},
			password: {
				type: "password"
			}
		},
	});

	function normalizeFields(val) {
		if (val === undefined || val === null) return [];
		if (typeof val === "string") {
			return val.split(",").map(f => f.trim()).filter(Boolean);
		}
		if (Array.isArray(val)) {
			return val.map(f => {
				if (typeof f === "string") return f.trim();
				if (typeof f === "object" && f !== null) return f.FIELDNAME || f.id || f.name || f;
				return f;
			}).filter(Boolean);
		}
		return [];
	}

	function normalizeOptions(val) {
		if (val === undefined || val === null) return [];
		if (typeof val === "string") {
			var trimmed = val.trim();
			return trimmed ? [trimmed] : [];
		}
		if (Array.isArray(val)) {
			return val.map(opt => {
				if (typeof opt === "string") return opt;
				if (typeof opt === "object" && opt !== null && opt.TEXT) return opt.TEXT;
				return String(opt);
			});
		}
		return [];
	}

	function parseInteger(val, defaultVal) {
		if (val === undefined || val === null) return defaultVal;
		var parsed = parseInt(val, 10);
		return Number.isInteger(parsed) && parsed >= 0 ? parsed : defaultVal;
	}

	function sapRFCCallNode(config) {
		try {
			RED.nodes.createNode(this, config);
			this.systemConfig = RED.nodes.getNode(config.system);
			var node = this;

			node.on('input', function(msg, send, done) {
				send = send || function() { node.send.apply(node, arguments); };
				done = done || function(err) { if (err) node.error(err, msg); };

				if (!node.systemConfig || !node.systemConfig.queue || !node.systemConfig.pool) {
					var sysErr = new Error("SAP System configuration node is not set or invalid");
					node.status({ fill: "red", shape: "ring", text: "No system configured" });
					node.error(sysErr, msg);
					done(sysErr);
					return;
				}

				var rfcName = msg.rfc || config.remoteFunction;
				if (!rfcName) {
					var rfcErr = new Error("No RFC function name specified in node configuration or msg.rfc");
					node.status({ fill: "red", shape: "ring", text: "No RFC specified" });
					node.error(rfcErr, msg);
					done(rfcErr);
					return;
				}

				var rfcParams = (msg.payload !== undefined && typeof msg.payload === "object" && msg.payload !== null) ? msg.payload : {};

				var bapiCommit = msg.bapiCommit !== undefined ? Boolean(msg.bapiCommit) : (config.bapiCommit === true || config.bapiCommit === "true");

				node.systemConfig.queue.push({
					pool: node.systemConfig.pool,
					node: node,
					msg: msg,
					send: send,
					done: done,
					status_start: {
						fill: "green",
						shape: "dot",
						text: `Calling ${rfcName}`
					},
					status_success: {},
					status_error: {
						fill: "red",
						shape: "dot",
						text: "Error"
					},
					rfc_name: rfcName,
					rfc_structure: rfcParams,
					bapiCommit: bapiCommit,
					postProcessor: function(res) {
						return res;
					}
				});
			});

			node.on('close', function() {
				node.status({});
			});
		} catch (err) {
			console.error("[sapRFC:sapRFCCallNode] ", err);
		}
	}

	RED.nodes.registerType("call", sapRFCCallNode);

	function sapRFCReadTable(config) {
		RED.nodes.createNode(this, config);
		this.systemConfig = RED.nodes.getNode(config.system);

		let node = this;

		node.on('input', function(msg, send, done) {
			send = send || function() { node.send.apply(node, arguments); };
			done = done || function(err) { if (err) node.error(err, msg); };

			if (!node.systemConfig || !node.systemConfig.queue || !node.systemConfig.pool) {
				var sysErr = new Error("SAP System configuration node is not set or invalid");
				node.status({ fill: "red", shape: "ring", text: "No system configured" });
				node.error(sysErr, msg);
				done(sysErr);
				return;
			}

			var payloadObj = (typeof msg.payload === "object" && msg.payload !== null) ? msg.payload : null;
			var table = msg.table || config.table || (payloadObj && payloadObj.QUERY_TABLE);

			if (!table) {
				var tableErr = new Error("No table specified in node configuration or msg.table");
				node.status({ fill: "red", shape: "ring", text: "No table specified" });
				node.error(tableErr, msg);
				done(tableErr);
				return;
			}

			// Fields resolution: msg.fields > payloadObj.FIELDS > config.selectedFields
			var fields = [];
			if (msg.fields !== undefined) {
				fields = normalizeFields(msg.fields);
			} else if (payloadObj && payloadObj.FIELDS !== undefined) {
				fields = normalizeFields(payloadObj.FIELDS);
			} else if (Array.isArray(config.selectedFields) && config.selectedFields.length > 0) {
				fields = config.selectedFields;
			}

			// Options resolution (WHERE conditions): msg.options > payloadObj.OPTIONS
			var options = [];
			if (msg.options !== undefined) {
				options = normalizeOptions(msg.options);
			} else if (payloadObj && payloadObj.OPTIONS !== undefined) {
				options = normalizeOptions(payloadObj.OPTIONS);
			}

			// Rowcount: msg.rowcount > payloadObj.ROWCOUNT > 0
			var rowcount = 0;
			if (msg.rowcount !== undefined) {
				rowcount = parseInteger(msg.rowcount, 0);
			} else if (payloadObj && payloadObj.ROWCOUNT !== undefined) {
				rowcount = parseInteger(payloadObj.ROWCOUNT, 0);
			}

			// Rowskips: msg.rowskips > payloadObj.ROWSKIPS > 0
			var rowskips = 0;
			if (msg.rowskips !== undefined) {
				rowskips = parseInteger(msg.rowskips, 0);
			} else if (payloadObj && payloadObj.ROWSKIPS !== undefined) {
				rowskips = parseInteger(payloadObj.ROWSKIPS, 0);
			}

			var rfcStructure = {
				QUERY_TABLE: table,
				FIELDS: fields,
				OPTIONS: options,
				ROWCOUNT: rowcount,
				ROWSKIPS: rowskips
			};

			node.systemConfig.queue.push({
				pool: node.systemConfig.pool,
				node: node,
				msg: msg,
				send: send,
				done: done,
				status_start: {
					fill: "green",
					shape: "dot",
					text: `Reading ${table}`
				},
				status_success: {},
				status_error: {
					fill: "red",
					shape: "dot",
					text: "Error"
				},
				rfc_name: "RFC_READ_TABLE",
				rfc_structure: rfcStructure,
				postProcessor: function(res) {
					var payload = [];
					if (res && Array.isArray(res.DATA) && Array.isArray(res.FIELDS)) {
						res.DATA.forEach((row) => {
							var out = {};
							res.FIELDS.forEach((col) => {
								out[col.FIELDNAME] = row.WA.substr(col.OFFSET, col.LENGTH).trim();
							});
							payload.push(out);
						});
					}
					return payload;
				}
			});
		});

		node.on('close', function() {
			node.status({});
		});

	}

	RED.nodes.registerType("read table", sapRFCReadTable);

	function sapRFCDescribeTable(config) {
		RED.nodes.createNode(this, config);
		this.systemConfig = RED.nodes.getNode(config.system);

		var node = this;

		node.on('input', function(msg, send, done) {
			send = send || function() { node.send.apply(node, arguments); };
			done = done || function(err) { if (err) node.error(err, msg); };

			if (!node.systemConfig || !node.systemConfig.queue || !node.systemConfig.pool) {
				var sysErr = new Error("SAP System configuration node is not set or invalid");
				node.status({ fill: "red", shape: "ring", text: "No system configured" });
				node.error(sysErr, msg);
				done(sysErr);
				return;
			}

			var payloadObj = (typeof msg.payload === "object" && msg.payload !== null) ? msg.payload : null;
			var table = msg.table || config.table || (typeof msg.payload === "string" ? msg.payload.trim() : (payloadObj && payloadObj.QUERY_TABLE));

			if (!table) {
				var tableErr = new Error("No table specified in node configuration or msg.table");
				node.status({ fill: "red", shape: "ring", text: "No table specified" });
				node.error(tableErr, msg);
				done(tableErr);
				return;
			}

			var condense = msg.condense !== undefined ? Boolean(msg.condense) : (config.condense === true || config.condense === "checked" || config.condense === "true");

			node.systemConfig.queue.push({
				pool: node.systemConfig.pool,
				node: node,
				msg: msg,
				send: send,
				done: done,
				status_start: {
					fill: "green",
					shape: "dot",
					text: `Reading fields: ${table}`
				},
				status_success: {},
				status_error: {
					fill: "red",
					shape: "dot",
					text: "Error"
				},
				rfc_name: "RFC_READ_TABLE",
				rfc_structure: {
					QUERY_TABLE: table,
					NO_DATA: "X"
				},
				postProcessor: function(res) {
					if (condense) {
						var payload = {};
						if (res && Array.isArray(res.FIELDS)) {
							res.FIELDS.forEach((field) => {
								payload[field.FIELDNAME] = field.FIELDTEXT;
							});
						}
						return payload;
					} else {
						return (res && res.FIELDS) ? res.FIELDS : [];
					}
				}
			});
		});

		node.on('close', function() {
			node.status({});
		});
	}

	RED.nodes.registerType("field list", sapRFCDescribeTable);

	RED.httpAdmin.post("/saprfc_table_fields", RED.auth.needsPermission('saprfc.read'), function(req, res) {
		let systemConfig = RED.nodes.getNode(req.body.systemConfig);
		let table = req.body.table;

		if (systemConfig === null) {
			// console.error("[sapRFC] systemConfig not set");
			res.json({
				error: true,
				message: "System is not set",
				sapError: {}
			});
			return;
		}

		let pool = systemConfig.pool;

		pool.acquire()
			.then(client => {
				return client.ping().then(isAlive => {
					if (isAlive === true) {
						return client;
					}
					throw new Error("Connection dead");
				}).catch(err => {
					if (typeof client.reopen === 'function') {
						return client.reopen().then(() => client);
					} else {
						return client.ping().then(isAlive => {
							if (isAlive === true) return client;
							throw err;
						}).catch(() => {
							throw err;
						});
					}
				});
			})
			.then(client => {
				client
					.call("RFC_READ_TABLE", {
						QUERY_TABLE: table,
						NO_DATA: "X"
					})
					.then(table => {
						// release the connection
						pool.release(client);

						// process the result
						let fieldList = [];

						table.FIELDS.forEach((field) => {
							fieldList.push({
								id: field.FIELDNAME,
								label: field.FIELDTEXT
							});
						})

						res.json({
							table: req.body.table,
							fieldList: fieldList
						});
					})
					.catch(err => {
						console.error("[sapRFC:admin.call] ", err);
						res.json({
							error: true,
							message: "Could not get table fields",
							sapError: err
						});

						pool.release(client);
					});
			})
			.catch(err => {
				console.error("[sapRFC:admin.pool.acquire] ", err);
				res.json({
					error: true,
					message: "Connection error",
					sapError: err
				});
			})

	});

}
