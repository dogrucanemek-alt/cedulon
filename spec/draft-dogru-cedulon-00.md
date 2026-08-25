---
title: "Cedulon: An Audit Layer for Agent-to-Agent Commerce"
abbrev: Cedulon
docname: draft-dogru-cedulon-00
date: 2026-08-25
category: info
ipr: trust200902
area: sec
workgroup:
keyword:
  - Cedulon
  - agent
  - receipt
  - policy
  - SCITT
stand_alone: true
smart_quotes: false
pi:
  - toc
  - tocindent
  - sortrefs
  - symrefs
  - comments
author:
  -
    ins: E. C. Dogru
    name: Emek Can Dogru
    org: Independent
normative:
  RFC2119:
  RFC8174:
  RFC8392:
  RFC8949:
  RFC9052:
  RFC9942:
  RFC9943:
informative:
  RFC9110:
  RFC9421:
  SHARIF-ATTP:
    title: "ATTP: Agent Trust Transport Protocol"
    author:
      - ins: R. Sharif
        name: Raza Sharif
    date: 2026-06
    target: https://datatracker.ietf.org/doc/draft-sharif-attp/01/
  BATES-ATTP:
    title: "Agent Transaction Protocol (ATP)"
    author:
      - ins: D. Bates
        name: David Asher Bates
    date: 2026-05
    target: https://datatracker.ietf.org/doc/draft-bates-atp/00/
---

--- abstract

This document defines the Cedulon Protocol, an audit layer for
agent-to-agent commerce. Payment rails such as HTTP 402 flows (x402) and
mandate protocols (AP2) already move value. They do not, by themselves,
produce a portable, fail-closed policy decision and a signed spend receipt
that can be anchored in a transparency log. Cedulon specifies a Trade Manifest
(signed offer before payment), a Policy Decision Point with default deny,
a Spend Receipt (COSE/CWT claim set after a gated payment), epoch
checkpoints, rail-extract reconciliation that proves completeness, a
Dispute Evidence Bundle (evidence, not an award), and optional SCITT
anchoring. Cedulon is not a competitor to x402 or AP2; it sits above them.

--- middle

# Introduction

Agents can now pay. Open HTTP 402 protocols attach stablecoin settlement to
ordinary requests. Card networks and processors issue agent-scoped tokens.
Google's Agent Payments Protocol (AP2) binds user intent to signed mandates.

What is missing is an interoperable **audit layer**: a machine-checkable
answer to "was this spend allowed by policy, against which offer, and what
bytes were delivered?" Without that layer, a prompt-injected or looping
agent can drain a rail that has already accepted a valid signature. A
counterparty can ship the wrong artifact. A transparency log, if used at
all, is proprietary.

Cedulon fills that gap. It does not clear funds, hold custody, or operate a
payment facilitator. An optional escrow actor is defined only as a
third-party role interface ({{escrow-role}}). This document and the
companion implementation MUST NOT operate escrow or custody
(`MUST-T8-4`, `MUST-T8-custody`).

Neighbor drafts are complementary, not substitutes. draft-sharif-attp
{{SHARIF-ATTP}} (and its payment-scoped predecessor
draft-sharif-agent-payment-trust-00) covers agent identity and
trust-score spend tiers via a central query API. draft-bates-atp
{{BATES-ATTP}} covers tamper-evident causal lineage as a signed DAG.
Cedulon is the completeness layer: a spend that never produced a receipt
is visible when the rail extract is reconciled (`MUST-T10-1`).

# Terminology

{::boilerplate bcp14-tagged}

The following terms are used:

Trade Manifest:
: A signed statement produced **before** payment. It binds a description of
  goods or service, price, currency, acceptance-criteria hash, cancel
  condition, expiry, and an optional AP2 mandate reference.

Policy Decision Point (PDP):
: The function that evaluates a structured spend request against stored
  policy. The default is deny.

Spend Receipt:
: A signed statement produced **after** a gated payment attempt. It binds
  payer, payee, amount, currency, policy hash, manifest hash or an explicit
  `no-manifest` flag, optional x402 payment reference, timestamp, and nonce.

Receipt Issuer:
: The party that signs Spend Receipts.

Anchor:
: An optional SCITT Transparency Service {{RFC9943}} that registers a signed
  statement and returns a COSE receipt {{RFC9942}}.

Dispute Evidence Bundle:
: A package of the Trade Manifest, the Spend Receipt, and a delivery hash.
  It is evidence for a later human or legal process. It is not an arbitral
  award and not an escrow release.

Decision Token:
: A single-use PDP allow bound to a hash of the evaluated request fields.

# Architecture

Cedulon has three control-plane objects and one optional log:

~~~~
  Principal --policy--> PDP --allow/deny--> x402/AP2 rail
                              |
                              v
                      Receipt Issuer --> Spend Receipt
                              |
                              v
                      Anchor / SCITT (optional)
~~~~

The payer agent never talks to the rail except through an adapter that
calls the PDP first (`MUST-T5-1`).

## Policy Decision Point

The PDP evaluates structured fields only (`MUST-T1-1`): amount, currency,
payee, tool identifier, nonce, optional manifest hash, and evaluation time.
It applies limit, velocity, and scope checks (`MUST-T2-1`, `MUST-T2-2`).
If the PDP is unreachable, uninitialized, or throws, the result is deny
(`MUST-T2-3`). Denied attempts do not increment success counters
(`MUST-T2-4`).

An allow produces a Decision Token whose `requestHash` covers amount,
currency, and payee (`MUST-T3-4`, `MUST-T6-1`). The token is single-use
(`MUST-T6-2`).

## Receipt Issuer

After the adapter attempts settlement (success or a recorded deny that still
needs an audit trail for an allowed-then-aborted path), the Receipt Issuer
signs a Spend Receipt over a canonical encoding (`MUST-T4-1`). Verifiers
reject bad signatures and byte mismatch (`MUST-T4-2`).

## Anchor / SCITT

Parties MAY register the signed receipt (or a privacy-preserving hash
encoding) as a SCITT Signed Statement {{RFC9943}} and attach the COSE
receipt (`MAY-T4-6`). This document does not operate a Transparency
Service.

# Trade Manifest

A Trade Manifest is the commerce analogue of a promise: it is issued
**before** value moves. It is conceptually symmetric to a later Spend
Receipt (promise then proof), and it MAY carry an AP2 mandate hash so that
user intent and the Cedulon offer stay linked (`SHOULD-T8-5`).

A Trade Manifest MUST bind all of the following (`MUST-T8-1`):

- goods or service description
- price (integer minor units, encoded as a decimal string)
- currency (ISO 4217 alphabetic or a documented token identifier)
- acceptance-criteria hash (SHA-256 of the exact delivery bytes or of a
  declared schema instance)
- cancel condition (opaque string agreed by the parties)
- expiry (POSIX milliseconds)

It MAY include `ap2MandateHash`.

The manifest is signed. A spend bound to a manifest MUST be denied if the
requested amount or currency differs from the manifest (`MUST-T8-2`) or
if the manifest is expired (`MUST-T3-3`).

A spend that is not bound to a verified manifest MUST be marked
`no-manifest` on the receipt and MUST still pass limit, velocity, and scope
checks (`MUST-T1-2`). An implementation MAY refuse all `no-manifest`
spend (`MAY-T1-4`).

# Spend Receipt

The Spend Receipt claim set is carried in COSE_Sign1 {{RFC9052}} wrapping
a CWT-compatible map {{RFC8392}}. A legacy canonical-JSON signature exists
only for comparison tests. New receipts MUST use the COSE profile
({{cose-profile}}).

Claims (`MUST-T4-3`, `MUST-T4-4`):

| Claim | Description |
|---|---|
| payer | Payer agent identifier |
| payee | Payee identifier |
| amount | Minor units as a decimal string |
| currency | Currency identifier |
| policyHash | SHA-256 of the canonical policy document |
| manifestHash | SHA-256 of the signed manifest, or absent when `no-manifest` is true |
| no-manifest | Boolean; MUST be true if and only if `manifestHash` is absent |
| x402PaymentRef | Optional rail payment reference |
| timestamp | POSIX milliseconds |
| nonce | Unique spend nonce |
| prevReceiptHash | Optional previous receipt hash (`SHOULD-T4-5`) |

Verifiers MUST reject a receipt if the signature fails or if the canonical
bytes do not match the signed payload (`MUST-T4-2`).

# COSE Profile {#cose-profile}

This profile uses deterministic CBOR {{RFC8949}} Section 4.2.1 (definite
lengths, shortest integer form, map keys sorted by encoded-key length then
byte order). Implementations MUST encode only the types used by Cedulon
claim maps: null, bool, unsigned and negative integers, UTF-8 text,
byte strings, arrays, and maps (`MUST-T4-1`).

## Claim labels

Registered CWT claims {{RFC8392}} are not required in -00. Cedulon uses
private integer labels:

| Label | Claim | CBOR type |
|---|---|---|
| 100 | payer | tstr |
| 101 | payee | tstr |
| 102 | amount | tstr (decimal minor units) |
| 103 | currency | tstr |
| 104 | policyHash | tstr (hex SHA-256) |
| 105 | manifestHash | tstr / null |
| 106 | noManifest | bool |
| 107 | x402PaymentRef | tstr / null |
| 108 | timestampMs | uint |
| 109 | nonce | tstr |
| 110 | prevReceiptHash | tstr / null |

## COSE_Sign1 headers

The protected header MUST be the map `{ 1: -8 }` (alg = EdDSA)
(`MUST-T4-1`). The unprotected header MUST be empty. The payload MUST be
the CBOR encoding of the claim map. The signature is Ed25519 over the
COSE `Sig_structure` `["Signature1", protected, h'', payload]`.

# Reconciliation and Epoch Checkpoints {#reconciliation}

Completeness is the property that every rail settlement in a window has a
matching Spend Receipt, every receipt has a matching settlement, receipt
and checkpoint hash chains verify, and checkpoint totals equal the sum of
receipts in the checkpoint window. If a spend occurred without a receipt,
the missing receipt is itself the evidence (`MUST-T10-2`).

## Checkpoint claims

An epoch checkpoint MUST be COSE_Sign1-signed with the same header profile
and MUST bind all of the following (`MUST-T11-1`):

| Label | Claim | CBOR type |
|---|---|---|
| 200 | epoch | uint |
| 201 | startMs | uint |
| 202 | endMs | uint |
| 203 | receiptCount | uint |
| 204 | chainHeadHash | tstr / null |
| 205 | totals | map tstr -> tstr (currency to decimal sum) |
| 206 | prevCheckpointHash | tstr / null |

## Verification algorithm

A verifier MUST perform these steps in order (`MUST-T10-1`,
`MUST-T11-2`):

1. Decode each Spend Receipt COSE_Sign1. Reject if Ed25519 verify fails or
   if the decoded claim map does not match the presented claims
   (`MUST-T4-2`).
2. Walk receipts in issuer order. The first `prevReceiptHash` MUST be
   null. Each later `prevReceiptHash` MUST equal the SHA-256 of the
   previous receipt's COSE bytes.
3. For each settlement in the rail extract, require a receipt whose
   `x402PaymentRef` equals the settlement `ref`. A settlement with no
   match MUST be reported as `settlement-without-receipt` identified by
   that `ref` (`MUST-T10-2`).
4. For each receipt with a non-null `x402PaymentRef`, require a
   settlement with that `ref`. A miss MUST be reported as
   `receipt-without-settlement` (`MUST-T10-3`).
5. Decode each checkpoint. Reject a failed signature or a totals map that
   does not equal the sum of receipt amounts in `[startMs, endMs]`
   (`MUST-T11-2`).
6. Walk checkpoints in epoch order. `prevCheckpointHash` MUST equal the
   SHA-256 of the previous checkpoint COSE bytes, or null for the first
   (`MUST-T11-4`).
7. If two successfully verified checkpoints share an epoch number and
   have different hashes, the verifier MUST report equivocation
   (`MUST-T11-3`).
8. If any finding exists, the audit MUST fail (`MUST-T10-4`).

Checkpoints SHOULD be registered with a Transparency Service
(`SHOULD-T11-5`). A test deployment MAY use an in-process append-only
log as the witness (`MAY-T11-6`). Cedulon still MUST NOT take custody.

# Lifecycle

1. **Manifest.** Parties sign a Trade Manifest (optional for metered API
   spend; required for goods with acceptance criteria).
2. **Policy check.** The adapter submits a structured request to the PDP.
   Default is deny.
3. **Payment.** On allow, the adapter performs the x402 (or other rail)
   exchange using exactly the decision fields (`MUST-T6-1`). The Decision
   Token is consumed (`MUST-T6-2`). A reused nonce is denied
   (`MUST-T3-1`, `MUST-T3-2`).
4. **Receipt.** The Receipt Issuer signs a Spend Receipt. Rail credentials
   MUST NOT appear in the receipt, logs, or tool results (`MUST-T5-2`,
   `MUST-T7-1`).
5. **Dispute Evidence Bundle.** If delivery bytes do not match the
   acceptance-criteria hash, an implementation MUST be able to emit a
   bundle of manifest + receipt + delivery hash (`MUST-T8-3`). The bundle
   MUST NOT be described as an arbitral award or escrow release
   (`MUST-T8-4`).

# Policy Semantics

Policy is default deny. The engine understands three families of rule:

- **Limit:** maximum amount per payment; maximum cumulative amount per
  window (`MUST-T2-2`).
- **Velocity:** maximum number of allowed payments per window
  (`MUST-T2-1`).
- **Scope:** optional allow-lists for payee, currency, and tool name.

Fail-closed: missing engine, crash, or exception yields deny
(`MUST-T2-3`). Implementations SHOULD emit stable reason codes
(`SHOULD-T2-5`). Decision tokens SHOULD expire after a short TTL
(`SHOULD-T6-3`).

The agent-facing spend interface MUST invoke the PDP and MUST NOT expose a
parallel ungated rail call to the model (`MUST-T5-1`).

# SCITT Anchoring

A Receipt Issuer or relying party MAY construct a SCITT Signed Statement
whose payload is either the Spend Receipt COSE object or a privacy profile
({{privacy}}) and register it with a Transparency Service {{RFC9943}}.
The service returns a COSE receipt {{RFC9942}}. Embedding that receipt
yields a Transparent Statement. Cedulon does not define a new transparency
algorithm.

# Privacy Considerations {#privacy}

A public transparency encoding MUST support omitting or hashing payer and
payee identifiers and MUST support amount redaction or bucket encoding
(`MUST-T9-1`). Implementations MUST NOT write government-ID numbers,
payment-instrument PAN, or street address into a public statement
(`MUST-T9-2`). Default public anchors SHOULD publish `policyHash`,
`manifestHash`, `receiptHash`, and timestamp rather than full claims
(`SHOULD-T9-3`). A private auditor MAY receive an unredacted receipt
out of band (`MAY-T9-4`).

# Security Considerations

This section restates the Block B MUST set. The authoritative trace table
is `THREAT_MODEL.md` in the companion repository.

Prompt injection (T1):
: The PDP MUST use structured fields only (`MUST-T1-1`). Unbound spend
  MUST be `no-manifest` and still gated (`MUST-T1-2`). Hosts SHOULD
  confirm first-use payees (`SHOULD-T1-3`).

Runaway spend (T2):
: Velocity and limits are mandatory (`MUST-T2-1`, `MUST-T2-2`).
  Fail-closed deny on engine fault (`MUST-T2-3`). Denied attempts MUST
  NOT count as success (`MUST-T2-4`).

Replay (T3):
: Unique nonce on allow (`MUST-T3-1`); reuse denied (`MUST-T3-2`);
  expired manifest denied (`MUST-T3-3`); single-use hashed decision
  (`MUST-T3-4`). Nonce stores SHOULD persist outside tests
  (`SHOULD-T3-5`).

Forgery (T4):
: Signed canonical receipts (`MUST-T4-1`, `MUST-T4-2`) with the claim
  set in `MUST-T4-3` and `MUST-T4-4`. Hash chaining is recommended
  (`SHOULD-T4-5`).

Bypass (T5):
: Single gated interface (`MUST-T5-1`). No rail secrets in prompts
  (`MUST-T5-2`). Hosts SHOULD isolate the PDP (`SHOULD-T5-3`).

TOCTOU (T6):
: Settlement fields MUST match the decision hash (`MUST-T6-1`). The
  decision is consumed on first use (`MUST-T6-2`).

Key leakage (T7):
: Secret key material MUST NOT appear in artifacts (`MUST-T7-1`).
  Examples MUST use mock keys (`MUST-T7-2`). Production SHOULD use an
  HSM or OS key store (`SHOULD-T7-3`).

Counterparty (T8):
: Manifest bind (`MUST-T8-1`, `MUST-T8-2`). Evidence bundle
  (`MUST-T8-3`) is not an award (`MUST-T8-4`).

Privacy (T9):
: See {{privacy}}.

Rail bypass completeness (T10):
: Verifiers MUST reconcile the rail extract to receipts
  (`MUST-T10-1`, `MUST-T10-2`, `MUST-T10-3`) and MUST fail the
  audit when any finding exists (`MUST-T10-4`). See {{reconciliation}}.

Checkpoint suppression (T11):
: Checkpoints MUST be signed and chained (`MUST-T11-1`,
  `MUST-T11-4`). Totals MUST match the window (`MUST-T11-2`).
  Equivocation MUST be reported (`MUST-T11-3`).

## Optional escrow role {#escrow-role}

Parties MAY name an escrow actor in a Trade Manifest as a third-party role
that holds funds under rules outside this protocol (`MAY-T8-6`).
Implementations of this specification MUST NOT take custody or operate
escrow `MUST-T8-custody`.

# IANA Considerations

This document has no IANA actions in -00. A later revision MAY request a
COSE header parameter and a CWT claim registry block for Cedulon claim labels.
This section is a placeholder.

# Informative Notes on Adjacent Protocols

x402 uses HTTP 402 {{RFC9110}} to negotiate stablecoin payment. AP2 uses
signed mandates as verifiable credentials. Cedulon does not replace either
protocol. Web Bot Auth {{RFC9421}} authenticates bots; it is not a spend
receipt. draft-sharif-attp {{SHARIF-ATTP}} is an identity and score
neighbor. draft-bates-atp {{BATES-ATTP}} is a lineage neighbor. Neither
defines rail-extract completeness.

--- back

# Acknowledgments
{:numbered="false"}

Field survey notes are recorded in the companion repository. This -00 seed
is not an IETF working-group item.
