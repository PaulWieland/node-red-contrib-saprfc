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
The __field list__ node is a wrapper around _RFC\_READ\_TABLE_ to get field metadata for an SAP table.

- **Table:** Configure in the node dialog or override dynamically with `msg.table` (or string `msg.payload`).
- **Condense:** Check in the node dialog or set `msg.condense = true` to convert the standard RFC output to a key-value object (`{ FIELDNAME: FIELDTEXT }`).

## Read Table
The __read table__ node queries SAP tables using _RFC\_READ\_TABLE_ and returns an array of JavaScript objects.

To use the node, you can configure the table name and select fields via the UI (_Fetch Fields_), or provide parameters dynamically on the incoming `msg`:

* `msg.table` (string): Target SAP table (e.g. `"MARA"`, `"KNA1"`).
* `msg.fields` (array or comma-separated string): Fields to return (e.g. `["MATNR", "MTART"]` or `"MATNR, MTART"`).
* `msg.options` (array or string): WHERE conditions (e.g. `["ERSDA >= '20230101'"]`).
* `msg.rowcount` (number): Max number of rows to return (default: `0` / all).
* `msg.rowskips` (number): Number of rows to skip (default: `0`).

Alternatively, pass the raw SAP query structure inside `msg.payload`:

```javascript
msg.payload = {
  QUERY_TABLE: "MARA",
  FIELDS: ["MATNR", "ERSDA", "ERNAM"],
  OPTIONS: ["ERSDA >= '20230101'"],
  ROWCOUNT: 10
};
return msg;
```

## Call

The __call__ node executes any SAP RFC or BAPI.

- **Function Name:** Configure in the node dialog or override dynamically with `msg.rfc`.
- **Import Parameters:** Passed in `msg.payload`.

Example function node building an import structure for _BAPI\_USER\_CHANGE_:

```javascript
msg.rfc = "BAPI_USER_CHANGE";
msg.payload = {
  USERNAME: "SOME_SAP_USER",
  ADDRESS: {
    E_MAIL: "myemail@company.com"
  },
  ADDRESSX: {
    E_MAIL: "X"
  }
};
return msg;
```

### Limitations

Currently the call node does not offer a way to use `BAPI_TRANSACTION_COMMIT` or `BAPI_TRANSACTION_ROLLBACK`. Major improvements need to be made to be able to accomodate commit and rollback.

## Catching Errors
If an error is encountered by any RFC, an error is throw. In order to see the full content of this error, drag a _catch_ node into your flow and attach it to a debug node. The debug node must be configured to output __msg.sapError__.

![image](https://user-images.githubusercontent.com/4663918/63024463-3fa8f800-be75-11e9-80aa-91a753e78227.png)


# Disclaimer

Use these programs at your own risk.

# Author

Paul Wieland, https://github.com/PaulWieland

# Feedback and Support

Submit any issues here on github, or ping me @Paul W on the node-red slack channel.
