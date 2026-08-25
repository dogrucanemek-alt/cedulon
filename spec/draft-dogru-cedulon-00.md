---
title: "Cedulon: An Audit Layer for Agent-to-Agent Commerce"
abbrev: Cedulon
docname: draft-dogru-cedulon-00
date: 2026-08-26
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
    org: VERAX TEKNOLOJI LIMITED SIRKETI
    country: Turkiye
    email: e.dogru@conarium.dev
normative:
  RFC2119:
  RFC6234:
  RFC8032:
  RFC8174:
  RFC8392:
  RFC8949:
  RFC9052:
  RFC9053:
  RFC9864:
  RFC9942:
  RFC9943:
informative:
  RFC7942:
  RFC9110:
  RFC9421:
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
produce a fail-closed policy check and a signed spend receipt that a
verifier can reconcile against a rail extract. Cedulon specifies a Trade
Manifest (signed offer before payment), a Policy Decision Point with
default deny, a Spend Receipt (COSE/CWT claim set after a gated payment),
epoch checkpoints, and rail-extract reconciliation that checks
completeness against an authenticated rail extract. It also defines a
Dispute Evidence Bundle (evidence, not an award) and optional SCITT
anchoring. Cedulon is not a competitor to x402 or AP2; it sits above
them.

--- middle

# Introduction

*Note to Readers:* This document is submitted as Informational. The
author's eventual intended track, if the work is taken up, is a
Standards Track profile of COSE {{RFC9052}} and CWT {{RFC8392}} for
agent-spend receipts. This -00 does not claim IETF consensus.

Agents can now pay. Open HTTP 402 protocols attach stablecoin settlement
to ordinary requests. Card networks and processors issue agent-scoped
tokens. Google's Agent Payments Protocol (AP2) binds user intent to
signed mandates.

What is missing is an interoperable **audit layer**: a machine-checkable
answer to "was this spend allowed by policy, against which offer, and
what bytes were delivered?" Without that layer, a prompt-injected or
looping agent can drain a rail that has already accepted a valid
signature. A counterparty can ship the wrong artifact. A transparency
log, if used at all, is proprietary.

Cedulon fills that gap. It does not clear funds, hold custody, or
operate a payment facilitator. An optional escrow actor is defined only
as a third-party role interface ({{escrow-role}}). Implementations of
this specification MUST NOT take custody of funds or operate escrow
(`MUST-T8-custody`).

Neighbor drafts are complementary, not substitutes.
draft-bates-atp {{BATES-ATTP}} covers tamper-evident causal lineage as
a signed DAG. Cedulon is the completeness layer: a spend that never
produced a receipt is visible when an authenticated rail extract is
reconciled (`MUST-T10-1`).

# Terminology

{::boilerplate bcp14-tagged}

The following terms are used:

Trade Manifest:
: A signed statement produced **before** payment. It binds a description
  of goods or service, price, currency, acceptance-criteria hash, cancel
  condition, expiry, and an optional AP2 mandate reference.

Policy Decision Point (PDP):
: The function that evaluates a structured spend request against stored
  policy. The default is deny.

Spend Receipt:
: A signed statement produced **after** a gated payment attempt. It
  binds payer, payee, amount, currency, policy hash, `manifestHash` or
  an explicit `noManifest` flag, rail payment reference, `timestampMs`,
  nonce, `prevReceiptHash`, and `outcome`.

Receipt Issuer:
: The party that signs Spend Receipts.

Anchor:
: An optional SCITT Transparency Service {{RFC9943}} that registers a
  signed statement and returns a COSE receipt {{RFC9942}}.

Dispute Evidence Bundle:
: A package of the Trade Manifest, the Spend Receipt, and a delivery
  hash. It is evidence for a later human or legal process. It is not an
  arbitral award and not an escrow release.

Decision Token:
: A single-use PDP allow bound to a hash of the evaluated request
  fields. It is implementation-internal and is never exchanged between
  parties. This document does not define a wire format for it.

Rail Extract:
: An authenticated list of settlement records for one account, one
  rail, and one time window. See {{rail-extract}}.

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

The PDP evaluates structured fields only (`MUST-T1-1`): amount,
currency, payee, tool identifier, nonce, optional manifest hash, and
evaluation time. It applies limit, velocity, and scope checks
(`MUST-T2-1`, `MUST-T2-2`). If the PDP is unreachable, uninitialized,
or throws, the result is deny (`MUST-T2-3`). Denied attempts do not
increment success counters (`MUST-T2-4`).

An allow produces a Decision Token whose `requestHash` covers six
fields: amount, currency, payee, tool, nonce, and `manifestHash`
(`MUST-T3-4`, `MUST-T6-1`). The token is single-use (`MUST-T6-2`) and
implementation-internal.

## Receipt Issuer

After the adapter attempts settlement (success or a recorded deny that
still needs an audit trail for an allowed-then-aborted path), the
Receipt Issuer signs a Spend Receipt over a canonical encoding
(`MUST-T4-1`). Verifiers reject bad signatures and byte mismatch
(`MUST-T4-2`).

## Anchor / SCITT

Parties MAY register the signed receipt (or a privacy-preserving hash
encoding) as a SCITT Signed Statement {{RFC9943}} and attach the COSE
receipt (`MAY-T4-6`). This document does not operate a Transparency
Service.

# Trade Manifest

A Trade Manifest is the commerce analogue of a promise: it is issued
**before** value moves. It is conceptually symmetric to a later Spend
Receipt (promise then proof), and it MAY carry an AP2 mandate hash so
that user intent and the Cedulon offer stay linked (`SHOULD-T8-5`).

A Trade Manifest MUST bind all of the following (`MUST-T8-1`):

- goods or service description
- price (integer minor units, encoded as a decimal string matching
  `0|[1-9][0-9]*`)
- currency (ISO 4217 alphabetic or a documented token identifier)
- acceptance-criteria hash (SHA-256 {{RFC6234}} of the exact delivery
  bytes or of a declared schema instance)
- cancel condition (opaque string agreed by the parties)
- expiry (POSIX milliseconds, `expiresAtMs`)

It MAY include `ap2MandateHash`. The corresponding CBOR label is
always present; a missing mandate is encoded as CBOR null.

The manifest is COSE_Sign1 {{RFC9052}} over a deterministic CBOR claim
map ({{cose-profile}}). `manifestHash` is the SHA-256 of the signed
COSE bytes (`MUST-T8-7`). A spend bound to a manifest MUST be denied
if the requested amount or currency differs from the manifest
(`MUST-T8-2`) or if the manifest is expired (`MUST-T3-3`).

A spend that is not bound to a verified manifest MUST be marked
`noManifest` on the receipt and MUST still pass limit, velocity, and
scope checks (`MUST-T1-2`). An implementation MAY refuse all
`noManifest` spend (`MAY-T1-4`).

# Spend Receipt

The Spend Receipt claim set is carried in COSE_Sign1 {{RFC9052}}
wrapping a CWT-compatible map {{RFC8392}}. New receipts MUST use the
COSE profile ({{cose-profile}}).

Claims (`MUST-T4-3`, `MUST-T4-4`, `MUST-T4-7`):

| Claim | Description |
|---|---|
| payer | Payer agent identifier |
| payee | Payee identifier |
| amount | Minor units as a decimal string `0|[1-9][0-9]*` |
| currency | Currency identifier |
| policyHash | SHA-256 of the canonical policy document (lowercase hex) |
| manifestHash | SHA-256 of the signed manifest COSE bytes, or null when `noManifest` is true |
| noManifest | Boolean; MUST be true if and only if `manifestHash` is null |
| x402PaymentRef | Rail payment reference, or null |
| timestampMs | POSIX milliseconds |
| nonce | Unique spend nonce; at least 128 bits of randomness; unique in the issuer scope |
| prevReceiptHash | Previous receipt hash, or null for the first receipt (`SHOULD-T4-5`) |
| outcome | `settled` or `aborted` |

A receipt with `outcome` = `settled` MUST have a non-null
`x402PaymentRef` (`MUST-T4-7`). An aborted receipt MUST NOT be added
into checkpoint totals.

All twelve labels in {{receipt-labels}} are always present. An empty
optional value is encoded as CBOR null, never by omitting the label.

`receiptHash` is the SHA-256 of the receipt's signed COSE bytes,
encoded as lowercase hex.

Verifiers MUST reject a receipt if the signature fails or if the
decoded claim map does not match the presented claims (`MUST-T4-2`).

# COSE Profile {#cose-profile}

This profile uses deterministic CBOR {{RFC8949}} Section 4.2.1
(definite lengths, shortest integer form, map keys sorted in
**bytewise lexicographic** order of their encoded keys).
Implementations MUST encode only the types used by Cedulon claim maps:
null, bool, unsigned and negative integers, UTF-8 text, byte strings,
arrays, and maps (`MUST-T4-1`).

## Claim labels {#receipt-labels}

Registered CWT claims {{RFC8392}} are not required in -00. Cedulon
uses CWT private-use integer labels less than -65536 so that the
profile does not occupy the 100-110 registry range.

Receipt labels (`MUST-T4-3`, `MUST-T4-4`, `MUST-T4-7`):

| Label | Claim | CBOR type |
|---|---|---|
| -70001 | payer | tstr |
| -70002 | payee | tstr |
| -70003 | amount | tstr |
| -70004 | currency | tstr |
| -70005 | policyHash | tstr (lowercase hex SHA-256) |
| -70006 | manifestHash | tstr / null |
| -70007 | noManifest | bool |
| -70008 | x402PaymentRef | tstr / null |
| -70009 | timestampMs | uint |
| -70010 | nonce | tstr |
| -70011 | prevReceiptHash | tstr / null |
| -70012 | outcome | tstr (`settled` / `aborted`) |

Checkpoint labels (`MUST-T11-1`):

| Label | Claim | CBOR type |
|---|---|---|
| -70101 | epoch | uint |
| -70102 | startMs | uint |
| -70103 | endMs | uint |
| -70104 | receiptCount | uint |
| -70105 | chainHeadHash | tstr / null |
| -70106 | totals | map tstr -> tstr |
| -70107 | prevCheckpointHash | tstr / null |

Manifest labels (`MUST-T8-1`):

| Label | Claim | CBOR type |
|---|---|---|
| -70201 | description | tstr |
| -70202 | amount | tstr |
| -70203 | currency | tstr |
| -70204 | acceptanceCriteriaHash | tstr |
| -70205 | cancelCondition | tstr |
| -70206 | expiresAtMs | uint |
| -70207 | ap2MandateHash | tstr / null |

## COSE_Sign1 headers

The protected header MUST be a deterministic CBOR map containing
(`MUST-T4-1`, `MUST-T4-8`):

- `1` (alg) = `-19` (Ed25519, {{RFC9864}}; the generic EdDSA value
  `-8` from {{RFC9053}} is deprecated for this profile)
- `3` (content type) = a tstr that distinguishes the payload:
  `application/cedulon-receipt+cbor`,
  `application/cedulon-checkpoint+cbor`, or
  `application/cedulon-manifest+cbor`
- `4` (kid) = bstr, mandatory. The profile computes `kid` as the
  first eight bytes of SHA-256 over the issuer's SubjectPublicKeyInfo
  DER. A verifier MUST obtain the public key from an authenticated
  channel (preconfigured issuer set, directory, or transparency
  statement) and MUST reject a message whose `kid` does not match
  that key.

The unprotected header MUST be empty. The payload MUST be the CBOR
encoding of the claim map. The signature is Ed25519 {{RFC8032}} over
the COSE `Sig_structure`
`["Signature1", protected, h'', payload]`.

# Rail Extract Profile {#rail-extract}

A verifier checks completeness against a **rail extract**, not against
the issuer's own receipts alone (`MUST-T10-7`).

## Record schema

Each settlement record MUST contain:

| Field | Type |
|---|---|
| ref | tstr (rail payment reference) |
| amount | tstr matching `0|[1-9][0-9]*` |
| currency | tstr |
| timestampMs | uint |

## Scope

An extract is scoped to one account identifier, one rail identifier,
and one half-open time window `[windowStartMs, windowEndMs)`.

## Authentication

The mock rail in the companion implementation signs the extract with
Ed25519 over a canonical encoding of the scoped body. A production
verifier MUST obtain the extract from the rail or from a signature
the rail published (`MUST-T10-7`).

If the extract is missing a verifiable signature, the verifier MUST
emit finding `unauthenticated-extract`. Completeness findings may
still be computed, but the completeness guarantee is **conditional**
on the extract being authentic. See {{security}}.

# Reconciliation and Epoch Checkpoints {#reconciliation}

Completeness is the property that, given an authenticated rail
extract, every settlement in the extract has a matching settled Spend
Receipt, every settled receipt has a matching settlement, receipt and
checkpoint hash chains verify, and checkpoint totals equal the sum of
**settled** receipts in the checkpoint window. If a spend occurred
without a receipt, the missing receipt is itself the evidence
(`MUST-T10-2`).

## Checkpoint claims

An epoch checkpoint MUST be COSE_Sign1-signed with the header profile
in {{cose-profile}} and MUST bind all of the following
(`MUST-T11-1`):

epoch, `startMs`, `endMs`, `receiptCount`, `chainHeadHash`,
`totals`, and `prevCheckpointHash`.

The checkpoint window is half-open `[startMs, endMs)`
(`MUST-T11-7`). `receiptCount` MUST equal the number of receipts
(settled and aborted) whose `timestampMs` falls in that window.
`chainHeadHash` MUST equal `receiptHash` of the last receipt in that
window, or null if the window is empty (`MUST-T11-2`). `totals`
MUST sum only receipts with `outcome` = `settled`.

## Genesis and continuity {#genesis}

The first checkpoint in a presented chain is the genesis checkpoint
of that chain. Its `prevCheckpointHash` MUST be null. Epoch numbers
MUST be consecutive integers. Adjacent windows MUST satisfy
`next.startMs = prev.endMs` (`MUST-T11-8`).

A later checkpoint that omits a prefix of earlier epochs (prefix
deletion) is detectable only if an external witness (transparency
log) has recorded the missing prefix (`MUST-T11-9`). Without that
witness, T11 guarantees about suppression are **conditional**.

## Verification algorithm

A verifier MUST perform these steps in order (`MUST-T10-1`,
`MUST-T11-2`):

1. If the rail extract signature does not verify, emit
   `unauthenticated-extract` and treat the guarantee as conditional
   (`MUST-T10-7`).
2. Decode each Spend Receipt COSE_Sign1. Reject if Ed25519 verify
   fails, if `kid` does not match the configured issuer key, if the
   content type is not the receipt type, or if the decoded claim map
   does not match the presented claims (`MUST-T4-2`, `MUST-T4-8`).
3. Walk receipts in issuer order. The first `prevReceiptHash` MUST
   be null. Each later `prevReceiptHash` MUST equal `receiptHash` of
   the previous receipt. A miss is `receipt-chain-break`.
4. Index settled receipts and extract records by `ref`. A `ref`
   that appears more than once on either side is `duplicate-ref`
   (`MUST-T10-6`).
5. For each unique `ref`, require a one-to-one match on `ref` AND
   `amount` AND `currency` (`MUST-T10-1`). Amount or currency
   mismatch is `settlement-mismatch`. A settlement with no receipt
   is `settlement-without-receipt` (`MUST-T10-2`). A settled
   receipt with no extract row is `receipt-without-settlement`
   (`MUST-T10-3`). A settled receipt with a null rail ref is
   `settled-without-ref`.
6. Aborted receipts are not matched to extract rows and are not
   added to totals.
7. Decode each checkpoint. Reject a failed signature. Require
   `receiptCount`, `chainHeadHash`, and `totals` to match the
   receipts in `[startMs, endMs)` as defined above
   (`MUST-T11-2`).
8. Every chained receipt MUST fall in exactly one checkpoint
   window. A gap or double count is `window-coverage`
   (`MUST-T11-7`, `MUST-T11-8`).
9. Walk checkpoints in epoch order. `prevCheckpointHash` MUST
   equal the SHA-256 of the previous checkpoint COSE bytes, or null
   for genesis (`MUST-T11-4`).
10. If two successfully verified checkpoints share an epoch number
    and have different hashes, emit `equivocation`
    (`MUST-T11-3`).
11. If any fail-severity finding exists, the audit MUST fail
    (`MUST-T10-4`).

## Finding codes

| Code | Severity | Meaning |
|---|---|---|
| settlement-without-receipt | fail | Extract row has no matching settled receipt |
| receipt-without-settlement | fail | Settled receipt ref is not on the extract |
| settlement-mismatch | fail | Same ref, different amount or currency |
| duplicate-ref | fail | Ref appears more than once on one side |
| settled-without-ref | fail | `outcome` is settled and `x402PaymentRef` is null |
| receipt-chain-break | fail | Signature or `prevReceiptHash` failed |
| checkpoint-total-mismatch | fail | Totals, count, signature, or checkpoint chain failed |
| checkpoint-head-mismatch | fail | `chainHeadHash` is not the last in-window receipt |
| equivocation | fail | Two distinct hashes for one epoch |
| window-coverage | fail | Gap, overlap, or non-adjacent / non-consecutive windows |
| unauthenticated-extract | warn | Extract has no verifiable signature; guarantee is conditional |

Checkpoints SHOULD be registered with a Transparency Service
(`SHOULD-T11-5`). A test deployment MAY use an in-process
append-only log as the witness (`MAY-T11-6`). Cedulon still MUST
NOT take custody.

# Lifecycle

1. **Manifest.** Parties sign a Trade Manifest (optional for metered
   API spend; required for goods with acceptance criteria).
2. **Policy check.** The adapter submits a structured request to the
   PDP. Default is deny. The Decision Token stays inside the
   implementation.
3. **Payment.** On allow, the adapter performs the x402 (or other
   rail) exchange using exactly the decision fields (`MUST-T6-1`).
   The Decision Token is consumed (`MUST-T6-2`). A reused nonce is
   denied (`MUST-T3-1`, `MUST-T3-2`).
4. **Receipt.** The Receipt Issuer signs a Spend Receipt. Rail
   credentials MUST NOT appear in the receipt, logs, or tool
   results (`MUST-T5-2`, `MUST-T7-1`).
5. **Dispute Evidence Bundle.** If delivery bytes do not match the
   acceptance-criteria hash, an implementation MUST be able to emit
   a bundle of manifest + receipt + delivery hash (`MUST-T8-3`).
   The bundle MUST NOT be described as an arbitral award or escrow
   release (`MUST-T8-4`).

# Policy Semantics

Policy is default deny. The engine understands three families of
rule:

- **Limit:** maximum amount per payment; maximum cumulative amount
  per window (`MUST-T2-2`).
- **Velocity:** maximum number of allowed payments per window
  (`MUST-T2-1`).
- **Scope:** optional allow-lists for payee, currency, and tool
  name.

Fail-closed: missing engine, crash, or exception yields deny
(`MUST-T2-3`). Implementations SHOULD emit stable reason codes
(`SHOULD-T2-5`). Decision tokens SHOULD expire after a short TTL
(`SHOULD-T6-3`).

The agent-facing spend interface MUST invoke the PDP and MUST NOT
expose a parallel ungated rail call to the model (`MUST-T5-1`).

# SCITT Anchoring

A Receipt Issuer or relying party MAY construct a SCITT Signed
Statement whose payload is either the Spend Receipt COSE object or a
privacy profile ({{privacy}}) and register it with a Transparency
Service {{RFC9943}}. The service returns a COSE receipt
{{RFC9942}}. Embedding that receipt yields a Transparent Statement.
Cedulon does not define a new transparency algorithm.

# Privacy Considerations {#privacy}

A public transparency encoding MUST support omitting or hashing
payer and payee identifiers and MUST support amount redaction or
bucket encoding (`MUST-T9-1`). Implementations MUST NOT write
government-ID numbers, payment-instrument PAN, or street address
into a public statement (`MUST-T9-2`). Default public anchors
SHOULD publish `policyHash`, `manifestHash`, `receiptHash`, and
`timestampMs` rather than full claims (`SHOULD-T9-3`). A private
auditor MAY receive an unredacted receipt out of band
(`MAY-T9-4`).

# Security Considerations {#security}

This section is authoritative for the protocol requirements in this
document. The companion repository file `THREAT_MODEL.md` is
informative and MUST NOT be read as overriding this section.

Prompt injection (T1):
: The PDP MUST use structured fields only (`MUST-T1-1`). Unbound
  spend MUST be `noManifest` and still gated (`MUST-T1-2`). Hosts
  SHOULD confirm first-use payees (`SHOULD-T1-3`).

Runaway spend (T2):
: Velocity and limits are mandatory (`MUST-T2-1`, `MUST-T2-2`).
  Fail-closed deny on engine fault (`MUST-T2-3`). Denied attempts
  MUST NOT count as success (`MUST-T2-4`).

Replay (T3):
: Unique nonce on allow (`MUST-T3-1`); reuse denied
  (`MUST-T3-2`); expired manifest denied (`MUST-T3-3`);
  single-use hashed decision (`MUST-T3-4`). Nonce stores SHOULD
  persist outside tests (`SHOULD-T3-5`).

Forgery (T4):
: Signed canonical receipts (`MUST-T4-1`, `MUST-T4-2`) with the
  claim set in `MUST-T4-3`, `MUST-T4-4`, and `MUST-T4-7`.
  Protected-header `kid` is mandatory (`MUST-T4-8`). Hash chaining
  is recommended (`SHOULD-T4-5`).

Bypass (T5):
: Single gated interface (`MUST-T5-1`). No rail secrets in prompts
  (`MUST-T5-2`). Hosts SHOULD isolate the PDP (`SHOULD-T5-3`).

TOCTOU (T6):
: Settlement fields MUST match the six-field decision hash
  (`MUST-T6-1`). The decision is consumed on first use
  (`MUST-T6-2`).

Key leakage (T7):
: Secret key material MUST NOT appear in artifacts (`MUST-T7-1`).
  Examples MUST use mock keys (`MUST-T7-2`). Production SHOULD use
  an HSM or OS key store (`SHOULD-T7-3`).

Counterparty (T8):
: Manifest bind (`MUST-T8-1`, `MUST-T8-2`). Evidence bundle
  (`MUST-T8-3`) is not an award (`MUST-T8-4`).
  `manifestHash` is the SHA-256 of the signed COSE bytes
  (`MUST-T8-7`).

Privacy (T9):
: See {{privacy}}.

Rail bypass completeness (T10):
: Verifiers MUST reconcile an authenticated extract to receipts
  with one-to-one `ref`+amount+currency matching
  (`MUST-T10-1`, `MUST-T10-6`, `MUST-T10-7`) and MUST fail the
  audit when any fail-severity finding exists (`MUST-T10-4`).
  See {{reconciliation}}.

Checkpoint suppression (T11):
: Checkpoints MUST be signed and chained (`MUST-T11-1`,
  `MUST-T11-4`). Totals, count, and `chainHeadHash` MUST match
  the half-open window (`MUST-T11-2`, `MUST-T11-7`).
  Equivocation MUST be reported (`MUST-T11-3`). Continuity and
  prefix-deletion detection that go beyond the presented chain are
  **conditional** on an external transparency witness
  (`MUST-T11-9`).

Issuer self-attestation:
: A Receipt Issuer that also produces the only copy of the extract
  can omit settlements. Completeness holds only against an
  extract the verifier obtained from the rail or from a rail
  signature.

Key rotation and revocation:
: `kid` identifies the verification key. This -00 does not specify
  a revocation list. Verifiers MUST pin the issuer keys they
  accept and MUST stop accepting a `kid` after an authenticated
  revocation signal.

Timestamp trust:
: `timestampMs` is issuer-asserted. Window assignment uses that
  field. A lying issuer can slide a receipt between windows.
  External timestamping or a transparency log is out of scope for
  -00.

Collusion:
: If the rail operator and the issuer collude, they can publish a
  matching extract and receipt set that hides a real-world
  settlement. Cedulon does not detect extract-external agreement.

Reversal, refund, and partial settlement:
: State machines for reversal, refund, and partial settlement are
  out of scope for -00 and are expected in -01.

## Optional escrow role {#escrow-role}

Parties MAY name an escrow actor in a Trade Manifest as a
third-party role that holds funds under rules outside this protocol
(`MAY-T8-6`). Implementations of this specification MUST NOT take
custody or operate escrow (`MUST-T8-custody`).

# IANA Considerations

This document has no IANA actions. Private-use CWT labels below
-65536 are used so that a registry assignment is not required for
-00.

# Implementation Status {#impl-status}

RFC 7942 {{RFC7942}} note: a companion implementation with a
runnable verification suite is published at
<https://github.com/dogrucanemek-alt/cedulon>. The code is a
profile of this document, not a second specification. This -00 is
not an IETF working-group item.

# Informative Notes on Adjacent Protocols

x402 uses HTTP 402 {{RFC9110}} to negotiate stablecoin payment. AP2
uses signed mandates as verifiable credentials. Cedulon does not
replace either protocol. Profiles built on HTTP Message Signatures
{{RFC9421}} authenticate bots; they are not a spend receipt.
draft-bates-atp {{BATES-ATTP}} is a lineage neighbor. It does not
define rail-extract completeness.

--- back

# Acknowledgments
{:numbered="false"}

Field survey notes and the informative threat-model table in the
companion repository helped shape the MUST identifiers used here.

# Appendix A. Test Vectors {#vectors}
{:numbered="false"}

These vectors use RFC 8032 Ed25519 secret scalar #1 (fixture only;
never a production key). Hex is lowercase. They MUST match the
locked tests in the companion implementation.

## A.1. Receipt COSE_Sign1

Claims: payer=`payer-1`, payee=`payee-1`, amount=`1`,
currency=`USD`, policyHash=`aa`, manifestHash=null,
noManifest=true, x402PaymentRef=null, timestampMs=1700000000000,
nonce=`n100000000000000`, prevReceiptHash=null, outcome=`aborted`.

COSE_Sign1 hex (one line; identical to the locked test):

~~~~
845830a301320378206170706c69636174696f6e2f636564756c6f6e2d726563656970742b63626f72044806e3fd8fda29bb60a0587cac3a000111706770617965722d313a000111716770617965652d313a0001117261313a00011173635553443a000111746261613a00011175f63a00011176f53a00011177f63a000111781b0000018bcfe568003a00011179706e3130303030303030303030303030303a0001117af63a0001117b6761626f727465645840685c01aa778a850b9d35250406f092b6f5cb03fb3595930422533e28ac620ad439f5e7bd8ed1fa5ded90d4421a2de34f94d1d78d38a65812cb5315ee7f1cf403
~~~~

## A.2. Manifest COSE_Sign1

Body: description=`fixture-goods`, amount=`1`, currency=`USD`,
acceptanceCriteriaHash=`00`, cancelCondition=`none`,
expiresAtMs=1700000000000, ap2MandateHash=null.

COSE_Sign1 hex (one line; identical to the locked test):

~~~~
845831a301320378216170706c69636174696f6e2f636564756c6f6e2d6d616e69666573742b63626f72044806e3fd8fda29bb60a0584aa73a000112386d666978747572652d676f6f64733a0001123961313a0001123a635553443a0001123b6230303a0001123c646e6f6e653a0001123d1b0000018bcfe568003a0001123ef65840898628b1524a44ca641b5058c7a47e71bd4ce1ca0782e03b511c23e0819c3771407d627216d0b104224ee82cacffbd21e66fe035ed5ce4ee85b7bcd9c560ad02
~~~~
