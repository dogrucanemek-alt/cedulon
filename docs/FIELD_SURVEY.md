# Field survey (Block A)

Accessed 2026-08-25. Claims carry a URL or `UNVERIFIED`.
Internal Turkish notes live outside this repository (`../ARASTIRMA_RAPORU.md`).

## Layering

ATP is an **audit layer**, not a payment rail.

- **x402** (Coinbase, Apache-2.0): HTTP 402 + facilitator settlement.
  https://www.coinbase.com/developer-platform/discover/launches/x402
  https://github.com/coinbase/x402/blob/main/specs/transports-v2/http.md
- **AP2** (Google, Apache-2.0): signed Intent/Cart/Payment mandates as VCs.
  https://cloud.google.com/blog/products/ai-machine-learning/announcing-agents-to-payments-ap2-protocol
- **MCP**: `tools/list` then `tools/call`. Spend tools wrap at the client.
  https://modelcontextprotocol.io/specification/2025-11-25/server/tools
- **SCITT**: architecture is RFC 9943 (Proposed Standard, June 2026). COSE receipts.
  https://datatracker.ietf.org/doc/html/rfc9943

Hook: Policy Decision Point before pay; signed Spend Receipt after; optional SCITT anchor.

## Claim checks

| Claim | Result | Source |
|---|---|---|
| x402 July volume $24M | Raw dashboard $24.24M circulates; wash-adjusted figures disagree. "July real volume = $24M" is UNVERIFIED. | https://gokhan.vc/blog/x402-economy-july-2026 |
| Mastercard–BVNK $1.8B | Confirmed as up to $1.8B ($1.5B + $300M contingent); close reported Aug 2026. | https://www.americanbanker.com/payments/news/mastercard-closes-its-1-8-billion-bvnk-acquisition |
| Visa CLI | Confirmed as a Crypto Labs CLI proof of concept (2026-06-10), not a GA SKU. | https://usa.visa.com/about-visa/newsroom/press-releases.releaseid.22491.html |
| AWS AgentCore Payments | Confirmed GA 2026-08-18. | https://aws.amazon.com/about-aws/whats-new/2026/08/bedrock-agentcore-payments-ga/ |

## Name file (summary)

Risk: **RED**.

- Swarm already ships "ATP: Agent Trade Protocol" (https://github.com/The-Swarm-Corporation/ATP-Protocol).
- Bluesky AT Protocol is commonly shortened to ATP (https://github.com/bluesky-social/atproto).
- Agent Trust Protocol (Sovr) uses ATP and `api.atp.dev`.
- npm/PyPI/crates bare `atp` are taken (unrelated or atproto).
- Class 9/42 trademark search on USPTO/EUIPO/TURKPATENT: UNVERIFIED (interactive search not completed).
- `agenttradeprotocol.org`: RDAP 404 (likely unregistered). `atp.dev`: treat as taken.

Backups (patron decision): ATRP (Agent Trade Receipt Protocol), AGTP (Agent Governance Trade Protocol).
npm scope candidate: `@agent-trade-protocol/*`. No publish in this tree.
