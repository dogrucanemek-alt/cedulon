---
title: "Cedulon: An Audit Layer for Agent-to-Agent Commerce"
abbrev: Cedulon
docname: draft-dogru-cedulon-02
date: 2026-08-27
category: info
submissiontype: independent
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
    country: Turkey
    email: e.dogru@cedulon.com
normative:
  RFC2119:
  RFC6234:
  RFC6838:
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
  BATES-ATP:
    title: "Agent Transaction Protocol (ATP)"
    author:
      - ins: D. Bates
        name: David Asher Bates
    date: 2026-05
    target: https://datatracker.ietf.org/doc/html/draft-bates-atp
  X402:
    title: "x402: An Open Standard for Internet-Native Payments"
    author:
      - org: x402 Foundation
    date: 2026
    target: https://www.x402.org/
  AP2:
    title: "Agent Payments Protocol (AP2)"
    author:
      - org: Google Agentic Commerce
    date: 2025-09
    target: https://ap2-protocol.org/ap2/specification/
  GRIGG:
    title: "Triple Entry Accounting"
    author:
      - ins: I. Grigg
        name: Ian Grigg
    date: 2005
    target: https://iang.org/papers/triple_entry.html
  PACIOLI:
    title: "Summa de arithmetica, geometria, proportioni et proportionalita"
    author:
      - ins: L. Pacioli
        name: Luca Pacioli
    date: 1494
  VAUBAN:
    title: "x402 STARK Receipt Format Extension"
    author:
      - org: Vauban Research
    date: 2026-05
    target: https://datatracker.ietf.org/doc/draft-vauban-x402-stark-receipts/
  SCHROCK:
    title: "Outcome Binding for Authorized Actions and Independently Observed Effects"
    author:
      - ins: I. Schrock
        name: Iman Schrock
    date: 2026-07
    target: https://datatracker.ietf.org/doc/draft-schrock-ep-outcome-binding/
  MARQUES:
    title: "Compliance Profile of Signed Action Receipts for AI Agents"
    author:
      - ins: J. A. Gomes Marques
        name: Joao Andre Gomes Marques
    date: 2026-07
    target: https://datatracker.ietf.org/doc/draft-marques-asqav-compliance-receipts/
  ACTA:
    title: "Signed Decision Receipts for Machine-to-Machine Access Control"
    author:
      - ins: T. Farley
        name: Tom Farley
    date: 2026-06
    target: https://datatracker.ietf.org/doc/draft-farley-acta-signed-receipts/
  HOPLEY:
    title: "Categorical Compliance Screening Receipt Format for Agentic-Payment Flows"
    author:
      - ins: C. Hopley
        name: Christopher Hopley
    date: 2026-05
    target: https://datatracker.ietf.org/doc/draft-hopley-x402-compliance-receipt/
  REATTEST:
    title: "Cedulon Re-Attestation: Carrying Spend Evidence Across Algorithm Retirement"
    author:
      - ins: E. C. Dogru
        name: Emek Can Dogru
    date: 2026-08
    target: https://github.com/dogrucanemek-alt/cedulon/blob/e681e24d1b29912d8c190259c2ea9f4f9538c29d/spec/draft-dogru-cedulon-reattestation-00.md
  STREAMING:
    title: "Cedulon Streaming Reconciliation: Continuous Completeness for Agent Spend"
    author:
      - ins: E. C. Dogru
        name: Emek Can Dogru
    date: 2026-08
    target: https://github.com/dogrucanemek-alt/cedulon/blob/e681e24d1b29912d8c190259c2ea9f4f9538c29d/spec/draft-dogru-cedulon-streaming-00.md
---

--- abstract

This document defines the Cedulon Protocol, an audit layer for
agent-to-agent commerce. Payment rails such as HTTP 402 flows (x402) and
mandate protocols (AP2) already move value. They do not, by themselves,
produce a fail-closed policy check and a signed spend receipt that a
verifier can reconcile against a rail extract. Cedulon specifies a Trade
Manifest (signed offer before payment), a Policy Decision Point with
default deny, a Spend Receipt (COSE/CWT claim set after a gated payment),
epoch checkpoints, and rail-extract reconciliation. The reconciliation
shows that no settlement on the extract lacks a receipt and no settled
receipt is absent from the extract. That result is unconditional only
when the verifier pins the rail key out of band and states the period
under audit; otherwise the document requires it to be reported as
conditional. Checkpoints carry the suppression guarantee, so this
revision profiles the checkpoint as a Signed Statement, gives the
verification algorithm a step that consumes the transparency receipts
returned for checkpoints, names what a witness holding a checkpoint the
presented chain omits reports, brings equivocation within reach by
comparing recorded copies against the presented chain, and states how
checkpoint totals may be withheld without withholding the fact that
they were. It also defines a Dispute Evidence Bundle (evidence, not an
award) and optional SCITT anchoring. Cedulon is not a competitor to
x402 or AP2; it sits above them.

--- middle

# Introduction

*Note to Readers:* This document is submitted as Informational. The
author's eventual intended track, if the work is taken up, is a
Standards Track profile of COSE {{RFC9052}} and CWT {{RFC8392}} for
agent-spend receipts. This -02 does not claim IETF consensus.

Agents can now pay. Open HTTP 402 protocols {{X402}} attach
stablecoin settlement to ordinary requests. Card networks and
processors issue agent-scoped tokens. Google's Agent Payments
Protocol (AP2) {{AP2}} binds user intent to signed mandates.

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

The control is an old one. Reconciling an internal ledger against an
external statement is what double-entry bookkeeping {{PACIOLI}} made
routine, and signing the artifacts on both sides is Grigg's
triple-entry idea {{GRIGG}}. Neither is claimed here. What this
document contributes is an open wire profile for that control in a
setting where the parties are software: a COSE receipt shape, an
extract shape, a checkpoint chain, and a verification algorithm
precise enough that two implementations reach the same finding on the
same evidence. The novelty is interoperability, not the idea.

Neighbor drafts are complementary, not substitutes.
draft-bates-atp {{BATES-ATP}} covers tamper-evident causal lineage as
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
: A portable, single-use PDP allow encoded as COSE_Sign1. The claim
  set binds `requestHash`, `policyHash`, `expiryMs`, `nonce`, and
  `singleUseId`. See {{decision-token}}.

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
(`MUST-T3-4`, `MUST-T6-1`). The token is a COSE_Sign1 object
(`MUST-T6-4`), is single-use (`MUST-T6-2`), and MAY be carried to
the adapter that performs settlement.

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

## Optional payee countersignature {#countersign}

A payee MAY attach a countersignature over the issuer's signed
Spend Receipt (`MAY-T8-9`). The profile uses a **detached**
COSE_Sign1 {{RFC9052}} whose payload is a CBOR map with a single
private-use label:

| Label | Claim | CBOR type |
|---|---|---|
| -70401 | receiptCose | bstr (exact issuer COSE_Sign1 bytes) |

The countersignature uses the header profile in {{cose-profile}}
and content type `application/cedulon-countersign+cbor`.

This is a second Sign1 object, not RFC 9052 Countersignature0
(unprotected-header label 11). Countersignature0 would write into
the issuer object and change `receiptHash` after issue, breaking
the receipt chain. A detached Sign1 keeps the issuer bytes
stable, reuses `kid` and content-type, and is absent by simply
omitting the sibling object.

Absence of a countersignature MUST NOT invalidate the issuer
receipt (`MAY-T8-9`). If a countersignature is present, a
verifier MUST reject it when the signature fails, when `kid` or
content type does not match the configured payee key, or when
label -70401 is not the issuer COSE bytes (`MUST-T8-8`). The
identifier `countersign-bad` SHOULD be used for this condition. A
Dispute Evidence Bundle that includes a verified countersignature
has stronger evidence that the payee accepted those bytes; the
bundle is still not an award (`MUST-T8-4`).

# COSE Profile {#cose-profile}

This profile uses deterministic CBOR {{RFC8949}} Section 4.2.1
(definite lengths, shortest integer form, map keys sorted in
**bytewise lexicographic** order of their encoded keys).
Implementations MUST encode only the types used by Cedulon claim maps:
null, bool, unsigned and negative integers, UTF-8 text, byte strings,
arrays, and maps (`MUST-T4-1`).

## Claim labels {#receipt-labels}

Registered CWT claims {{RFC8392}} are not required in -02. Cedulon
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
| -70106 | totals | map tstr -> tstr / null |
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

Decision Token labels (`MUST-T6-4`):

| Label | Claim | CBOR type |
|---|---|---|
| -70301 | requestHash | tstr |
| -70302 | policyHash | tstr (lowercase hex SHA-256) |
| -70303 | expiryMs | uint |
| -70304 | nonce | tstr |
| -70305 | singleUseId | tstr |

## COSE_Sign1 headers

The protected header MUST be a deterministic CBOR map containing
(`MUST-T4-1`, `MUST-T4-8`):

- `1` (alg) = `-19` (Ed25519, {{RFC9864}}; the generic EdDSA value
  `-8` from {{RFC9053}} is deprecated for this profile)
- `3` (content type) = a tstr that distinguishes the payload:
  `application/cedulon-receipt+cbor`,
  `application/cedulon-checkpoint+cbor`,
  `application/cedulon-manifest+cbor`,
  `application/cedulon-decision+cbor`, or
  `application/cedulon-countersign+cbor`
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

# Decision Token {#decision-token}

A Decision Token is the portable encoding of a PDP allow. It is
COSE_Sign1 with the header profile in {{cose-profile}} and the
labels in {{receipt-labels}}. All five labels are always present
(`MUST-T6-4`).

`requestHash` MUST be the six-field hash defined for the PDP
(`MUST-T6-1`). `policyHash` MUST be the SHA-256 of the canonical
policy document the PDP evaluated. `expiryMs` is a Unix time in
milliseconds after which the token MUST be treated as expired
(`SHOULD-T6-3`). `nonce` is the request nonce. `singleUseId` is
the identifier consumed on the first settlement attempt
(`MUST-T6-2`).

A party that accepts a Decision Token MUST reject it if the
signature fails, if `kid` does not match a configured PDP key, if
the content type is not `application/cedulon-decision+cbor`, if
the decoded claim map does not match the presented claims, or if
`expiryMs` is in the past (`MUST-T6-5`).

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
Ed25519 over a canonical encoding of the scoped body. A verifier MUST
obtain the extract from the rail or from a signature the rail
published (`MUST-T10-7`). A deployment that cannot do so is running
the reconciliation against evidence it did not obtain independently,
and MUST report the guarantee as conditional.

A signature on an extract proves internal consistency, not origin: a
key generated by whoever produced the object verifies against itself.
The verifier therefore MUST obtain the rail's public key out of band
and MUST verify the extract signature against that key rather than
against any key the extract carries (`MUST-T10-8`). A verifier that
holds no such key MUST treat the guarantee as conditional.

Keys are compared as bytes. A verifier MUST compare the pinned key
and the key that signed the extract by their SubjectPublicKeyInfo
DER encoding, not by any text encoding of it, so that the same key
presented in a different envelope still compares equal
(`MUST-T10-9`). A pinned key the verifier cannot decode is a fault in
the verifier's own configuration, not evidence about the extract, and
MUST be reported as `trust-key-unreadable` rather than as a key
mismatch.

What a verifier emits for an extract it cannot authenticate depends on
whether it stated an expectation. With no pinned key the verifier has
asserted nothing, so an extract that does not carry a verifiable
signature is `unauthenticated-extract`, a warning: completeness
findings may still be computed, but the guarantee is **conditional**
on the extract being authentic. With a pinned key the verifier has
asserted what it requires, and an extract that fails to meet it is a
failure rather than a caveat; see the verification algorithm for which
finding applies. -00 defined only the first case, and readers of -00
should note that this revision makes the pinned case fail closed.
See {{security}}.

## Scope agreement

An extract declares a window and carries settlement records. The two
MUST agree: a verifier MUST report every settlement record whose
`timestampMs` falls outside `[windowStartMs, windowEndMs)` as
`extract-scope-mismatch`, identified by that record's `ref`
(`MUST-T10-10`). This check is about the extract's internal
consistency and MUST be performed whether or not a rail key is
pinned.

A verifier that knows which account, rail, and window it is auditing
MUST also check the extract against that expectation and MUST fail
closed when the extract does not cover it (`MUST-T10-11`). An extract
for another account or rail, or one whose window does not span the
period under audit, cannot support a completeness claim about that
period.

A verifier that states no period leaves the extract free to define
one, and an extract that reports on a millisecond balances as easily
as one that reports on a month. Pinning a key establishes who signed;
only a stated period establishes what the signature had to cover. A
verifier that has not stated the period under audit therefore MUST
emit `unstated-audit-window` and MUST treat the guarantee as
conditional (`MUST-T10-15`), whatever else verifies.

# Reconciliation and Epoch Checkpoints {#reconciliation}

Completeness is the property that, given an authenticated rail
extract, every settlement in the extract has a matching settled Spend
Receipt, every settled receipt has a matching settlement, receipt and
checkpoint hash chains verify, and checkpoint totals equal the sum of
**settled** receipts in the checkpoint window. If a spend occurred
without a receipt, the missing receipt is itself the evidence
(`MUST-T10-2`).

A checkpoint published with its totals withheld ({{redaction}}) cannot
contribute the last of those to the property. It is not a violation of
completeness and it is not a demonstration of it either: the
comparison was not made, and a result that rests on a comparison
nobody made is conditional (`MUST-T11-12`).

## Checkpoint claims {#redaction}

An epoch checkpoint MUST be COSE_Sign1-signed with the header profile
in {{cose-profile}} and MUST bind all of the following
(`MUST-T11-1`):

epoch, `startMs`, `endMs`, `receiptCount`, `chainHeadHash`,
`totals`, and `prevCheckpointHash`.

The checkpoint window is half-open `[startMs, endMs)`
(`MUST-T11-7`). `receiptCount` MUST equal the number of receipts
(settled and aborted) whose `timestampMs` falls in that window.
`chainHeadHash` MUST equal `receiptHash` of the last receipt in that
window, or null if the window is empty (`MUST-T11-2`). Where `totals`
is present it MUST sum only receipts with `outcome` = `settled`; the
one permitted absence is the signed redaction below.

An issuer that publishes a checkpoint without its totals MUST encode
`totals` as null in the signed payload (`MUST-T11-12`). An empty map
is an honest zero for an empty window and is not a redaction. Because
the redaction is inside the signature, it cannot be added to, or
removed from, a checkpoint after signing.

A verifier MUST NOT accept a redaction asserted anywhere but the
signed payload (`MUST-T11-13`). A presentation-layer flag alongside
a checkpoint is chosen by whoever presents it, which is the party
under audit; honouring such a flag would let that party switch off
the totals comparison for a checkpoint whose signed totals are wrong.
The structural claims (epoch, `startMs`, `endMs`, `receiptCount`,
`chainHeadHash`, `prevCheckpointHash`) MUST NOT be redacted: a
checkpoint missing any of them does not decode, and a verifier MUST
treat it as a failed checkpoint rather than as a redacted one.

## Genesis and continuity {#genesis}

The first checkpoint in a presented chain is the genesis checkpoint
of that chain. Its `prevCheckpointHash` MUST be null. Epoch numbers
MUST be consecutive integers. Adjacent windows MUST satisfy
`next.startMs = prev.endMs` (`MUST-T11-8`).

A later checkpoint that omits a prefix of earlier epochs (prefix
deletion) is detectable only if an external witness (transparency
log) has recorded the missing prefix (`MUST-T11-9`). Without that
witness, T11 guarantees about suppression are **conditional**.

-01 stated that dependency and stopped there: nothing in its
verification algorithm read a transparency receipt, so the witness
had no way to speak. This revision gives it one. A verifier that
holds transparency receipts for the period under audit compares what
the witness recorded against what the chain presented, and reports
the difference under its own name ({{witness}}). A witness that holds
a checkpoint the presented chain omits is not the same condition as
a chain that leaves a gap in its own coverage, and the two MUST NOT
be reported under one identifier (`MUST-T11-11`). The first says
evidence is being withheld; the second says the evidence shown is
incomplete. An operator who cannot tell them apart cannot tell an
incomplete record from a concealed one.

## The transparency witness {#witness}

A checkpoint registered with a Transparency Service {{RFC9943}} is a
Signed Statement whose payload is the checkpoint COSE object and
whose content type is `application/cedulon-checkpoint+cbor`
({{anchoring}}). The service returns a receipt {{RFC9942}} that binds
the statement it recorded.

A verifier MAY be given such receipts for the period under audit. It
is a distinct input from the presented checkpoint chain, and supplying
it is optional: a verifier given none performs the same steps, and
reports the same findings, that it would if this input did not exist
(`MUST-T11-10`). Supplying an empty set is not the same as supplying
none. An empty set says a witness is configured and recorded nothing,
which is itself reportable; absence says no witness was consulted.

A receipt binds a statement hash, not a statement. The body is not
carried by the receipt and a verifier will often not hold it. Two
levels of checking follow from that, and they are not the same
(`MUST-T11-10`).

Every receipt MUST have its signature verified before it counts for
anything. That is what establishes the hash as one the service signed
for, and it is all that comparing recorded hashes against presented
ones requires: the verifier computes the statement hash of each
presented checkpoint itself.

A receipt accompanied by the statement body carries more, and MUST be
checked further before that body is relied on. The body's statement
hash MUST equal the hash the receipt binds, and the body MUST itself
verify as a checkpoint. A body that fails either check proves nothing
and MUST be ignored rather than counted, while the receipt it came
with remains usable for the hash comparison. Equivocation is the case
that needs a body, because it compares claims rather than hashes.

What such a receipt establishes, and what it does not, is worth
stating plainly. It establishes that the service signed for that
statement. Whether the statement is a member of an append-only log,
and whether that log has ever equivocated, are properties of the
service and its own proofs, not of Cedulon. A verifier that treats a
signed receipt as proof of log membership is claiming more than the
receipt carries.

## Verification algorithm

A verifier MUST perform all of these steps and MUST report every
finding they produce (`MUST-T10-1`, `MUST-T11-2`). They are numbered
for reference, not to require an evaluation order: no step
short-circuits another, and an implementation may evaluate them in any
order that produces the same set of findings.

One data dependency is worth naming, because "any order" read naively
would break it. Step 15 decides which transparency receipts, and which
statement bodies, survive checking. Steps 14 and 16 consume what
survives. An implementation that ran step 14 against unchecked bodies,
or step 16 against unchecked receipts, would not produce the same set
of findings, so that order is not among the permitted ones. Nothing
else in this list feeds another step.

When a step names an identifier in backticks, that identifier
SHOULD be used for the condition in diagnostic output. The
normative requirement is the behaviour: report the condition,
identified by the `ref` or other handle given in the step. The
identifiers are not an interoperability surface.

1. Establish the subject of the audit. When an extract is supplied,
   the settlement records it carries are the ones reconciled; a
   settlement list from any other source MUST NOT be substituted for
   them (`MUST-T10-12`). If the caller supplies both and they differ,
   the verifier MUST report that the caller-supplied list disagrees
   with the extract, and MUST still reconcile the extract. The
   identifier `extract-settlement-mismatch` SHOULD be used for this
   condition in diagnostic output.
2. Verify the extract signature against the out-of-band rail key
   (`MUST-T10-8`, `MUST-T10-9`). If no key is pinned, the verifier
   MUST treat the completeness guarantee as conditional
   (`MUST-T10-7`). The identifier `unauthenticated-extract` SHOULD
   be used for this condition in diagnostic output. If a key is
   pinned and cannot be decoded, the verifier MUST report that the
   pinned key is unreadable. The identifier `trust-key-unreadable`
   SHOULD be used for this condition. If a key is pinned and the
   signature does not verify against it, or verifies against a
   different key, the verifier MUST report that the extract is not
   signed by the pinned key. The identifier `extract-key-mismatch`
   SHOULD be used for this condition. A finding that puts the
   extract itself in doubt MUST prevent an unconditional guarantee.
3. Check scope. The verifier MUST report each settlement record
   whose `timestampMs` falls outside the declared window, identified
   by that record's `ref` (`MUST-T10-10`). When the verifier states
   an expected account, rail, or window, it MUST report an extract
   that does not cover it (`MUST-T10-11`). The identifier
   `extract-scope-mismatch` SHOULD be used for both conditions. If
   the verifier stated no period, it MUST treat the guarantee as
   conditional (`MUST-T10-15`). The identifier
   `unstated-audit-window` SHOULD be used for this condition.
4. Decode each Spend Receipt COSE_Sign1. Reject if Ed25519 verify
   fails, if `kid` does not match the configured issuer key, if the
   content type is not the receipt type, or if the decoded claim map
   does not match the presented claims (`MUST-T4-2`, `MUST-T4-8`).
5. Scope the receipts. When an extract is supplied, only receipts whose
   `timestampMs` falls in the extract's declared window are reconciled
   against it (`MUST-T10-16`). A receipt outside that window is not a
   completeness failure against this extract; auditing a longer period
   requires extracts that cover it. Receipts remain subject to every
   other check regardless of window.
6. Walk receipts in issuer order. The first `prevReceiptHash` MUST
   be null. Each later `prevReceiptHash` MUST equal `receiptHash` of
   the previous receipt. A miss MUST be reported as a break in the
   receipt chain. The identifier `receipt-chain-break` SHOULD be
   used for this condition.
7. Index settled receipts and extract records by `ref`. A `ref`
   that appears more than once on either side MUST be reported as a
   repeated reference (`MUST-T10-6`). The identifier `duplicate-ref`
   SHOULD be used for this condition.
8. For each `ref` that appears exactly once on each side, require a
   one-to-one match on `ref` AND `amount` AND `currency`
   (`MUST-T10-1`). Amount or currency mismatch MUST be reported as
   a settlement that does not match its receipt, identified by that
   `ref`. The identifier `settlement-mismatch` SHOULD be used for
   this condition. A settlement with no receipt MUST be reported as
   lacking a receipt, identified by its `ref` (`MUST-T10-2`). The
   identifier `settlement-without-receipt` SHOULD be used for this
   condition. A settled receipt with no extract row MUST be reported
   as a completeness failure (`MUST-T10-3`). The identifier
   `receipt-without-settlement` SHOULD be used for this condition.
   A settled receipt with a null rail ref MUST be reported as
   settled without a rail reference. The identifier
   `settled-without-ref` SHOULD be used for this condition.
9. A `ref` already reported as repeating MUST still be reconciled
   by amount rather than dropped from the comparison
   (`MUST-T10-13`). For each currency under that `ref`, compare the
   total settled against the total receipted. A settled total that
   exceeds the receipted total MUST be reported as a settlement
   lacking a receipt, and the finding MUST state the unaccounted
   amount. The identifier `settlement-without-receipt` SHOULD be
   used for this condition. A settled total that is less than the
   receipted total MUST be reported as a settlement that does not
   match its receipt, identified by that `ref`. The identifier
   `settlement-mismatch` SHOULD be used for this condition. An
   amount on that repeating `ref` that cannot be parsed as an
   integer MUST be reported without abandoning the audit; the
   identifier `malformed-amount` SHOULD be used for this condition.
   A verifier MUST still report findings for the remaining records.
10. Aborted receipts are not matched to extract rows and are not
    added to totals.
11. Decode each checkpoint. Reject a failed signature, and reject a
   `kid` that does not match the key obtained for the checkpoint
   issuer, on the same terms as a receipt (`MUST-T4-8`). Require
   `receiptCount`, `chainHeadHash`, and `totals` to match the
   receipts in `[startMs, endMs)` as defined above
   (`MUST-T11-2`). The identifier `checkpoint-total-mismatch`
   SHOULD be used for a failed signature, a wrong `receiptCount`,
   or totals that disagree, and `checkpoint-head-mismatch` for a
   `chainHeadHash` that is not the last in-window receipt. If the
   signed `totals` is null, the verifier
   cannot perform the totals comparison for that checkpoint. It
   MUST report that the comparison was skipped and MUST treat the
   completeness guarantee as conditional; the absence of a
   comparison is not a passed comparison (`MUST-T11-12`). The
   identifier `checkpoint-totals-redacted` SHOULD be used for this
   condition. `receiptCount` and `chainHeadHash` MUST still be
   checked. A checkpoint that fails verification MUST NOT be
   treated as redacted, whatever it claims about its own totals.
12. Every chained receipt MUST fall in exactly one checkpoint
    window. A gap or double count MUST be reported as a window
    coverage failure (`MUST-T11-7`, `MUST-T11-8`). The identifier
    `window-coverage` SHOULD be used for this condition.
13. Walk checkpoints in epoch order. `prevCheckpointHash` MUST
    equal the SHA-256 of the previous checkpoint COSE bytes, or null
    for genesis (`MUST-T11-4`). The identifier
    `checkpoint-total-mismatch` SHOULD be used for a broken chain,
    which is the fourth condition its table row names.
14. If two successfully verified checkpoints share an epoch number
    and have different hashes, the verifier MUST report
    equivocation (`MUST-T11-3`). The identifier `equivocation`
    SHOULD be used for this condition. The checkpoints compared
    here are those presented **together with** any carried by
    verified transparency receipts (step 15). Comparing only the
    presented chain cannot raise this finding: `MUST-T11-8`, applied
    in step 12, requires that chain's epochs to be consecutive, so no
    two of its members share an epoch. A copy recorded by a witness
    is where the second one is found.
15. If transparency receipts were supplied, discard any whose
    signature fails (`MUST-T11-10`). The survivors are the recorded
    statement hashes used in step 16. Where a receipt also carries
    the statement body, discard that body unless its statement hash
    equals the one the receipt binds and it verifies as a
    checkpoint; the surviving bodies are what step 14 compares.
    Discarding a body does not discard its receipt.
16. Compare the surviving witness records against the presented
    chain (`MUST-T11-11`). For each presented checkpoint with no
    surviving record, report that it is not anchored; the
    identifier `checkpoint-not-anchored` SHOULD be used. This is a
    warning: a witness may have been configured after the
    checkpoint was issued, and an operator's own gap is not
    evidence of concealment. For each surviving record whose
    statement is absent from the presented chain, report that a
    recorded checkpoint was withheld; the identifier
    `checkpoint-withheld` SHOULD be used. This is a finding and the
    audit MUST fail. The verifier MUST NOT report a withheld
    checkpoint as a window coverage failure (`MUST-T11-11`).
17. If any finding remains that is not a warning (a warning is a
    condition that only makes the completeness guarantee
    conditional), the audit MUST fail (`MUST-T10-4`).

## Finding codes

The identifiers below are for diagnostic output. They are not an
interoperability surface. A finding object that can be carried on
the wire is outside the scope of this document and may be defined
later. Two implementations interoperate when they accept the same
inputs and fail or warn on the same conditions, not when they
print the same strings.

A condition that makes the audit fail is a finding. A condition
that only makes the completeness guarantee conditional is a
warning. Warnings MUST still appear in operator-facing output
(`MUST-T10-14`).

| Code | Effect | Meaning |
|---|---|---|
| settlement-without-receipt | audit fails | Extract row has no matching settled receipt, or a repeating `ref` settled more than it receipted |
| receipt-without-settlement | audit fails | Settled receipt ref is not on the extract |
| settlement-mismatch | audit fails | Same `ref`, different amount or currency, including a repeating `ref` that settled less than it receipted |
| duplicate-ref | audit fails | Ref appears more than once on one side |
| settled-without-ref | audit fails | `outcome` is settled and `x402PaymentRef` is null |
| receipt-chain-break | audit fails | Signature or `prevReceiptHash` failed |
| checkpoint-total-mismatch | audit fails | Totals, count, signature, or checkpoint chain failed |
| checkpoint-head-mismatch | audit fails | `chainHeadHash` is not the last in-window receipt |
| equivocation | audit fails | Two distinct hashes for one epoch |
| window-coverage | audit fails | Gap, overlap, or non-adjacent / non-consecutive windows |
| unauthenticated-extract | guarantee conditional | No pinned rail key, or the extract has no verifiable signature |
| extract-key-mismatch | audit fails | Extract is signed by a key other than the pinned rail key, or does not verify against it |
| trust-key-unreadable | audit fails | The pinned rail key could not be decoded; the verifier's configuration is at fault |
| extract-scope-mismatch | audit fails | A record falls outside the declared window, or the extract does not cover the expected account, rail, or window |
| extract-settlement-mismatch | audit fails | A caller-supplied settlement list disagrees with the extract; the extract is authoritative |
| malformed-amount | audit fails | An amount on a `ref` already reported as repeating that could not be parsed as an integer |
| unstated-audit-window | guarantee conditional | The verifier stated no period, so the extract defined its own |
| countersign-bad | audit fails | Present payee countersignature failed verify |
| checkpoint-withheld | audit fails | A verified transparency receipt binds a checkpoint the presented chain does not contain |
| checkpoint-not-anchored | guarantee conditional | A witness was supplied and holds no verified receipt for this checkpoint |
| checkpoint-totals-redacted | guarantee conditional | The checkpoint was signed with `totals` null, so the totals comparison could not be made |

A finding that puts the extract itself in doubt (`extract-key-mismatch`,
`trust-key-unreadable`, `extract-scope-mismatch`, or
`extract-settlement-mismatch`) MUST also prevent an unconditional
guarantee, not merely fail the audit.

An unconditional guarantee therefore requires all of: an extract, a
pinned rail key the extract's signature verifies against, a stated
period the extract covers, no finding that puts the extract in
doubt, and no warning that withholds part of the comparison. A
checkpoint whose totals were signed as withheld
(`checkpoint-totals-redacted`) removes a comparison the guarantee
rests on, and a presented checkpoint a supplied witness does not
hold (`checkpoint-not-anchored`) leaves part of the chain
unwitnessed. Either one makes the result conditional. Anything less
than the whole list is conditional, and the report MUST say so.

An implementation MUST make the guarantee and any warnings visible in
whatever human-readable audit report it produces under this document,
not only in a returned structure (`MUST-T10-14`). A report that says the books balance while withholding
that the balance is conditional invites the reader to take a
conditional result for an unconditional one.

Checkpoints SHOULD be registered with a Transparency Service
(`SHOULD-T11-5`). A test deployment MAY use an in-process
append-only log as the witness (`MAY-T11-6`). Cedulon still MUST
NOT take custody.

The guarantee named above is about completeness against the extract,
which is the subject of T10. It is not a claim that no checkpoint was
suppressed. Suppression is the subject of T11, and a report MUST NOT
be read as settling it when no witness was consulted: with no
transparency receipts, the presented chain is self-consistent by
construction and says nothing about what it left out (`MUST-T11-9`).
A verifier that consulted a witness and found every presented
checkpoint recorded, with nothing recorded that was not presented,
has discharged T11 for the period those receipts cover, and for no
longer.

# Lifecycle

1. **Manifest.** Parties sign a Trade Manifest (optional for metered
   API spend; required for goods with acceptance criteria).
2. **Policy check.** The adapter submits a structured request to the
   PDP. Default is deny. An allow is a Decision Token
   (`MUST-T6-4`).
3. **Payment.** On allow, the adapter performs the x402 (or other
   rail) exchange using exactly the decision fields (`MUST-T6-1`).
   The Decision Token is consumed (`MUST-T6-2`). A reused nonce is
   denied (`MUST-T3-1`, `MUST-T3-2`). A tampered or expired token
   is denied (`MUST-T6-5`).
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

# SCITT Anchoring {#anchoring}

A Receipt Issuer or relying party MAY construct a SCITT Signed
Statement whose payload is either the Spend Receipt COSE object or a
privacy profile ({{privacy}}) and register it with a Transparency
Service {{RFC9943}}. The service returns a COSE receipt
{{RFC9942}}. Embedding that receipt yields a Transparent Statement.
Cedulon does not define a new transparency algorithm.

An epoch checkpoint MUST be registrable on the same terms
(`MUST-T11-14`). Its Signed Statement carries the checkpoint
COSE_Sign1 object as the payload and `application/cedulon-checkpoint+cbor`
as the content type, which is among the media types {{iana}} asks to
have registered and which, until then, is a placeholder like the rest.
Nothing else about registration differs from a receipt.

This is a short section for a requirement -01 was missing, and the
omission mattered more than its length suggests. -01 asked for
checkpoints to be registered (`SHOULD-T11-5`) while profiling only
the receipt here, so the object carrying the suppression guarantee
had no stated form to be registered in. Two implementations could
follow -01 to the letter and register incomparable things.

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

The paragraph above counts receipt fields. A checkpoint publishes
something a receipt does not: a per-currency total for a whole
window, which discloses trading volume even when every individual
receipt is redacted (`MUST-T9-5`). -01 gave no rule for it, so an
implementation could publish that total, or withhold it in a way no
verifier could recognise, and neither reading contradicted the text.

The rule is the one stated in {{reconciliation}}: `totals` MAY be
withheld by signing it as null (`MUST-T11-12`), and only that form
counts as a redaction (`MUST-T11-13`). The structural claims are not
redactable, because a verifier that cannot read the window or the
chain head cannot check anything at all, and a checkpoint that hid
them would be indistinguishable from a broken one.

Withholding is honest and it is also a cost: a verifier that cannot
recompute the totals says so, and the completeness guarantee for that
window is conditional. A deployment that wants an unconditional result
publishes the totals; a deployment that wants the volume private
accepts a conditional one. What a deployment MUST NOT do is obtain
the unconditional result while withholding the evidence for it.

# Security Considerations {#security}

This section is authoritative for the protocol requirements in this
document. The companion repository file `THREAT_MODEL.md` is
informative and MUST NOT be read as overriding this section.

Requirement identifiers take the form KEYWORD-Tn-k, where KEYWORD
is MUST, SHOULD, or MAY, n is the threat number in this section,
and k is a sequence number within that threat. MUST-T8-custody is
the custody prohibition under T8. The tables below define the
requirement text those citations refer to.

## T1: Prompt injection leads to unauthorized spend

| ID | Requirement |
|---|---|
| MUST-T1-1 | The PDP MUST decide from structured request fields and stored policy, not from model-generated prose. |
| MUST-T1-2 | A spend that is not bound to a verified Trade Manifest MUST be marked `noManifest` on the Spend Receipt and MUST still be subject to limit, velocity, and scope policy. |
| SHOULD-T1-3 | Hosts SHOULD require a human confirmation channel for first-use payees. |
| MAY-T1-4 | An implementation MAY refuse all `noManifest` spend. |

## T2: Runaway agent (loop spend)

| ID | Requirement |
|---|---|
| MUST-T2-1 | Policy MUST express a maximum payment count per configured time window (velocity). |
| MUST-T2-2 | Policy MUST express a maximum amount per payment and a maximum cumulative amount per window. |
| MUST-T2-3 | If the PDP is unreachable, uninitialized, or throws during evaluation, the spend MUST be denied (fail-closed, default deny). |
| MUST-T2-4 | A denied attempt MUST NOT increment the allowed-spend counters as if it had succeeded. |
| SHOULD-T2-5 | Implementations SHOULD emit a stable reason code for velocity and limit denials. |

## T3: Replay of payment authority

| ID | Requirement |
|---|---|
| MUST-T3-1 | Every spend attempt that the PDP allows MUST include a nonce that the implementation has not accepted before. |
| MUST-T3-2 | A second attempt that reuses a nonce MUST be denied. |
| MUST-T3-3 | A Trade Manifest MUST carry an expiry; a spend against an expired manifest MUST be denied. |
| MUST-T3-4 | A PDP allow decision MUST be bound to a hash of the request fields it evaluated and MUST be single-use. |
| SHOULD-T3-5 | Nonce stores SHOULD persist across process restart when the deployment is not a test fixture. |

## T4: Receipt forgery or repudiation

| ID | Requirement |
|---|---|
| MUST-T4-1 | A Spend Receipt MUST be signed by the Receipt Issuer over a canonical encoding of its claims. |
| MUST-T4-2 | Verifiers MUST reject a receipt whose signature does not validate or whose canonical bytes do not match the signed payload. |
| MUST-T4-3 | A Spend Receipt MUST include `payer`, `payee`, `amount`, `currency`, `policyHash`, `timestampMs`, and `nonce`. |
| MUST-T4-4 | A Spend Receipt MUST include `manifestHash` or an explicit `noManifest` flag, never an ambiguous empty hash. Empty optional values are CBOR null; labels are never absent. |
| SHOULD-T4-5 | Receipts SHOULD form a hash chain (`prevReceiptHash`) so omission is detectable within one issuer stream. |
| MAY-T4-6 | Parties MAY register the signed receipt as a SCITT statement to obtain a COSE receipt. |
| MUST-T4-7 | A Spend Receipt MUST include `outcome` (`settled` or `aborted`). A settled receipt MUST have a non-null rail ref. Aborted receipts MUST NOT enter checkpoint totals. |
| MUST-T4-8 | COSE_Sign1 protected headers MUST use alg -19 (Ed25519), a mandatory `kid`, and a payload-specific content type. Verifiers MUST reject a `kid` that does not match the configured issuer key. |

## T5: Policy bypass via direct rail access

| ID | Requirement |
|---|---|
| MUST-T5-1 | The agent-facing spend interface MUST invoke the PDP and MUST NOT expose a parallel ungated rail call to the model. |
| MUST-T5-2 | Rail credentials, wallet handles, and facilitator tokens MUST NOT be placed in tool results or prompts. |
| SHOULD-T5-3 | Hosts SHOULD run the PDP and signing keys in a process the model runtime cannot write. |
| MAY-T5-4 | A deployment MAY use OS or hardware isolation between the model and the PDP. |

## T6: TOCTOU between policy check and payment

| ID | Requirement |
|---|---|
| MUST-T6-1 | Payment settlement MUST use the same six `requestHash` fields the PDP evaluated: amount, currency, payee, tool, nonce, and `manifestHash`. |
| MUST-T6-2 | An allow decision MUST be consumed on the first settlement attempt, success or fail-closed abort, and MUST NOT authorize a later different request. |
| SHOULD-T6-3 | Implementations SHOULD treat a decision older than a short TTL as expired. |
| MUST-T6-4 | An allow Decision Token MUST be COSE_Sign1 with CWT private-use labels -70301..-70305 (`requestHash`, `policyHash`, `expiryMs`, `nonce`, `singleUseId`) and content type `application/cedulon-decision+cbor`. |
| MUST-T6-5 | A party that accepts a Decision Token MUST reject a failed signature, a `kid` or content-type mismatch, a claim-map mismatch, or an expired `expiryMs`. |

## T7: Signing-key leakage

| ID | Requirement |
|---|---|
| MUST-T7-1 | Secret key material MUST NOT appear in receipts, checkpoints, manifests, decision tokens, logs, or example output. |
| MUST-T7-2 | Example and test keys MUST be generated at runtime or stored as clearly fake fixtures, never as production secrets. |
| SHOULD-T7-3 | Production deployments SHOULD use an HSM or OS key store and SHOULD rotate keys. |
| MAY-T7-4 | Implementations MAY encrypt keys at rest. |

## T8: Counterparty price gouging or defective delivery

| ID | Requirement |
|---|---|
| MUST-T8-1 | A Trade Manifest MUST bind goods or service description, price, currency, acceptance-criteria hash, cancel condition, and expiry. |
| MUST-T8-2 | A spend bound to a manifest MUST be denied if the requested amount or currency differs from the manifest. |
| MUST-T8-3 | If delivery bytes do not hash to the acceptance-criteria hash, the implementation MUST be able to produce a Dispute Evidence Bundle containing the manifest, the spend receipt, and the delivery hash. |
| MUST-T8-4 | The Dispute Evidence Bundle MUST NOT be described as an arbitral award or escrow release. |
| MUST-T8-7 | `manifestHash` MUST be the SHA-256 of the signed Trade Manifest COSE bytes and MUST NOT include the issuer public key encoding. |
| SHOULD-T8-5 | Manifests SHOULD reference an AP2 mandate hash when one exists. |
| MAY-T8-6 | Parties MAY add an optional escrow actor as a third-party role interface; this project MUST NOT implement custody. |
| MUST-T8-custody | Implementations of this specification MUST NOT take custody of funds or operate escrow. |
| MUST-T8-8 | If a payee countersignature is present, a verifier MUST reject it when the signature fails, when `kid` or content type does not match the configured payee key, or when the payload is not the issuer COSE_Sign1 bytes. |
| MAY-T8-9 | A payee MAY attach a detached COSE_Sign1 countersignature over the issuer receipt bytes. Absence MUST NOT invalidate the issuer receipt. |

## MUST-T8-custody

Implementations of this specification MUST NOT take custody of
funds or operate escrow. See also {{escrow-role}}.

## T9: PII leakage into the transparency log

See also {{privacy}}.

| ID | Requirement |
|---|---|
| MUST-T9-1 | A transparency encoding MUST support omitting or hashing payer/payee identifiers and MUST support amount redaction or range/bucket encoding. |
| MUST-T9-2 | Implementations MUST NOT write raw government-ID, payment-instrument PAN, or street address fields into a public transparency statement. |
| SHOULD-T9-3 | Default public anchors SHOULD publish `policyHash`, `manifestHash`, `receiptHash`, and timestamp rather than full claim sets. |
| MAY-T9-4 | A private auditor MAY receive an unredacted receipt out of band. |
| MUST-T9-5 | A checkpoint discloses a per-currency window total, which the receipt-field rules above do not cover. Withholding it is governed by MUST-T11-12 and MUST-T11-13: null in the signed payload, and no other form of redaction honoured. |

## T10: Secret spend via rail bypass

See {{reconciliation}}.

| ID | Requirement |
|---|---|
| MUST-T10-1 | A verifier MUST match each extract settlement to a settled receipt on `ref` AND `amount` AND `currency`. |
| MUST-T10-2 | A settlement with no matching receipt MUST be reported as a completeness failure identified by that settlement `ref`. |
| MUST-T10-3 | A settled Spend Receipt whose `x402PaymentRef` is not on the extract MUST be reported as a completeness failure. |
| MUST-T10-4 | An audit that has any fail-severity completeness finding MUST fail (non-zero status in the companion tool). |
| SHOULD-T10-5 | Hosts SHOULD still apply T5 (no ungated rail in the model process). Completeness does not replace prevention. |
| MUST-T10-6 | A `ref` that appears more than once among settled receipts or among extract rows MUST be reported as `duplicate-ref`. |
| MUST-T10-7 | A verifier MUST obtain the extract from the rail or from a rail signature. With no pinned rail key, an unverifiable extract MUST be reported as `unauthenticated-extract` and makes the completeness guarantee conditional. With a pinned key, see MUST-T10-8: the extract MUST fail closed rather than warn. |
| MUST-T10-8 | A verifier MUST obtain the rail public key out of band and MUST verify the extract signature against that key, not against a key the extract carries. Without such a key the guarantee is conditional. |
| MUST-T10-9 | Keys MUST be compared by SubjectPublicKeyInfo DER encoding rather than by any text encoding. A pinned key that cannot be decoded MUST be reported as `trust-key-unreadable`, not as a key mismatch. |
| MUST-T10-10 | Every settlement record whose `timestampMs` falls outside the extract's declared window MUST be reported as `extract-scope-mismatch`, identified by that record's `ref`. This check MUST run whether or not a key is pinned. |
| MUST-T10-11 | When the verifier states an expected account, rail, or window, an extract that does not cover it MUST fail closed as `extract-scope-mismatch`. |
| MUST-T10-12 | When an extract is supplied, the records it carries are the subject of reconciliation. A settlement list from another source MUST NOT be substituted; a disagreeing list MUST be reported as `extract-settlement-mismatch`. |
| MUST-T10-13 | A `ref` reported as `duplicate-ref` MUST still be reconciled by aggregate amount per currency, and a shortfall MUST state the unaccounted amount. An unparseable amount MUST be reported as `malformed-amount` without aborting the audit. |
| MUST-T10-14 | An implementation MUST surface the guarantee and any warnings in any human-readable audit report it produces, not only in a returned structure. |
| MUST-T10-15 | A verifier that has not stated the period under audit MUST emit `unstated-audit-window` and MUST treat the guarantee as conditional, because an unstated period leaves the extract free to define its own. |
| MUST-T10-16 | When an extract is supplied, only receipts whose `timestampMs` falls in its declared window are reconciled against it. A receipt outside that window MUST NOT be reported as a completeness failure against that extract. |

In MUST-T10-4, a completeness finding that makes the audit fail is
distinct from a warning that only makes the guarantee conditional.
The verification algorithm states that distinction by behaviour
({{reconciliation}}).

## T11: Checkpoint suppression or rollback

| ID | Requirement |
|---|---|
| MUST-T11-1 | An epoch checkpoint MUST be COSE-signed and MUST bind epoch number, time window, receipt count, chain-head hash, per-currency totals, and the previous checkpoint hash. |
| MUST-T11-2 | Verifiers MUST reject a checkpoint whose signature fails, whose totals do not match settled receipts in the declared window, whose `receiptCount` is wrong, or whose `chainHeadHash` is not the last in-window receipt hash. Where the signed totals are null, MUST-T11-12 governs instead: there is no total to disagree with, the comparison is reported as skipped, and the count and chain-head checks still apply. |
| MUST-T11-3 | Two verified checkpoints for the same epoch with different hashes MUST be reported as equivocation. The checkpoints compared are those presented together with those carried by verified transparency receipts; the presented chain alone cannot satisfy this requirement, because MUST-T11-8 makes its epochs consecutive. |
| MUST-T11-4 | A broken checkpoint hash chain MUST fail verification. |
| SHOULD-T11-5 | Checkpoints SHOULD be registered with a Transparency Service when one is configured. |
| MAY-T11-6 | A test deployment MAY use an in-process append-only log as the witness. |
| MUST-T11-7 | Checkpoint windows MUST be half-open `[startMs, endMs)`. Every chained receipt MUST fall in exactly one window. |
| MUST-T11-8 | Presented checkpoint epochs MUST be consecutive and adjacent windows MUST meet at `endMs = next.startMs`. |
| MUST-T11-9 | Prefix-deletion and suppression claims that go beyond the presented chain are conditional on an external transparency witness. A report MUST NOT present a completeness guarantee as settling suppression when no witness was consulted. |
| MUST-T11-10 | Transparency receipts are an optional, separate input. A verifier given none MUST behave as it did without this input. A receipt MUST have its signature verified before it counts for anything. Where a receipt also carries the statement body, that body MUST NOT be relied on unless its statement hash equals the one the receipt binds and it verifies as a checkpoint; a discarded body does not discard its receipt. |
| MUST-T11-11 | A verified receipt binding a checkpoint absent from the presented chain MUST be reported as a withheld checkpoint, and MUST NOT be reported as a window coverage failure. A presented checkpoint with no verified receipt, where a witness was supplied, MUST be reported and makes the guarantee conditional. |
| MUST-T11-12 | Withheld checkpoint totals MUST be encoded as null in the signed payload. A verifier MUST report that the totals comparison was skipped and MUST treat the guarantee as conditional; `receiptCount` and `chainHeadHash` MUST still be checked. |
| MUST-T11-13 | A redaction asserted outside the signed payload MUST NOT be honoured, and structural claims MUST NOT be redacted. A checkpoint that fails verification MUST NOT be treated as redacted. |
| MUST-T11-14 | An epoch checkpoint MUST be registrable as a Signed Statement carrying the checkpoint COSE object with content type `application/cedulon-checkpoint+cbor`. |

Issuer self-attestation:
: A Receipt Issuer that also produces the only copy of the extract
  can omit settlements. Completeness holds only against an
  extract the verifier obtained from the rail or from a rail
  signature.

Key rotation and revocation:
: `kid` identifies the verification key. This -02 does not specify
  a revocation list. Verifiers MUST pin the issuer keys they
  accept and MUST stop accepting a `kid` after an authenticated
  revocation signal.

Timestamp trust:
: `timestampMs` is issuer-asserted. Window assignment uses that
  field. A lying issuer can slide a receipt between windows.
  External timestamping of receipts is out of scope for -02; the
  checkpoint witness added here covers checkpoints, not receipt
  timestamps.

Collusion:
: If the rail operator and the issuer collude, they can publish a
  matching extract and receipt set that hides a real-world
  settlement. Cedulon does not detect extract-external agreement.

Reversal, refund, and partial settlement:
: State machines for reversal, refund, and partial settlement are
  out of scope for this revision.

## Optional escrow role {#escrow-role}

Parties MAY name an escrow actor in a Trade Manifest as a
third-party role that holds funds under rules outside this protocol
(`MAY-T8-6`). Implementations of this specification MUST NOT take
custody or operate escrow (`MUST-T8-custody`).

# IANA Considerations {#iana}

CWT claim labels need no assignment: this profile uses private-use
integer labels below -65536.

Media types do. This document defines five and makes their values a
normative check inside a protected COSE header (`MUST-T4-8`,
`MUST-T6-5`), so they cannot stay unregistered while that check stands.
If this work is taken up, the following should be registered in the
Standards Tree per {{RFC6838}}:

| Media type | Carries |
|---|---|
| application/cedulon-receipt+cbor | Spend Receipt claim set |
| application/cedulon-checkpoint+cbor | Epoch checkpoint claim set |
| application/cedulon-manifest+cbor | Trade Manifest claim set |
| application/cedulon-decision+cbor | Decision Token claim set |
| application/cedulon-countersign+cbor | Payee countersignature |

For each: encoding is binary CBOR {{RFC8949}}; security considerations
are those in {{security}}; the change controller would be the IETF; the
contact is the author of this document. Until registration, an
implementation outside a closed deployment should expect these names to
change, and readers should treat them as placeholders rather than as
stable identifiers.

# Implementation Status {#impl-status}

This section is to be removed before publishing as an RFC.

RFC 7942 {{RFC7942}} note.

Implementation:
: A companion implementation with a runnable verification suite at
  <https://github.com/dogrucanemek-alt/cedulon>. The code is a profile
  of this document, not a second specification. This -02 is not an
  IETF working-group item.

Maturity:
: Research code by a single implementer. Three readers have run the
  code on their own machines against a pinned commit and reported
  figures matching the author's: two from a clean clone of the whole
  suite, one re-running the published reproduction. That is
  byte-stability across environments, not an independent
  implementation, and the distinction matters: the same code agreeing
  with itself on three machines rules out a local accident and nothing
  more. One reader reports an independent implementation of the Signed
  Statement identity, kept deliberately separate from this codebase; no
  independent implementation of the reconciliation algorithm is known
  to the author.

Coverage:
: The receipt, checkpoint, extract, reconciliation, and verification
  algorithm are implemented, including the transparency witness input,
  the withheld and not-anchored conditions, and signed totals
  redaction. Every requirement added in this revision is implemented
  and covered by a red-then-green case before appearing in this text.
  The witness used in the suite is the in-process append-only log that
  `MAY-T11-6` permits; the implementation has not been run against a
  deployed Transparency Service, and it treats a receipt as a signature
  over a statement, not as a proof of log membership. The escrow role,
  reversal, refund, and partial settlement are not implemented.

Licensing:
: Apache-2.0.

Contact:
: The author of this document.

Experience:
: Readers of -00 and -01 have reported defects in both, and each
  revision has been driven by what they found rather than by a plan.
  -01 fixed a bypass of the completeness claim and a gap about which
  key an extract is checked against. The defect behind this revision
  was reported against -01 by a reader who then had it independently
  confirmed by a second: the object carrying the T11 guarantee was not
  profiled for registration and was never read during verification.
  Repairing it turned up one more, found while checking the repair
  rather than reported: the first attempt asserted the totals
  redaction in a field outside the signature, which let a checkpoint
  with wrong signed totals be re-presented as redacted and silence the
  mismatch. That is the defect `MUST-T11-13` now forbids, and it was
  the same shape as the bypass -01 was written to fix.

Note on distribution: the requirements in this document are implemented
in the repository at the commit named in the release notes. The
published `@cedulon` packages lag the repository: as of this revision
the requirements added here are in the repository but not yet in a
published package version, so a reader checking a claim against an
installed package should read the repository instead, or confirm the
package version carries the commit.

## Changes from -01 {#changes}

This revision has one subject: the checkpoint, which carries the T11
guarantee against suppression and rollback, was not wired into
anything that could discharge it.

A reader of -01 set out the gap and a second reader confirmed it
independently. Four things were wrong at once, and they were the same
thing seen from four sides. The SCITT anchoring section profiled the
Spend Receipt and not the checkpoint, so `SHOULD-T11-5` asked for
checkpoints to be registered without saying in what form
(`MUST-T11-14` now says). None of the steps of the verification
algorithm read a transparency receipt, so a deployment could follow
`SHOULD-T11-5` to the letter and still have a verifier that never
consulted the witness (steps 15 and 16 now do). `MUST-T11-3`,
equivocation, could not fire at all: the only checkpoints compared
were the presented ones, and `MUST-T11-8` requires those to be
consecutive, so no two of them can share an epoch. A second copy is
found in a witness, and nothing brought one in. And the checkpoint
binds a per-currency total for a window while the privacy section
counted only receipt fields, so a window total could be published, or
withheld, with no stated rule either way.

The repairs are `MUST-T11-10` through `MUST-T11-14`. The transparency
receipt is a new optional input; supplying none leaves the verifier
behaving exactly as in -01, which is deliberate, because the point of
the witness is to add a claim that could not be made before, not to
withdraw one that could.

Two decisions inside those repairs are worth stating on their own,
because a reader might reasonably have expected the other choice.

- A recorded checkpoint the presented chain omits gets its own
  identifier, `checkpoint-withheld`, rather than being folded into
  `window-coverage` (`MUST-T11-11`). The reporter asked which way it
  should go. Coverage says the record shown is incomplete; a withheld
  checkpoint says the party under audit is holding a record it did
  not show. An operator who sees one identifier for both cannot tell
  an incomplete record from a concealed one, which is the distinction
  the whole threat is about.
- A checkpoint with no receipt in a supplied witness is a warning
  rather than a failure. A witness may be configured after
  checkpoints have already been issued, and an operator's own gap in
  anchoring is not evidence that anything was concealed. The
  asymmetry is deliberate: what the witness holds and the chain does
  not is a finding, what the chain holds and the witness does not is
  a warning.

One change is not a repair of -01 but of the first attempt at this
revision, and it is recorded because the failure is instructive.
Signed totals were first made redactable through a field carried
alongside the checkpoint rather than inside the COSE payload. Anything
outside the signature is chosen by whoever presents the object, which
here is the party under audit, so a checkpoint whose signed totals
disagreed with its receipts could be re-presented as redacted and the
mismatch went unreported. Redaction is now inside the signature and a
redaction asserted anywhere else MUST be ignored (`MUST-T11-12`,
`MUST-T11-13`). This was the same shape as the bypass -01 was written
to close: a check that a party under audit could switch off.

Reversal, refund, partial settlement, and the escrow role remain out
of scope and are still expected later, with no date. -01 said the same
and this revision does not improve on it.

The reporters are named in the Acknowledgments.

# Evolution and Future Work (Informative) {#evolution}

This section is a direction, not a commitment. The structures below
are reserved in name only. Normative wire formats, tests, and
threat-model MUST lines for them belong in later revisions (-03 or
later), written with the same discipline as this -02.

## Re-attestation profile

Algorithms retire. A Spend Receipt or checkpoint signed under
Ed25519 today may need a later verifier that no longer accepts
`-19`. A companion seed {{REATTEST}} sketches re-attestation:
register the original COSE bytes as a SCITT Signed Statement and
have a current algorithm countersign or receipt them. The
principle is that structures outlive ciphers. The first concrete
example is the profile's own move from generic EdDSA (`-8`) to
Ed25519 (`-19`) in {{RFC9864}}.

## Streaming reconciliation

Epoch checkpoints in this document are batch windows. A later
revision may define a continuous, second-scale profile
{{STREAMING}} in which the same completeness relation is evaluated
as settlements arrive, without waiting for an epoch close. That
work does not change the matching rules in this document, and it
did not arrive in this revision either.

## Generalization

Payment is the special case that this -02 implements. The same
completeness calculus (an authenticated extract of consumed units
reconciled to signed receipts) can apply to other consumable
resources such as compute, data, or energy. This document does
not specify those profiles.

# Informative Notes on Adjacent Protocols

x402 {{X402}} uses HTTP 402 {{RFC9110}} to negotiate stablecoin
payment. AP2 {{AP2}} uses signed mandates as verifiable credentials.
Cedulon does not replace either protocol. Profiles built on HTTP Message Signatures
{{RFC9421}} authenticate bots; they are not a spend receipt.
draft-bates-atp {{BATES-ATP}} is a lineage neighbor. It does not
define rail-extract completeness.

draft-vauban-x402-stark-receipts {{VAUBAN}} specifies complementary
x402 receipt-format variants that a Cedulon Spend Receipt MAY carry
as a rail proof; it does not define rail-extract completeness.
draft-schrock-ep-outcome-binding {{SCHROCK}} compares authorized
action bytes to independently observed effects; it does not define
rail-extract completeness.
draft-marques-asqav-compliance-receipts {{MARQUES}} profiles
access-control action receipts (the broader Acta family includes
{{ACTA}}); it does not define rail-extract completeness.
draft-hopley-x402-compliance-receipt {{HOPLEY}} records an
admission-time compliance decision; it does not define rail-extract
completeness.

--- back

# Acknowledgments
{:numbered="false"}

Vernon Wharff set out the defect this revision repairs: that the
object carrying the T11 guarantee was neither profiled for
registration nor read during verification, and that the equivocation
requirement could not fire against a presented chain. He also asked
the question that decided the shape of the repair, namely whether a
recorded checkpoint absent from the chain deserves its own identifier
or belongs under window coverage. Iman Schrock confirmed the finding
independently and drew its boundary, keeping it separate from the
extract-binding work already closed in -01.

Iman Schrock and Pablo Play ran the -00 implementation against the
pinned commit and reported the defects that produced -01. Iman Schrock
found the two extract-binding defects, proposed the repair -01 adopts,
later reran the posted -01 from a clean clone against its own pinned
commit, and is also the author of {{SCHROCK}}, cited here as adjacent
work. He is the reader whose independent implementation of the Signed
Statement identity is noted in {{impl-status}}, and he asked for it to
be kept separate from any cross-implementation claim about Cedulon;
that separation is his and is recorded here as he stated it. Pablo Play found that a repeated reference hid the unaccounted
amount, filed a written reproduction, and re-ran that reproduction
against the pinned commit to confirm the figures quoted from it.

Nicholas Templeman ran the suite from a clean clone on a different
operating system and reported his figures, and classified his own run
honestly as a repetition of the author's checks rather than an
independent implementation. Walter Hawkins did not run it; he read the
reported figures and pressed for the run to be stated precisely enough
to be repeatable, which is why the conditions and not only the totals
appear in {{impl-status}}.

None of them reviewed this text, and any error in it is the author's.

Field survey notes and the informative threat-model narrative in the
companion repository helped shape the requirement identifiers used
here. Those identifiers are defined in {{security}}.

# Appendix A. Test Vectors {#vectors}
{:numbered="false"}

These vectors use RFC 8032 Ed25519 secret scalar #1 (fixture only;
never a production key). Hex is lowercase. They MUST match the
locked tests in the companion implementation.

Receipt COSE_Sign1:

Claims: payer=`payer-1`, payee=`payee-1`, amount=`1`,
currency=`USD`, policyHash=`aa`, manifestHash=null,
noManifest=true, x402PaymentRef=null, timestampMs=1700000000000,
nonce=`n100000000000000`, prevReceiptHash=null, outcome=`aborted`.

COSE_Sign1 hex (whitespace ignored; identical to the locked test):

~~~~
845830a301320378206170706c69636174696f6e2f636564756c6f6e2d
726563656970742b63626f72044806e3fd8fda29bb60a0587cac3a0001
11706770617965722d313a000111716770617965652d313a0001117261
313a00011173635553443a000111746261613a00011175f63a00011176
f53a00011177f63a000111781b0000018bcfe568003a00011179706e31
30303030303030303030303030303a0001117af63a0001117b6761626f
727465645840685c01aa778a850b9d35250406f092b6f5cb03fb359593
0422533e28ac620ad439f5e7bd8ed1fa5ded90d4421a2de34f94d1d78d
38a65812cb5315ee7f1cf403
~~~~

Manifest COSE_Sign1:

Body: description=`fixture-goods`, amount=`1`, currency=`USD`,
acceptanceCriteriaHash=`00`, cancelCondition=`none`,
expiresAtMs=1700000000000, ap2MandateHash=null.

COSE_Sign1 hex (whitespace ignored; identical to the locked test):

~~~~
845831a301320378216170706c69636174696f6e2f636564756c6f6e2d
6d616e69666573742b63626f72044806e3fd8fda29bb60a0584aa73a00
0112386d666978747572652d676f6f64733a0001123961313a0001123a
635553443a0001123b6230303a0001123c646e6f6e653a0001123d1b00
00018bcfe568003a0001123ef65840898628b1524a44ca641b5058c7a4
7e71bd4ce1ca0782e03b511c23e0819c3771407d627216d0b104224ee8
2cacffbd21e66fe035ed5ce4ee85b7bcd9c560ad02
~~~~
