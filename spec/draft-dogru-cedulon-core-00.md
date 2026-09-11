---
title: "Cedulon Core: Spend Receipts and Rail Reconciliation for Agent Commerce"
abbrev: Cedulon Core
docname: draft-dogru-cedulon-core-00
date: 2026-09-09
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
  RFC7493:
  RFC8032:
  RFC8174:
  RFC8392:
  RFC8410:
  RFC8785:
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
  RFC4846:
  CEDULON-DT:
    title: "Cedulon: An Audit Layer for Agent-to-Agent Commerce"
    author:
      - ins: E. C. Dogru
        name: Emek Can Dogru
    date: 2026
    target: https://datatracker.ietf.org/doc/draft-dogru-cedulon/
  CEDULON-CHECKPOINT:
    title: "Cedulon Checkpoints: Epoch Witnesses and Transparency"
    author:
      - ins: E. C. Dogru
        name: Emek Can Dogru
    date: 2026
    target: https://github.com/dogrucanemek-alt/cedulon/blob/master/spec/draft-dogru-cedulon-checkpoint-00.md
  CEDULON-THREATS:
    title: "Cedulon Threat Narratives"
    author:
      - ins: E. C. Dogru
        name: Emek Can Dogru
    date: 2026
    target: https://github.com/dogrucanemek-alt/cedulon/blob/master/spec/draft-dogru-cedulon-threats-00.md
  KUEHLEWIND-AUDIT:
    title: "An Architecture for Auditing AI Agent Delegation and Interactions"
    author:
      - ins: M. Kuehlewind
        name: Mirja Kuehlewind
      - ins: H. Birkholz
        name: Henk Birkholz
    date: 2026-05
    target: https://datatracker.ietf.org/doc/draft-kuehlewind-audit-architecture/
  BIRKHOLZ-VAC:
    title: "Verifiable Agent Conversation Records"
    author:
      - ins: H. Birkholz
        name: Henk Birkholz
      - ins: T. Heldt
        name: T. Heldt
      - ins: O. Steele
        name: Orie Steele
    date: 2026-08
    target: https://datatracker.ietf.org/doc/draft-birkholz-verifiable-agent-conversations/
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
  ABAK:
    title: "Evidence Requirements for Agent Control Delivery and Outcome Reconciliation"
    author:
      - ins: A. T. Abak
        name: Ali Toygar Abak
    date: 2026-08
    target: https://datatracker.ietf.org/doc/draft-abak-agent-control-delivery-evidence/
  CPB:
    title: "Canonical Payload Binding: A Signed Statement Construction Profile"
    author:
      - ins: S. Mih
        name: Steven Mih
      - ins: A. Sokolov
        name: Anton Sokolov
    date: 2026-08
    target: https://datatracker.ietf.org/doc/draft-mih-sokolov-scitt-payload-binding/
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

This document defines the core of the Cedulon Protocol, an audit layer
for agent-to-agent commerce. Payment rails such as HTTP 402 flows
(x402) and mandate protocols (AP2) already move value, and a mandate
protocol can already refuse a spend before it happens. What they do
not, by themselves, give a party that is neither payer nor rail
operator is a retrievable record of that decision and a signed spend
receipt that reconciles against an authenticated extract of the rail.
This document specifies a Trade Manifest (a signed offer before
payment), a Policy Decision Point with default deny, a Spend Receipt
(a COSE/CWT claim set issued after a gated payment), and rail-extract
reconciliation.

The reconciliation shows that no settlement on the extract lacks a
receipt and no settled receipt is absent from the extract. That result
is unconditional only when the verifier pins the rail key out of band
and names the account, rail and window under audit; otherwise it is
reported as conditional. No signed object is attested by a key it
carries itself, and the exact input to every hash-valued field is
stated, so that an independent verifier can be written from the text
alone. Epoch checkpoints, the transparency witness and the anchoring
of checkpoints as SCITT Signed Statements are specified in a companion
document. Cedulon is not a competitor to x402 or AP2; it sits above
them.

--- middle

# Introduction

Agents can now pay. Open HTTP 402 protocols {{X402}} attach
stablecoin settlement to ordinary requests. Card networks and
processors issue agent-scoped tokens. Google's Agent Payments
Protocol (AP2) {{AP2}} binds user intent to signed mandates.

What is missing is an interoperable **audit layer**: a machine-checkable
answer to "was this spend allowed by policy, against which offer, and
what bytes were delivered?" The third question is answered to the
extent the evidence carries it: machine-checkably where an
attributable payee countersignature binds a `deliveredHash`
({{countersign}}), and narrowed to "what bytes were promised, and
what hash was presented beside them" where none does - a bundle
must not claim more than its signatures cover. Without this layer, a
prompt-injected or
looping agent can drain a rail that has already accepted a valid
signature. A counterparty can ship the wrong artifact. A transparency
log, if used at all, is proprietary.

Cedulon fills that gap. The name is from cedule, the older legal
word for a written schedule or note.
It does not clear funds, hold custody, or
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
extract shape, and a verification algorithm precise enough that two
implementations reach the same finding on the same evidence. The
checkpoint chain that carries the same discipline over epochs is in
{{CEDULON-CHECKPOINT}}. The novelty is interoperability, not the idea.

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

Presented-unattested:
: The state of a receipt or checkpoint the verifier holds no pinned
  issuer key for. Its signature is checked against the key the object
  itself carries ({{presentation}}), which establishes internal
  consistency only, so the object is neither attested nor rejected:
  every presented object is weighed as one set and the completeness
  guarantee is reported as conditional. It is a state of the report,
  not a finding code. See {{issuer-root}}.

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
Receipt Issuer signs a Spend Receipt over the deterministic CBOR
encoding of its claims (`MUST-T4-1`). Verifiers reject bad signatures and byte mismatch
(`MUST-T4-2`).

## Anchor / SCITT

Parties MAY register the signed receipt (or a privacy-preserving hash
encoding) as a SCITT Signed Statement {{RFC9943}} and attach the COSE
receipt (`MAY-T4-6`). This document does not operate a Transparency
Service.

# Trade Manifest {#trade-manifest}

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
  bytes, lowercase hexadecimal)
- cancel condition (opaque string agreed by the parties)
- expiry (POSIX milliseconds, `expiresAtMs`)

The hash is taken over the exact delivery bytes only. Hashing a
schema instance instead would need a marker in the manifest saying
so; this document defines no such marker, and until one is defined
that use is out of scope rather than an alternative a verifier is
expected to guess at.

It MAY include `ap2MandateHash`. The corresponding CBOR label is
always present; a missing mandate is encoded as CBOR null.

It MAY name a `payee`. An offer that is specific to one counterparty
carries that party's payee identifier; when present, every receipt
that names this manifest has its `payee` compared against it as exact
octets under `MUST-T8-9`, on that requirement's two-branch severity.
An open offer legitimately omits the member, and no comparison is
made. Unlike `ap2MandateHash`, the label is encoded only when the
member is present, so a manifest signed before -05 carries
the same bytes and keeps verifying; this is why the null convention
above does not apply to it.

The manifest is COSE_Sign1 {{RFC9052}} over a deterministic CBOR claim
map ({{cose-profile}}). `manifestHash` is the SHA-256 of the signed
COSE bytes (`MUST-T8-7`). A spend bound to a manifest MUST be denied
if the requested amount or currency differs from the manifest
(`MUST-T8-2`) or if the manifest is expired (`MUST-T3-3`).

A spend that is not bound to a verified manifest MUST be marked
`noManifest` on the receipt and MUST still pass limit, velocity, and
scope checks (`MUST-T1-2`). An implementation MAY refuse all
`noManifest` spend (`MAY-T1-4`).

# Spend Receipt {#spend-receipt}

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
Spend Receipt (`MAY-T8-10`). The profile uses a **detached**
COSE_Sign1 {{RFC9052}} whose payload is a CBOR map with private-use
labels:

| Label | Claim | CBOR type |
|---|---|---|
| -70401 | receiptCose | bstr (exact issuer COSE_Sign1 bytes) |
| -70402 | deliveredHash | bstr (optional; SHA-256 of the exact delivered bytes) |

The countersignature uses the header profile in {{cose-profile}}
and content type `application/cedulon-countersign+cbor`.

This is a second Sign1 object, not RFC 9052 Countersignature0
(unprotected-header label 11). Countersignature0 would write into
the issuer object and change `receiptHash` after issue, breaking
the receipt chain. A detached Sign1 keeps the issuer bytes
stable, reuses `kid` and content-type, and is absent by simply
omitting the sibling object.

Absence of a countersignature MUST NOT invalidate the issuer
receipt (`MAY-T8-10`). A countersignature travels beside the issuer
signature without being covered by it, so anyone holding an honest
receipt can append one of their own. Attribution is therefore the
gate: a countersignature that cannot be attributed to the pinned
payee key - the signature fails, `kid` or content type does not
match, label -70401 is not the issuer COSE bytes (`MUST-T8-8`), or
the signature is valid under some other key - MUST be rejected as
approval evidence. What is rejected is the countersignature, not
the receipt: the verdict on the untouched issuer receipt MUST NOT
change because an unattributable object was attached. An appendable
object the issuer signature does not cover must not be able to
manufacture a negative result; this is the lesson `MUST-T8-9`
already encodes for the manifest comparison, applied one object
over. The identifiers `countersign-bad` (unverifiable) and
`countersign-key-mismatch` (verifiable under another key) name the
discarded object as warnings, and where the verifier pinned a payee
key and no attributable countersignature remains, the
`countersign-missing` warning still applies: a discarded forgery is
the absence of the payee's word, not a substitute for it.

The optional `deliveredHash` claim binds delivery to the receipt
under the payee's key. A payee who countersigns MAY include the
SHA-256 of the exact bytes it received in the same signed payload
as the issuer receipt bytes. When an attributable countersignature
carries `deliveredHash` and the verifier also holds the Trade
Manifest, the two digests are compared as exact octets:
`deliveredHash` against `acceptanceCriteriaHash`. A mismatch is
`delivery-mismatch`, and it is a finding rather than a warning,
because both ends of the comparison are signed. A `deliveredHash`
carried by an unattributable countersignature is discarded with it.
A countersigner MUST refuse to sign a `deliveredHash` that is not 32
octets; a verifier that meets one anyway treats the countersignature
as carrying no `deliveredHash`, so the delivery question narrows as
it does when the claim is absent, and the signature verdict does not
move. A countersignature without the claim is valid exactly as before
-05, which introduced it.

A Dispute Evidence Bundle that includes a verified countersignature
has stronger evidence that the payee accepted those bytes; the
bundle is still not an award (`MUST-T8-4`).

# COSE Profile {#cose-profile}

This profile uses deterministic CBOR {{RFC8949}} Section 4.2.1
(definite lengths, shortest integer form, map keys sorted in
**bytewise lexicographic** order of their encoded keys).
Implementations MUST encode only the types used by Cedulon claim maps:
null, bool, unsigned and negative integers, UTF-8 text, byte strings,
arrays, and maps (`MUST-T4-1`).

A decoder MUST refuse a CBOR map that carries a duplicate encoded
key (`MUST-T4-18`). The encoding rules already forbid producing one, so
a decoder that accepts it accepts a document no conforming encoder can
produce, and two decoders may disagree on which of the two values
wins, which is a disagreement about what was signed.

A decoder MUST also impose a bound on what it will attempt: on encoded
size, on nesting depth, and on the number of elements it will decode
from an audit input. It MUST refuse an input that exceeds a bound with
a named refusal rather than by exhausting memory or the stack, and it
SHOULD document the bounds it applies (`MUST-T4-19`). This document
fixes no numbers. A bound that is right for a desktop verifier is wrong
for a service, and a number written here would be wrong for one of them
within a year. What a reader is entitled to is that the refusal is a
refusal, named and reported, rather than a crash that an operator has
to interpret.

## Claim labels {#receipt-labels}

Registered CWT claims {{RFC8392}} are not required by this profile. Cedulon
uses CWT private-use integer labels less than -65536 so that the
profile does not occupy the 100-110 registry range.

Every claim the tables below annotate as `hash` carries a SHA-256
digest rendered as exactly 64 lowercase hexadecimal characters
(`[0-9a-f]{64}`). A signer MUST refuse to sign, and a validator MUST
reject, a value that does not match that grammar, naming the claim in
the refusal. A decoder that preserves unknown or foreign claims is a
separate layer and keeps them unchanged; the grammar binds what a
party signs and what a validator accepts, not what a decoder can
carry.

Receipt labels (`MUST-T4-3`, `MUST-T4-4`, `MUST-T4-7`):

| Label | Claim | CBOR type |
|---|---|---|
| -70001 | payer | tstr |
| -70002 | payee | tstr |
| -70003 | amount | tstr |
| -70004 | currency | tstr |
| -70005 | policyHash | tstr (hash) |
| -70006 | manifestHash | tstr (hash) / null |
| -70007 | noManifest | bool |
| -70008 | x402PaymentRef | tstr / null |
| -70009 | timestampMs | uint |
| -70010 | nonce | tstr |
| -70011 | prevReceiptHash | tstr (hash) / null |
| -70012 | outcome | tstr (`settled` / `aborted`) |

Checkpoint labels (`MUST-T11-1`):

| Label | Claim | CBOR type |
|---|---|---|
| -70101 | epoch | uint |
| -70102 | startMs | uint |
| -70103 | endMs | uint |
| -70104 | receiptCount | uint |
| -70105 | chainHeadHash | tstr (hash) / null |
| -70106 | totals | map tstr -> tstr / null |
| -70107 | prevCheckpointHash | tstr (hash) / null |

Manifest labels (`MUST-T8-1`):

| Label | Claim | CBOR type |
|---|---|---|
| -70201 | description | tstr |
| -70202 | amount | tstr |
| -70203 | currency | tstr |
| -70204 | acceptanceCriteriaHash | tstr (hash) |
| -70205 | cancelCondition | tstr |
| -70206 | expiresAtMs | uint |
| -70207 | ap2MandateHash | tstr (hash) / null |
| -70208 | payee | tstr (optional; encoded only when present) |

Decision Token labels (`MUST-T6-4`):

| Label | Claim | CBOR type |
|---|---|---|
| -70301 | requestHash | tstr (hash) |
| -70302 | policyHash | tstr (hash) |
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
  `application/cedulon-decision+cbor`,
  `application/cedulon-countersign+cbor`, or
  `application/cedulon-inclusion+cbor`
- `4` (kid) = bstr, mandatory. The profile computes `kid` as the
  first eight bytes of SHA-256 over the issuer's SubjectPublicKeyInfo
  DER, in the Ed25519 SubjectPublicKeyInfo encoding of {{RFC8410}}. A
  verifier MUST obtain the public key from an authenticated
  channel (preconfigured issuer set, directory, or transparency
  statement) and MUST reject a message whose `kid` does not match
  that key.

The unprotected header MUST be empty, and a decoder MUST refuse a
message whose unprotected header is not an empty map, by the name
`cose-sign1-unprotected`, rather than verify the signature and ignore
the header (`MUST-T4-21`). The reason is in {{hash-inputs}}: every
digest over a signed object in this profile is computed over the
COSE_Sign1 octets, which include the unprotected header, while the
signature does not cover it. A decoder that ignored a stuffed header
would verify the signature and compute a `receiptHash` the issuer
never produced, so one honestly signed receipt could carry as many
digests as a stranger cared to give it, and a chain built on
`prevReceiptHash` would follow whichever copy it was handed. The
payload MUST be
the CBOR encoding of the claim map. The signature is Ed25519
{{RFC8032}} over the COSE `Sig_structure`
`["Signature1", protected, h'', payload]`.

## How a signed object is presented {#presentation}

The signed octets above are what this profile defines and what every
digest in {{hash-inputs}} is taken over. An object handed to a
verifier travels with a little more than that, and the previous
revisions used one of those members - the key an object carries -
without ever saying where it came from.

A presented Spend Receipt, epoch checkpoint, Trade Manifest, or
Decision Token carries, beside the signed octets, its claim set or
body in decoded form and **the signer's public key as a
SubjectPublicKeyInfo PEM**; a countersigned receipt carries the
payee's key the same way, and an object presented in the JSON
encoding of {{canonical-json}} repeats its signature there as
base64. None of these is inside the signed octets, which is the
whole point of naming them here: the signature
covers the COSE message and nothing else, so every one of these
members is a surface anyone holding the object can rewrite. This is
the same shape the Rail Extract states in {{rail-extract}}, and it
is stated once here for the COSE objects rather than left to be
inferred from an implementation.

A carried key is not an identity source and MUST NOT be used as one
(`MUST-T4-11`). Under a pin it has exactly one effect: an object
that verifies under the pinned key while carrying a different key is
reported as `carried-key-mismatch`, a warning, and stays attested
({{issuer-root}}). With no pin held it is the only key present, so
the signature check that runs against it says the object is
internally consistent and says nothing about who signed it; two
issuers cannot be told apart in that state.

# Canonical JSON encoding {#canonical-json}

Not everything this document hashes or signs is CBOR. The policy
document, the six request fields bound by a Decision Token, and the
scoped body of a Rail Extract are JSON. Two implementations could
agree on every other requirement in this document and still produce
different bytes unless the encoding is named, which makes an
independent verifier impossible to write from the text. This section
names that encoding.

Where this document says "the canonical encoding" of a JSON document,
it means the encoding defined by {{RFC8785}}, and the octets hashed or
signed are the UTF-8 octets of that encoding.

Three notes on the boundary of that reference:

- {{RFC8785}} Section 3.1 takes I-JSON {{RFC7493}} as its input, and
  an I-JSON object carries no duplicate member names. This document
  makes that precondition a rule at every place a verifier receives a
  JSON document as text - a rail extract body, a policy document, a
  stored receipt file: a text in which any object, at any depth,
  repeats a member name MUST be refused by the name
  `json-duplicate-key`, before the text is parsed (`MUST-T4-20`). The
  rule is measured on the text because a parser that keeps either
  value has already discarded the evidence of the other, and two
  verifiers parsing one text could then canonicalize two different
  documents and sign or check two different octet strings, which is
  the JSON form of the disagreement `MUST-T4-18` forbids for CBOR. A
  verifier handed an object rather than text, as a tool behind a
  JSON-RPC boundary is, cannot apply the rule and MUST NOT report
  that it did; whether the text was checked is then the transport's
  to state.

- {{RFC8785}} Section 3.2.2.2 requires a serializer to terminate on a
  lone surrogate, and so does this document: a producer MUST refuse to
  encode a document containing one, by name, and MUST NOT sign what it
  could not encode. A verifier reading bytes it cannot canonicalize for
  this reason reports the input as failing verification with the
  refusal named beside the verdict; it does not crash. No field defined
  by this document may contain a lone surrogate, so a conforming
  document never reaches this rule.

- {{RFC8785}} defines no encoding for an integer outside the IEEE 754
  double range. No document defined here carries one: every amount and
  cumulative limit is already a decimal string before it is encoded,
  and every hash is lowercase hexadecimal. A document that would need
  such an integer is outside this specification.

## Which octets are hashed {#hash-inputs}

Every hash-valued field in this document is SHA-256 {{RFC6234}} of the
input named below. All but three are rendered as lowercase hexadecimal.
`kid` differs only in its rendering: the digest is computed over the
same stated input and then truncated to its first 8 bytes, carried as
a byte string rather than as hex ({{cose-profile}} states the same
rule where the header is defined). `ap2MandateHash` differs in whose
digest it is: AP2 defines the mandate and its octets, and this
document carries the result opaquely rather than restating a rule it
does not own. `deliveredHash` differs in its carrier: it is a claim in
a CBOR map and is carried as the raw 32 digest bytes (bstr), not as
hex; comparisons against `acceptanceCriteriaHash` are made over the
digest value.

| Field | Input to SHA-256 |
|---|---|
| `receiptHash` | the signed COSE_Sign1 octets of the receipt |
| `manifestHash` | the signed COSE_Sign1 octets of the Trade Manifest |
| `checkpointHash` | the signed COSE_Sign1 octets of the checkpoint |
| `statementHash` | the signed COSE_Sign1 octets of the statement |
| `acceptanceCriteriaHash` | the exact delivery bytes, as defined where the Trade Manifest is |
| `deliveredHash` | the exact bytes the payee received; the same input rule as `acceptanceCriteriaHash`, computed by the other party |
| `policyHash` | the UTF-8 octets of the canonical policy document |
| `requestHash` | the UTF-8 octets of the canonical six-field request document |
| `kid` | the SubjectPublicKeyInfo DER; the digest is then truncated to its first 8 bytes |
| `ap2MandateHash` | the octets AP2 defines for its mandate; not profiled by this document |

Wherever this table, or any other sentence in this document, says "the
signed COSE_Sign1 octets", those are the octets of the **untagged**
four-element COSE_Sign1 array of {{RFC9052}}. This profile never wraps
a message in CBOR tag 18, and the vectors in Appendix A carry the
untagged form. A verifier that hashed a tagged copy would compute a
different digest for every object in this profile, so the choice is
stated here once rather than left to be inferred from the vectors.

The six fields of the request document are the ones `MUST-T6-1` names:
amount, currency, payee, tool, nonce, and `manifestHash`.

Naming the members is not stating the document, so the document is
stated here. The request document is a JSON object carrying exactly
those six members and no others, every member always present. `amount`
is the decimal string of the request, in the amount syntax the receipt
claims table states, never a JSON number: {{RFC8785}} encodes the
number 1 and the string "1" differently, and an implementation free to
pick either would produce two digests for one request. `currency`,
`payee`, and `nonce` are the request's text strings. `tool` is the
request's text string, or JSON null where the deployment names none.
`manifestHash` is the lowercase hexadecimal string, or JSON null for a
spend bound to no manifest; an absent value is null, never an omitted
member. A document with a seventh member, a missing member, or another
type for one of these is not the request document this section
defines.

The policy document is different on purpose, and the difference is
scope rather than an oversight. Its member set is the deployment's
own: this document defines how the bytes of whatever policy document a
PDP evaluates are encoded ({{canonical-json}}) and digested, not what
its members are. `policyHash` binds a spend to the exact bytes its PDP
evaluated; it is not a value two deployments are expected to compute
from a shared schema, and nothing in the verification algorithm
compares one deployment's `policyHash` to another's.

# Decision Token {#decision-token}

A Decision Token is the portable encoding of a PDP allow. It is
COSE_Sign1 with the header profile in {{cose-profile}} and the
labels in {{receipt-labels}}. All five labels are always present
(`MUST-T6-4`).

`requestHash` MUST be the SHA-256 of the canonical encoding of the six
fields the PDP evaluated (`MUST-T6-1`), rendered as lowercase
hexadecimal; {{canonical-json}} defines that encoding and
{{hash-inputs}} states the octets.
`policyHash` MUST be the SHA-256 of the canonical
policy document the PDP evaluated. `expiryMs` is a Unix time in
milliseconds after which the token MUST be treated as expired
(`SHOULD-T6-3`): expired when the evaluation time is strictly greater
than `expiryMs`, not yet expired at exactly `expiryMs`, on the same
boundary discipline `MUST-T3-3` states for the manifest. `nonce` is the request nonce. `singleUseId` is
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

The extract body is a JSON document. Each settlement record MUST
contain the following members, under these names:

| Member | JSON type |
|---|---|
| ref | string (rail payment reference) |
| amount | string matching `0|[1-9][0-9]*` |
| currency | string |
| timestampMs | number (POSIX milliseconds, an integer) |

These member names are normative. A rail MAY add members of its own
to a record; it MUST NOT rename the four above. The types above
are stated in JSON terms.

A record MAY carry a `beneficiary` member (string). A rail that can
resolve a payment reference to the party credited declares it there;
when present, it is compared against the payee of the receipt that
names the same `ref`, and a difference is reported
(`beneficiary-mismatch`). Resolving a reference to a beneficiary is a
feature of the rail's own system: this profile does not assume it,
and measures it only when the rail declares it.

## Scope

An extract is scoped to one account identifier, one rail identifier,
and one half-open time window `[windowStartMs, windowEndMs)`. The
signed body is one JSON document with exactly this shape:

| Member | JSON type |
|---|---|
| accountId | string |
| railId | string |
| windowStartMs | number (POSIX milliseconds, an integer) |
| windowEndMs | number (POSIX milliseconds, an integer) |
| clockSkewMs | number (milliseconds, a non-negative integer; optional; see {{reconciliation}}) |
| settlements | array of settlement records (schema above) |

All six named members except `clockSkewMs` MUST be present; a body
missing one, or a record renaming a core member, MUST be refused by
name at both ends - by the signer before it signs and by the verifier
before it checks a signature - so a malformed extract is the same
refusal on both sides rather than a signature verdict. Additional
members beyond these are the rail's to add, as with records.

The integer-valued members - `windowStartMs`, `windowEndMs`, each
record's `timestampMs`, and `clockSkewMs` - MUST be integers of
magnitude at most 2^53 - 1, the range a JSON number carries exactly,
and `clockSkewMs` MUST NOT be negative; a value outside those bounds,
or a non-integer, is refused by name in the same way as a missing
member. `windowEndMs` MUST be greater than `windowStartMs`: the window
is half-open, so one that does not end after it starts declares no
population, and a body carrying one is refused by name
(`malformed-extract-window`) in the same way, at both ends.

The body is read as text before it is read as an object. A text in
which any object repeats a member name is refused as
`json-duplicate-key` at both ends, before parsing and before any
signature is checked (`MUST-T4-20`, {{canonical-json}}); a signer
that parsed first would sign one of the two values and an honest
verifier could check the other.

`clockSkewMs`, when present, declares the boundary allowance the
verifier applies at this window's edges during reconciliation
({{reconciliation}}); when absent, the profile default of 300000
milliseconds (five minutes) applies.

## Authentication

The rail signs Ed25519 {{RFC8032}} over the canonical encoding of the
scoped body, which is a JSON document and therefore takes the encoding
of {{canonical-json}}: the signed octets are the UTF-8 octets of the
{{RFC8785}} encoding of the body above. The signature and the rail's
public key travel beside the body, the signature as base64 and the
key as a SubjectPublicKeyInfo PEM; neither is part of the signed
octets. A verifier MUST
obtain the extract from the rail or from a signature the rail
published (`MUST-T10-7`). A deployment that cannot do so is running
the reconciliation against evidence it did not obtain independently,
and MUST report the guarantee as conditional.

A signature on an extract proves internal consistency, not origin: a
key generated by whoever produced the object verifies against itself.
The verifier therefore MUST obtain the rail's public key out of band
and MUST verify the extract signature against that key (`MUST-T10-8`).
A key the extract carries is not that key: it is neither the rail's
identity nor a fallback for one the verifier did not obtain. Where no
such key is held, the carried key is the only key present, so the
signature check that runs against it says the extract is internally
consistent and says nothing about who produced it, and the verifier
MUST treat the guarantee as conditional.

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
asserted nothing, so the condition is `unauthenticated-extract`
whatever the extract carries - a signature that verifies against the
carried key establishes internal consistency and not origin, and one
that fails or is refused is not a verdict about a key either. It is a
warning: completeness findings may still be computed, but the
guarantee is **conditional** on the extract being authentic. With a pinned key the verifier has
asserted what it requires, and an extract that fails to meet it is a
failure rather than a caveat; see the verification algorithm for which
finding applies.
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

The period is one axis of that scope. The account and the rail are
the other two, and they behave the same way: an extract names one of
each, so a verifier that has not stated them leaves the extract to
say whose settlements were accounted for and which way out was
watched. A verifier that has not stated the account or the rail under
audit therefore MUST emit `unstated-audit-scope` and MUST treat the
guarantee as conditional (`MUST-T10-18`). Where no rail key is pinned
at all, all three axes are equally unstated and
`unauthenticated-extract` is the condition reported.

Stating them does not widen the population; it names it. One account
settling on two rails has two settlement paths, and an extract for
the first reports nothing about the second: a spend that left that
way is not an unmatched row, it is outside the population the extract
declared. Because the strongest line this profile prints - a balanced
audit under an unconditional guarantee - is true of one account, on
one rail, over one window, a report that carries it MUST also carry
that account, rail and window (`MUST-T10-19`). A completeness claim
about an account is the conjunction of one such report per rail that
account can settle on, and enumerating those rails is the deployment's
statement, not something an extract can be asked to prove.

# Trust roots {#trust-roots}

{{rail-extract}} states the rule for one object: a signature proves
internal consistency, not origin, so the verifier obtains the rail key
out of band and checks the extract against it, and the key the extract
carries is neither the rail's identity nor a fallback for one the
verifier did not obtain (`MUST-T10-8`). The same discipline applies
to the issuer: a verifier obtains the public key from an
authenticated channel and rejects a `kid` that does not match that
key (`MUST-T4-8`). This section states the verification algorithm,
the separate root inputs, and the error semantics that name a missing
or mismatched pin, for every signed object in the profile.

The gap is not theoretical. A verifier that checks a Spend Receipt
against the key the receipt carries accepts a receipt signed by any
key at all, including one an attacker minted for the occasion. Such a
receipt matches a settlement the attacker was never authorised to
make, the settlement stops looking uncovered, and the audit reports
nothing. The completeness property in {{reconciliation}} is then
computed over evidence that answers to nobody.

## The issuer root {#issuer-root}

A verifier MUST obtain the issuer's public key out of band and MUST
verify Spend Receipt and epoch checkpoint signatures against that key.
A key the object carries is not that key: it establishes no signer
identity and is not a fallback for a pin the verifier does not hold
(`MUST-T4-9`, `MUST-T4-11`). Where no issuer key is held, a signature
checked against the key its own object carries establishes internal
consistency and nothing more, which is the state {{presentation}} and
the last row of the table below describe. A
verifier that holds no such key and is presented with any Spend
Receipt or epoch checkpoint MUST treat the completeness guarantee as
conditional and SHOULD report the condition; the identifier
`unauthenticated-issuer` is used for it in this implementation.

The condition names those two objects because an audit given no
receipts and no checkpoints rests on the extract alone.
There the absent issuer root withholds nothing, and warning about a
root the audit never consulted would spend the warning where it
carries no information.

Reporting a mismatch is not sufficient on its own. A receipt that
does not answer to the pinned issuer key MUST NOT count as coverage
for the settlement it names, and the settlement MUST still be
reported as uncovered (`MUST-T4-10`). A verifier that reports the
mismatch and then lets the receipt match the settlement anyway has
described the attack in its output while still concluding that the
books balance.

Keys are compared as bytes, by their SubjectPublicKeyInfo DER
encoding, on the same terms as `MUST-T10-9`. A pinned issuer key the
verifier cannot decode is a fault in its own configuration and MUST
be reported as `trust-key-unreadable` rather than as a mismatch
against the objects; where no pinned key can be decoded at all,
nothing is attested and the verifier MUST NOT fall back to accepting
the keys the objects carry (`MUST-T4-11`). Falling back is how a
mistyped configuration becomes a bypass.

Membership in the attested set follows one rule: the signature
verifies under a pinned issuer key. The `kid` header routes the check
to a candidate key; the key an object carries beside its signature is
not an identity source, because it travels outside the signed octets
and anyone can rewrite it. Two consequences are stated so that
implementations do not diverge on them. First, an honestly signed
object whose carried key was swapped stays attested: the swap is
reported (`carried-key-mismatch`, a warning) and MUST NOT move the
object out of the attested set or change the verdict, on the same
reasoning as {{countersign}} - a surface the signature does not cover
must not be able to manufacture a negative result. Second, an object
that claims the pin, by its carried key or its `kid`, but does not
verify under it is excluded from the attested set and MUST still be
walked and named - for a receipt, `receipt-chain-break` with a
signature-failed detail - never silently dropped; an object that
neither verifies under the pin nor claims it is
`issuer-key-mismatch`, excluded, and the settlement it names stays
uncovered.

The rule, read out per cell (steps 6 and 8 are the verification
algorithm's):

| Claims the pin (carried key or `kid`) | Verifies under the pin | Result |
|---|---|---|
| yes | yes | attested; a carried key other than the verifying one is `carried-key-mismatch`, a warning, and does not move the receipt |
| yes | no | excluded from the attested set; still walked and named in step 6 (`receipt-chain-break`, signature-failed detail); its settlement stays uncovered in step 8. A checkpoint has no chain walk to be named in, so it is reported as `issuer-key-mismatch` on this row as well as the next, and the window it would have covered is reported uncovered |
| no | no | `issuer-key-mismatch`; excluded; its settlement stays uncovered in step 8 (`MUST-T4-9`, `MUST-T4-10`) |
| no pin held | no pin to verify under | no comparison against a key the verifier holds happens, and the keys the objects carry are not a fallback for one (`MUST-T4-11`); each signature is still checked against the key its own object carries ({{presentation}}), which establishes that the object is internally consistent and nothing about who signed it, so a broken signature is still named (`receipt-chain-break`, `checkpoint-total-mismatch`) while two different issuers cannot be told apart; receipts are presented-unattested, the verifier reports `unauthenticated-issuer`, and accusation-shaped findings take the two-branch severity of `MUST-T8-9` |

A verifier MUST accept an issuer root that is a set of keys rather
than a single key (`MUST-T4-12`). An issuer that rotates its key
mid-window otherwise
produces a finding against every honest receipt signed by the
retired key, and the reachable way out of that is to stop pinning,
which is the opposite of what the pin is for. The same acceptance
applies to a publisher pin, a witness pin, and a rail pin: a
verifier MUST accept each of those roots as a set of keys, so a
rotation inside the window does not force it off the pin.

## The payee root {#payee-root}

The optional countersignature in {{countersign}} travels beside the
issuer signature without being covered by it. Anyone holding an
honest receipt can append a countersignature of their own, so a
verifier that checks it against the key carried next to it learns
only that some key signed something.

A countersignature MUST NOT be treated as evidence that the payee
approved the payment unless it verifies against a payee key the
verifier obtained out of band (`MUST-T4-13`). Without such a key the
verifier SHOULD report the condition and MUST treat the guarantee as
conditional.

Naming a payee key states an expectation, and an expectation that
only fires when the evidence is present can be cancelled by deleting
the evidence. Where a verifier has pinned a key for a payee, a
settled receipt naming that payee and carrying no **attributable**
countersignature MUST be reported (`MUST-T4-14`): a countersignature
that failed to verify, or verified under some other key, is discarded
under {{countersign}} and leaves the expectation open exactly as a
missing one does. Otherwise an attacker removes their own failed
forgery - or appends one - and the report returns to unconditional.
The discarded object itself is a warning, never a failure of the
receipt it rode beside; {{countersign}} states the invariant.

## The decision root {#decision-root}

A Decision Token is issued by the policy decision point and consumed
by the same deployment. The consumer therefore holds the key it
signs with and has no reason to ask the token which key to check it
against. A consumer MUST verify a Decision Token against its own
issuing key and MUST NOT accept one it cannot check that way
(`MUST-T6-6`).

## The manifest root {#manifest-root}

A Trade Manifest is optional. A deployment that presents none is not
missing a root, and this requirement does not make such an audit
conditional. The forbidden case is the other one: a manifest is
presented, and the verifier accepts it because the key travelling
inside it verifies against itself.

A verifier that is presented with a Trade Manifest MUST obtain the
publisher's public key out of band and MUST verify the manifest
signature against that key, not against a key the manifest carries
(`MUST-T4-15`). A verifier without such a key that is presented with
a Trade Manifest MUST report the completeness guarantee as
conditional and SHOULD report the condition; the identifier
`unauthenticated-manifest` is used for it in this implementation.
An audit presented with no Trade Manifest is not made conditional by
this requirement.

A pinned manifest key the verifier cannot decode is a fault in its
own configuration and MUST be reported as `trust-key-unreadable`
rather than as a mismatch, on the same terms as `MUST-T4-11`. A
manifest that does not verify against a readable pin MUST be
reported as `manifest-key-mismatch` and MUST fail the audit. Falling
back to the key the manifest carries is how a presented document
becomes a bypass.

Attribution is one question and coverage is another, and a root that
answers only the first leaves the document doing work it was never
spent under. A verifier presented with a Trade Manifest MUST compare
the manifest hash to the `manifestHash` of the receipts presented to
the audit and MUST report a manifest that no presented receipt
references (`MUST-T4-17`); the identifier `manifest-covers-no-receipt`
is used for it in this implementation, and the completeness guarantee
is conditional. The comparison runs against those presented receipts,
including aborted ones, and is made before any extract window is
applied and before any issuer key is applied; a hash on an aborted
receipt, on a receipt outside the extract window, or on a receipt no
pinned key attests still counts as a reference. This requirement asks
whether any receipt names the terms, not whether a settlement in the
window was made under them, and not whether the receipt that names them
is attributable. A forged receipt can therefore silence this warning.
That is accepted: what it silences is a statement that terms were
named, and the report it leaves behind is still marked conditional and
still carries the finding that the receipt answers to no pinned key. A correctly attributed manifest
travelling beside a set of receipts marked `noManifest` states terms
nothing presented was spent under, and a report that stays silent
about it reads as terms-backed when it is not. This requirement does
not reach the audit presented with no Trade Manifest, which remains a
deployment choice under `MUST-T1-2`.

Naming a manifest is not obeying one, and that is the third place this
document has had to say the same thing twice. A verifier presented with
a Trade Manifest MUST compare the amount, the currency and the
settlement time of every receipt that names it against the
manifest's amount, currency and expiry, and MUST report a receipt that
departs from them (`MUST-T8-9`); the identifier
`manifest-terms-mismatch` is used for it in this implementation.
Every receipt that names the manifest is measured, aborted ones
included: an aborted receipt that carries the hash of terms and a
departing amount recorded an attempt against terms it misstates, and
`MUST-T4-17` next door already counts it as a reference. The time
compared is the receipt's `timestampMs`, against the boundary
`MUST-T3-3` states: strictly after `expiresAtMs` departs, exactly at
it does not. Amount and currency are compared on the exact-octet
terms of `MUST-T8-2` - the audit asks whether the gate's own rules
were kept, so it compares the way the gate compares.

Where a usable issuer key is pinned, the comparison is made over the
receipts that verify under it and the audit fails. Where none is
pinned, the departure is still reported and the audit does not fail on
it alone. An issuer key is usable when the pinned issuer root holds at
least one key the verifier can decode. A pinned root none of whose
keys decode is already `trust-key-unreadable` and attests nothing, so
the comparison takes the unpinned branch while that finding stands;
the audit has failed on the configuration fault, and the departure is
still said out loud without becoming a charge no readable key backs.
A receipt signed by any key at all, carrying the right manifest hash
and the wrong amount, would otherwise make the verifier report a
breach that never happened, against a payment reference the forger
chose. Reporting a departure costs nothing if it is unattributable;
failing an audit on it hands an attacker a way to accuse an honest
payer.

`MUST-T4-17` and this requirement therefore differ, and the difference
is not an inconsistency. Asking whether a manifest hash appears
anywhere is a question about a set of documents, and an unattributable
document is still in that set. Saying that a named party broke terms it
signed is a charge, and a charge needs a key behind it.

Only receipts that name the manifest are measured against
it: reading the terms onto a receipt that never claimed them would
invent a violation the payer did not commit.

The rules being enforced here are not new. A gate already refuses a
bound spend whose amount or currency differs from the manifest
(`MUST-T8-2`) and one made against an expired manifest
(`MUST-T3-3`). Both were written for the point where money moves, and
an audit reads the record after that point, where the gate is no longer
present to be asked. Without a counterpart a receipt can carry the hash
of terms it breaks and the report still calls the books balanced. This
is a finding rather than a condition on the guarantee: a verifier that
reports it held every root it needed, and the statement it is making is
unconditional.

The gate answers differently from the audit, and the difference is
deliberate. A policy decision point presented with a Trade Manifest
it cannot attribute MUST refuse the payment rather than settle and
record the doubt (`MUST-T4-16`). An audit describes what it found
and may say the result is conditional; a gate decides whether money
moves, and a settled payment carrying the hash of terms nobody
authorised cannot be withdrawn by reporting it afterwards. The
receipt would record those terms as agreed.

## What the roots do not cover

A verifier that supplies none of these roots is not making an error,
and this document does not require it to. It is making a weaker
statement, and the guarantee it reports must say so. With no issuer
key nothing distinguishes one submitted receipt from another, so
conditions computed across the submitted set - two receipts claiming
one settlement reference, for instance - cannot be attributed to
anyone and are reported as conditions of the submission rather than
as failures of a party.

# Reconciliation {#reconciliation}

Completeness is the property that, given an authenticated rail
extract, every settlement in the extract has a matching settled Spend
Receipt, every settled receipt has a matching settlement, receipt and
checkpoint hash chains verify, and checkpoint totals equal the sum of
**settled** receipts in the checkpoint window. If a spend occurred
without a receipt, the missing receipt is itself the evidence
(`MUST-T10-2`).

The property is stated over a population, and the extract is what
declares it: one account, on one rail, over one window
({{rail-extract}}). "Every settlement" means every settlement that
extract carried. A settlement path no presented extract covers is not
reconciled and not found missing - it is outside the population - so
the report names the account, rail and window it was computed over
(`MUST-T10-19`), and a verifier that stated none of them says so
instead (`MUST-T10-18`).

A checkpoint published with its totals withheld ({{CEDULON-CHECKPOINT}}, Checkpoint claims) cannot
contribute the last of those to the property. It is not a violation of
completeness and it is not a demonstration of it either: the
comparison was not made, and a result that rests on a comparison
nobody made is conditional (`MUST-T11-12`).

## Verification algorithm {#verification}

A verifier MUST perform all of these steps and MUST report every
finding they produce (`MUST-T10-1`). They are numbered
for reference, not to require an evaluation order: no step
short-circuits another, and an implementation may evaluate them in any
order that produces the same set of findings.

The data dependencies are named, because "any order" read naively
would break them. Step 7's index of refs is what steps 8 and 9 reconcile.
An implementation
that ran a consumer against an unchecked producer would not produce
the same set of findings, so those orders are not among the
permitted ones.

The second is the issuer pin. The step that resolves it decides the
**attested set** - the receipts and checkpoints that verify under a
usable pinned issuer key, or the whole presented set when no usable
key is pinned - and every later step that walks receipts
consumes that set: the chain walk in step 6, the indexing
and reconciliation in steps 7 through 9, and the `MUST-T8-9` comparison. A receipt the
pin rejects is reported once and then excluded, which is what keeps
the settlement it names visible as uncovered (`MUST-T4-10`); an
implementation that let it back into any of those steps would let a
forged receipt cover a settlement, satisfy a checkpoint count, or
invent a terms charge. Two checks deliberately stay on the presented
set whatever any key says, and MUST NOT acquire the dependency:
`MUST-T4-17`, which asks whether a manifest was named at all, and the
per-receipt defect checks that ask what a receipt says about itself.
The list above is the inventory, maintained rather than summarised.

Checkpoint and witness verification consumes that attested set
and is specified in {{CEDULON-CHECKPOINT}} (Verification algorithm).

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
   (`MUST-T10-8`, `MUST-T10-9`). If no key is pinned, the check that
   runs is against the key the extract carries, which establishes
   internal consistency and not origin; the verifier MUST still
   compute it, MUST NOT read it as a statement about who produced the
   extract, and MUST treat the completeness guarantee as conditional
   (`MUST-T10-7`). The identifier `unauthenticated-extract` SHOULD
   be used for this condition in diagnostic output, whatever the
   extract carries. If a key is
   pinned and cannot be decoded, the verifier MUST report that the
   pinned key is unreadable. The identifier `trust-key-unreadable`
   SHOULD be used for this condition. If a key is pinned and the
   signature does not verify against it, or verifies against a
   different key, the verifier MUST report that the extract is not
   signed by the pinned key. The identifier `extract-key-mismatch`
   SHOULD be used for this condition. The rows of an extract the pin
   refused are not reconciled against the receipts, and no settlement
   finding is read out of that document (`MUST-T10-20`); the
   identifier `settlement-comparison-skipped` SHOULD be used to say
   that the comparison did not run. A finding that puts the
   extract itself in doubt MUST prevent an unconditional guarantee.
3. Check scope. The verifier MUST report each settlement record
   whose `timestampMs` falls outside the declared window, identified
   by that record's `ref` (`MUST-T10-10`). When the verifier states
   an expected account, rail, or window, it MUST report an extract
   that does not cover it (`MUST-T10-11`). The identifier
   `extract-scope-mismatch` SHOULD be used for both conditions. If
   the verifier stated no period, it MUST treat the guarantee as
   conditional (`MUST-T10-15`). The identifier
   `unstated-audit-window` SHOULD be used for this condition. If it
   stated no account or no rail, it MUST treat the guarantee as
   conditional for the same reason (`MUST-T10-18`); the identifier
   `unstated-audit-scope` SHOULD be used. Whatever the verdict, the
   report MUST name the account, rail and window the extract declared,
   in every structure it returns for the audit (`MUST-T10-19`).
4. Resolve each Spend Receipt against the issuer root
   ({{issuer-root}}) in one pass. Decode the COSE_Sign1; a content
   type that is not the receipt type, a decoder bound, or a decoded
   claim map that does not match the presented claims is a named
   refusal, not a signature verdict (`MUST-T4-2`, `MUST-T4-8`). Then
   ask one question: does the signature verify under a pinned issuer
   key. `kid` routes the check to a candidate key and carries no
   authority of its own; the carried key is not consulted for
   membership at all. The resolution table in {{issuer-root}} reads
   the answer out per cell. Every cell there is a named condition
   plus a membership decision; no cell is a silent removal.
   Where a countersignature is present,
   {{payee-root}} governs what it establishes (`MUST-T4-13`,
   `MUST-T4-14`). Where a Trade Manifest is presented, {{manifest-root}}
   governs it (`MUST-T4-15`): with no publisher key pinned the verifier
   reports `unauthenticated-manifest` and the guarantee is conditional;
   with a pin that cannot be read, `trust-key-unreadable`; with a pin
   the manifest does not answer to, `manifest-key-mismatch`; and with
   a manifest that no presented receipt references,
   `manifest-covers-no-receipt` (`MUST-T4-17`). A receipt that names
   the manifest but departs from its amount, currency, expiry or,
   where the manifest names one, payee is
   reported as `manifest-terms-mismatch`; with a usable issuer key
   pinned the comparison runs over the attested receipts and the
   departure fails the audit, and with no usable issuer key it is a
   warning over the presented receipts and does not by itself fail
   the audit (`MUST-T8-9`). An audit
   presented with no Trade Manifest is not made conditional by this
   step.
5. Scope the receipts. Membership follows the ref binding first: a
   receipt whose `ref` appears on the extract is reconciled against
   this extract even when its own `timestampMs` falls outside the
   declared window - the rail has signed that the settlement belongs
   to the window, and the receipt follows its settlement. The
   `timestampMs` sieve applies only to receipts the extract does not
   name: such a receipt outside the window is not a completeness
   failure against this extract (`MUST-T10-16`); auditing a longer
   period requires extracts that cover it. At the window's edges the
   declared allowance applies ({{rail-extract}}): an unmatched
   settled receipt within `clockSkewMs` of `windowEndMs`, and an
   unmatched settlement record within `clockSkewMs` of
   `windowStartMs`, are reported as `boundary-deferred`, a warning,
   rather than as step 8's completeness findings - two honest clocks
   can disagree by less than the allowance, and both verifiers of an
   honest edge payment would otherwise reach the same false
   accusation (`MUST-T10-17`). Where the following window's extract
   is presented and verifies, a deferred receipt whose `ref` appears
   on it is resolved and not reported, and one whose `ref` does not
   appear hardens into the step 8 finding; a deferred settlement
   record near the opening edge resolves through this step's ref
   binding, since the prior window's receipt that names its `ref` is
   reconciled here regardless of timestamp. The following window's
   extract closes or hardens closing-edge deferrals only; an
   opening-edge record stays deferred until a receipt in the
   presented bag names its `ref`, whether or not a following extract
   is presented. In a single-window audit
   a deferred record keeps the guarantee conditional. Receipts remain
   subject to every other check regardless of window.
6. Walk the attested receipts in issuer order. Issuer order is the
   order induced by the `prevReceiptHash` chain: the verifier
   rebuilds the chain from the links, and the order in which
   receipts were presented carries no weight. `timestampMs` is
   issuer-asserted and is not an ordering source. The first
   `prevReceiptHash` MUST be null. Each later `prevReceiptHash` MUST
   equal `receiptHash` of the previous receipt. A miss, and a
   receipt the links cannot place, MUST be reported as a break in
   the receipt chain. The identifier `receipt-chain-break` SHOULD be
   used for this condition.
7. Index the attested settled receipts and extract records by `ref`. A `ref`
   that appears more than once on either side MUST be reported as a
   repeated reference (`MUST-T10-6`). The identifier `duplicate-ref`
   SHOULD be used for this condition.
8. For each `ref` that appears exactly once on each side, require a
   one-to-one match on `ref` AND `amount` AND `currency`
   (`MUST-T10-1`), compared as exact octets on the terms of
   `MUST-T8-2`; step 9's aggregation is the only place this algorithm
   reads an amount as a number. Amount or currency mismatch MUST be reported as
   a settlement that does not match its receipt, identified by that
   `ref`. The identifier `settlement-mismatch` SHOULD be used for
   this condition. A settlement with no receipt MUST be reported as
   lacking a receipt, identified by its `ref` (`MUST-T10-2`). The
   identifier `settlement-without-receipt` SHOULD be used for this
   condition. A settled receipt with no extract row MUST be reported
   as a completeness failure (`MUST-T10-3`). The identifier
   `receipt-without-settlement` SHOULD be used for this condition.
   A settled receipt with a null rail ref MUST be reported as
   settled without a rail reference; this check asks what a receipt
   says about itself and runs over the presented receipts, attested
   or not. The identifier
   `settled-without-ref` SHOULD be used for this condition.
   Where a settlement record declares a `beneficiary`
   ({{rail-extract}}), it MUST be compared against the matched
   receipt's `payee` as exact octets; a difference is
   `beneficiary-mismatch` and fails the audit. Where neither the
   manifest names a `payee` nor any settlement record declares a
   `beneficiary`, the report MUST carry `counterparty-unbound`, a
   scope record: ref, amount and currency closed against the payer's
   account extract, and the counterparty's identity was not bound.
   It is a statement of what the evidence did not cover, not a
   doubt about what it did, so it does not move the verdict and does
   not by itself make the guarantee conditional.
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
11. If any finding remains that is not a warning (a warning is a
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
| receipt-chain-break | audit fails | Signature or `prevReceiptHash` failed, or the links cannot place a receipt (issuer order, step 6) |
| unauthenticated-extract | guarantee conditional | No verifier-supplied rail key, whatever the extract carries: a signature that verifies establishes internal consistency and not that the named rail produced the extract, and one that fails or is refused is not a key verdict either. The same code is reported when a rail key is pinned and no extract was presented at all, because there is nothing to check the pin against. A presented extract that does not verify under a pinned key is `extract-key-mismatch` instead |
| extract-key-mismatch | audit fails | Extract is signed by a key other than the pinned rail key, or does not verify against it |
| settlement-comparison-skipped | guarantee conditional | The pinned rail key refused the presented extract, so its rows were not reconciled against the receipts (`MUST-T10-20`). The code says what did not run; the refusal itself is reported as `extract-key-mismatch` |
| trust-key-unreadable | audit fails | A pinned key - rail, issuer, or manifest publisher - could not be decoded; the verifier's configuration is at fault, and nothing falls back to the keys the objects carry |
| issuer-key-mismatch | audit fails | An object is signed by a key other than the pinned issuer key, or does not verify under it at all, so it is not coverage for anything it names. A checkpoint reaches this code by either route: unlike a receipt, which is named in the chain walk as `receipt-chain-break` when it claims the pin and fails, a checkpoint that claims the pin and fails is reported here and leaves its window uncovered |
| countersign-key-mismatch | conditional | A countersignature verifies under a key other than the one pinned for that payee; unattributable, discarded as approval evidence, and the receipt it rode beside is unaffected ({{countersign}}) |
| countersign-missing | conditional | A payee key is pinned and a settled receipt for that payee carries no attributable countersignature; a discarded garbage or foreign-key object leaves this open |
| unauthenticated-issuer | conditional | No verifier-supplied issuer key and at least one receipt or checkpoint presented; their signatures are checked against the keys the objects carry ({{presentation}}), which establishes that each object is internally consistent and not that the named issuer produced it |
| unauthenticated-countersigner | conditional | No verifier-supplied payee key; a countersignature is present but proves no approval |
| unauthenticated-manifest | conditional | No verifier-supplied manifest key and a Trade Manifest was presented; its signature is not checked at all, because the check that exists under a pin (`manifest-key-mismatch`) has no key to run against and the key the manifest carries is not a fallback for one. An audit presented with no Trade Manifest is not this condition |
| manifest-key-mismatch | audit fails | A presented Trade Manifest is signed by a key other than the pinned publisher key, or does not verify against it |
| manifest-covers-no-receipt | conditional | A presented Trade Manifest is referenced by no presented receipt, including aborted ones and those outside the extract window; the manifest states terms no presented receipt names. It is reported on what was presented, not on whether the manifest was attributed, so it appears beside `manifest-key-mismatch` as well |
| manifest-terms-mismatch | audit fails under a usable issuer pin; warning without one | A receipt names this Trade Manifest but departs from it in amount, currency, settlement time, or, where the manifest states one, payee. A manifest refused by a stated publisher pin is not compared at all; a gate applying `MUST-T8-2` and `MUST-T3-3` would have refused the payment. The two severities are the two branches of `MUST-T8-9` |
| extract-scope-mismatch | audit fails | A record falls outside the declared window, or the extract does not cover the expected account, rail, or window |
| extract-settlement-mismatch | audit fails | A caller-supplied settlement list disagrees with the extract on `ref`, amount, currency or timestamp, which are the fields compared; the extract is authoritative. A beneficiary that differs is not part of this comparison and is reached by `beneficiary-mismatch`, against the receipt payee |
| malformed-amount | audit fails | An amount on a `ref` already reported as repeating that could not be parsed as an integer |
| unstated-audit-window | guarantee conditional | A usable rail pin states no period, so the extract defined its own. Where no rail key is pinned at all the period is equally unstated, and `unauthenticated-extract` is the condition reported |
| unstated-audit-scope | guarantee conditional | A usable rail pin states no account or no rail, so the extract defined the settlement path it reported on. The same "no pin at all" case is `unauthenticated-extract` |
| countersign-bad | conditional | Present payee countersignature failed verify (signature, content type, or payload binding); unattributable, discarded as approval evidence. One verifiable under another key is `countersign-key-mismatch` |
| carried-key-mismatch | conditional | An object verifies under a pinned issuer key but the key carried beside its signature is a different one; the unsigned surface was rewritten, the object stays attested ({{issuer-root}}) |
| boundary-deferred | conditional | An unmatched item sits within the declared `clockSkewMs` of the window edge; deferred to the adjacent window rather than reported as a completeness failure (step 5) |
| beneficiary-mismatch | audit fails | A settlement record declares a `beneficiary` and the matched receipt's `payee` differs |
| counterparty-unbound | scope record; verdict and guarantee unchanged | Neither the manifest names a `payee` nor any settlement record declares a `beneficiary`: ref, amount and currency closed against the payer's account extract, and the counterparty's identity was not bound |
| delivery-mismatch | audit fails | An attributable countersignature carries `deliveredHash` and it differs from the acceptance-criteria hash of a Trade Manifest the audit did not refuse; both ends are signed (`MAY-T8-11`). Where a stated publisher pin refuses the manifest, its acceptance hash founds nothing and this comparison is not made (`MUST-T8-9`) |
| malformed-policy-hash (and its family: malformed-request-hash, malformed-acceptance-criteria-hash, malformed-manifest-hash, malformed-receipt-hash, malformed-prev-receipt-hash, malformed-chain-head-hash, malformed-prev-checkpoint-hash, malformed-ap-two-mandate-hash) | audit fails | A hash-shaped claim does not match the 64-lowercase-hex grammar of {{receipt-labels}}; the claim is named in the code |

A finding that puts the extract itself in doubt (`extract-key-mismatch`,
`trust-key-unreadable`, `extract-scope-mismatch`, or
`extract-settlement-mismatch`) MUST also prevent an unconditional
guarantee, not merely fail the audit. A finding that puts a presented
Trade Manifest in doubt (`manifest-key-mismatch`, or
`trust-key-unreadable` on the manifest pin) does the same.

An unconditional guarantee therefore requires all of: an extract, a
pinned rail key the extract's signature verifies against, a stated
period the extract covers, an issuer root for whatever receipts and
checkpoints are presented, a manifest root for whatever Trade Manifest
is presented, no finding that puts the extract in
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
witness receipts, the presented chain is self-consistent by
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

One boundary is stated here rather than left to be inferred. In the
retrospective audit, "allowed by policy" is the Receipt Issuer's
signed assertion: the spend passed the issuer's gate under the
`policyHash` the receipt names. The Decision Token is consumed at the
gate, and the verification algorithm never sees it; the audit does
not independently re-verify the PDP's allow. The completeness side of
the audit has an independent leg - the rail extract - and the policy
side deliberately does not: that is a trust boundary of this profile,
not an oversight. A deployment that wants the policy answer to be
independently verifiable needs a receipt-to-token binding, which this
revision does not define; it is named as a possible extension
({{evolution}}), and adding it would change what a receipt carries,
so it is not smuggled in here.

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
receipt is redacted (`MUST-T9-5`).

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

An attacker plants instructions in tool output, a web page, or a retrieved
document. The agent then calls a spend tool outside the principal's intent.
Narratives and measured runs: {{CEDULON-THREATS}}.

| ID | Requirement |
|---|---|
| MUST-T1-1 | The PDP MUST decide from structured request fields and stored policy, not from model-generated prose. |
| MUST-T1-2 | A spend that is not bound to a verified Trade Manifest MUST be marked `noManifest` on the Spend Receipt and MUST still be subject to limit, velocity, and scope policy. |
| SHOULD-T1-3 | Hosts SHOULD require a human confirmation channel for first-use payees. |
| MAY-T1-4 | An implementation MAY refuse all `noManifest` spend. |

## T2: Runaway agent (loop spend)

A stuck tool loop or recursive planner issues many payments.
Velocity and cumulative-limit counters live in the PDP, fail-closed.
Narratives and measured runs: {{CEDULON-THREATS}}.

| ID | Requirement |
|---|---|
| MUST-T2-1 | Policy MUST express a maximum payment count per configured time window (velocity). |
| MUST-T2-2 | Policy MUST express a maximum amount per payment and a maximum cumulative amount per window. |
| MUST-T2-3 | If the PDP is unreachable, uninitialized, or throws during evaluation, the spend MUST be denied (fail-closed, default deny). |
| MUST-T2-4 | A denied attempt MUST NOT increment the allowed-spend counters as if it had succeeded. |
| SHOULD-T2-5 | Implementations SHOULD emit a stable reason code for velocity and limit denials. |

## T3: Replay of payment authority

An observer replays a signed payment payload, mandate, or Cedulon decision token.
Every gated spend carries a unique nonce; manifests expire; tokens are single-use.
Narratives and measured runs: {{CEDULON-THREATS}}.

| ID | Requirement |
|---|---|
| MUST-T3-1 | Every spend attempt that the PDP allows MUST include a nonce that the implementation has not accepted before. |
| MUST-T3-2 | A second attempt that reuses a nonce MUST be denied. |
| MUST-T3-3 | A Trade Manifest MUST carry an expiry; a spend against an expired manifest MUST be denied. The manifest is expired when the settlement time is strictly greater than `expiresAtMs`; a settlement at exactly `expiresAtMs` is within the manifest. |
| MUST-T3-4 | A PDP allow decision MUST be bound to the SHA-256 of the canonical encoding of the request fields it evaluated, as stated in {{hash-inputs}}, and MUST be single-use. |
| SHOULD-T3-5 | Nonce stores SHOULD persist across process restart when the deployment is not a test fixture. |

## T4: Receipt forgery or repudiation

A party alters a receipt, invents a receipt, or denies a real spend.
Receipts are signed; verification covers the signed bytes; a hash chain links them.
Narratives and measured runs: {{CEDULON-THREATS}}.

| ID | Requirement |
|---|---|
| MUST-T4-1 | A Spend Receipt MUST be signed by the Receipt Issuer over the deterministic CBOR encoding of its claims, as profiled in {{cose-profile}}. The phrase "canonical encoding" is reserved for JSON documents ({{canonical-json}}). |
| MUST-T4-2 | Verifiers MUST reject a receipt whose signature does not validate or whose canonical bytes do not match the signed payload. |
| MUST-T4-3 | A Spend Receipt MUST include `payer`, `payee`, `amount`, `currency`, `policyHash`, `timestampMs`, and `nonce`. |
| MUST-T4-4 | A Spend Receipt MUST include `manifestHash` or an explicit `noManifest` flag, never an ambiguous empty hash. Empty optional values are CBOR null; labels are never absent. |
| SHOULD-T4-5 | Receipts SHOULD form a hash chain (`prevReceiptHash`) so omission is detectable within one issuer stream. |
| MAY-T4-6 | Parties MAY register the signed receipt as a SCITT statement to obtain a COSE receipt. |
| MUST-T4-7 | A Spend Receipt MUST include `outcome` (`settled` or `aborted`). A settled receipt MUST have a non-null rail ref. Aborted receipts MUST NOT enter checkpoint totals. |
| MUST-T4-8 | COSE_Sign1 protected headers MUST use alg -19 (Ed25519), a mandatory `kid`, and a payload-specific content type. Verifiers MUST reject a `kid` that does not match the configured issuer key. |
| MUST-T4-9 | A verifier MUST obtain the issuer public key out of band and MUST verify Spend Receipt and epoch checkpoint signatures against that key. A key carried by the object MUST NOT be treated as the signer's identity and MUST NOT be used as a fallback where no key was obtained (`MUST-T4-11`); a signature checked against it where no issuer key is held establishes internal consistency only and attests nothing. A verifier without such a key that is presented with any Spend Receipt or epoch checkpoint MUST report the completeness guarantee as conditional. An audit presented with neither rests on the extract alone and is not made conditional by this requirement. |
| MUST-T4-10 | A receipt that does not verify against the pinned issuer key MUST NOT count as coverage for the settlement it names, and that settlement MUST still be reported as uncovered. Reporting the mismatch is not sufficient on its own. |
| MUST-T4-11 | Pinned issuer keys MUST be compared by SubjectPublicKeyInfo DER encoding. A pinned key that cannot be decoded MUST be reported as a verifier configuration fault rather than as a mismatch, and where no pinned key decodes, the verifier MUST NOT fall back to the keys the objects carry. |
| MUST-T4-12 | A verifier MUST accept an issuer, publisher, witness, or rail root comprising more than one key, so that a key rotation inside the audited window does not require it to abandon pinning. |
| MUST-T4-13 | A payee countersignature MUST NOT be treated as evidence of payee approval unless it verifies against a payee key the verifier obtained out of band. |
| MUST-T4-14 | Where a verifier has pinned a key for a payee, a settled receipt naming that payee and carrying no attributable countersignature MUST be reported, so that deleting the evidence - or substituting an unattributable object for it - does not delete the question. |
| MUST-T4-15 | A verifier that is presented with a Trade Manifest MUST obtain the publisher public key out of band and MUST verify the manifest signature against that key, not against a key the manifest carries. A pin that cannot be read MUST be reported as `trust-key-unreadable`; a readable pin the manifest does not answer to MUST be reported as `manifest-key-mismatch` and MUST fail the audit. A verifier without such a key that is presented with a Trade Manifest MUST report the completeness guarantee as conditional. An audit presented with no Trade Manifest is not made conditional by this requirement. |
| MUST-T4-16 | A policy decision point presented with a Trade Manifest it cannot verify against a key supplied out of band MUST refuse the payment. Settling and reporting the doubt afterwards is not available to it: the receipt carries the manifest hash as terms the named party agreed to. |
| MUST-T4-17 | A verifier presented with a Trade Manifest MUST compare the manifest hash against the `manifestHash` of the receipts presented to the audit, including aborted ones, before any extract window is applied and before any issuer key is applied, and MUST report a presented manifest that no presented receipt references. Verifying who published the terms does not establish that any receipt names them, and whether a hash appears is a question a verifier can answer from a document nobody vouches for. An audit presented with no Trade Manifest is not made conditional by this requirement. |
| MUST-T4-18 | A decoder MUST refuse a CBOR map that carries a duplicate encoded key. The encoding rules forbid producing one; accepting one accepts a document no conforming encoder can produce, and leaves two decoders free to disagree about which value was signed. |
| MUST-T4-19 | A decoder MUST impose a bound on encoded size, nesting depth, and the number of elements it will decode from an audit input, and MUST refuse an input that exceeds a bound with a named refusal rather than by exhausting memory or the stack. It SHOULD document the bounds it applies. This document fixes no numbers: the bound is deployment policy, the named refusal is not. |
| MUST-T4-20 | A verifier that receives a JSON document as text MUST refuse a text in which any object repeats a member name, by name (`json-duplicate-key`), before parsing it. {{RFC8785}} takes I-JSON as its input, and a parser that keeps either value has already discarded the evidence of the other, so two verifiers could canonicalize different documents from one text. A verifier handed an object rather than text cannot apply this rule and MUST NOT report that it did. |
| MUST-T4-21 | A decoder MUST refuse a COSE_Sign1 message whose unprotected header is not an empty map, by name (`cose-sign1-unprotected`), rather than verifying the signature and ignoring the header. The digests of {{hash-inputs}} cover the unprotected header and the signature does not; ignoring it lets an honestly signed object carry a digest its signer never produced. |

## T5: Policy bypass via direct rail access

The agent or an attacker calls the rail without the PDP.
The only payment function is the adapter that calls the PDP first.
Narratives and measured runs: {{CEDULON-THREATS}}.

| ID | Requirement |
|---|---|
| MUST-T5-1 | The agent-facing spend interface MUST invoke the PDP and MUST NOT expose a parallel ungated rail call to the model. |
| MUST-T5-2 | Rail credentials, wallet handles, and facilitator tokens MUST NOT be placed in tool results or prompts. |
| SHOULD-T5-3 | Hosts SHOULD run the PDP and signing keys in a process the model runtime cannot write. |
| MAY-T5-4 | A deployment MAY use OS or hardware isolation between the model and the PDP. |

## T6: TOCTOU between policy check and payment

An allow is computed; the request is then swapped before the rail sees it.
Settlement pays only the exact fields hashed into the single-use decision.
Narratives and measured runs: {{CEDULON-THREATS}}.

| ID | Requirement |
|---|---|
| MUST-T6-1 | Payment settlement MUST use the same six `requestHash` fields the PDP evaluated: amount, currency, payee, tool, nonce, and `manifestHash`. |
| MUST-T6-2 | An allow decision MUST be consumed on the first settlement attempt, success or fail-closed abort, and MUST NOT authorize a later different request. |
| SHOULD-T6-3 | Implementations SHOULD treat a decision older than a short TTL as expired. |
| MUST-T6-4 | An allow Decision Token MUST be COSE_Sign1 with CWT private-use labels -70301..-70305 (`requestHash`, `policyHash`, `expiryMs`, `nonce`, `singleUseId`) and content type `application/cedulon-decision+cbor`. |
| MUST-T6-5 | A party that accepts a Decision Token MUST reject a failed signature, a `kid` or content-type mismatch, a claim-map mismatch, or an expired `expiryMs`. The token is expired when the evaluation time is strictly greater than `expiryMs`; at exactly `expiryMs` it is not. |
| MUST-T6-6 | A consumer of a Decision Token MUST verify it against its own issuing key and MUST NOT accept a token it cannot check that way. The consumer issued the token, so asking the token which key to check it against is a question that answers itself. |
| MUST-T6-7 | A party that records a settlement under a Decision Token MUST refuse it when that settlement's `timestampMs` is strictly greater than the token's `expiryMs`. At exactly `expiryMs` the settlement remains inside the token's authority; the boundary is the one `SHOULD-T6-3` states. The recording party holds both values and makes the comparison then. |

A later verifier cannot make this comparison. Decision Tokens are not
among the inputs {{verification}} enumerates: the extract, the
receipts, the manifests, the checkpoints, and the witness receipts.
The rule is written on the party that can apply it. Verification does
not repeat it.

This revision adds `MUST-T6-7`. Pablo Etcheverry found that nothing
compared a settlement's clock to the clock of the decision that
authorised it, so a settlement that appeared to predate its decision
still verified. The complete repair - carrying the decision's issuance
time on the token and binding the receipt to it, so a later verifier
can detect an effect that predates its decision - is a Standards Track
revision's work and is not done here. No new claim label is added;
`MUST-T6-4` still names the same five labels.

## T7: Signing-key leakage

Keys leak from disk, logs, or a prompt. Forged manifests or receipts follow.
This tree ships mock keys only; the requirements still constrain any later real key.
Narratives and measured runs: {{CEDULON-THREATS}}.

| ID | Requirement |
|---|---|
| MUST-T7-1 | Secret key material MUST NOT appear in receipts, checkpoints, manifests, decision tokens, logs, or example output. |
| MUST-T7-2 | Example and test keys MUST be generated at runtime or stored as clearly fake fixtures, never as production secrets. |
| SHOULD-T7-3 | Production deployments SHOULD use an HSM or OS key store and SHOULD rotate keys. |
| MAY-T7-4 | Implementations MAY encrypt keys at rest. |
| MUST-T7-5 | An implementation that stores a signing key in the clear MUST report the protection it actually obtained, measured from the stored object rather than derived from the platform. A mount that ignores filesystem permissions accepts the call and protects nothing. |
| MUST-T7-6 | A writable directory anywhere on the path to a stored signing key makes the file permission moot, and a symbolic link on that path hands the destination to whoever placed it. An implementation MUST refuse both rather than report the key as protected. |

## T8: Counterparty price gouging or defective delivery

The payee ships a different artifact, or the price exceeds the signed offer.
The Trade Manifest binds price and an acceptance-criteria hash before payment.
Narratives and measured runs: {{CEDULON-THREATS}}.

| ID | Requirement |
|---|---|
| MUST-T8-1 | A Trade Manifest MUST bind goods or service description, price, currency, acceptance-criteria hash, cancel condition, and expiry. |
| MUST-T8-2 | A spend bound to a manifest MUST be denied if the requested amount or currency differs from the manifest. Amount and currency are compared as the exact octets of their text strings: no case folding, no Unicode normalisation, no numeric reinterpretation. The amount syntax already forbids the leading zero that would make two spellings of one number, and a verifier that folds case to accept a currency accepts a token the issuer did not write. |
| MUST-T8-3 | If delivery bytes do not hash to the acceptance-criteria hash, the implementation MUST be able to produce a Dispute Evidence Bundle containing the manifest, the spend receipt, and the delivery hash. |
| MUST-T8-4 | The Dispute Evidence Bundle MUST NOT be described as an arbitral award or escrow release. |
| MUST-T8-7 | `manifestHash` MUST be the SHA-256 of the signed Trade Manifest COSE bytes and MUST NOT include the issuer public key encoding. |
| SHOULD-T8-5 | Manifests SHOULD reference an AP2 mandate hash when one exists. |
| MAY-T8-6 | Parties MAY add an optional escrow actor as a third-party role interface; this project MUST NOT implement custody. |
| MUST-T8-custody | Implementations of this specification MUST NOT take custody of funds or operate escrow. |
| MUST-T8-8 | If a payee countersignature is present, a verifier MUST reject it when the signature fails, when `kid` or content type does not match the configured payee key, or when the payload is not the issuer COSE_Sign1 bytes. |
| MUST-T8-9 | A verifier presented with a Trade Manifest MUST compare the amount, currency and settlement time of every receipt that names it, aborted ones included, against the manifest amount, currency and expiry - amount and currency on the exact-octet terms of `MUST-T8-2`, time on the boundary of `MUST-T3-3`, and, where the manifest names a `payee`, the receipt payee on the same exact-octet terms - and MUST report a receipt that departs from them. Where a usable issuer key is pinned (a pinned issuer root at least one of whose keys the verifier can decode), the comparison is made over the receipts that verify under it and a departure MUST fail the audit. Where no usable issuer key is pinned, the departure MUST still be reported and MUST NOT by itself fail the audit: this requirement charges a party with departing from terms it signed, and a charge that no key stands behind is one a forged receipt can invent against an honest payer. This differs from `MUST-T4-17` on purpose. That requirement asks whether terms were named, which an unattributable document can answer; this one makes an accusation, which it cannot. `MUST-T8-2` and `MUST-T3-3` bind the gate; an audit reads the record after the gate is gone, so without this the receipt can carry the hash of terms it breaks. Receipts that do not name the manifest are not measured against it. A Trade Manifest that a stated publisher pin refuses is not terms for this purpose: where the verifier reports `manifest-key-mismatch`, it MUST NOT read a charge out of that document's body, neither this comparison nor the acceptance-hash comparison of {{countersign}}. The refusal is the finding; a document the audit has just rejected must not also be the evidence it convicts with, on the same reasoning that keeps an unattributable countersignature from turning a negative result. |
| MAY-T8-10 | A payee MAY attach a detached COSE_Sign1 countersignature over the issuer receipt bytes. Absence MUST NOT invalidate the issuer receipt. |
| MAY-T8-11 | An attributable countersignature MAY carry `deliveredHash`. When present and the verifier holds the Trade Manifest, the verifier MUST compare it against `acceptanceCriteriaHash` as exact octets and MUST report a mismatch as a failing finding (`delivery-mismatch`): both ends of that comparison are signed. A `deliveredHash` on an unattributable countersignature MUST be discarded with it. |

## MUST-T8-custody

Implementations of this specification MUST NOT take custody of
funds or operate escrow. See also {{escrow-role}}.

## T9: PII leakage into the transparency log

A public receipt or transparency statement carries names, addresses, or full
amounts that should stay private. Log-facing encodings offer redaction.
See also {{privacy}}. Narratives and measured runs: {{CEDULON-THREATS}}.

| ID | Requirement |
|---|---|
| MUST-T9-1 | A transparency encoding MUST support omitting or hashing payer/payee identifiers and MUST support amount redaction or range/bucket encoding. |
| MUST-T9-2 | Implementations MUST NOT write raw government-ID, payment-instrument PAN, or street address fields into a public transparency statement. |
| SHOULD-T9-3 | Default public anchors SHOULD publish `policyHash`, `manifestHash`, `receiptHash`, and timestamp rather than full claim sets. |
| MAY-T9-4 | A private auditor MAY receive an unredacted receipt out of band. |
| MUST-T9-5 | A checkpoint discloses a per-currency window total, which the receipt-field rules above do not cover. Withholding it is governed by MUST-T11-12 and MUST-T11-13: null in the signed payload, and no other form of redaction honoured. |

## T10: Secret spend via rail bypass

An operator, leaked credential, or a second binary can settle on the rail
and omit the Receipt Issuer. Completeness reconciles the extract to the receipts.
See {{reconciliation}}. Narratives and measured runs: {{CEDULON-THREATS}}.

| ID | Requirement |
|---|---|
| MUST-T10-1 | A verifier MUST match each extract settlement to a settled receipt on `ref` AND `amount` AND `currency`. An audit presented with no extract, no receipts and no checkpoints reports no completeness finding: there is nothing to be complete about. It is not thereby unconditional, and the warnings for the roots it was not given still apply. |
| MUST-T10-2 | A settlement with no matching receipt MUST be reported as a completeness failure identified by that settlement `ref`. |
| MUST-T10-3 | A settled Spend Receipt whose `x402PaymentRef` is not on the extract MUST be reported as a completeness failure. |
| MUST-T10-4 | An audit that has any fail-severity completeness finding MUST fail (non-zero status in the companion tool). |
| SHOULD-T10-5 | Hosts SHOULD still apply T5 (no ungated rail in the model process). Completeness does not replace prevention. |
| MUST-T10-6 | A `ref` that appears more than once among settled receipts or among extract rows MUST be reported as `duplicate-ref`. |
| MUST-T10-7 | A verifier MUST obtain the extract from the rail or from a rail signature. With no pinned rail key the extract MUST be reported as `unauthenticated-extract`, whatever it carries, and the completeness guarantee is conditional: a signature that verifies against the carried key establishes internal consistency and not origin, and one that fails or is refused is not a verdict about a key either. With a pinned key, see MUST-T10-8: the extract MUST fail closed rather than warn. |
| MUST-T10-8 | A verifier MUST obtain the rail public key out of band and MUST verify the extract signature against that key. A key the extract carries MUST NOT be treated as the rail's identity and MUST NOT stand in for a key the verifier did not obtain; a signature checked against it establishes internal consistency only. Without such a key the guarantee is conditional and the condition is reported as `unauthenticated-extract`. |
| MUST-T10-9 | Keys MUST be compared by SubjectPublicKeyInfo DER encoding rather than by any text encoding. A pinned key that cannot be decoded MUST be reported as `trust-key-unreadable`, not as a key mismatch. |
| MUST-T10-10 | Every settlement record whose `timestampMs` falls outside the extract's declared window MUST be reported as `extract-scope-mismatch`, identified by that record's `ref`. This check MUST run whether or not a key is pinned. |
| MUST-T10-11 | When the verifier states an expected account, rail, or window, an extract that does not cover it MUST fail closed as `extract-scope-mismatch`. |
| MUST-T10-12 | When an extract is supplied, the records it carries are the subject of reconciliation. A settlement list from another source MUST NOT be substituted; a disagreeing list MUST be reported as `extract-settlement-mismatch`. |
| MUST-T10-13 | A `ref` reported as `duplicate-ref` MUST still be reconciled by aggregate amount per currency, and a shortfall MUST state the unaccounted amount. An unparseable amount MUST be reported as `malformed-amount` without aborting the audit. |
| MUST-T10-14 | An implementation MUST surface the guarantee and any warnings in any human-readable audit report it produces, not only in a returned structure. |
| MUST-T10-15 | A verifier that has not stated the period under audit MUST emit `unstated-audit-window` and MUST treat the guarantee as conditional, because an unstated period leaves the extract free to define its own. |
| MUST-T10-16 | When an extract is supplied, a receipt whose `ref` appears on it is reconciled against it regardless of its own `timestampMs`; the window sieve applies only to receipts the extract does not name, and such a receipt outside the window MUST NOT be reported as a completeness failure against that extract. |
| MUST-T10-17 | An unmatched settled receipt within the declared `clockSkewMs` of `windowEndMs`, and an unmatched settlement record within it of `windowStartMs`, MUST be reported as `boundary-deferred`, a warning, rather than as a completeness failure. A closing-edge deferral resolves against the following window's extract and hardens into the completeness finding when that extract is presented and does not name the `ref`; an opening-edge deferral resolves only against a receipt in the presented bag that names its `ref`, and a following extract does not harden it. Absent a declared `clockSkewMs`, the profile default of 300000 milliseconds applies. |
| MUST-T10-18 | A verifier that has not stated the account or the rail under audit MUST emit `unstated-audit-scope` and MUST treat the guarantee as conditional, because an unstated account or rail leaves the extract free to define the settlement path it reports on, exactly as an unstated period leaves it free to define the period (`MUST-T10-15`). |
| MUST-T10-19 | A report MUST name the account, rail and window the extract declared, in the printed report, in the finding object it returns, and in every other structure the implementation returns for that audit, a tool result or an export included. A balanced result under an unconditional guarantee is a statement about one account on one rail over one window; an account that can settle on a second rail has a settlement path outside that population, and a report that does not name its own scope cannot be distinguished from one that covers every path. Where no extract was presented there is no declared population, and the structure names none. |
| MUST-T10-20 | Where a stated rail pin refuses the presented extract and the verifier reports `extract-key-mismatch`, the verifier MUST NOT read a settlement finding out of that document's body: not a mismatch against a receipt, not money reported as unaccounted for, and not a receipt left unmatched by rows the refused document omits. The refusal is the finding. This is `MUST-T8-9`'s rule for a refused Trade Manifest, on the money axis and for the same reason: a charge that no key stands behind is one a forged extract can invent against an honest payer, and a document the audit has just rejected must not also be the evidence it convicts with. Because a reader cannot otherwise tell a comparison that found nothing from one that never ran, the verifier MUST report `settlement-comparison-skipped` in the same result. A pinned key the verifier cannot decode is `trust-key-unreadable` and is not a refusal of the document, so it does not reach this requirement. |

In MUST-T10-4, a completeness finding that makes the audit fail is
distinct from a warning that only makes the guarantee conditional.
The verification algorithm states that distinction by behaviour
({{reconciliation}}).

## T11: Checkpoint suppression or rollback

T11 (checkpoint chain and witness): see {{CEDULON-CHECKPOINT}}.
The two identities that the core label set and the reconciliation
conditionality depend on remain here.

| ID | Requirement |
|---|---|
| MUST-T11-1 | An epoch checkpoint MUST be COSE-signed and MUST bind epoch number, time window, receipt count, chain-head hash, per-currency totals, and the previous checkpoint hash. |
| MUST-T11-12 | Withheld checkpoint totals MUST be encoded as null in the signed payload. A verifier MUST report that the totals comparison was skipped and MUST treat the guarantee as conditional; `receiptCount` and `chainHeadHash` MUST still be checked. |

## Optional escrow role {#escrow-role}

Parties MAY name an escrow actor in a Trade Manifest as a
third-party role that holds funds under rules outside this protocol
(`MAY-T8-6`). Implementations of this specification MUST NOT take
custody or operate escrow (`MUST-T8-custody`).

## T12: Settlement without a recorded receipt

The threats above are about a counterparty, a rail or an attacker.
This one is about the issuer's own implementation, and it produces
exactly the condition the rest of this document exists to make
detectable. Ordering, recovery and observability: {{CEDULON-THREATS}}.

| ID | Requirement |
|---|---|
| MUST-T12-1 | An issuer MUST NOT complete a settlement whose receipt it cannot record durably. The ability to record MUST be established before value moves, not after. |
| MUST-T12-2 | Where a settlement has been made and its record cannot be completed, the issuer MUST undo the settlement in every place it still controls: in memory, on the rail ledger it controls, and in any later write it has not yet issued. A refused payment MUST NOT consume the nonce or the payment allowance it never used. |
| MUST-T12-3 | Two issuers MUST NOT share one durable state. An implementation that permits it MUST fail loudly rather than let one writer overwrite the other's receipt, and the failure MUST name what an operator can act on. |
| MUST-T12-4 | Where a settlement has entered a rail the issuer does not control, and the local record cannot be completed, the outcome is indeterminate. The issuer MUST NOT treat the payment as reversed, and MUST NOT return the authority to spend, unless it holds authenticated evidence that the rail did not complete the settlement or that a reversing entry completed. |

# IANA Considerations {#iana}

This document is an Independent Submission {{RFC4846}}, and a
standards tree registration requires IETF approval, which this stream
does not carry. It therefore requests the **provisional**
registration of four media types in the "Media Types" registry
{{RFC6838}}, under the procedure of {{RFC6838}} Section 5.2.1, which
is available to an Internet-Draft, each carrying the `+cbor`
structured syntax suffix that {{RFC8949}} registers. Each names one of the COSE_Sign1 objects this document
defines and is carried as the COSE `content type` header parameter
(label 3) of that object ({{cose-profile}}). The value is a normative
check inside a protected header (`MUST-T4-8`, `MUST-T6-5`), which is
why the names cannot stay unregistered while that check stands.
A provisional entry is superseded by a permanent registration in the
standards tree, which the later Standards Track revision named in
{{evolution}} would request. Until that registration is made, an
implementation outside a closed deployment should treat these names
as ones a registration may change.

The claim labels this document assigns inside the CBOR claim sets,
`-70001` through `-70402` ({{receipt-labels}}, {{countersign}}), lie
in the Private Use range of the "CBOR Web Token (CWT) Claims"
registry {{RFC8392}}, integer values less than -65536, and this
document requests no assignment for them. A later Standards Track
revision that moves them into the assigned range will request new
labels then, without reinterpreting these.

No other IANA action is requested.

The four templates follow. The checkpoint and inclusion types are in {{CEDULON-CHECKPOINT}}. Fields that are the same for every one
are stated once, in the first, and the others say so.

## application/cedulon-receipt+cbor {#iana-receipt}

Type name:
: application

Subtype name:
: cedulon-receipt+cbor

Required parameters:
: N/A

Optional parameters:
: N/A

Encoding considerations:
: binary. A COSE_Sign1 structure {{RFC9052}} in deterministic CBOR
  {{RFC8949}}, untagged, as profiled in {{spend-receipt}} and
  {{cose-profile}}.

Security considerations:
: See {{security}} of this document. The object is signed; its
  evidentiary weight depends on the verifier holding the issuer key
  out of band ({{issuer-root}}), never on a key the object carries.

Interoperability considerations:
: The claim set is a CBOR map with the labels and types stated in
  {{receipt-labels}}, encoded per {{RFC8949}} Section 4.2.1. A
  decoder refuses a duplicate key (`MUST-T4-18`), an input beyond its
  stated bounds (`MUST-T4-19`), and a non-empty unprotected header
  (`MUST-T4-21`) by name rather than accepting it.

Published specification:
: This document, {{spend-receipt}}.

Applications that use this media type:
: Agent payment adapters, policy decision points, auditors, and
  dispute-evidence tooling that produce or verify Cedulon Spend
  Receipts.

Fragment identifier considerations:
: N/A

Additional information:
: Deprecated alias names for this type: N/A. Magic number(s): N/A.
  File extension(s): N/A. Macintosh file type code(s): N/A.

Person and email address to contact for further information:
: Emek Can Dogru, e.dogru@cedulon.com

Intended usage:
: COMMON

Restrictions on usage:
: N/A

Author:
: Emek Can Dogru

Change controller:
: IETF

## application/cedulon-manifest+cbor {#iana-manifest}

Type name:
: application

Subtype name:
: cedulon-manifest+cbor

Encoding considerations:
: binary. A COSE_Sign1 structure in deterministic CBOR, untagged, as
  profiled in {{trade-manifest}} and {{cose-profile}}.

Security considerations:
: See {{security}} of this document. A manifest is an offer signed
  before payment; it binds terms, not delivery, and is verified only
  against a publisher key held out of band ({{manifest-root}}).

Interoperability considerations:
: As for application/cedulon-receipt+cbor; the labels are those of
  the manifest table in {{receipt-labels}}, and the `payee` label is
  encoded only when present.

Published specification:
: This document, {{trade-manifest}}.

Applications that use this media type:
: Payees and marketplaces that publish signed offers to paying
  agents, and verifiers reconciling receipts against those offers.

Required parameters, optional parameters, fragment identifier considerations, additional information, contact, intended usage, restrictions on usage, author, change controller:
: As for application/cedulon-receipt+cbor.

## application/cedulon-decision+cbor {#iana-decision}

Type name:
: application

Subtype name:
: cedulon-decision+cbor

Encoding considerations:
: binary. A COSE_Sign1 structure in deterministic CBOR, untagged, as
  profiled in {{decision-token}} and {{cose-profile}}.

Security considerations:
: See {{security}} of this document. A Decision Token is consumed at
  the gate by the party that issued it ({{decision-root}}); it is not
  an input to the retrospective audit ({{verification}}), and a
  verifier that treated it as one would be claiming a check the audit
  does not make.

Interoperability considerations:
: As for application/cedulon-receipt+cbor; the labels are those of
  the Decision Token table in {{receipt-labels}}, all five always
  present.

Published specification:
: This document, {{decision-token}}.

Applications that use this media type:
: Policy decision points and the payment adapters that consume their
  allow decisions.

Required parameters, optional parameters, fragment identifier considerations, additional information, contact, intended usage, restrictions on usage, author, change controller:
: As for application/cedulon-receipt+cbor.

## application/cedulon-countersign+cbor {#iana-countersign}

Type name:
: application

Subtype name:
: cedulon-countersign+cbor

Encoding considerations:
: binary. A detached COSE_Sign1 structure in deterministic CBOR,
  untagged, as profiled in {{countersign}}, whose payload carries the
  exact issuer receipt octets it countersigns.

Security considerations:
: See {{security}} of this document. A countersignature that does
  not verify under a payee key held out of band carries no
  evidentiary weight and cannot move the verdict on the receipt it
  travels beside ({{countersign}}, {{payee-root}}).

Interoperability considerations:
: As for application/cedulon-receipt+cbor; the optional
  `deliveredHash` claim is a 32-octet byte string and is read as
  absent when it is not.

Published specification:
: This document, {{countersign}}.

Applications that use this media type:
: Payees that acknowledge a receipt and, optionally, bind the bytes
  they delivered.

Required parameters, optional parameters, fragment identifier considerations, additional information, contact, intended usage, restrictions on usage, author, change controller:
: As for application/cedulon-receipt+cbor.

# Implementation Status {#impl-status}

This section is to be removed before publishing as an RFC.

RFC 7942 {{RFC7942}} note. The per-reader narrative this section used
to carry - who reported what, in which revision, and what each repair
found inside the previous repair - is kept in the repository's
STATUS.md, where it can be corrected without a revision of this
document.

Implementation:
: A companion implementation with a runnable verification suite at
  <https://github.com/dogrucanemek-alt/cedulon>. The code is a profile
  of this document, not a second specification. This -00 is not an
  IETF working-group item.

Maturity:
: Research code by a single implementer. Three readers have run the
  code on their own machines against a pinned commit and reported
  figures matching the author's: two from a clean clone of the whole
  suite, one re-running the published reproduction. That is
  byte-stability across environments and not an independent
  implementation; the same code agreeing with itself on three machines
  rules out a local accident and nothing more. One reader reports an
  independent implementation of the Signed Statement identity, kept
  deliberately separate from this codebase; no independent
  implementation of the reconciliation algorithm is known to the
  author. One reader rebuilt the regenerated receipt vector of
  {{vectors}} from this text alone, in an independent toolchain, and
  obtained the published 307 octets byte for byte, SHA-256
  `0f1fe8859faf25de906b08142674f1270656d8ea7bfc00853c2fc6e9d3f5a10b`;
  that reader had read parts of the public repository and says so, so
  it is not a clean-room result.

Coverage:
: The receipt, checkpoint, extract, reconciliation and verification
  algorithm are implemented, including the transparency witness input,
  the withheld and not-anchored conditions, and signed totals
  redaction. Every requirement added in the posted series {{CEDULON-DT}} is covered by a
  red-then-green case written before the text, with one exception: the
  reversal branch of `MUST-T12-4` is specified and not executed,
  because this tree carries no authenticated external-rail path. The
  escrow role, reversal, refund and partial settlement are not
  implemented. The witness used in the suite is the in-process log
  that `MAY-T11-6` permits, a Merkle tree that issues inclusion
  proofs; tier 2 of {{CEDULON-CHECKPOINT}} (The transparency witness) is exercised against it red-then-green,
  and the implementation has not been run against a deployed
  Transparency Service.

: Continuous integration runs the pre-release suite - the post-release
  registry checks are a separate job, deliberately excluded, so "the
  suite" names exactly what was measured - on three hosted runners,
  each as a non-root user: Linux, macOS and Windows. At the commit
  this revision describes, all three assert every case, 575 of 575,
  with none skipped. A local Windows run without symbolic-link
  privilege skips four POSIX-mode cases with a stated reason rather
  than passing silently.

Licensing:
: Apache-2.0.

Contact:
: The author of this document.

Experience:
: The posted series {{CEDULON-DT}} was driven by what a reader found
  rather than by a plan. T12 came from none of those readers: it was
  found while writing an adversarial task, in the ordering the
  implementation itself used, which produced against the issuer the
  one condition this document exists to make detectable.

The manifest root (`MUST-T4-15`) and the gate's refusal to settle
against a manifest it cannot attribute (`MUST-T4-16`)
were published as 0.4.0 rather than as a patch: the gate had been
answering 200 to an
unattributable manifest and writing that manifest's hash into the
receipt, and refusing it is a change in behaviour that a version number
ought to announce.

Note on distribution: everything the posted series {{CEDULON-DT}} added is in the
published packages at version 0.9.0, and the workspace publishes
0.13.0 as this revision is written. A reader can check a claim against
an installed package rather than against a working tree. Packages at
0.7.0 and earlier parse extract text with a parser that keeps the last
of two values, verify a signature over a stuffed unprotected header
without complaint, and name neither the account nor the rail their
reports were computed over. That order is deliberate: -00 described
requirements its published package did not yet carry, a reader found
the discrepancy, and this document does not repeat it.


# Evolution and Future Work (Informative) {#evolution}

This document is submitted to the Independent Submissions Editor
{{RFC4846}} as Informational. The author's intended eventual track, if
the work is taken up, is a Standards Track profile of COSE {{RFC9052}}
and CWT {{RFC8392}} for agent-spend receipts, which is where the
standards tree registrations {{iana}} leaves provisional would be
requested.

This section is a direction, not a commitment. The structures below
are reserved in name only. Normative wire formats, tests, and
threat-model MUST lines for them belong in later revisions (-01 or later), written with the same discipline as this -00.

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

Payment is the special case that this -00 implements. The same
completeness calculus (an authenticated extract of consumed units
reconciled to signed receipts) can apply to other consumable
resources such as compute, data, or energy. This document does
not specify those profiles.

# Informative Notes on Adjacent Protocols {#adjacent}

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
draft-abak-agent-control-delivery-evidence {{ABAK}} states evidence
requirements for a governance control - stop, suspend, revoke -
travelling toward the component expected to constrain a runtime, and
keeps emission, receiver-side observation, enforcement outcome and
observed control effect as separate results. Its object moves the
other way from this one: Cedulon reconciles a spend that already
happened against what the rail reported, and evidences neither the
delivery of a control instruction nor its enforcement. A denied spend
leaves no portable artifact here at all - a Decision Token encodes an
allow ({{decision-token}}) - so what a Cedulon audit says about a
refusal it says through the settlement that did not appear on the
extract, which is an effect observation over a declared population and
not an acknowledgement from an enforcement point. Its bounded-population
rule and this document's `MUST-T10-18` and `MUST-T10-19` are the same
kind of bound on two different objects.

draft-kuehlewind-audit-architecture {{KUEHLEWIND-AUDIT}} describes an
architecture for auditing agent-driven interactions: distributed
audit records that link user intent, delegation and authorization to
an execution, propagation of audit context across domains, optional
attestation under RATS, and registration of the records with a SCITT
Transparency Service, with financial transactions by agents among its
motivating cases. It is the trail a Cedulon audit would be read
within. What this document adds for the case of a spend is the
completeness result over a declared population of an authenticated
rail extract; the architecture does not define rail-extract
completeness. draft-birkholz-verifiable-agent-conversations
{{BIRKHOLZ-VAC}} defines a COSE-signed record of an agent's
conversation - session metadata, messages, tool invocations,
reasoning traces - for the same Transparency Services. A Spend
Receipt is the kind of artifact such a record would name for a
payment step; neither document profiles the other, and the
conversation record does not define rail-extract completeness.

--- back

# Acknowledgments
{:numbered="false"}

Vernon Wharff set out the defect -02 repairs: that the object
carrying the T11 guarantee was neither profiled for registration nor
read during verification, and that the equivocation requirement could
not fire against a presented chain. He also asked the question that
decided the shape of that repair, namely whether a recorded checkpoint
absent from the chain deserves its own identifier or belongs under
window coverage. Iman Schrock confirmed the finding independently and
drew its boundary, keeping it separate from the extract-binding work
already closed in -01.

Iman Schrock raised the first of -03's two subjects, against
the posted -02: whether the profile should accept a pinned witness key
and report an absent or mismatched pin explicitly. It should, and the
same question turned out to be unanswered for three further objects.

Iman Schrock and Pablo Etcheverry ran the -00 implementation against the
pinned commit and reported the defects that produced -01. Iman Schrock
found the two extract-binding defects, proposed the repair -01 adopts,
later reran the posted -01 from a clean clone against its own pinned
commit, and is also the author of {{SCHROCK}}, cited here as adjacent
work. He is the reader whose independent implementation of the Signed
Statement identity is noted in {{impl-status}}, and he asked for it to
be kept separate from any cross-implementation claim about Cedulon;
that separation is his and is recorded here as he stated it. Pablo Etcheverry found that a repeated reference hid the unaccounted
amount, filed a written reproduction, and re-ran that reproduction
against the pinned commit to confirm the figures quoted from it. He
later took up a standing invitation to break the implementation and
ran the suite on a platform its author had not, which is how the three
defects behind 0.3.1 were found and how a fourth came to light while
they were being repaired.

Nicholas Templeman ran the suite from a clean clone and reported his
figures. He also corrected two claims in a row written about that run:
the install it named was not the strict from-lockfile form, and his
platform was the same operating system family as the earlier ones, so
the run corroborates the numbers and adds no cross-environment
evidence. He
classified his own run honestly as a repetition of the author's checks
rather than an independent implementation. Walter Hawkins did not run it; he read the
reported figures and pressed for the run to be stated precisely enough
to be repeatable, which is why the conditions and not only the totals
appear in {{impl-status}}.

Tiago Pinto ran the -04 Appendix A vectors against the exact
datatracker archive bytes in an independent toolchain before reading
the text, confirmed both signatures, the SPKI-derived `kid`, and
deterministic re-encoding byte for byte, and then filed the
first-failure list that -05 answers: eight points where an
independent implementation could no longer be built from the text,
one question, and three mechanical defects. The two-tier witness
split, the single key-resolution rule, the normative extract shape,
the issuer-order definition, the boundary allowance, the
countersignature attribution rule, the counterparty bindings, and the
delivery binding follow the failure points he named. Iman Schrock
additionally reran the frozen -04 claims against the archive and the
package registry, and corrected this document's description of what
its continuous integration measures; that correction is recorded in
{{impl-status}} where it landed.

Reading the posted -05 against those dispositions, Tiago Pinto found
that the repair of the key-resolution failure had left its own old
description standing: the finding-code table still said that objects
held under no pin were checked against the keys they carry, while the
verification path said no signature comparison happened at all, and
the carried key both sentences turn on had no defined source anywhere
in this document. Measuring the two sentences against the companion
implementation settled them in opposite directions, which is why
neither was simply deleted, and {{presentation}} now defines the
member they depend on. He also asked for the state named in the
unpinned cell to be defined rather than used once, and consented to
his -04 run being recorded as the first run of these vectors outside
the companion codebase and not as an independent implementation.

The two rules -06 adds came from reading rather than from a reader.
Steven Mih and Anton Sokolov published the canonicalization vectors
of {{CPB}}; running them through this profile's own {{RFC8785}}
encoder is what put the I-JSON precondition on the page as a rule
this document had left unstated, and the corrected reading of one of
those vectors was reported to the SCITT list before `MUST-T4-20` was
written. `MUST-T4-21` was found in the companion decoder while
measuring, for that reading, what this profile's digests cover.

None of them reviewed this text, and any error in it is the author's.

Field survey notes and the informative threat-model narrative in the
companion repository helped shape the requirement identifiers used
here. Those identifiers are defined in {{security}}.

# Appendix A. Test Vectors {#vectors}
{:numbered="false"}

These vectors use RFC 8032 Ed25519 secret scalar #1 (fixture only;
never a production key). Hex is lowercase.

The vectors below MUST stand as the locked tests of this document:
an implementation matches them or it does not, and where an
implementation and a vector disagree, one of the two is wrong and this
document does not say in advance which.

Receipt COSE_Sign1:

Claims: payer=`payer-1`, payee=`payee-1`, amount=`1`,
currency=`USD`, policyHash=
`fca4142da8ad241d24928227893894f4b5365efb746a4529fe9df0119d10da2c`
(the SHA-256 of the UTF-8 octets of the ASCII string
`cedulon/appendix-policy`, standing in for a canonical policy
document; the field's input rule is in {{hash-inputs}}; see
{{CEDULON-DT}}), manifestHash=null,
noManifest=true, x402PaymentRef=null, timestampMs=1700000000000,
nonce=`n100000000000000`, prevReceiptHash=null, outcome=`aborted`.

COSE_Sign1 hex (whitespace ignored):

~~~~
845830a301320378206170706c69636174696f6e2f636564756c6f6e2d
726563656970742b63626f72044806e3fd8fda29bb60a058bbac3a0001
11706770617965722d313a000111716770617965652d313a0001117261
313a00011173635553443a000111747840666361343134326461386164
323431643234393238323237383933383934663462353336356566623734
366134353239666539646630313139643130646132633a00011175f63a
00011176f53a00011177f63a000111781b0000018bcfe568003a000111
79706e3130303030303030303030303030303a0001117af63a0001117b
6761626f7274656458400a24269b7521d409ebe462db297c3aa25b23d6
c697aa4a864b1b3a3edb5b30537b34b048a797073eaee41af371effb68
ecbb47b80e62d7e775e8cae5b066c30c
~~~~

Manifest COSE_Sign1:

Body: description=`fixture-goods`, amount=`1`, currency=`USD`,
acceptanceCriteriaHash=
`e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`
(the SHA-256 of an empty delivery; the field is a digest of the exact
delivery bytes, so the vector carries a well-formed one),
cancelCondition=`none`,
expiresAtMs=1700000000000, ap2MandateHash=null.

COSE_Sign1 hex (whitespace ignored):

~~~~
845831a301320378216170706c69636174696f6e2f636564756c6f6e2d
6d616e69666573742b63626f72044806e3fd8fda29bb60a05889a73a00
0112386d666978747572652d676f6f64733a0001123961313a0001123a
635553443a0001123b7840653362306334343239386663316331343961
666266346338393936666239323432376165343165343634396239333
463613439353939316237383532623835353a0001123c646e6f6e653a
0001123d1b0000018bcfe568003a0001123ef65840599b5b1cc7bfd3fe
8b8e65cdd876652aeca13660e6bdccc93afe12188a295b20fdfe8e6e48
ae447dc74ccb0f13383f0f43f0f67f288d61a6395e95e2038e320d
~~~~
