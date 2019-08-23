module.exports = function(RED) {
	"use strict";

	var rfcPool = require('node-rfc').Pool;
	var async = require("async");

    function sapRFCNode(config) {
        RED.nodes.createNode(this,config);
		
		this.pool = function(node){
			var systemConfig = {
				user: node.credentials.username,
				passwd: node.credentials.password,
				ashost: node.credentials.host,
				sysnr: node.credentials.systemNumber,
				client: node.credentials.client,
				lang: node.credentials.lang,
			}
					
			// create the saprouter property only if its defined in the config
			node.credentials.sapRouter ? systemConfig.saprouter = node.credentials.sapRouter : null;

			return new rfcPool(systemConfig);
		}(this);

		// Build an async queue processor to limit the number of nodes submitting parallel requests to the pool
		// ToDo: Check to see if the performance improves when using more than 4 connections. If yes, make queue limit a configurable option.
		this.queue = async.queue(function(task,callback){
			task.node.status({fill:"yellow", shape:"dot", text:"Connecting"});
			
			// TODO check if the client isAlive, if not re-establish the connection
			// task.pool.acquire()
			// .then(client => {
			// 	if(!client.isAlive){
			// 		let config = RED.nodes.getNode(config.system);
			// 		config.pool(config);
			// 	}
			//
			// });
			
			
			task.pool.acquire()
			.then(client => {
				task.node.status(task.status_start);
								
				client
					.call(task.rfc_name, task.rfc_structure)
					.then(res => {
						// release the connection
						task.pool.release(client);
						
						// update the node status
						task.node.status(task.status_success);

						// process the result
						task.msg.payload = task.postProcessor(res);

						// send message to next node in flow
						task.node.send(task.msg);
						
						// advance the queue
						callback();
					})
					.catch(err => {
						task.pool.release(client);
						callback();
						
						task.node.status(task.status_error);

						task.msg.sapError = err;
						task.node.error("[saprfc] " + task.msg.key + "; use `catch` node to debug msg.sapError", task.msg);
					});
			})
			.catch(err => {
				callback();
				
				task.node.status({fill:"red",shape:"dot",text:"Connection Error"});

				task.msg.sapError = err;
				task.node.error("[saprfc] " + task.msg.key + "; use `catch` node to debug msg.sapError", task.msg);
			})
		}, 4);
		
		// Async Queue error handler
		this.queue.error(function(err, task) {
			task.node.status({fill:"red",shape:"dot",text:"Queue Error"});

			task.msg.sapError = err;
			task.node.error("[saprfc] " + task.msg.key + "; use `catch` node to debug msg.sapError", task.msg);
			
		    console.error('Task experienced an error', err);
		});

	}
	
	RED.nodes.registerType("saprfc-config", sapRFCNode,{
		credentials: {
			nickname: {type: "text"},
			host: {type: "text"},
			client: {type: "text"},
			systemNumber: {type: "text"},
			sapRouter: {type: "text"},
			username: {type: "text"},
			password: {type: "password"},
			lang: {type: "text"}
		},
	});
	

	function sapRFCCallNode(config){
        RED.nodes.createNode(this,config);
		this.systemConfig = RED.nodes.getNode(config.system);
								
        var node = this;
        node.on('input', function(msg) {
			this.systemConfig.queue.push({
				pool: this.systemConfig.pool,
				node: node,
				msg: msg,
				status_start: {fill:"green", shape:"dot", text:"Calling "+config.remoteFunction},
				status_success: {},
				status_error: {fill:"red",shape:"dot",text:"Error"},
				rfc_name: config.remoteFunction,
				rfc_structure: msg.payload,
				postProcessor: function(res){
					return res;
				}
			});
        });
    }
	
    RED.nodes.registerType("call",sapRFCCallNode);
	
	function sapRFCReadTable(config){
        RED.nodes.createNode(this,config);
		this.systemConfig = RED.nodes.getNode(config.system);
		
        let node = this;
				
        node.on('input', function(msg) {
			let rfcStructure = {
				QUERY_TABLE: config.table || msg.payload.QUERY_TABLE,
				FIELDS: Array.isArray(config.selectedFields) ? config.selectedFields : Array.isArray(msg.payload.FIELDS) ? msg.payload.FIELDS : [],
				OPTIONS: Array.isArray(msg.payload.OPTIONS) ? msg.payload.OPTIONS : [],
				ROWCOUNT: Number.isInteger(msg.payload.ROWCOUNT) ? msg.payload.ROWCOUNT : 0,
				ROWSKIPS: Number.isInteger(msg.payload.ROWSKIPS) ? msg.payload.ROWSKIPS : 0
			}
			
			// console.log(config, node, rfcStructure);
			
			this.systemConfig.queue.push({
				pool: this.systemConfig.pool,
				node: node,
				msg: msg,
				status_start: {fill:"green", shape:"dot", text:"Calling RFC_READ_TABLE"},
				status_success: {},
				status_error: {fill:"red",shape:"dot",text:"Error"},
				rfc_name: "RFC_READ_TABLE",
				rfc_structure: rfcStructure,
				postProcessor: function(res){
					var payload = [];
					
					res.DATA.forEach((row) => {
						var out = {};

						res.FIELDS.forEach((col) => {
							out[col.FIELDNAME] = row.WA.substr(col.OFFSET, col.LENGTH).trim();
						});

						payload.push(out);
					});
					
					return payload;
				}
			});
        });
		
    }
	
    RED.nodes.registerType("read table",sapRFCReadTable, {
    	settings: {
    		table: { exportable: true },
			selectedFields: { exportable: true }
    	}
    });

	function sapRFCDescribeTable(config){
        RED.nodes.createNode(this,config);
		this.systemConfig = RED.nodes.getNode(config.system);
								
        var node = this;
				
        node.on('input', function(msg) {
			this.systemConfig.queue.push({
				pool: this.systemConfig.pool,
				node: node,
				msg: msg,
				status_start: {fill:"green", shape:"dot", text:"Reading table"},
				status_success: {},
				status_error: {fill:"red",shape:"dot",text:"Error"},
				rfc_name: "RFC_READ_TABLE",
				rfc_structure: {
					QUERY_TABLE: config.table,
					NO_DATA: "X"
				},
				postProcessor: function(res){
					if(config.condense){
						var payload = {};
						
						res.FIELDS.forEach((field) => {
							payload[field.FIELDNAME] = field.FIELDTEXT;
						})
					}else{
						var payload = res.FIELDS;
					}
					
					return payload;
				}
			});
        });
    }
	
    RED.nodes.registerType("field list",sapRFCDescribeTable);
	
	RED.httpAdmin.post("/saprfc_table_fields", RED.auth.needsPermission('saprfc.read'), function(req,res){
		let node = RED.nodes.getNode(req.body.nodeId);
		let table = req.body.table;
		let pool = node.systemConfig.pool;
		
		pool.acquire()
		.then(client => {
			node.status({fill:"green", shape:"dot", text:"Requesting table fields"});
			
			client
				.call("RFC_READ_TABLE", {QUERY_TABLE: table,NO_DATA: "X"})
				.then(table => {
					// release the connection
					pool.release(client);
					
					// update the node status
					node.status({});

					// process the result
					let fieldList = [];

					table.FIELDS.forEach((field) => {
						fieldList.push({id: field.FIELDNAME, label: field.FIELDTEXT});
					})

					res.json({
						table: req.body.table,
						fieldList: fieldList
					});
				})
				.catch(err => {
					res.json({
						error: true
					});
					
					pool.release(client);
					
					node.status({fill:"red", shape:"dot", text: "Error getting table fields"});

					node.error("[saprfc]; use `catch` node to debug msg.sapError", err);
				});
		})
		.catch(err => {
			callback();
			
			task.node.status({fill:"red",shape:"dot",text:"Connection Error"});

			task.msg.sapError = err;
			task.node.error("[saprfc] " + task.msg.key + "; use `catch` node to debug msg.sapError", task.msg);
		})
		
	});

}

