# Cedulon

Audit layer for agent-to-agent spend: signed trade manifest, fail-closed
policy, signed spend receipt (SCITT-anchorable).

Cedulon is **not** a payment rail. It sits above x402 and AP2.

No npm publish, no real wallets, no network rails: everything runs locally
against mock fixtures.

Core packages carry zero runtime dependencies; the MCP server package
depends only on the official MCP SDK.

## Requirements

- Node.js 22 or newer (20+ for the libraries; scripts use Node type stripping)
- npm 10 or newer

## Install and run (clean clone)

```bash
npm install
npx tsc --noEmit
npm run test:all
npm run demo
```

`npm run tamper` is expected to exit non-zero (tampered bytes fail verify).

`npm run demo:unguarded` shows the unprotected hole: 100/100 allows.

`npm run audit` must exit 0 (`audit: balanced`).

`npm run demo:bypass` must exit non-zero:
`audit: 1 settlement without receipt → FAIL`.

`npm run demo:bypasses` prints four FAIL lines (missing receipt, wrong
amount, null-ref, garbage chain head) and exits 0 only when every bypass
is caught; a missed bypass makes it exit non-zero.

A third party can reproduce this without trusting us:
`docs/RUN_AS_VERIFIER.md`.

Five-minute path, including the MCP host config: `docs/QUICKSTART.md`.

## MCP server

Cedulon can run as a local stdio MCP server. The host talks JSON-RPC on
stdin/stdout. The five tools are thin wrappers over the existing
packages; they do not reimplement policy, receipts, or audit.

| Tool | Arguments | Result |
| --- | --- | --- |
| `cedulon_spend` | `amount` (string), `currency`, `payee`, `nonce`, optional `tool` | Allow → signed receipt JSON. Deny → `{ ok: false, reason }` (for example `limit-amount`). |
| `cedulon_audit` | optional `extraSettlements[]` (`ref`, `amount`, `currency`, `timestampMs`) | `{ ok, summary, findings }`. Balanced books print `audit: balanced`. |
| `cedulon_verify_receipt` | `receipt` object, or `coseHex` + `publicKeyPem`, optional countersignature fields | `{ ok, receipt, countersignature }` |
| `cedulon_export_ledger` | none | Receipts + checkpoint + extract in the `demo:export` JSON shape |
| `cedulon_status` | none | `{ version, policy, receiptCount, chainHead }` |

```bash
npm run mcp
```

Claude Desktop / Claude Code / Cursor:

```json
{
  "mcpServers": {
    "cedulon": {
      "command": "node",
      "args": [
        "--experimental-strip-types",
        "packages/mcp-server/src/index.ts"
      ],
      "cwd": "/absolute/path/to/cedulon"
    }
  }
}
```

Registry files (`server.json`, `smithery.yaml`) are prepared in this
repository. Directory submissions stay with the publisher.


## Layout

```
packages/core           policy engine + Decision Token (workspace dep on @cedulon/cose)
packages/cose           deterministic CBOR + COSE_Sign1 (Ed25519)
packages/manifest       signed trade manifest
packages/receipts       spend receipt (COSE default, JSON legacy)
packages/checkpoint     epoch checkpoints + in-process transparency log
packages/audit          rail-extract completeness checker
packages/mcp-guard      MCP tools/call wrapper (mock)
packages/mcp-server     stdio MCP server (official SDK)
packages/x402-adapter   HTTP 402 adapter + mock rail extract
examples/demo           runaway, dispute, bypass, audit CLI
spec/draft-dogru-cedulon-00.md
THREAT_MODEL.md
docs/RUN_AS_VERIFIER.md
```

Brand names come from `packages/core/src/brand.ts` only.

## How to cite

Citation metadata is in `CITATION.cff`. The archived -00 release is
published as https://doi.org/10.5281/zenodo.22099792

## License

Apache-2.0
