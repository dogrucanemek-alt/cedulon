# Cedulon

Audit layer for agent-to-agent spend: signed trade manifest, fail-closed
policy, signed spend receipt (SCITT-anchorable).

Cedulon is **not** a payment rail. It sits above x402 and AP2.

The packages are on npm and the MCP server is in the MCP Registry, but nothing
here touches money: no real wallets and no network rails, only mock fixtures.
`cedulon_spend` settles on a mock rail and says so in its own description.

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

`npm run demo:live` reconciles a real Base Sepolia USDC window instead of a
fixture. Read-only: it needs an RPC URL in `CEDULON_RPC_URL` and no wallet,
key, or transaction. Against an account whose receipts you do not hold, every
settlement the chain reports comes back as a gap.

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
| `cedulon_audit` | optional `extract` (a signed rail extract you were presented with: `body`, `signature`, `publicKeyPem`), the trust roots (`trust`, `issuerTrust`, `witnessTrust`, `payeeTrust`, `manifest`, `manifestTrust`), optional `extraSettlements[]` (`ref`, `amount`, `currency`, `timestampMs`; refused beside `extract`) | `{ ok, summary, findings, warnings, guarantee, counts }`, plus `scope` when the audit ran over a presented extract; `counts` is the class every receipt and row landed in. Balanced books print `audit: balanced`. |
| `cedulon_verify_receipt` | `receipt` object, or `coseHex` + `publicKeyPem`, optional countersignature fields | `{ ok, receipt, countersignature }` |
| `cedulon_export_ledger` | none | Receipts + checkpoint + extract in the `demo:export` JSON shape |
| `cedulon_status` | none | `{ version, policy, receiptCount, chainHead }` |

Claude Desktop / Claude Code / Cursor. Nothing to clone and nothing to build:

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

In Claude Code that config is one command:

```bash
claude mcp add cedulon -- npx -y @cedulon/mcp-server
```

Policy limits come from the environment: `CEDULON_MAX_AMOUNT`,
`CEDULON_MAX_CUMULATIVE`, `CEDULON_MAX_PAYMENTS`, `CEDULON_WINDOW_MS`,
`CEDULON_ALLOWED_PAYEES`, `CEDULON_ALLOWED_CURRENCIES`,
`CEDULON_ALLOWED_TOOLS`, `CEDULON_PAYER`. Set `CEDULON_STATE_PATH` to keep the
receipt chain across restarts; without it the ledger lives in memory.

Working inside this repository instead, against the sources:

```bash
npm run mcp
```

The server is listed in the MCP Registry as
`io.github.dogrucanemek-alt/cedulon`; `server.json` is the entry it is published
from.

`npm run mcpb` builds an `.mcpb` bundle — a zip holding the server and its
dependencies, which a desktop host installs in one click, with the policy caps
exposed as settings. It installs the released npm package rather than packing
the working tree, so the bundle holds what npm would have given you, and the
version must already be released. The result lands in `build/` and is a release
artifact, not source. Released bundles are attached to the matching GitHub
release, with the bundle's SHA-256 in the release notes; `v0.13.0` carries
`cedulon-0.13.0.mcpb`, and `v0.12.0` the one before it.

`smithery.yaml` is the older ecosystem format and is not submitted; Smithery's
current instructions take an HTTPS endpoint or an `.mcpb` bundle.

There is also a `Dockerfile`, for hosts and directories that build the
repository rather than install the package:

```bash
docker build -t cedulon .
docker run -i --rm cedulon
```

The protocol is the container's stdin/stdout, so it needs `-i`. It needs no
credentials: the server settles on a mock rail and holds no wallet.


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
packages/base-extract   read-only Base Sepolia USDC → RailExtract
examples/demo           runaway, dispute, bypass, audit CLI
spec/                   draft-dogru-cedulon-08 (posted 2 September 2026),
                        -07, -06, -05, -04, -03, -02, -01, -00;
                        draft-dogru-cedulon-decision-profile-02 (posted
                        5 September 2026), -01, -00: decisions against effects
                        on the same reconciler; and the direction seeds
                        draft-dogru-cedulon-reattestation-00 and
                        draft-dogru-cedulon-streaming-00
THREAT_MODEL.md
docs/RUN_AS_VERIFIER.md
```

Brand names come from `packages/core/src/brand.ts` only.

## How to cite

Citation metadata is in `CITATION.cff`. The archived -00 release is
published as https://doi.org/10.5281/zenodo.22099792. The posted decision
profile, draft-dogru-cedulon-decision-profile-02, is deposited on its own as
https://doi.org/10.5281/zenodo.22337734 (all versions; the posted -02 text is
https://doi.org/10.5281/zenodo.22339342)

## Privacy Policy

<https://cedulon.com/privacy.html>

The MCP server runs on your machine and makes no network requests. It collects
nothing, because there is no endpoint of ours to collect it. `packages/mcp-server/README.md`
states what it holds while it runs and what it writes if you ask it to.

## License

Apache-2.0
