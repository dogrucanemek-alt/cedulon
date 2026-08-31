---
title: "Cedulon: An Audit Layer for Agent-to-Agent Commerce"
abbrev: Cedulon
docname: draft-dogru-cedulon-07
date: 2026-08-31
category: info
submissiontype: IETF
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

This document defines the Cedulon Protocol, an audit layer for
agent-to-agent commerce. Payment rails such as HTTP 402 flows (x402) and
mandate protocols (AP2) already move value, and a mandate protocol can
already refuse a spend before it happens and return signed receipts.
What they do not, by themselves, give a party that is neither payer nor
rail operator is a retrievable record of that decision and a signed
spend receipt that reconciles against an authenticated extract of the
rail. Cedulon specifies a Trade
Manifest (signed offer before payment), a Policy Decision Point with
default deny, a Spend Receipt (COSE/CWT claim set after a gated payment),
epoch checkpoints, and rail-extract reconciliation. The reconciliation
shows that no settlement on the extract lacks a receipt and no settled
receipt is absent from the extract. That result is unconditional only
when the verifier pins the rail key out of band and states the period
under audit; otherwise the document requires it to be reported as
conditional. Checkpoints carry the suppression guarantee, so the
document profiles the checkpoint as a Signed Statement, gives the
verification algorithm a step that consumes the witness receipts
returned for checkpoints, names what a witness holding a checkpoint the
presented chain omits reports, brings equivocation within reach by
comparing recorded copies against the presented chain, and states how
checkpoint totals may be withheld without withholding the fact that
they were. No signed object is attested by a key it carries itself,
and a presented Trade Manifest must be bound both to the
receipts that name it and to the terms those receipts claim. The
document also names a threat no adversary causes, a settlement
recorded on a rail with no receipt behind it, and defines a Dispute
Evidence Bundle (evidence, not an award) and optional SCITT anchoring.
The encodings earlier revisions called canonical are defined, and the
exact input to every hash-valued field is stated, so that an
independent verifier can be written from the text alone. This
revision states one distinction in the four places that had kept its
older absolute form: a key an object carries is never the signer's
identity and never a substitute for a key the verifier did not obtain,
while a signature checked against it where no key is held establishes
internal consistency and attests nothing. Cedulon is not a competitor
to x402 or AP2; it
sits above them.

--- middle

# Introduction

*Note to Readers:* This document is submitted as Informational. The
author's eventual intended track, if the work is taken up, is a
Standards Track profile of COSE {{RFC9052}} and CWT {{RFC8392}} for
agent-spend receipts. This -07 does not claim IETF consensus.

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

-03 allowed this hash to be taken over "the exact
delivery bytes or a declared schema instance" and gave a verifier no
way to tell which one an issuer had used. Two implementations reading
the same manifest would then compute different digests over the same
delivery and neither would be wrong. This revision defines the first
reading only. Hashing a schema instance instead would need a marker in
the manifest saying so, this document defines no such marker, and until
one is defined that use is out of scope rather than an alternative a
verifier is expected to guess at.

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

-03 bound the encoder and said nothing about the
decoder, which left the reading side free where the writing side was
not. A decoder MUST refuse a CBOR map that carries a duplicate encoded
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
carry. -04 stated the rendering in prose while its
own Appendix A vector violated it, which taught decoders to be
lenient; the grammar is enforced and the vector was regenerated in
-05.

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
  `application/cedulon-decision+cbor`, or
  `application/cedulon-countersign+cbor`
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
posted -05 stated the header empty and said nothing about the
decoder; the companion decoder ignored the header until the
question of what the digest covers was measured. The payload MUST be
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
scoped body of a Rail Extract are JSON, and -03
called each of them "canonical" without saying what that meant. Two
implementations could therefore agree on every requirement in this
document and still produce different bytes, which makes an independent
verifier impossible to write from the text. This section closes that.

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
  to state. The posted -05 said nothing about this. The companion
  implementation refused such texts before the sentence existed, and
  its conformance runner carried the difference as a recorded split
  against -05 rather than as a pass.

- {{RFC8785}} Section 3.2.2.2 requires a serializer to terminate on a
  lone surrogate, and so does this document: a producer MUST refuse to
  encode a document containing one, by name, and MUST NOT sign what it
  could not encode. A verifier reading bytes it cannot canonicalize for
  this reason reports the input as failing verification with the
  refusal named beside the verdict; it does not crash. No field defined
  by this document may contain a lone surrogate, so a conforming
  document never reaches this rule. -04 permitted
  emitting the escaped form instead, which contradicted the RFC it
  cited; that permission is removed.

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
digest value. -03 named the digest for some of
these fields and not for others; the omissions were not a deliberate
degree of freedom.

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
amount, currency, payee, tool, nonce, and `manifestHash`. -03 described
`requestHash` as "the six-field hash" while naming
SHA-256 for `policyHash` in the same sentence, which left a reader free
to conclude that the request binding was not a digest at all. It is
one.

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
{{hash-inputs}} states the octets. -03 called this
"the six-field hash" in the same sentence that named SHA-256 for
`policyHash`, which left the digest for one of them unstated.
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
to a record; it MUST NOT rename the four above. -04
said the member names were the rail's to define, which contradicted
this table and made the extract unconstructable from the text: a
verifier reading `reference` where the table says `ref` has no rule
telling it whether the two are the same member. The table wins, and
-04's sentence is withdrawn. The table also used
CBOR terms (`tstr`, `uint`) for what is a JSON body; the types above
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
member.

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
should note that -02 made the pinned case fail closed.
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
out of band and checks the extract against that key rather than
against any key the extract carries (`MUST-T10-8`). -02 already
required a verifier to obtain the public key from an authenticated
channel and to reject a `kid` that does not match that key
(`MUST-T4-8`). What -02 did not carry was the verification algorithm,
the separate root inputs, and the error semantics that name a missing
or mismatched pin. This section states those for every signed object
in the profile.

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

## The witness root {#witness-root}

{{witness}} describes what a transparency witness adds. An inclusion
receipt checked against the key it carries says that some log is
internally consistent, and a log is cheap to invent.

A verifier MUST obtain the transparency service's public key out of
band and MUST verify inclusion receipts against it (`MUST-T11-15`).
Inclusion receipts that cannot be checked that way MUST NOT be used
as evidence, in either direction: they cannot establish that a
checkpoint was anchored, and they cannot establish that one was
withheld. A verifier SHOULD report that it left them out.

A log holds statements from everyone who uses it. A statement held by
a pinned log MUST additionally answer to the issuer root before it
counts as something that issuer published (`MUST-T11-16`); otherwise
another user's epoch, sitting in a shared log, reads as this issuer
publishing two checkpoints for one epoch.

Anchoring and withholding are different claims and need different
evidence. Establishing that a checkpoint was logged needs only the
statement hash. Establishing that an issuer withheld one needs to
know whose statement it is, which an inclusion receipt carrying no
statement body cannot say. Such a receipt MUST NOT be used to report
a withheld checkpoint, and MUST NOT be silently discarded either: a
real withholding must not be buried by removing the body
(`MUST-T11-17`).

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
still said out loud without becoming a charge no readable key backs. -03
stated the first case for both, and an
implementation showed why that is wrong: a receipt signed by any key at
all, carrying the right manifest hash and the wrong amount, made the
verifier report a breach that never happened, against a payment
reference the forger chose. Reporting a departure costs nothing if it
is unattributable; failing an audit on it hands an attacker a way to
accuse an honest payer.

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

# Reconciliation and Epoch Checkpoints {#reconciliation}

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
window - the last link, in issuer order (the `prevReceiptHash` chain,
as the verification algorithm's step 6 defines it), of the chain
inside the window, not the last one presented or the latest
`timestampMs` - or null if the window is empty (`MUST-T11-2`). Where `totals`
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
verification algorithm read a witness receipt, so the witness
had no way to speak. -02 gave it one. A verifier that
holds witness receipts for the period under audit compares what
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
({{anchoring}}). What comes back, and what it proves, is stated as
two named tiers, because -04 promised the
mechanics of one tier while describing the checks of the other.

**Tier 1 - the witness receipt.** The witness returns a co-signature
over the statement hash of what it recorded: a COSE_Sign1 whose
payload binds the statement hash, the entry index, and the witness's
tree head. Verifying it establishes exactly one sentence - "the
witness signed for this hash" - and nothing more; in particular it
does not establish membership in an append-only log. -04 called this
object a transparency receipt and cited the
verification mechanics of {{RFC9942}} for it while describing a hash
comparison; the admission in {{impl-status}}, that the receipt was a
signature over a statement rather than a proof of log membership, was
correct, and the protocol text now says the same thing. The
{{RFC9942}} citation applies in tier 2, where its mechanics are
actually performed.

A verifier MAY be given witness receipts for the period under audit.
It is a distinct input from the presented checkpoint chain, and
supplying it is optional: a verifier given none performs the same
steps, and reports the same findings, that it would if this input did
not exist (`MUST-T11-10`). Supplying an empty set is not the same as
supplying none. An empty set says a witness is configured and
recorded nothing, which is itself reportable; absence says no witness
was consulted.

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

**Tier 2 - log membership.** A verifier MAY additionally be given,
for one recorded statement, the registered Signed Statement bytes
(the candidate entry) and an inclusion proof. When both are present,
the verifier MUST perform the verification of {{RFC9942}} Section
5.2.1 over them: hash the candidate entry bytes to obtain the leaf,
apply the proof to reproduce a root, and accept only when the leaf
hash, the proof's leaf index, and the reproduced root are all equal
to the statement hash, entry index, and tree head of one witness
receipt that verifies under the pinned witness key (`MUST-T11-18`).
Reproducing a root is deliberately not sufficient on its own: the
proof format below carries no domain separation between leaves and
interior nodes, and the exact match against a witness-signed receipt
is what closes the ambiguities that follow from that. A pair that
fails this check, or a candidate entry presented without a proof,
MUST be reported as a failing finding; the identifier
`witness-inclusion-invalid` names it.

The inclusion proof is an audit path: the leaf index, and the sibling
hashes from the leaf's level up to the root, lowest level first. The
tree is built over statement hashes as leaves; an interior node is
the SHA-256 of the concatenation of its two children's 32 raw bytes;
a level with an odd count pairs its last node with itself, so the
path needs no separate leaf count.

Where witness receipts are supplied and this pair is not, tier 2 was
not exercised, and the report MUST say so rather than letting the
tier pass silently (`MUST-T11-19`); the identifier
`witness-inclusion-not-exercised` names it, as a warning - the
witness attested the statement hash, and log membership was not
proven. A pair that verifies is silent, like every other passing
check in the algorithm.

What tier 1 establishes, and what it does not, is worth stating
plainly. It establishes that the service signed for that statement.
Whether the statement is a member of an append-only log is tier 2's
question, answered only where tier 2's inputs were supplied and
verified; whether the log has ever equivocated remains a property of
the service and its own proofs. A verifier that treats a tier-1
receipt alone as proof of log membership is claiming more than the
receipt carries.

## Verification algorithm {#verification}

A verifier MUST perform all of these steps and MUST report every
finding they produce (`MUST-T10-1`, `MUST-T11-2`). They are numbered
for reference, not to require an evaluation order: no step
short-circuits another, and an implementation may evaluate them in any
order that produces the same set of findings.

The data dependencies are named, because "any order" read naively
would break them. Step 15 decides which witness receipts, and which
statement bodies, survive checking; steps 14 and 16 consume what
survives. Step 7's index of refs is what steps 8 and 9 reconcile.
Step 11 decides which checkpoints verified, and step 14 compares
only those together with what step 15 admitted. An implementation
that ran a consumer against an unchecked producer would not produce
the same set of findings, so those orders are not among the
permitted ones.

The second is the issuer pin. The step that resolves it decides the
**attested set** - the receipts and checkpoints that verify under a
usable pinned issuer key, or the whole presented set when no usable
key is pinned - and every later step that walks receipts or
checkpoints consumes that set: the chain walk in step 6, the indexing
and reconciliation in steps 7 through 9, the checkpoint comparisons
in steps 11 through 13, and the `MUST-T8-9` comparison. A receipt the
pin rejects is reported once and then excluded, which is what keeps
the settlement it names visible as uncovered (`MUST-T4-10`); an
implementation that let it back into any of those steps would let a
forged receipt cover a settlement, satisfy a checkpoint count, or
invent a terms charge. Two checks deliberately stay on the presented
set whatever any key says, and MUST NOT acquire the dependency:
`MUST-T4-17`, which asks whether a manifest was named at all, and the
per-receipt defect checks that ask what a receipt says about itself.
-04 asserted that nothing else in the list fed another step, which
the dependencies above had already made false; the assertion is
withdrawn and the list above is the inventory, maintained rather
than summarised.

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
   `unstated-audit-window` SHOULD be used for this condition. If it
   stated no account or no rail, it MUST treat the guarantee as
   conditional for the same reason (`MUST-T10-18`); the identifier
   `unstated-audit-scope` SHOULD be used. Whatever the verdict, the
   report MUST name the account, rail and window the extract declared
   (`MUST-T10-19`).
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
   plus a membership decision; no cell is a silent removal, and the
   word "reject" in earlier revisions meant nothing more than a cell
   of that table.
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
11. Decode each checkpoint. Reject a failed signature, and reject a
   `kid` that does not match the key obtained for the checkpoint
   issuer, on the same terms as a receipt (`MUST-T4-8`). Require
   `receiptCount`, `chainHeadHash`, and `totals` to match the
   attested receipts in `[startMs, endMs)` as defined above
   (`MUST-T11-2`); a receipt step 4 rejected is not among them,
   or a forged receipt could satisfy a checkpoint count. The identifier `checkpoint-total-mismatch`
   SHOULD be used for a failed signature, a wrong `receiptCount`,
   or totals that disagree, and `checkpoint-head-mismatch` for a
   `chainHeadHash` that is not the last link, in issuer order
   (step 6), of the chain inside `[startMs, endMs)` - "last
   receipt" binds to the chain, not to presentation or to
   `timestampMs`. If the
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
    `window-coverage` SHOULD be used for this condition. The check
    runs against the presented checkpoint windows and it is
    fail-closed: a receipt that falls under none of them is this
    failure - including every receipt when no checkpoint was
    presented, and receipts after the last closed checkpoint's
    `endMs`. The text names that last state an **open epoch**, and
    it is auditable only when the checkpoint that closes it is
    issued; the name explains why the finding fired, it does not
    soften it. Nothing about an absent checkpoint is silent:
    uncovered evidence surfaces as a finding rather than as a gap
    in the report.
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
    verified witness receipts (step 15). Comparing only the
    presented chain cannot raise this finding: `MUST-T11-8`, applied
    in step 12, requires that chain's epochs to be consecutive, so no
    two of its members share an epoch. A copy recorded by a witness
    is where the second one is found.
15. If witness receipts were supplied, verify them against the
    out-of-band witness key ({{witness-root}}); receipts that
    cannot be checked that way are not evidence in either direction
    and the verifier reports that it left them out (`MUST-T11-15`);
    the identifier `unauthenticated-witness` SHOULD be used for this
    condition.
    Discard any whose signature fails (`MUST-T11-10`). A surviving
    receipt whose statement body verifies against the issuer root is
    a statement that issuer published; one that does not is another
    party's, and is not this issuer equivocating (`MUST-T11-16`).
    The survivors are the recorded statement hashes used in step 16. Where a receipt also carries
    the statement body, discard that body unless its statement hash
    equals the one the receipt binds and it verifies as a
    checkpoint; the surviving bodies are what step 14 compares.
    Discarding a body does not discard its receipt.
    This is tier 1 of {{witness}}. Where the tier-2 pair - the
    registered Signed Statement bytes and an inclusion proof - was
    also supplied, verify it as {{witness}} states: apply the proof
    to the candidate entry's hash and accept only on an exact match
    with a witness-signed receipt (`MUST-T11-18`); a pair that fails,
    or a candidate without a proof, is `witness-inclusion-invalid`
    and the audit MUST fail. Where witness receipts were supplied
    and no tier-2 pair was, report `witness-inclusion-not-exercised`
    as a warning (`MUST-T11-19`): the witness attested the statement
    hash, and log membership was not proven.
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
    audit MUST fail. A record that carries no statement body cannot
    say whose statement it binds, so it MUST NOT produce this
    finding; it is reported as an entry that could not be attributed
    and makes the guarantee conditional, because a real withholding
    must not be buried by removing the body (`MUST-T11-17`). Such a
    record still establishes anchoring in the first half of this
    step: proving that a checkpoint was logged needs only its hash. The verifier MUST NOT report a withheld
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
| receipt-chain-break | audit fails | Signature or `prevReceiptHash` failed, or the links cannot place a receipt (issuer order, step 6) |
| checkpoint-total-mismatch | audit fails | Totals, count, signature, or checkpoint chain failed. The signature branch is reached where no issuer pin has already excluded the checkpoint: under a pin a checkpoint that does not verify is `issuer-key-mismatch` and never reaches the totals comparison |
| checkpoint-head-mismatch | audit fails | `chainHeadHash` is not the last link, in issuer order, of the chain inside the window, or the expected head could not be computed at all because the last receipt on the chain refused canonical encoding; the refusal is named and is not a signature verdict |
| equivocation | audit fails | Two distinct hashes for one epoch |
| window-coverage | audit fails | Gap, overlap, or non-adjacent / non-consecutive windows |
| unauthenticated-extract | guarantee conditional | No verifier-supplied rail key, whatever the extract carries: a signature that verifies establishes internal consistency and not that the named rail produced the extract, and one that fails or is refused is not a key verdict either. The same code is reported when a rail key is pinned and no extract was presented at all, because there is nothing to check the pin against. A presented extract that does not verify under a pinned key is `extract-key-mismatch` instead |
| extract-key-mismatch | audit fails | Extract is signed by a key other than the pinned rail key, or does not verify against it |
| trust-key-unreadable | audit fails | A pinned key - rail, issuer, or manifest publisher - could not be decoded; the verifier's configuration is at fault, and nothing falls back to the keys the objects carry |
| issuer-key-mismatch | audit fails | An object is signed by a key other than the pinned issuer key, or does not verify under it at all, so it is not coverage for anything it names. A checkpoint reaches this code by either route: unlike a receipt, which is named in the chain walk as `receipt-chain-break` when it claims the pin and fails, a checkpoint that claims the pin and fails is reported here and leaves its window uncovered |
| countersign-key-mismatch | conditional | A countersignature verifies under a key other than the one pinned for that payee; unattributable, discarded as approval evidence, and the receipt it rode beside is unaffected ({{countersign}}) |
| countersign-missing | conditional | A payee key is pinned and a settled receipt for that payee carries no attributable countersignature; a discarded garbage or foreign-key object leaves this open |
| unauthenticated-issuer | conditional | No verifier-supplied issuer key and at least one receipt or checkpoint presented; their signatures are checked against the keys the objects carry ({{presentation}}), which establishes that each object is internally consistent and not that the named issuer produced it |
| unauthenticated-witness | conditional | No verifier-supplied witness key; inclusion receipts were left out of the comparison |
| unauthenticated-countersigner | conditional | No verifier-supplied payee key; a countersignature is present but proves no approval |
| unauthenticated-manifest | conditional | No verifier-supplied manifest key and a Trade Manifest was presented; its signature is not checked at all, because the check that exists under a pin (`manifest-key-mismatch`) has no key to run against and the key the manifest carries is not a fallback for one. An audit presented with no Trade Manifest is not this condition |
| manifest-key-mismatch | audit fails | A presented Trade Manifest is signed by a key other than the pinned publisher key, or does not verify against it |
| manifest-covers-no-receipt | conditional | A presented Trade Manifest is referenced by no presented receipt, including aborted ones and those outside the extract window; the manifest states terms no presented receipt names. It is reported on what was presented, not on whether the manifest was attributed, so it appears beside `manifest-key-mismatch` as well |
| manifest-terms-mismatch | audit fails under a usable issuer pin; warning without one | A receipt names this Trade Manifest but departs from it in amount, currency, settlement time, or, where the manifest states one, payee. A manifest refused by a stated publisher pin is not compared at all; a gate applying `MUST-T8-2` and `MUST-T3-3` would have refused the payment. The two severities are the two branches of `MUST-T8-9` |
| witness-entry-unattributable | conditional | The witness holds a statement this chain does not present, carrying no body to say whose it is |
| extract-scope-mismatch | audit fails | A record falls outside the declared window, or the extract does not cover the expected account, rail, or window |
| extract-settlement-mismatch | audit fails | A caller-supplied settlement list disagrees with the extract on `ref`, amount, currency or timestamp, which are the fields compared; the extract is authoritative. A beneficiary that differs is not part of this comparison and is reached by `beneficiary-mismatch`, against the receipt payee |
| malformed-amount | audit fails | An amount on a `ref` already reported as repeating that could not be parsed as an integer |
| unstated-audit-window | guarantee conditional | A usable rail pin states no period, so the extract defined its own. Where no rail key is pinned at all the period is equally unstated, and `unauthenticated-extract` is the condition reported |
| unstated-audit-scope | guarantee conditional | A usable rail pin states no account or no rail, so the extract defined the settlement path it reported on. The same "no pin at all" case is `unauthenticated-extract` |
| countersign-bad | conditional | Present payee countersignature failed verify (signature, content type, or payload binding); unattributable, discarded as approval evidence. One verifiable under another key is `countersign-key-mismatch` |
| checkpoint-withheld | audit fails | A verified witness receipt binds a checkpoint the presented chain does not contain |
| checkpoint-not-anchored | guarantee conditional | A witness was supplied and holds no verified receipt for this checkpoint |
| checkpoint-totals-redacted | guarantee conditional | The checkpoint was signed with `totals` null, so the totals comparison could not be made |
| carried-key-mismatch | conditional | An object verifies under a pinned issuer key but the key carried beside its signature is a different one; the unsigned surface was rewritten, the object stays attested ({{issuer-root}}) |
| boundary-deferred | conditional | An unmatched item sits within the declared `clockSkewMs` of the window edge; deferred to the adjacent window rather than reported as a completeness failure (step 5) |
| beneficiary-mismatch | audit fails | A settlement record declares a `beneficiary` and the matched receipt's `payee` differs |
| counterparty-unbound | scope record; verdict and guarantee unchanged | Neither the manifest names a `payee` nor any settlement record declares a `beneficiary`: ref, amount and currency closed against the payer's account extract, and the counterparty's identity was not bound |
| delivery-mismatch | audit fails | An attributable countersignature carries `deliveredHash` and it differs from the acceptance-criteria hash of a Trade Manifest the audit did not refuse; both ends are signed (`MAY-T8-11`). Where a stated publisher pin refuses the manifest, its acceptance hash founds nothing and this comparison is not made (`MUST-T8-9`) |
| witness-inclusion-invalid | audit fails | The tier-2 candidate bytes and inclusion proof do not reproduce a witness-signed tree head, or a candidate was supplied without a proof (`MUST-T11-18`) |
| witness-inclusion-not-exercised | conditional | Witness receipts were supplied and no tier-2 pair was, so log membership was not proven (`MUST-T11-19`). The code says nothing about whether any of those receipts verified: it is reported on presentation, and an unpinned or unverifiable inclusion receipt reaches it alongside `unauthenticated-witness` |
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
| MUST-T3-3 | A Trade Manifest MUST carry an expiry; a spend against an expired manifest MUST be denied. The manifest is expired when the settlement time is strictly greater than `expiresAtMs`; a settlement at exactly `expiresAtMs` is within the manifest. -03 said "expired" without fixing the boundary, which two implementations can read two ways. |
| MUST-T3-4 | A PDP allow decision MUST be bound to the SHA-256 of the canonical encoding of the request fields it evaluated, as stated in {{hash-inputs}}, and MUST be single-use. |
| SHOULD-T3-5 | Nonce stores SHOULD persist across process restart when the deployment is not a test fixture. |

## T4: Receipt forgery or repudiation

| ID | Requirement |
|---|---|
| MUST-T4-1 | A Spend Receipt MUST be signed by the Receipt Issuer over the deterministic CBOR encoding of its claims, as profiled in {{cose-profile}}. The phrase "canonical encoding" is reserved for JSON documents ({{canonical-json}}); -03 used it for both and left a reader to work out which was meant. |
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
| MUST-T6-5 | A party that accepts a Decision Token MUST reject a failed signature, a `kid` or content-type mismatch, a claim-map mismatch, or an expired `expiryMs`. The token is expired when the evaluation time is strictly greater than `expiryMs`; at exactly `expiryMs` it is not. |
| MUST-T6-6 | A consumer of a Decision Token MUST verify it against its own issuing key and MUST NOT accept a token it cannot check that way. The consumer issued the token, so asking the token which key to check it against is a question that answers itself. |

## T7: Signing-key leakage

| ID | Requirement |
|---|---|
| MUST-T7-1 | Secret key material MUST NOT appear in receipts, checkpoints, manifests, decision tokens, logs, or example output. |
| MUST-T7-2 | Example and test keys MUST be generated at runtime or stored as clearly fake fixtures, never as production secrets. |
| SHOULD-T7-3 | Production deployments SHOULD use an HSM or OS key store and SHOULD rotate keys. |
| MAY-T7-4 | Implementations MAY encrypt keys at rest. |
| MUST-T7-5 | An implementation that stores a signing key in the clear MUST report the protection it actually obtained, measured from the stored object rather than derived from the platform. A mount that ignores filesystem permissions accepts the call and protects nothing. |
| MUST-T7-6 | A writable directory anywhere on the path to a stored signing key makes the file permission moot, and a symbolic link on that path hands the destination to whoever placed it. An implementation MUST refuse both rather than report the key as protected. |

## T8: Counterparty price gouging or defective delivery

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
| MAY-T8-10 | A payee MAY attach a detached COSE_Sign1 countersignature over the issuer receipt bytes. Absence MUST NOT invalidate the issuer receipt. -04 numbered this requirement MAY-T8-9, colliding with MUST-T8-9; the number is corrected and the requirement text is unchanged. |
| MAY-T8-11 | An attributable countersignature MAY carry `deliveredHash`. When present and the verifier holds the Trade Manifest, the verifier MUST compare it against `acceptanceCriteriaHash` as exact octets and MUST report a mismatch as a failing finding (`delivery-mismatch`): both ends of that comparison are signed. A `deliveredHash` on an unattributable countersignature MUST be discarded with it. |

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
| MUST-T10-1 | A verifier MUST match each extract settlement to a settled receipt on `ref` AND `amount` AND `currency`. An audit presented with no extract, no receipts and no checkpoints reports no completeness finding: there is nothing to be complete about. It is not thereby unconditional, and the warnings for the roots it was not given still apply. |
| MUST-T10-2 | A settlement with no matching receipt MUST be reported as a completeness failure identified by that settlement `ref`. |
| MUST-T10-3 | A settled Spend Receipt whose `x402PaymentRef` is not on the extract MUST be reported as a completeness failure. |
| MUST-T10-4 | An audit that has any fail-severity completeness finding MUST fail (non-zero status in the companion tool). |
| SHOULD-T10-5 | Hosts SHOULD still apply T5 (no ungated rail in the model process). Completeness does not replace prevention. |
| MUST-T10-6 | A `ref` that appears more than once among settled receipts or among extract rows MUST be reported as `duplicate-ref`. |
| MUST-T10-7 | A verifier MUST obtain the extract from the rail or from a rail signature. With no pinned rail key, an unverifiable extract MUST be reported as `unauthenticated-extract` and makes the completeness guarantee conditional. With a pinned key, see MUST-T10-8: the extract MUST fail closed rather than warn. |
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
| MUST-T10-19 | A report MUST name the account, rail and window the extract declared, in any human-readable output it produces and in any structure it returns. A balanced result under an unconditional guarantee is a statement about one account on one rail over one window; an account that can settle on a second rail has a settlement path outside that population, and a report that does not name its own scope cannot be distinguished from one that covers every path. |

In MUST-T10-4, a completeness finding that makes the audit fail is
distinct from a warning that only makes the guarantee conditional.
The verification algorithm states that distinction by behaviour
({{reconciliation}}).

## T11: Checkpoint suppression or rollback

| ID | Requirement |
|---|---|
| MUST-T11-1 | An epoch checkpoint MUST be COSE-signed and MUST bind epoch number, time window, receipt count, chain-head hash, per-currency totals, and the previous checkpoint hash. |
| MUST-T11-2 | Verifiers MUST reject a checkpoint whose signature fails, whose totals do not match settled receipts in the declared window, whose `receiptCount` is wrong, or whose `chainHeadHash` is not the hash of the last in-window receipt in issuer order (the `prevReceiptHash` chain). Where the signed totals are null, MUST-T11-12 governs instead: there is no total to disagree with, the comparison is reported as skipped, and the count and chain-head checks still apply. |
| MUST-T11-3 | Two verified checkpoints for the same epoch with different hashes MUST be reported as equivocation. The checkpoints compared are those presented together with those carried by verified witness receipts; the presented chain alone cannot satisfy this requirement, because MUST-T11-8 makes its epochs consecutive. |
| MUST-T11-4 | A broken checkpoint hash chain MUST fail verification. |
| SHOULD-T11-5 | Checkpoints SHOULD be registered with a Transparency Service when one is configured. |
| MAY-T11-6 | A test deployment MAY use an in-process append-only log as the witness. |
| MUST-T11-7 | Checkpoint windows MUST be half-open `[startMs, endMs)`. Every chained receipt MUST fall in exactly one window. |
| MUST-T11-8 | Presented checkpoint epochs MUST be consecutive and adjacent windows MUST meet at `endMs = next.startMs`. |
| MUST-T11-9 | Prefix-deletion and suppression claims that go beyond the presented chain are conditional on an external transparency witness. A report MUST NOT present a completeness guarantee as settling suppression when no witness was consulted. |
| MUST-T11-10 | Witness receipts are an optional, separate input. A verifier given none MUST behave as it did without this input. A receipt MUST have its signature verified before it counts for anything. Where a receipt also carries the statement body, that body MUST NOT be relied on unless its statement hash equals the one the receipt binds and it verifies as a checkpoint; a discarded body does not discard its receipt. |
| MUST-T11-11 | A verified receipt binding a checkpoint absent from the presented chain MUST be reported as a withheld checkpoint, and MUST NOT be reported as a window coverage failure. A presented checkpoint with no verified receipt, where a witness was supplied, MUST be reported and makes the guarantee conditional. |
| MUST-T11-12 | Withheld checkpoint totals MUST be encoded as null in the signed payload. A verifier MUST report that the totals comparison was skipped and MUST treat the guarantee as conditional; `receiptCount` and `chainHeadHash` MUST still be checked. |
| MUST-T11-13 | A redaction asserted outside the signed payload MUST NOT be honoured, and structural claims MUST NOT be redacted. A checkpoint that fails verification MUST NOT be treated as redacted. |
| MUST-T11-14 | An epoch checkpoint MUST be registrable as a Signed Statement carrying the checkpoint COSE object with content type `application/cedulon-checkpoint+cbor`. |
| MUST-T11-15 | A verifier MUST obtain the transparency service public key out of band and MUST verify inclusion receipts against it. Receipts that cannot be checked that way MUST NOT be used as evidence in either direction, and the verifier SHOULD report that they were left out. |
| MUST-T11-16 | A statement held by a pinned log MUST additionally verify against the issuer root before it counts as something that issuer published, so that another user's epoch in a shared log is not read as equivocation by this issuer. |
| MUST-T11-17 | An inclusion receipt carrying no statement body MUST NOT be used to report a withheld checkpoint, because it cannot say whose statement it binds. It MUST NOT be discarded silently either: a real withholding must not be buried by removing the body. |
| MUST-T11-18 | Where candidate Signed Statement bytes and an inclusion proof are both supplied, a verifier MUST verify log membership by the mechanics of RFC 9942 Section 5.2.1 and MUST accept only when the leaf hash, leaf index, and reproduced root exactly match a witness receipt that verifies under the pinned witness key. Root reproduction alone is not acceptance. A pair that fails, or a candidate supplied without a proof, MUST be reported as a failing finding. |
| MUST-T11-19 | Where witness receipts are supplied and the tier-2 pair is not, the report MUST state that log membership was not exercised rather than passing the tier silently. |

Issuer self-attestation:
: A Receipt Issuer that also produces the only copy of the extract
  can omit settlements. Completeness holds only against an
  extract the verifier obtained from the rail or from a rail
  signature.

Key rotation and revocation:
: `kid` identifies the verification key. This -07 does not specify
  a revocation list. Verifiers MUST pin the issuer keys they
  accept and MUST stop accepting a `kid` after an authenticated
  revocation signal.

Timestamp trust:
: `timestampMs` is issuer-asserted. Window assignment uses that
  field. A lying issuer can slide a receipt between windows.
  External timestamping of receipts is out of scope for this revision; the
  checkpoint witness covers checkpoints, not receipt
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

## T12: Settlement without a recorded receipt

The threats above are about a counterparty, a rail or an attacker.
This one is about the issuer's own implementation, and it produces
exactly the condition the rest of this document exists to make
detectable.

An issuer that settles a payment, appends the receipt in memory and
then persists its state has three steps where it could have two
outcomes. If the write fails, the rail holds a settlement and the
receipt exists nowhere durable. The next start reads a state that
does not contain it, and the audit in {{reconciliation}} reports
`settlement-without-receipt` against an honest issuer that did
everything its own policy asked. The evidence is missing because the
issuer lost it, not because anyone hid it, and nothing in the report
can tell those apart.

| ID | Requirement |
|---|---|
| MUST-T12-1 | An issuer MUST NOT complete a settlement whose receipt it cannot record durably. The ability to record MUST be established before value moves, not after. |
| MUST-T12-2 | Where a settlement has been made and its record cannot be completed, the issuer MUST undo the settlement in every place it still controls: in memory, on the rail ledger it controls, and in any later write it has not yet issued. A refused payment MUST NOT consume the nonce or the payment allowance it never used. |
| MUST-T12-3 | Two issuers MUST NOT share one durable state. An implementation that permits it MUST fail loudly rather than let one writer overwrite the other's receipt, and the failure MUST name what an operator can act on. |
| MUST-T12-4 | Where a settlement has entered a rail the issuer does not control, and the local record cannot be completed, the outcome is indeterminate. The issuer MUST NOT treat the payment as reversed, and MUST NOT return the authority to spend, unless it holds authenticated evidence that the rail did not complete the settlement or that a reversing entry completed. |

Ordering:
: Settle-then-record is the natural order to write and the wrong one
  to ship. The record is what makes the settlement accountable, so the
  record is what has to be secured first (`MUST-T12-1`), and a
  settlement that cannot be recorded has to be undone everywhere the
  issuer still controls, including the nonce and the allowance it
  never used (`MUST-T12-2`). That undo is what the in-process
  `RailLedger` and the session tests measure. Once value has entered a
  rail the issuer does not control, a local snapshot cannot retract it.
  Persistence failing after that point leaves the outcome
  indeterminate; authority is not returned without authenticated
  evidence that the rail did not complete the settlement or that a
  reversing entry did (`MUST-T12-4`).

Recovery:
: A durable-state conflict is not necessarily fatal, but it MUST NOT
  be silent, and an implementation that refuses every subsequent
  write without offering a way back has turned a recoverable
  condition into an outage. The reason reported has to separate the
  cases an operator would act on differently (`MUST-T12-3`): a write
  that conflicted with another writer, a write that failed, and a
  state another process is holding. A single opaque failure leaves the
  operator to guess which of those happened.

Observability:
: A violation of this threat is not visible in the evidence a verifier
  receives. The audit sees a settlement with no receipt and reports
  `settlement-without-receipt`, which is the same finding an adversary
  would produce, and nothing in the extract or the receipt set
  distinguishes an issuer that lost the evidence from one that hid it.
  That is why the requirements here fall on the issuer rather than on
  the verifier, and why an operator-facing reason is required rather
  than optional.

# IANA Considerations {#iana}

This document requests the registration of five media types in the
"Media Types" registry {{RFC6838}}, in the standards tree, each
carrying the `+cbor` structured syntax suffix that {{RFC8949}}
registers. Each names one of the COSE_Sign1 objects this document
defines and is carried as the COSE `content type` header parameter
(label 3) of that object ({{cose-profile}}). The value is a normative
check inside a protected header (`MUST-T4-8`, `MUST-T6-5`), which is
why the names cannot stay unregistered while that check stands.
Registration in the standards tree requires IETF approval; until
then, an implementation outside a closed deployment should treat
these names as placeholders that a registration may change. The
provisional registration procedure of {{RFC6838}} Section 5.2.1 is
available to an Internet-Draft, and a provisional entry, if one is
made, is superseded by the registration this section requests.

The claim labels this document assigns inside the CBOR claim sets,
`-70001` through `-70402` ({{receipt-labels}}, {{countersign}}), lie
in the Private Use range of the "CBOR Web Token (CWT) Claims"
registry {{RFC8392}}, integer values less than -65536, and this
document requests no assignment for them. A later Standards Track
revision that moves them into the assigned range will request new
labels then, without reinterpreting these.

No other IANA action is requested.

The five templates follow. Fields that are the same for every one
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

## application/cedulon-checkpoint+cbor {#iana-checkpoint}

Type name:
: application

Subtype name:
: cedulon-checkpoint+cbor

Encoding considerations:
: binary. A COSE_Sign1 structure in deterministic CBOR, untagged, as
  profiled in {{redaction}} and {{cose-profile}}; the same object is
  the payload of the Signed Statement {{anchoring}} registers.

Security considerations:
: See {{security}} of this document. A checkpoint carries the
  suppression guarantee for its window ({{witness}}) and is verified
  only against a pinned issuer key.

Interoperability considerations:
: As for application/cedulon-receipt+cbor; the labels are those of
  the checkpoint table in {{receipt-labels}}, and `totals` signed as
  null is a redaction, not a malformed claim.

Published specification:
: This document, {{redaction}}.

Applications that use this media type:
: As for application/cedulon-receipt+cbor, and transparency witnesses
  that co-sign or register checkpoints.

Required parameters, optional parameters, fragment identifier considerations, additional information, contact, intended usage, restrictions on usage, author, change controller:
: As for application/cedulon-receipt+cbor.

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

RFC 7942 {{RFC7942}} note.

Implementation:
: A companion implementation with a runnable verification suite at
  <https://github.com/dogrucanemek-alt/cedulon>. The code is a profile
  of this document, not a second specification. This -07 is not an
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

: The requirements -03 and -04 added came out of five adversarial
  rounds against the implementation, each one asking a reviewer to
  break the code rather than to read it, with the reviewer barred from
  changing it. Four of those rounds found a defect inside the previous
  round's repair rather than in the original code, which is the reason
  this section does not describe the result as settled. The
  requirements -05 added came from a different direction: a
  reader ran the posted -04 Appendix A vectors against the exact
  archive bytes in an independent toolchain, reproduced both
  signatures and the byte-for-byte re-encoding, and filed the
  first-failure list {{changes-04}} answers - the first verification
  of this profile's vectors outside the companion codebase. The two
  requirements this revision adds came from a third: the author
  ran a neighbouring draft's canonicalization vectors through this
  profile's own encoder and reported the reading to the SCITT list,
  and measuring what that reading implied for this profile's digests
  found a surface the companion decoder was ignoring
  ({{changes-05}}).

: The conditions of that outside run, as its own log records them:
  Linux x86_64, Python 3.14.4, cbor2 6.1.4, cryptography 50.0.1,
  against the archive bytes of the posted -04, SHA-256
  `661755c600aede25451ce3a67df4a45d0d964c7b9196dc725dd310723eb8a49f`.
  Reading the posted -05, the same reader rebuilt the regenerated
  receipt vector of {{vectors}} from the text alone - protected header
  from the profile rules, `policyHash` as the SHA-256 over the UTF-8
  octets of the policy identifier the appendix names, deterministic
  CBOR, the {{RFC8032}} fixture key - and obtained the published 307
  octets byte for byte, SHA-256
  `0f1fe8859faf25de906b08142674f1270656d8ea7bfc00853c2fc6e9d3f5a10b`,
  against archive bytes SHA-256
  `fc8962b3daeed9f8e5b1c2b7d26d605c14873d9de1cbf35743ce59af2c7aa62e`.
  Both published signatures verify and neither object is tag-wrapped.
  That is this document's text producing a signed object without the
  code that produced it, which is the narrow claim it supports: the
  same reader has read parts of the public repository and its package
  metadata, says so, and for that reason does not describe the pass as
  a clean-room implementation.

Coverage:
: The receipt, checkpoint, extract, reconciliation, and verification
  algorithm are implemented, including the transparency witness input,
  the withheld and not-anchored conditions, and signed totals
  redaction. Requirements added in this revision and the previous three
  are implemented and covered by a red-then-green case before
  appearing in this text, except the reversal branch of `MUST-T12-4`:
  its extract branch is executed red-then-green, and the reversal
  branch is specified and not executed. `MUST-T4-17` and `MUST-T8-9`
  are in the published packages (see the note on distribution below);
  `MUST-T8-9` is published in the two-branch form specified since the
  -04.
  Continuous integration runs the full pre-release suite - the
  post-release registry checks are a separate job, deliberately
  excluded from it, so "full suite" here names exactly what was
  measured - on three hosted runners, each as a non-root user:
  Linux, macOS, and Windows; a fourth Linux job runs three cases
  only and is not a coverage claim. At the commit this revision
  describes, all three assert every case, 437 of 437, with none
  skipped. A local Windows run without symbolic-link privilege skips
  four POSIX-mode cases with a stated reason rather than returning
  silently, so a green local suite names what it did not cover and is
  that much smaller a claim. An earlier version of this paragraph
  said continuous integration ran "the whole suite"; a reader
  re-running the frozen claims pointed out that the excluded
  post-release job is part of the whole, and the sentence now names
  the suite it measures. That continues a pattern: an independent
  runner reported the first platform distinction back from a Linux
  run after this text claimed otherwise, and this paragraph has been
  corrected once per reader who measured it. The undo after a failed
  write is exercised on Windows too, by making the state file
  read-only so the atomic rename fails, and the protection report and
  the refusal to settle without a durable record are checked on all
  three operating systems.
  The witness used in the suite is the in-process log that
  `MAY-T11-6` permits, now a Merkle tree that issues inclusion
  proofs; tier 2 of {{witness}} is exercised against it
  red-then-green. The implementation has not been run against a
  deployed Transparency Service. The simplification the earlier
  admission here named - a receipt treated as a signature over a
  statement rather than proof of log membership - no longer reaches
  the protocol text: it is tier 1 by name, and tier 2 carries the
  membership question. The escrow role,
  reversal, refund, and partial settlement are not implemented.

Licensing:
: Apache-2.0.

Contact:
: The author of this document.

Experience:
: Readers of -00, -01 and -02 have reported defects in each, and every
  revision has been driven by what they found rather than by a plan.
  -01 fixed a bypass of the completeness claim and a gap about which
  key an extract is checked against. -02 repaired a defect reported
  against -01 and independently confirmed by a second reader: the
  object carrying the T11 guarantee was neither profiled for
  registration nor read during verification.

: The defect behind -03 was reported against the posted -02.
  A reader asked whether the profile should accept a pinned witness key
  and report an absent or mismatched pin explicitly. -02 Section 6.2 already
  required a verifier to obtain the public key from an authenticated
  channel and to reject a `kid` that does not match that key. What it
  did not carry was the verification algorithm, the separate root
  inputs, and the error semantics. Following the same question into
  the implementation found the omission for the Spend Receipt, the
  epoch checkpoint and the Decision Token. T12 came from neither
  reader nor adversary, and not from the rounds of trying to break the
  implementation either: it was found while writing the task for one
  of them, in the ordering the implementation itself used, which
  produced against the issuer the one condition this document exists
  to make detectable.

Note on distribution: the requirements -03 and -04 add that
are in a published package are in the published `@cedulon` packages at version 0.7.0, not only in the
repository, with the exceptions named below. What -05 added -
the hash-claim grammar, the countersignature attribution rule, the
pin-under-signature attested set, the boundary allowance, the
counterparty bindings, `deliveredHash`, and witness tier 2 - and what
this revision adds - the refusal of a JSON text that repeats a member
name (`MUST-T4-20`) and the refusal of a non-empty unprotected header
(`MUST-T4-21`) - are implemented in the repository at the pinned
commit and are not in a published package at the time of posting:
the 0.7.0 packages parse extract text with a parser that keeps the
last of two values, and their decoder verifies a signature over a
stuffed unprotected header without complaint. The next package
release carries all of it, and this sentence is the discrepancy
notice rather than a reader having to find one. A reader can check a claim against an installed package
rather than against a working tree. That order is deliberate: -00
described requirements that its published package did not yet carry,
a reader found the discrepancy, and this document does not repeat it.
Versions 0.2.x and earlier predate everything in this revision.

0.3.0 predated the manifest root and the T12 bound. It carried three
defects that only appear
away from the platform it was written on, which an independent runner
found by taking up a standing invitation to break it. A directory that
could not be written refused the lock before the record and left the
refusal as an uncaught exception rather than the reason this document
requires; the case for a symbolic link on the path used a call that
does not exist in the module system the package declares, so it never
reached its assertion; and repairing that revealed a fourth defect,
that the state fingerprint was read before the path was checked, so a
replaced path was reported as a conflicting writer rather than as a
hijacked destination. 0.3.1 closes all four. The manifest root
(`MUST-T4-15`) and the gate's refusal to settle against a manifest it
cannot attribute (`MUST-T4-16`) were published as 0.4.0 rather than as a patch: the
gate had been answering 200 to an unattributable manifest and writing
that manifest's hash into the receipt, and refusing it is a change in
behaviour that a version number ought to announce.

`MUST-T4-17` and `MUST-T8-9` were the exceptions in -04 and are no
longer; `MUST-T12-4`'s reversal branch still is. The same independent
runner who took up the invitation against 0.4.0 reported that
attributing a manifest was not the same as establishing that anything
in the window was spent under it, which is the distinction that
`MUST-T4-17` now draws. A reader of this document then observed that
the distinction survives one step further out: a receipt can name the
manifest and still depart from its amount, currency or expiry, which
is what `MUST-T8-9` closes. Both were unpublished when -03 was posted
and both are in the published packages now, so a
reader can check either against an installed 0.7.0 rather than against
this tree. `MUST-T8-9` as published carries the two-branch form
specified here: a departure under a usable issuer pin is a finding and
fails the audit, and a departure with no usable pin is reported as a
warning that does not by itself fail it. -03 stated
the single branch, and the difference is deliberate rather than a
drafting slip; the reason is given where the requirement is defined.
Four repairs -05's review rounds produced are in 0.7.0 and
were not in 0.6.0, so a reader comparing the two sees them. The MCP
boundary refuses an amount spelling the grammar forbids instead of
parsing and reprinting it, which had let `01` through as `1` and
erased the octets `MUST-T8-2` compares; `signManifest` holds the same
grammar its receipt counterpart always held; a decoder refusal keeps
its name on the audit surface instead of surfacing as a signature
failure, which `MUST-T4-19` requires; and no verifier throws on input
it cannot read, in either the CBOR or the JSON path, after an interim
shape that rethrew those names left a single oversized checkpoint able
to end an audit by exception rather than by finding.

`MUST-T12-4` is the one exception left in this revision, and it is
now half an exception. Its extract branch - authenticated rail
evidence resolving an indeterminate outcome - is executed
red-then-green against the in-process `RailLedger` and ships in
0.7.0. Its reversal branch is specified and not executed: there is
no authenticated external-rail path in this tree, so the rule that
forbids returning authority without evidence of a completed
reversing entry has no red-then-green case, and a reader checking
that branch against an installed 0.7.0 will not find it.

## Changes from -06 {#changes-06}

This revision has two subjects. The first repairs a wording residue
that -06's own repair created, reported by the reader who implemented
-06 from the posted text; it changes no behaviour. The second adds two
requirements on one axis of the audit's declared scope that every
earlier revision left unstated.

-06 stated, for the first time, what a verifier does when it holds no
pinned issuer key: the signature is still checked against the key the
object itself carries, which establishes internal consistency and
nothing about who signed it ({{presentation}}, {{issuer-root}}). Four
places in the same document still carried the older absolute
formulation, under which no signed object may be verified against a key
it carries at all. Read literally, those four forbade the check the
other two had just defined, and two implementations following different
halves of the document would produce different findings from the same
evidence.

- The Abstract said no signed object may be verified against a key it
  carries itself. It now says no signed object is attested by one.
- The opening paragraph of {{issuer-root}} stated the prohibition
  without the no-pin case. It now separates the two: a carried key is
  neither an identity nor a fallback for a pin (`MUST-T4-9`,
  `MUST-T4-11`), and where no key is held the check that runs
  establishes internal consistency only.
- `MUST-T4-9` carries the same split, in the requirement's own words.
- `MUST-T10-8` carried the identical residue on the rail path, where it
  was not reported: an extract presented under no pinned rail key is
  verified against the key it carries, and the implementation says so in
  its own warning. The requirement now separates identity from internal
  consistency the same way, and names `unauthenticated-extract` as the
  condition.

The witness root already stated the distinction correctly and is
unchanged; it is where the wording for the other four came from.

The second subject is the scope a completeness result is over. -05
established that a verifier which states no period cannot call its
result unconditional, because the extract then defines the period it
reports on (`MUST-T10-15`). The account and the rail are the same kind
of axis and were never given the same treatment: an extract names one
account and one rail ({{rail-extract}}), so a verifier that states
neither leaves the extract to define whose settlements were accounted
for and which way out was watched. `MUST-T10-18` closes that axis the
way -05 closed the period.

`MUST-T10-19` states the consequence the earlier revisions left to the
reader. A balanced audit under an unconditional guarantee is true of
one account, on one rail, over one window. An account that can settle
on a second rail has a settlement path no presented extract covers,
and a spend that left that way is not an unmatched row - it is outside
the declared population, which is precisely the bypass {{security}}
names in T10. The report now carries the account, rail and window it
was computed over, so the strongest line it prints cannot be read as a
statement about paths it never looked at. Enumerating an account's
rails remains the deployment's statement; no extract can be asked to
prove that the enumeration is complete.

This distinction is the one {{ABAK}} draws for control instructions,
where a receiver-side observation at one enforcement point does not
establish that another required path was reached.

## Changes from -05 {#changes-05}

This revision has one subject on the wire, one at the registry, and
one repair to what the text claimed about verification without a
pinned key.
On the wire it adds two decoder rules, each the named refusal of a
surface the posted -05 left implicit; at the registry it turns the
placeholder table of -05's IANA section into the registration
requests {{RFC6838}} asks for. Both rules landed red-then-green in
the companion implementation before they were written here, and each
came from reading rather than from a reader: the first from running
the canonicalization vectors of a neighbouring draft {{CPB}} through
this profile's own {{RFC8785}} encoder, the second from measuring
what would change if the digests of {{hash-inputs}} were taken over
the COSE `ToBeSigned` structure instead of the signed octets. That
second question is not answered in this revision; what the
measurement found on the way is.

- JSON text gains the rule CBOR already had. {{RFC8785}} takes I-JSON
  {{RFC7493}} as its input, and an I-JSON object carries no duplicate
  member names; a verifier that receives a JSON document as text now
  refuses a text in which any object repeats a member name, by the
  name `json-duplicate-key`, before parsing it (`MUST-T4-20`,
  {{canonical-json}}, {{rail-extract}}). -05 was silent, and the
  companion refused such texts anyway; its conformance runner carried
  that difference as a recorded split against the posted -05, and
  this sentence is what the split was waiting for. The rule is
  measured on the text because a parser that keeps either value has
  already discarded the evidence of the other.
- The empty unprotected header became a decoder rule rather than an
  encoder promise. Every digest over a signed object covers the
  unprotected header and the signature does not, so a decoder that
  verified the signature and ignored a stuffed header would compute
  a `receiptHash` the issuer never produced. A COSE_Sign1 whose
  unprotected header is not an empty map is refused as
  `cose-sign1-unprotected` (`MUST-T4-21`, {{cose-profile}}). The
  companion decoder had ignored the header. The vectors in Appendix
  A are unchanged, because every one of them carries an empty one.
- {{iana}} states a full {{RFC6838}} template for each of the five
  media types and requests their registration in the standards tree,
  and says of the claim labels that they lie in the Private Use range
  of {{RFC8392}} and are not requested. -05 listed the names and said
  they should be registered if the work were taken up.
- What a verifier holding no pinned issuer key does is now stated as
  measured, in one wording rather than two. The verification path said
  no signature comparison happened at all; the finding-code table said
  the objects were checked against the keys they carry. Measurement
  settled the two in opposite directions, so both were rewritten
  rather than reconciled to either: a receipt or checkpoint signature
  is checked against the key its own object carries, which is why a
  broken signature is still named while two issuers cannot be told
  apart, and a presented Trade Manifest with no pinned publisher key
  is not checked at all. Neither statement is a new requirement; both
  describe what {{verification}} already did. Sweeping the rest of the
  table the same way found one more row describing one branch of three:
  unauthenticated-extract is reported for an extract whose signature
  verifies under no pinned rail key, for one that does not, and for a
  pinned rail key with no extract presented at all, where -05 named
  only the unsigned case and sent the pinned case to
  `extract-key-mismatch`, which is where a presented extract that fails
  under a pin goes and the only one of the three that lands there.
- Two more rows say what a pinned issuer key does to a checkpoint. A
  checkpoint that does not verify under the pin, whether because it was
  signed by another key or because its bytes were altered, is
  `issuer-key-mismatch` and leaves its window uncovered; it never
  reaches the totals comparison, so the signature branch of
  `checkpoint-total-mismatch` belongs to the unpinned path. The pin
  table in {{issuer-root}} described only the receipt outcome for that
  cell, because a checkpoint has no chain walk to be named in. The
  companion also carried an operator-facing message asserting that an
  unpinned manifest's signature proved internal consistency, which the
  same measurement shows it never checks; the message now says so, red
  before green.
- {{presentation}} defines the carried key those statements turn on.
  Every presented receipt, checkpoint, Trade Manifest and Decision
  Token carries the signer's SubjectPublicKeyInfo PEM beside its
  signed octets, and {{issuer-root}} has named a warning for that key
  since -05 without any revision saying where the key came from: -05
  defined such a member only for the Rail Extract. The state the
  unpinned cell
  names, presented-unattested, is likewise defined in the terminology
  rather than used once.
- A Trade Manifest refused by a stated publisher pin no longer founds a
  charge. Its body was still supplying the terms comparison of
  `MUST-T8-9` and the acceptance-criteria hash behind `delivery-mismatch`,
  so a manifest anyone could mint, presented beside an honest receipt,
  produced two hard findings against the payee while the same report
  refused the document as `manifest-key-mismatch`. That is the shape this
  profile closes everywhere else: evidence nothing stands behind must not
  manufacture a negative result. The requirement says so where the charge
  is defined, and the companion stops reading the body at the refusal,
  measured red before green.
- Six more finding-code rows were swept the same way as the three above
  and named the branch they were missing: the refused chain head under
  `checkpoint-head-mismatch`, cover reported on presentation rather than
  on attribution, the payee branch of the terms comparison, the four
  fields `extract-settlement-mismatch` actually compares, the unpinned
  half of `unstated-audit-window`, and what
  `witness-inclusion-not-exercised` does and does not say about
  verification. Two operator-facing messages stopped reporting states the
  same report contradicted: a reconciliation that had not closed and a
  witness attestation nothing had verified.
- {{impl-status}} names what this revision adds as not yet in a
  published package, on the same terms -05 used for its own
  additions, carries the suite size measured at the commit it
  describes, and records the conditions of the outside vector run and
  of the regeneration of a vector from this text alone.

## Changes from -04 {#changes-04}

All but the last three changes in -05 answered a
first-failure list filed against the posted -04 by an independent
reader who ran the Appendix A vectors against the exact archive
bytes before reading the text: eight points where an implementation
could no longer be built from the text alone, one question, and
three mechanical defects. The last three answered a counter-reading
of -05, made from the text alone before it was posted, and a
reply on the DISPATCH list. The
repairs landed red-then-green in the companion implementation before
the sentences below were written, and the shapes in the text are
taken from what the implementation measurably does.

- The transparency receipt path stopped promising {{RFC9942}}
  mechanics it did not perform. {{witness}} now names two tiers: the
  witness receipt (a co-signature over the statement hash, and
  nothing more) and log membership (candidate Signed Statement bytes
  plus an inclusion proof, verified by RFC 9942 Section 5.2.1
  mechanics against a witness-signed tree head, with exact
  receipt-matching stated as normative). Where tier 2's inputs are
  absent, the report says the tier was not exercised
  (`MUST-T11-18`, `MUST-T11-19`).
- Key resolution in step 4 collapsed to one rule - membership in the
  attested set follows verification under the pinned root - read out
  cell by cell in a table, each cell a named condition plus a
  membership decision, never a silent removal. The carried key is
  not an identity source: swapping it on an honestly signed object
  is `carried-key-mismatch`, a warning, and cannot move the object
  out of the attested set ({{issuer-root}}).
- The Rail Extract body has one normative shape. Table 8's member
  names bind the rail; the sentence that said the names were the
  rail's to define is withdrawn; the full signed body - members,
  types in JSON terms, and the signature representation - is stated
  in {{rail-extract}}.
- "Issuer order" is defined as the order induced by the
  `prevReceiptHash` chain; presentation order carries no weight, and
  `chainHeadHash` binds to the last link of the chain in the window.
  The window-coverage check is stated as fail-closed, zero
  checkpoints and the open epoch included. The claim that no other
  step fed another is withdrawn for the maintained dependency list.
- The window boundary stopped manufacturing accusations out of two
  honest clocks: membership follows the ref binding first, and an
  unmatched item within the extract-declared `clockSkewMs` of the
  edge is `boundary-deferred`: a closing-edge item resolves against
  the following window's extract, an opening-edge item only against
  a receipt in the presented bag (`MUST-T10-17`).
- An appended countersignature can no longer fail an honest audit.
  Attribution gates evidentiary weight; an unattributable
  countersignature is discarded with a warning, the pinned
  expectation stays open, and the verdict on the issuer receipt
  does not move ({{countersign}}).
- The counterparty triangle is closable and honestly scoped: an
  optional manifest `payee`, an optional settlement-record
  `beneficiary`, and a `counterparty-unbound` scope record when
  neither is present.
- The delivery claim shrank to its evidence and the evidence grew:
  an optional `deliveredHash` on the countersignature makes the
  acceptance comparison signed-to-signed (`MAY-T8-11`), and the
  Introduction conditions "what bytes were delivered?" on that
  evidence being present.
- "Allowed by policy" is stated as the Receipt Issuer's signed
  assertion, with the trust boundary named: the audit does not
  independently verify the PDP's allow, and a receipt-to-token
  binding is a possible extension, not -05.
- Mechanical: the hash-claim grammar (64 lowercase hex) moved into
  the signers and validators, named per claim, and the Appendix A
  receipt vector - which violated Table 3 in the posted -04 - is
  regenerated with a computed digest. `MAY-T8-9` is renumbered
  `MAY-T8-10`; the number collided with `MUST-T8-9` and the
  requirement text did not change. The lone-surrogate escape
  permission contradicted {{RFC8785}} Section 3.2.2.2 and is
  removed: producers refuse by name, verifiers report rather than
  crash ({{canonical-json}}).
- The extract's time fields are refused at the shape gate when they
  are not integers, the way the tables already named them: a
  counter-reading found that `1.5` and `NaN` passed a `number` check
  and were signed. `windowStartMs`, `windowEndMs`, each record's
  `timestampMs`, and `clockSkewMs` are now refused by name unless
  they are integers of magnitude at most 2^53 - 1, and `clockSkewMs`
  unless it is also non-negative; the canonical-encoding refusal for
  non-finite numbers still guards members the rail adds.
- An opening-edge deferral is closed only by a receipt in the
  presented bag. The implementation had let a following window's
  extract harden it into `settlement-without-receipt`; the text's
  reason for the deferral, ref binding, never said so, and the seven
  edge cases are locked as tests.
- The abstract no longer says that payment rails and mandate
  protocols lack a fail-closed policy check; a mandate protocol has
  one, and returns signed receipts. It names the missing piece as
  what a party that is neither payer nor rail operator can retrieve
  and reconcile against an authenticated rail extract. A reply on
  the DISPATCH list narrowed the claim, and the narrowing is right.

## Changes from -03 {#changes-03}

-04 had one subject: -03 could not be implemented from its own
text. Eighteen decision points were read out of it by someone working
from the words alone, and eight of them had two defensible answers.
Nothing here adds a capability. Everything here closes a place where
two conforming implementations would produce different bytes or reach
different verdicts.

Five of those eight were the same defect wearing different clothes.
-03 hashed or signed a JSON document in four places and called the
encoding "canonical" without ever defining it, and named the digest for
some hash-valued fields and not others. {{canonical-json}} defines the
encoding by reference to {{RFC8785}}, and {{hash-inputs}} states, for
every hash-valued field, exactly which octets go in. The heaviest of
those was `requestHash`: -03 called it "the six-field hash" in the same
sentence that named SHA-256 for `policyHash`, and a reader was entitled
to conclude it was not a digest at all.

`MUST-T8-9` changes in a way a diff will show, and the change is
deliberate. -03 said an unpinned departure from manifest terms fails
the audit, full stop. An implementation showed what that permits: a
receipt signed by any key, carrying the right manifest hash and a wrong
amount, makes a verifier report a breach that never happened against a
payment reference the forger picks. The requirement now separates the
two cases and says why it differs from `MUST-T4-17`, which is a naming
question rather than a charge and is answered from the presented set
whether or not anything vouches for it.

`MUST-T4-18` and `MUST-T4-19` are new: -03 bound the encoder to
deterministic CBOR and said nothing about the decoder, neither about a
duplicate key nor about what a decoder does when an input is larger
than it is willing to read. The second fixes no numbers. A bound is
deployment policy; refusing by name rather than by running out of stack
is not.

`MUST-T3-3` and `MUST-T8-2` gain the boundary and the comparison rule
they were missing: whether a settlement exactly at expiry is inside the
manifest, and whether a currency may be case-folded before it is
compared. `MUST-T10-1` says what an audit with nothing in it reports.

The acceptance-criteria hash had two readings and no way to signal
which one was used, so two implementations would have hashed the same
delivery differently. This revision defines one of them and puts the
other out of scope until something can say which is meant.

The verification algorithm now names its data dependencies. -03 named
one and said nothing else fed another step, which stopped being true
once the issuer pin began deciding the attested set: the chain walk,
the reconciliation, the checkpoint comparisons and `MUST-T8-9` all
consume it, and the algorithm now says so, along with the two checks
that deliberately stay on the presented set. The two severities of
`MUST-T8-9` are now stated in the algorithm step and the finding
table as well as in the requirement, after an early draft of this
revision changed the requirement and left the step and the table
carrying the old unconditional verdict.

Three encodings that could be read two ways are now stated once each:
`kid` is the SHA-256 of the SubjectPublicKeyInfo DER truncated to its
first 8 bytes, in that order; "the signed COSE_Sign1 octets" are the
untagged array, never tag 18; and the six-field request document is
given as an exact JSON shape, member by member, rather than as a list
of names. The hash-input table now covers `acceptanceCriteriaHash`
and says whose digest `ap2MandateHash` is. The Decision Token gains
the same expiry boundary `MUST-T3-3` states for the manifest.

Appendix A no longer defers to the tests of an
implementation; a specification that points at code cannot be
implemented from its own text, which is the property this revision is
trying to restore.

One change is metadata rather than text: the submission stream in the
document's header changes from independent to IETF. The Note to
Readers has named an eventual Standards Track intent since -00, and
{{iana}} asks for Standards Tree registration; neither belongs on the
Independent Stream. The rendered pages are unchanged by it.

What has not changed: `MUST-T12-4` remains specified and not executed,
and this document still has no independent implementation written from
its text alone. The point of this revision is to make that possible,
not to claim it happened.

## Changes from -02 {#changes-02}

-03 had two subjects. The first is that -02 stated a rule
for signed objects and left the implementation and the verification
algorithm without a counterpart for every object the rule applied to.
The second is T12, which no reader reported and which is not about an
adversary at all.

-02 Section 6.2 already required a verifier to obtain the public key from an
authenticated channel (a preconfigured issuer set, a directory, or a
transparency statement) and to reject a message whose `kid` does not
match that key (`MUST-T4-8`). That rule was general. What -02 did not
carry was the verification algorithm that applies it to each signed
object, the separate root inputs a verifier supplies out of band, and
the error semantics that name a missing, unreadable, or mismatched
pin. A companion implementation that followed the algorithm it had,
rather than that prose, still checked a Spend Receipt, an epoch
checkpoint, a Decision Token and a transparency inclusion receipt
against the key travelling inside them. A receipt like that silences
the `settlement-without-receipt` finding for the settlement it names.
The completeness property is then computed over evidence that answers
to nobody. {{trust-roots}} states the missing algorithm and the
error semantics, and the verification algorithm now applies them.

A reader raised the inclusion-receipt half of this against the posted
-02 after checking the archived text against the implementation
commit. Following it into the code turned up the other three, along
with two conditions that were not about keys at all.

The first is that reporting a mismatch is not enough. An
implementation that names a foreign key and then still lets the
receipt match its settlement has described the attack in its output
while concluding that the books balance. `MUST-T4-10` now requires
the settlement to stay reported.

The second is that an expectation which only fires when the evidence
is present can be cancelled by deleting the evidence. A pinned payee
key with no countersignature to check was silence, so removing a
countersignature removed the question with it. `MUST-T4-14` closes
that, and `MUST-T11-17` closes the same shape in the witness: an
inclusion receipt with its body stripped off can no longer bury a
withholding, while still not being allowed to accuse anyone.

T12 is new and is not about an adversary. An issuer that settles,
appends the receipt in memory and then writes its state will, when
that write fails, leave the rail holding a settlement whose receipt
exists nowhere durable. Restarted, it reports
`settlement-without-receipt` against itself. The condition this
document exists to make detectable was reachable through the
implementation's own ordering, and no requirement in -02 said
otherwise.

The same first subject carries five requirements this section has not
named so far, all of them stated in {{trust-roots}}. A pinned key that
cannot be decoded MUST NOT fall back to the keys the objects carry
(`MUST-T4-11`). An issuer root may comprise more than one key, and a
verifier must accept one that does, so a rotation inside the audited
window does not force it to choose between findings against honest
receipts and abandoning the pin (`MUST-T4-12`); the same set-of-keys
acceptance applies to a publisher, witness, or rail pin. The same out-of-band rule reaches the payee
countersignature (`MUST-T4-13`), the transparency witness
(`MUST-T11-15` and `MUST-T11-16`), the Decision Token, whose
consumer issued it and therefore already holds the key to check it
with (`MUST-T6-6`), and a presented Trade Manifest (`MUST-T4-15`).

Two requirements belong to neither subject. `MUST-T7-5` and
`MUST-T7-6` come from measuring the protection a stored signing key
actually has instead of deriving it from the platform. A mount that
ignores filesystem permissions accepts the call and protects nothing,
and a writable directory or a symbolic link anywhere on the path makes
the file permission moot. They are stated because the implementation
reported protection it did not have.

Two things are stated here that -02 got right and -03 kept
unchanged: the extract rule itself, and the treatment of a pinned key
the verifier cannot decode. What changed is their reach, and the
change is not backward compatible. Where a verifier pinned the rail
key, supplied no issuer key, and was presented with receipts or
checkpoints, -02 reported the guarantee as unconditional and -03
reports it as conditional. Nothing about the evidence
changed; what changed is that the guarantee now says which questions
were never asked. An audit presented with neither is unaffected, for
the reason given in {{issuer-root}}.

## Changes from -01 {#changes}

-02 had one subject: the checkpoint, which carries the T11
guarantee against suppression and rollback, was not wired into
anything that could discharge it.

A reader of -01 set out the gap and a second reader confirmed it
independently. Four things were wrong at once, and they were the same
thing seen from four sides. The SCITT anchoring section profiled the
Spend Receipt and not the checkpoint, so `SHOULD-T11-5` asked for
checkpoints to be registered without saying in what form
(`MUST-T11-14` now says). None of the steps of the verification
algorithm read a witness receipt, so a deployment could follow
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
of scope and are still expected later, with no date. -01 said the same,
and no revision since has improved on it.

The reporters are named in the Acknowledgments.

# Evolution and Future Work (Informative) {#evolution}

This section is a direction, not a commitment. The structures below
are reserved in name only. Normative wire formats, tests, and
threat-model MUST lines for them belong in later revisions (-08 or later), written with the same discipline as this -07.

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

Payment is the special case that this -07 implements. The same
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
discipline on two different objects.

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

-03 said these vectors "MUST match the locked tests
in the companion implementation", which pointed the reader at code
rather than at this document. A specification that defers to an
implementation cannot be implemented from its own text, and that is the
property this document is trying to have. The vectors below are
normative on their own terms: an implementation matches them or it does
not, and where an implementation and a vector disagree, one of the two
is wrong and this document does not say in advance which.

Receipt COSE_Sign1:

Claims: payer=`payer-1`, payee=`payee-1`, amount=`1`,
currency=`USD`, policyHash=
`fca4142da8ad241d24928227893894f4b5365efb746a4529fe9df0119d10da2c`
(the SHA-256 of the UTF-8 octets of the ASCII string
`cedulon/appendix-policy`, standing in for a canonical policy
document; the field's input rule is in {{hash-inputs}}, and the
-04's vector carried `aa` here, violating its own
Table 3 - see {{changes-04}}), manifestHash=null,
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
