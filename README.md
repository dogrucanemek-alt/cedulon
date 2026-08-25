# Cedulon

Audit layer for agent-to-agent spend: signed trade manifest, fail-closed
policy, signed spend receipt (SCITT-anchorable).

Cedulon is **not** a payment rail. It sits above x402 and AP2.

No npm publish, no real wallets, no network rails: everything runs locally
against mock fixtures.

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

A third party can reproduce this without trusting us:
`docs/RUN_AS_VERIFIER.md`.

## Layout

```
packages/core           policy engine (no npm dependencies)
packages/cose           deterministic CBOR + COSE_Sign1 (Ed25519)
packages/manifest       signed trade manifest
packages/receipts       spend receipt (COSE default, JSON legacy)
packages/checkpoint     epoch checkpoints + in-process transparency log
packages/audit          rail-extract completeness checker
packages/mcp-guard      MCP tools/call wrapper (mock)
packages/x402-adapter   HTTP 402 adapter + mock rail extract
examples/demo           runaway, dispute, bypass, audit CLI
spec/draft-dogru-cedulon-00.md
THREAT_MODEL.md
docs/RUN_AS_VERIFIER.md
```

Brand names come from `packages/core/src/brand.ts` only.

## License

Apache-2.0
