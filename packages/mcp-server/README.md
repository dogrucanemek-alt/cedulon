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
| `cedulon_audit` | Reconcile the receipt chain against the rail extract: the in-process ledger, or a signed extract you present as `extract`. Optional `extraSettlements` injects extract rows (bypass demo; refused beside `extract`). The result carries `scope` when it ran over a presented extract, and `counts`, the class every receipt and row landed in. |
| `cedulon_verify_receipt` | Verify receipt COSE bytes (`receipt` object or `coseHex` + `publicKeyPem`). Checks countersignature when present. |
| `cedulon_export_ledger` | Receipts + checkpoint + extract in the `demo:export` JSON shape. |
| `cedulon_status` | Version, policy summary, receipt count, chain head. |

## Run

The binary is `cedulon-mcp` (compiled JavaScript, no
`--experimental-strip-types`). From this repository, after `npm run build:packages`:

```bash
node packages/mcp-server/dist/index.js
```

From the published package, without a clone:

```bash
npx -y @cedulon/mcp-server
```

`npx cedulon-mcp` is the same binary from a packed or already-installed copy.
The server is also listed in the MCP Registry as
`io.github.dogrucanemek-alt/cedulon`.

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

## Privacy Policy

<https://cedulon.com/privacy.html>

The short version, which that page states at length. This server runs on your
machine and speaks to your client over stdio. It makes no network requests:
this package and the six packages it depends on contain no HTTP client, no
socket, and no telemetry, and the only dependency outside the project is the
official Model Context Protocol SDK. It collects nothing, because there is no
endpoint of ours to collect it.

While it runs it holds, in memory, the spend requests of the session (amount,
currency, payee, nonce, calling tool name), the receipts derived from them,
the checkpoint, and your policy limits. It writes nothing to disk unless you
set `CEDULON_STATE_PATH`, in which case that ledger is written as JSON to the
path you chose, on your machine. No analytics, no crash reporting, no update
check, no third-party sharing.

Privacy questions and security reports: <e.dogru@conarium.dev>.
