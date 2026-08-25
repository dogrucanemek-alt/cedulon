# `@cedulon/mcp-server`

Local stdio MCP server. Thin wrappers over `@cedulon/core`,
`@cedulon/x402-adapter`, `@cedulon/audit`, and `@cedulon/receipts`.
The only non-workspace runtime dependency is the official MCP SDK.

Core packages still carry zero runtime dependencies. This package depends
only on those workspace packages plus `@modelcontextprotocol/sdk`.

## Tools

| Name | What it does |
| --- | --- |
| `cedulon_spend` | Policy-gated spend. Args: `amount`, `currency`, `payee`, `nonce`, `tool`. Allow → signed receipt JSON. Deny → `{ ok: false, reason }`. |
| `cedulon_audit` | Reconcile the in-process ledger with the rail extract. Optional `extraSettlements` injects extract rows (bypass demo). |
| `cedulon_verify_receipt` | Verify receipt COSE bytes (`receipt` object or `coseHex` + `publicKeyPem`). Checks countersignature when present. |
| `cedulon_export_ledger` | Receipts + checkpoint + extract in the `demo:export` JSON shape. |
| `cedulon_status` | Version, policy summary, receipt count, chain head. |

## Run

The binary is `cedulon-mcp` (compiled JavaScript, no
`--experimental-strip-types`). From this repository, after `npm run build:packages`:

```bash
node packages/mcp-server/dist/index.js
```

From a packed or published install:

```bash
npx cedulon-mcp
```

`npx @cedulon/mcp-server` is the same once the package is on the npm registry.

From the repository source tree (development):

```bash
npm run mcp
```

## Host config

Claude Desktop / Claude Code / Cursor (`mcpServers`), after the package is
installed:

```json
{
  "mcpServers": {
    "cedulon": {
      "command": "npx",
      "args": ["-y", "@cedulon/mcp-server"]
    }
  }
}
```

## State and policy

In-process by default. Set `CEDULON_STATE_PATH` to a JSON file to persist
receipts, checkpoints, extract rows, and demo keys across process restarts.
Do not commit that file.

Policy knobs (demo defaults in parentheses):

- `CEDULON_MAX_AMOUNT` (`10`)
- `CEDULON_MAX_CUMULATIVE` (`30`)
- `CEDULON_MAX_PAYMENTS` (`3`)
- `CEDULON_WINDOW_MS` (`3600000`)
- `CEDULON_ALLOWED_PAYEES` (`payee-1`; `*` clears the list)
- `CEDULON_ALLOWED_CURRENCIES` (`USD`; `*` clears the list)
- `CEDULON_ALLOWED_TOOLS`
- `CEDULON_PAYER` (`payer-1`)

The rail is the in-process mock. No wallet, no RPC, no network.
