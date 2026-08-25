# ATP — Agent Trade Protocol

Audit layer for agent-to-agent spend: signed trade manifest, fail-closed
policy, signed spend receipt (SCITT-anchorable).

ATP is **not** a payment rail. It sits above x402 and AP2.

Local repository only. No remote, no npm publish, no real wallets.

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

## Layout

```
packages/core           policy engine (no npm dependencies)
packages/manifest       signed trade manifest
packages/receipts       signed spend receipt + dispute bundle + SCITT stub
packages/mcp-guard      MCP tools/call wrapper (mock)
packages/x402-adapter   HTTP 402 adapter (mock rail)
examples/demo           runaway (3/97) and dispute-evidence demos
spec/draft-dogru-atp-00.md
THREAT_MODEL.md
```

Brand names come from `packages/core/src/brand.ts` only.

## License

Apache-2.0
