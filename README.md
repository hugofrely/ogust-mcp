# Ogust MCP

A local MCP server for the Ogust V2 API. It covers all 62 documented objects through tools for searching, reading, creating, updating, and deleting records. Available operations vary by object and depend on your Ogust account permissions.

## Install locally

You'll need Git, Node.js 22.9 or later, and the two API keys from your Ogust company profile. Run these commands in a terminal on macOS or Linux for a fresh install.

```sh
git clone https://github.com/hugofrely/ogust-mcp.git
cd ogust-mcp
npm ci
npm run build
cp .env.example .env
chmod 600 .env
```

Open `.env` in your local editor and fill in `OGUST_PUBLIC_KEY` and `OGUST_PRIVATE_KEY`. Leave `OGUST_ACCESS=read` for read-only access, or set `OGUST_ACCESS=full` to enable creation, updates, and deletion. Keep an existing `.env` when reinstalling or updating.

The server runs locally over **stdio**. Choose your client below, or [ask your coding agent to install it](#ask-claude-or-codex-to-install-it).

### Codex

From the repository directory, register `ogust` with the Codex CLI and check the saved configuration. The entry is available to the CLI and the Codex desktop app.

```sh
codex mcp add ogust -- "$(command -v node)" "--env-file-if-exists=$PWD/.env" "$PWD/dist/index.js"
codex mcp get ogust
```

For manual configuration, add this entry to `~/.codex/config.toml`. Use absolute paths to Node.js and your local clone. If an `ogust` entry already exists, check its paths before editing it. [Codex MCP documentation](https://developers.openai.com/codex/mcp)

```toml
[mcp_servers.ogust]
command = "/path/to/node"
args = [
  "--env-file-if-exists=/path/to/ogust-mcp/.env",
  "/path/to/ogust-mcp/dist/index.js",
]
```

### Claude Code

From the repository directory, register the server at user scope so it is available across your local projects. Open a new Claude Code session and use `/mcp` to check its connection status. [Claude Code MCP documentation](https://code.claude.com/docs/en/mcp)

```sh
claude mcp add --transport stdio --scope user ogust -- "$(command -v node)" "--env-file-if-exists=$PWD/.env" "$PWD/dist/index.js"
claude mcp get ogust
```

### Claude Desktop

In Claude Desktop, open **Settings → Developer → Edit Config** to open `claude_desktop_config.json`. Add the `ogust` entry under `mcpServers`, keeping any other entries. Set `command` to the absolute path returned by `command -v node` and replace both repository paths with paths from your local clone. Fully quit and reopen Claude Desktop after saving. [Local MCP servers in Claude Desktop](https://modelcontextprotocol.io/docs/develop/connect-local-servers)

```json
{
  "mcpServers": {
    "ogust": {
      "command": "/path/to/node",
      "args": [
        "--env-file-if-exists=/path/to/ogust-mcp/.env",
        "/path/to/ogust-mcp/dist/index.js"
      ]
    }
  }
}
```

### Verify the connection

Open a new session or restart the desktop app after registering the server. Ask it to run `ogust_catalog` to verify that the server loads. Once you have saved both keys locally, ask it to run `ogust_verify_auth` to check whether Ogust accepts them. Both checks leave Ogust records untouched.

### Ask Claude or Codex to install it

Paste this prompt into a local Claude Code or Codex session with terminal access. Replace `[client]` with `Claude Code`, `Claude Desktop`, or `Codex`.

> Install the Ogust MCP server from https://github.com/hugofrely/ogust-mcp for [client] on this computer. Follow the README. Reuse an existing clone if present, check that Node.js is 22.9 or newer, run `npm ci` and `npm run build`, and register the local stdio server as `ogust` using absolute paths. Preserve existing MCP entries and any existing `.env`. If `.env` is missing, create it from `.env.example` and tell me where to enter my Ogust keys locally. Keep credentials out of chat and command output. Check that the server exposes `ogust_catalog` if the client can load it in this session, and tell me if I need to restart. Leave Ogust records untouched.

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
