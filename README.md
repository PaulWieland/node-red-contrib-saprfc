# node-red-contrib-saprfc

Currently in Alpha state.

Node-Red (http://nodered.org) nodes for communicating with SAP via node-rfc (https://github.com/SAP/node-rfc).

There are three nodes included:

* call - used to make a remote function or BAPI call.
* read table - query a table. a wrapper for RFC\_READ\_TABLE which allows you to query a table with conditions and returns parsed rows.
* field list - gets the field list of a table. This is a wrapper for RFC\_READ\_TABLE which only gets the field list.


# Install

## Woah cowboy...
This package is a wrapper for node-rfc (https://github.com/SAP/node-rfc). Make sure you have a working install of node-rfc before continuing.

## Okay, I have a working node-rfc install
Run the following command after you have done a global install of Node-RED & node-rfc

	npm install -g node-red-contrib-saprfc

You will need the connection parameters for your sap system.

# Usage

These nodes will appear in their own "sapRFC" catagory on the Node-Red pallet.


# Disclaimer

Use these programs at your own risk.

# Author

Paul Wieland, https://github.com/PaulWieland

# Feedback and Support

Submit any issues here on github, or ping me @Paul W on the node-red slack channel.
