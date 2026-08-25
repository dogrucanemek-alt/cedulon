# Field survey (Block A)

Accessed 2026-08-25. Claims carry a URL or `UNVERIFIED`.
Internal Turkish notes live outside this repository (`../ARASTIRMA_RAPORU.md`).

## Layering

Cedulon is an **audit layer**, not a payment rail.

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

Acronym backups are **invalid**: AGTP is taken (`nomoticai/agtp`, `draft-hood-independent-agtp-09`). ATRP stays in the A*P graveyard. Word-name candidates were **Cedulon** (preferred), **Vouchel**, **Pactile**, **Assensus**. Detail and sources: `../ARASTIRMA_RAPORU.md` §8.6.

**Resolution (2026-08-25): the protocol is named Cedulon.** npm scope: `@cedulon/*`. No publish in this tree.

## Closest Internet-Drafts (FIX, 2026-08-25)

Checked against the posted text, not summaries.

### `draft-sharif-agent-payment-trust-00`

https://www.ietf.org/archive/id/draft-sharif-agent-payment-trust-00.txt — accessed 2026-08-25.
Expires 26 September 2026; already **superseded** by `draft-sharif-attp-01` (3 June 2026).

| Our claim | In the draft? | Citation |
|---|---|---|
| ECDSA agent identity | Yes | §5.1 MUST P-256 |
| 5-dimension score 0–100, L0–L4 | Yes | §7.1–§7.4 |
| Central Trust Query API | Yes | §10.1 unauthenticated GET |
| Hash-chained signed receipt | Yes | §11.1–§11.3 (agent trail, not trade) |
| SCITT / COSE anchor | **No** | Normative refs are FIPS 186-4 + RFC 2119/8174. §10.1 “certificate transparency” is an API analogy. |
| x402 / AP2 | **No** | Informative rail is Stripe MPP only. |
| Trade Manifest | **No** | Agent Passport is identity, not an offer. |
| Fail-closed | **Partial** | §4 SHOULD fail-closed for *new* agents; cached-trust for known agents. |
| Trust from verifiable proof | **No** | Trust Authority computes the score (§2). |

### `draft-bates-atp-00`

https://www.ietf.org/archive/id/draft-bates-atp-00.txt — accessed 2026-08-25.
Informational DAG of signed agent-action nodes. Another expansion of the letters “ATP”.

- §5 Non-Goals: no authorization policy, no runtime access control.
- Text search: no `x402`, `AP2`, `fail-closed`, `payment`, `spend`, `manifest`.
- SCITT: optional composition for anti-suppression (§14.6, Appendix C.6). Not a spend-audit profile.

Cedulon (this repo) stays an audit layer above rails. Sharif/ATTP = identity + score. Bates = causal lineage. Complementary; no outbound mail.
