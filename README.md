# Ogust MCP

A local MCP server for the Ogust V2 API. It covers all 62 documented objects through tools for searching, reading, creating, updating, and deleting records. Available operations vary by object and depend on your Ogust account permissions.

## Installation

You'll need Node.js 22.9 or later and the two API keys from your Ogust company profile.

```sh
git clone https://github.com/hugofrely/ogust-mcp.git
cd ogust-mcp
npm ci
npm run build
cp .env.example .env
chmod 600 .env
```

Set `OGUST_PUBLIC_KEY` and `OGUST_PRIVATE_KEY` in `.env`. With `OGUST_ACCESS=read`, only read and search tools are available. Set `OGUST_ACCESS=full` to enable creation, updates, and deletion.

### Connect an MCP client

The server uses the **stdio** transport. If your client supports `mcpServers`, use the configuration below and replace both paths with the absolute paths in your local clone. If the client cannot find Node.js, replace `node` with the path returned by `command -v node`.

```json
{
  "mcpServers": {
    "ogust": {
      "command": "node",
      "args": [
        "--env-file-if-exists=/path/to/ogust-mcp/.env",
        "/path/to/ogust-mcp/dist/index.js"
      ]
    }
  }
}
```

To register the server with the Codex CLI, run this command from the repository directory.

```sh
codex mcp add ogust -- "$(command -v node)" "--env-file-if-exists=$PWD/.env" "$PWD/dist/index.js"
```

Restart your MCP client, then call `ogust_verify_auth` to check your credentials.

## Tools

| Tool | Inputs and behavior |
| --- | --- |
| `ogust_catalog` | Lists available objects when called without arguments. Pass `resource` to see its fields, which fields the docs mark as required for creation, and which methods the server routes for that object. |
| `ogust_verify_auth` | Checks whether the server can obtain a token and returns the authentication status. |
| `ogust_search` | Accepts `resource`, `filters`, `pagenum` (default 1), and `nbperpage` (default 20). Returns Ogust pagination metadata alongside the results. |
| `ogust_get` | Accepts `resource` and `params` with the object's ID or composite key. |
| `ogust_get_list` | Accepts a `key` in `object.field` format and returns the allowed values for that field. |
| `ogust_set` | Creates or updates an object in `full` mode. Pass `resource` and supply the Ogust fields in `params`. |
| `ogust_remove` | Deletes the object identified in `params` in `full` mode. |

Use `ogust_get_list` for the `list` object. The `historyLog` and `communication` objects are read-only. Ogust determines which operations are available for other objects. Configure and enable webhooks in Ogust.

### Example arguments

- Find customers whose last name starts with Dup using `ogust_search` with `{"resource":"customer","filters":{"last_name":"Dup%"},"nbperpage":10}`.
- Read the record for customer 123456 using `ogust_get` with `{"resource":"customer","params":{"id_customer":"123456"}}`.
- Find invoices for customer 123456 using `ogust_search` with `{"resource":"invoice","filters":{"id_customer":"123456"}}`.
- Get the allowed payment methods using `ogust_get_list` with `{"key":"customer.method_of_payment"}`.
- Update a customer note using `ogust_set` with `{"resource":"customer","params":{"id_customer":"123456","comment":"Call back"}}`.

The server passes advanced Ogust filters such as `@in|A|B` through as supplied. Use JSON objects or arrays for nested fields. The server encodes them as PHP form parameters and omits `null` values. Pass large identifiers as strings to preserve precision.

## Authentication and tests

The server reads the API keys from its environment. It signs `getToken` requests with HMAC-SHA1, caches the token in memory, and refreshes it before expiration. If Ogust rejects a token during a read, the server refreshes it and retries the read once. The server sends each write or delete request once per MCP call.

Git ignores `.env`. In `full` mode, the tools use the permissions associated with the configured API keys. Restrict access to those keys and verify the target record before deleting it.

```sh
npm test
```

The tests launch the server over stdio and mock Ogust responses to check request signing, token caching and renewal, pagination, and the routing of write and delete requests.

[Ogust V2 API documentation](https://login.ogust.app/api/v2/documentation.php)
