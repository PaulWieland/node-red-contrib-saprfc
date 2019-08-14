# node-red-contrib-saprfc

Currently in Beta state.

Node-Red (http://nodered.org) nodes for communicating with SAP via node-rfc (https://github.com/SAP/node-rfc).

There are three nodes included:

* call - used to make a remote function or BAPI call.
* read table - query a table. a wrapper for RFC\_READ\_TABLE which allows you to query a table with conditions and returns parsed rows.
* field list - gets the field list of a table. This is a wrapper for RFC\_READ\_TABLE which only gets the field list.

![image](https://user-images.githubusercontent.com/4663918/63022233-76304400-be70-11e9-8516-cab988df6b1e.png)


# Install

## Woah cowboy...
This package is a wrapper for [node-rfc](https://github.com/SAP/node-rfc), which relies on the [SAP NW RFC SDK](http://sap.github.io/node-rfc/install.html). Make sure you have a working install of node-rfc before continuing.

## Okay, I have a working node-rfc install
Run the following command after you have done a global install of Node-RED & node-rfc

	npm install -g node-red-contrib-saprfc

You will need the connection parameters for your SAP system, which can usually be obtained from your SAP GUI Logon.

# Usage

These nodes will appear in their own "sapRFC" catagory on the Node-Red pallet.

## Config
After adding the first node, you have to configure the connection to your SAP system.

This node sets up a node-rfc connection pool and an async queue which limits the amount of simultaneous connections to 4. In testing, there does not seem to be a performance gain for using more than 4 connections. The queue is processed first in first out.


## Field List
The __field list__ node is the easiest to use. It is a wrapper around _RFC\_READ\_TABLE_ - you only need to enter the table name for which you would like to get the list of fields and wire it to a debug node to inspect the output.

Use the condense flag to convert the standard output from the RFC to a simple object where each property is the technical name of the table and it's value is the display name.

## Read Table
The __read table__ node is a wrapper around _RFC\_READ\_TABLE_. It converts the result into a native Array of JS Objects, each representing one result row.

To use the node, you have to use a _function_ node pass a structure with the import parameters.
Here is an example function node which builds the import structure:

```javascript
var date = new Date();

msg.payload = {
  QUERY_TABLE: "MARA",
  FIELDS: ["MATNR","ERSDA","ERNAM"],
  OPTIONS: ["ERSDA >= '"+date.getFullYear()+""+("0" + (date.getMonth() - 2)).slice(-2)+""+("0" + date.getDate()).slice(-2)+"'"],
  ROWCOUNT: 10
}
return msg;
```

## Call

The __call__ node allows you to call any SAP RFC you would like. Just like the __read table__ node, you must use a _function_ node to build and pass the import parameters.

This example shows how you would build an import structure for _BAPI\_USER\_CHANGE_ to update a user's email address:

```javascript
msg.payload = {
  USERNAME: "SOME_SAP_USER",
  ADDRESS: {
    E_MAIL: "myemail@company.com"
  },
  ADDRESSX: {
    E_MAIL: "X"
  }
}
return msg;
```

## Catching Errors
If an error is encountered by any RFC, an error is throw. In order to see the full content of this error, drag a _catch_ node into your flow and attach it to a debug node. The debug node must be configured to output __msg.sapError__.

![image](https://user-images.githubusercontent.com/4663918/63024463-3fa8f800-be75-11e9-80aa-91a753e78227.png)


# Disclaimer

Use these programs at your own risk.

# Author

Paul Wieland, https://github.com/PaulWieland

# Feedback and Support

Submit any issues here on github, or ping me @Paul W on the node-red slack channel.
