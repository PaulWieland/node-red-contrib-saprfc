module.exports = function(RED) {
	"use strict";
	var rfcClient = require('node-rfc').Client;
	

    function sapRFCNode(config) {
        RED.nodes.createNode(this,config);
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
			
			var systemConfig = {
				user: this.systemConfig.credentials.username,
				passwd: this.systemConfig.credentials.password,
				ashost: this.systemConfig.credentials.host,
				sysnr: this.systemConfig.credentials.systemNumber,
				client: this.systemConfig.credentials.client,
				lang: this.systemConfig.credentials.lang,
				// saprouter: this.systemConfig.credentials.sapRouter ; even if undefined, the node-rfc client tries to use it and fails. The property must be unset if no router is needed.
			}
			
			// create the saprouter property only if its defined in the config
			this.systemConfig.credentials.sapRouter ? systemConfig.saprouter = this.systemConfig.credentials.sapRouter : "";
				
			
			var client = new rfcClient(systemConfig);

			node.status({fill:"yellow",shape:"ring", text:"Opening"});
			
			client.open().then(() => {
				node.status({fill:"green", shape:"dot", text:"Calling "+config.remoteFunction});
				
				client.call(
					config.remoteFunction,
					msg.payload
				).then((res) => {
					client.close();
					
					node.status({});
					
					msg.payload = res;
					node.send(msg);
				}).catch((err) => {
					client.close();
					
					node.status({fill:"red",shape:"dot",text:"Error"});
					
					msg.sapError = err;
					node.error("[saprfc:client.call] " + msg.key + "; use `catch` node to debug msg.sapError", msg);
					
				});
			}).catch((err) => {
				client.close();
				
				node.status({fill:"red",shape:"dot",text:"Connection Error"});
				msg.sapError = err;
				node.error("[saprfc:client.open] use `catch` node to debug msg.sapError", msg);
			});
			
        });
    }
	
    RED.nodes.registerType("call",sapRFCCallNode);
	
	function sapRFCReadTable(config){
        RED.nodes.createNode(this,config);
		this.systemConfig = RED.nodes.getNode(config.system);
								
        var node = this;
        node.on('input', function(msg) {
			
			var systemConfig = {
				user: this.systemConfig.credentials.username,
				passwd: this.systemConfig.credentials.password,
				ashost: this.systemConfig.credentials.host,
				sysnr: this.systemConfig.credentials.systemNumber,
				client: this.systemConfig.credentials.client,
				lang: this.systemConfig.credentials.lang,
			}
						
			// create the saprouter property only if its defined in the config
			this.systemConfig.credentials.sapRouter ? systemConfig.saprouter = this.systemConfig.credentials.sapRouter : "";
				
			var client = new rfcClient(systemConfig);

			node.status({fill:"yellow",shape:"ring", text:"Opening"});
			
			client.open().then(() => {
				node.status({fill:"green", shape:"dot", text:"Calling RFC_READ_TABLE"});
				
				client.call(
					"RFC_READ_TABLE",
					msg.payload
				).then((res) => {
					client.close();
					
					node.status({});
					
					msg.payload = [];

					res.DATA.forEach((row) => {
						var out = {};

						res.FIELDS.forEach((col) => {
							out[col.FIELDNAME] = row.WA.substr(col.OFFSET, col.LENGTH).trim();
						});

						msg.payload.push(out);
					});

					node.send(msg);
				}).catch((err) => {
					client.close();
					
					console.error("[saprfc:sapRFCReadTable -> client.call] ",err);
					
					node.status({fill:"red",shape:"dot",text:"Error"});
					
					msg.sapError = err;
					node.error("[saprfc:client.call] " + msg.key + "; use `catch` node to debug msg.sapError", msg);
					
				});
			}).catch((err) => {
				client.close();
				
				node.status({fill:"red",shape:"dot",text:"Connection Error"});
				msg.sapError = err;
				node.error("[saprfc:client.open] use `catch` node to debug msg.sapError", msg);
			});

        });
    }
	
    RED.nodes.registerType("read table",sapRFCReadTable);

	function sapRFCDescribeTable(config){
        RED.nodes.createNode(this,config);
		this.systemConfig = RED.nodes.getNode(config.system);
								
        var node = this;
        node.on('input', function(msg) {
			
			var systemConfig = {
				user: this.systemConfig.credentials.username,
				passwd: this.systemConfig.credentials.password,
				ashost: this.systemConfig.credentials.host,
				sysnr: this.systemConfig.credentials.systemNumber,
				client: this.systemConfig.credentials.client,
				lang: this.systemConfig.credentials.lang,
			}
			
			// create the saprouter property only if its defined in the config
			this.systemConfig.credentials.sapRouter ? systemConfig.saprouter = this.systemConfig.credentials.sapRouter : "";
				
			var client = new rfcClient(systemConfig);

			node.status({fill:"yellow",shape:"ring", text:"Opening"});
			
			client.open().then(() => {
				node.status({fill:"green", shape:"dot", text:"Reading table"});
				
				client.call(
					"RFC_READ_TABLE",
					{
						QUERY_TABLE: config.table,
						NO_DATA: "X"
					}
				).then((res) => {
					client.close();
					
					node.status({});
					
					if(config.condense){
						msg.payload = {};
						
						res.FIELDS.forEach((field) => {
							msg.payload[field.FIELDNAME] = field.FIELDTEXT;
						})
					}else{
						msg.payload = res.FIELDS;
					}

					node.send(msg);
				}).catch((err) => {
					client.close();
					
					node.status({fill:"red",shape:"dot",text:"Error"});
					
					msg.sapError = err;
					node.error("[saprfc:client.call] " + msg.key + "; use `catch` node to debug msg.sapError", msg);
				});
			}).catch((err) => {
				client.close();
				
				node.status({fill:"red",shape:"dot",text:"Connection Error"});
				msg.sapError = err;
				node.error("[saprfc:client.open] use `catch` node to debug msg.sapError", msg);
			});
						
        });
    }
	
    RED.nodes.registerType("field list",sapRFCDescribeTable);


}

