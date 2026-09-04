---
title: "Cedulon Decision Profile: Reconciling an Agent's Decisions Against Its Effects"
abbrev: Cedulon Decision Profile
docname: draft-dogru-cedulon-decision-profile-01
date: 2026-09-04
category: info
submissiontype: IETF
ipr: trust200902
area: sec
workgroup:
keyword:
  - Cedulon
  - agent
  - decision
  - reconciliation
  - completeness
stand_alone: true
smart_quotes: false
pi:
  - toc
  - tocindent
  - sortrefs
  - symrefs
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
  RFC8785:
  RFC8949:
  RFC9052:
  RFC9864:
  CEDULON:
    title: "Cedulon: An Audit Layer for Agent-to-Agent Commerce"
    author:
      - ins: E. C. Dogru
        name: Emek Can Dogru
    date: 2026-09-02
    seriesinfo:
      Internet-Draft: draft-dogru-cedulon-08
    target: https://datatracker.ietf.org/doc/html/draft-dogru-cedulon-08
informative:
  RFC7942:
  RFC9943:
  ABAK:
    title: "Evidence Requirements for Agent Control Delivery and Outcome Reconciliation"
    author:
      - ins: A. T. Abak
        name: Ali Toygar Abak
    date: 2026-09-04
    seriesinfo:
      Internet-Draft: draft-abak-agent-control-delivery-evidence-01
    target: https://datatracker.ietf.org/doc/html/draft-abak-agent-control-delivery-evidence-01
  AEB:
    title: "The Action Evidence Boundary for Consequential Agent Effects"
    author:
      - ins: I. Schrock
        name: Iman Schrock
    date: 2026-08-31
    seriesinfo:
      Internet-Draft: draft-schrock-action-evidence-boundary-05
    target: https://datatracker.ietf.org/doc/html/draft-schrock-action-evidence-boundary-05
  OUTCOME:
    title: "Outcome Binding for Authorized Actions and Independently Observed Effects"
    author:
      - ins: I. Schrock
        name: Iman Schrock
    date: 2026-07-28
    seriesinfo:
      Internet-Draft: draft-schrock-ep-outcome-binding-00
    target: https://datatracker.ietf.org/doc/html/draft-schrock-ep-outcome-binding-00
---

--- abstract

The Cedulon core document reconciles an issuer's signed Spend Receipts
against an authenticated extract of a payment rail and reports, over a
declared population, that no settlement lacks a receipt and no settled
receipt is absent from the rail. Money is the special case that
document implements. This document defines a second population on the
same reconciler. A Decision Record is signed by the party that decided
whether an agent may act; an Effect Extract is an authenticated list
of the effects that actually occurred on a channel. An allow must be
matched by exactly one effect whose content hash the record named; a
refusal must be matched by none. The Decision Record claim set, the
Effect Extract shape, the points at which the reconciliation departs
from the spend rules, the finding codes, and one media type are
defined. This revision binds the class of the allowed effect into the
signed record, narrows what the Decider's chain is claimed to control,
and states the boundary to three adjacent documents. The text is
provisional and the companion implementation carries the profile
prepared and unpublished.

--- middle

# Introduction

The Cedulon core document {{CEDULON}} answers one question
about an agent that spends: did every settlement on the rail have a
receipt behind it, and did every settled receipt reach the rail? It
answers it by closing three signed objects over a declared population:
the issuer's records, an authenticated extract of the counterparty
system, and epoch checkpoints that total the records. The verifier
holds the keys out of band and the report names the population it
covered.

An agent that acts without spending raises the same question with
different nouns. A party decided whether the agent may reply, post,
send, or call; a channel carried whatever the agent then did. Did every
effect on the channel have a decision behind it? Did every allowed
action occur, once, with the content that was allowed? Did anything
occur that was refused? Section 19 of {{CEDULON}} reserves later
profiles in name only, and its Section 19.3 sketches the same
completeness calculus for other consumable resources: compute, data,
energy. This document is a different population on the same
reconciler, decisions against effects rather than another unit of
spend, and it is the first profile written out.

The profile keeps the core's three roles and its verification
algorithm. What changes is the record, the row, the binding between
them, and the words the report uses. What does not change is
measured: the companion implementation holds the spend behaviour byte
for byte behind a golden file, and every rule in this document that
departs from the spend rules is stated as a departure.

Three documents written at the same time ask adjacent questions about
the same agent, and the boundary between them is worth stating so
that a reader does not take one for another. This profile reconciles
signed decisions against the effects a channel carried. {{AEB}}
handles what happens before an effect: authorization, reservation,
and the provider's entry. {{OUTCOME}} reconciles the exact action
and its source against the effect that was independently observed,
and keeps missing evidence indeterminate rather than resolving it
either way. {{ABAK}} covers the delivery and enforcement of a
governance control on its way to one or more enforcement points. The
finding this profile exists for, an effect that occurred against a
refusal ({{binding}}), establishes that the decision and effect
populations did not reconcile; it does not by itself establish
whether the failure lay in control delivery, enforcement, another
path, or elsewhere. Where a deployment realizes a refusal through a
downstream control path, the evidence for that path is the question
{{ABAK}} addresses; where no such path exists, this profile does not
imply one.

This document is a companion to the core document, not a revision of
it. It is not an IETF working-group item. Its requirement language is
provisional in the sense Section 19 of {{CEDULON}} gives the
structures it reserves: a direction written with the core's
discipline, not a commitment, and a later revision may change it. The
companion implementation carries the profile prepared and
unpublished.

# Terminology

{::boilerplate bcp14-tagged}

Terms defined in the core document keep their meaning here: Policy
Decision Point, epoch checkpoint, trust root, population, finding,
warning, guarantee. The following are specific to this profile.

Decider:
: The party that decides, per request, whether the agent may act. It
  signs Decision Records and epoch checkpoints over them. Its key is
  the issuer root of this profile ({{roots}}).

Subject:
: The party on whose request the decision was taken, named in the
  record as an opaque identifier.

Decision Record:
: A COSE_Sign1 object signed by the Decider stating one decision:
  allow, deny, or defer, with the request it answered, the policy it
  applied, and, for an allow, the reference and the content hash of
  the effect it allowed ({{record}}).

Effect:
: One thing that happened on a channel as a result of, or in the
  absence of, a decision: a message sent, a post made, a call placed.
  It is identified by a reference, classed by a short name, and bound
  by the SHA-256 of its content.

Channel:
: The system on which effects occur and from which an Effect Extract
  is taken. It plays the role a rail plays in the core document.

Effect Extract:
: The authenticated list of effects on one channel, for one Decider,
  over one window ({{extract}}). It plays the role a rail extract
  plays in the core document.

Refusal:
: A Decision Record whose decision is deny or defer. A refusal expects
  no effect.

# The population {#population}

The core document's reconciler closes an issuer record against a
counterparty row over a declared population. This profile fills the
same three roles:

| Role | Spend (core) | Decision (this document) |
|---|---|---|
| Issuer record | Spend Receipt | Decision Record |
| Counterparty row | settlement record on a rail extract | effect row on an Effect Extract |
| Match key | `ref` | `ref` |
| Content binding | amount and currency equal | allow: a row exists and `effectHash` is equal; refusal: no row |
| Record that expects no row | `outcome` aborted | `decision` deny or defer |
| Aggregate witness | checkpoint `totals` per currency | checkpoint `totals` per decision kind |
| Declared population | account, rail, window | decider, channel, window |

Which population a presented document belongs to is the verifier's
call, made by the profile it applies, and never the document's. A
verifier applying this profile MUST read every presented record as a
Decision Record and every presented extract as an Effect Extract, and
MUST refuse by name a document that does not have that shape; it MUST
NOT infer the population from members a body happens to carry
(`MUST-DP-1`). The companion found the alternative wrong in both
directions: a rail extract that added a member named `effects` was
re-routed away from the spend rules it was subject to, and an Effect
Extract handed to the spend rules crashed before any report existed.
Under this profile a rail extract is the wrong document and is refused
as one; under the spend rules an Effect Extract is refused the same
way.

# Decision Record {#record}

A Decision Record is COSE_Sign1 with the header profile of Section 6.2
of {{CEDULON}}: deterministic CBOR, `alg` `-19` (Ed25519,
{{RFC9864}}), `kid` mandatory and computed as the core states, an empty
unprotected header refused by name if not empty, and the payload the
CBOR encoding of the claim map below. The content type header
parameter is `application/cedulon-decision-record+cbor` ({{iana}}).

## Claim labels {#record-labels}

The labels lie in the Private Use range of the CWT Claims registry
{{RFC8392}}, below the block the core document uses for the Decision
Token (`-70301` to `-70305`) and the countersignature (`-70401`,
`-70402`), so that no two Cedulon claim maps share a label. Every
claim annotated `hash` carries a SHA-256 {{RFC6234}} digest rendered
as exactly 64 lowercase hexadecimal characters, the grammar of Section
6.1 of {{CEDULON}}, and a value outside that grammar is
refused by name at signing and at verification.

| Label | Claim | CBOR type |
|---|---|---|
| -70501 | decider | tstr |
| -70502 | subject | tstr |
| -70503 | requestHash | tstr (hash) |
| -70504 | policyHash | tstr (hash) |
| -70505 | inputsHash | tstr (hash) / null |
| -70506 | decision | tstr (`allow` / `deny` / `defer`) |
| -70507 | reasonCode | tstr |
| -70508 | ref | tstr / null |
| -70509 | effectHash | tstr (hash) / null |
| -70510 | timestampMs | uint |
| -70511 | nonce | tstr |
| -70512 | prevRecordHash | tstr (hash) / null |
| -70513 | effectClass | tstr / null |

All thirteen labels are always present; a nullable claim carries CBOR
null when it has no value. The thirteenth label is new in this
revision; a record with twelve is refused at verification as a claim
set that does not have this shape, and the companion carries no
records signed under the earlier set outside its own fixtures.

`decider` and `subject` are opaque identifiers chosen by the
deployment. `requestHash` is the SHA-256 of the request the Decider
evaluated, in the canonical encoding of Section 7 of
{{CEDULON}} when the request is a JSON document and over its
UTF-8 octets when it is text; this document does not fix the request's
fields, and a deployment MUST state what it hashes. `policyHash` is
the SHA-256 of the canonical policy document the Decider applied.
`inputsHash`, when not null, is the SHA-256 of whatever further
context the Decider consulted, encoded the same way, so that a later
reader can tell two decisions on the same request apart by what else
was on the table. `reasonCode` is a short token the deployment
defines; it is carried, not interpreted.

`ref` is the reference under which the allowed effect will appear on
the channel, and the key on which the reconciliation matches.
`effectHash` is the SHA-256 of the content of the effect the Decider
allowed, over the octets the channel will carry: for a text reply, the
UTF-8 octets of the text. The Effect Extract computes the same digest
over the same octets ({{extract}}), so equality of the two is equality
of content.

`effectClass` is the class of the effect the Decider allowed, a short
name in the vocabulary the channel defines, such as a reply or a
post. An Effect Extract row carries the same claim in the same
vocabulary ({{extract-schema}}), so equality of the two is equality
of class. The class is under the Decider's signature so that what the
Decider allowed cannot be read as one class by one reader and another
by the next without changing what was signed; the earlier revision
carried it on the row only and named the gap.

`timestampMs` is the decision time in POSIX milliseconds. `nonce`
identifies the record. `prevRecordHash` links records into the
Decider's chain: it is the SHA-256 of the previous record's COSE_Sign1
octets, the same input the core's `receiptHash` takes on the COSE path
(Section 7.1 of {{CEDULON}}), or null for the first record
of a chain.

## Claim rules {#record-rules}

A signer MUST refuse to sign, and a verifier MUST reject, a claim set
that breaks any of the following, naming the rule in the refusal
(`MUST-DP-2`):

- `decision` is one of `allow`, `deny`, `defer`.
- Every hash-annotated claim that is not null matches the hash grammar.
- `timestampMs` is a non-negative integer of magnitude at most 2^53 - 1,
  the `uint` the label table states; a CBOR decoder hands back any
  number, and the rule is what makes the table true.
- An allow carries a non-empty `ref` and a non-null `effectHash`. An
  allow that names no effect is a decision the reconciliation cannot
  close, and an allow that names no reference is one it cannot find.
- An allow carries a non-empty `effectClass`. An allow that names no
  class is one whose effect could be matched by a row of any class
  under the same reference and content, which is the substitution
  {{security}} names.
- A refusal MAY carry an `effectClass`: it names the class of what
  was refused, and it is carried, not measured. A refusal binds to
  the absence of a row of any class.
- A refusal carries `effectHash` null. A refusal binds to the absence
  of an effect, never to a content hash, so a hash on a refusal would
  be a claim the audit cannot measure and a second reading of whether
  the effect occurred. A refusal MAY carry a `ref`: it names what was
  refused, and an effect appearing under that reference is the worst
  finding this profile has ({{codes}}).

The verifier MUST apply these rules itself, on the claim map it
decoded from the signed payload, and MUST NOT rely on the signer
having applied them (`MUST-DP-3`). The Decider is the party under
audit. A Decider that signed a well-formed COSE_Sign1 over a claim map
that skips a rule has produced an object whose signature verifies, and
a verifier that checked only the signature and the equality of the
decoded map with the presented claims would attest it. The companion
implementation did exactly that until it was measured: an allow with
no reference, signed below the signer's own rules under the pinned
decider key, verified true, was attested, was counted as unmatched,
and the audit still said the books balanced. The rules now run at both
ends.

## Presentation and confusion {#record-presentation}

A Decision Record is presented as Section 6.3 of {{CEDULON}}
states for the core's COSE objects: the signed octets, the decoded
claim set, and the Decider's public key as a SubjectPublicKeyInfo PEM
beside them. The carried key is not an identity source. Under a pinned
decider key a record that verifies under the pin while carrying
another key is reported as `carried-key-mismatch`, a warning, and
stays attested; with no pin held the signature check that runs against
the carried key says the record is internally consistent and nothing
about who signed it.

A Decision Record is not a Decision Token. The core's Decision Token
(Section 8 of {{CEDULON}}) is the portable encoding of a
PDP allow, carried by the party that will spend; a Decision Record is
the Decider's own log of what it decided, kept for audit, and it
exists for refusals as well. The two carry different content types and
different claim maps. A verifier MUST reject a Decision Record whose
content type is not `application/cedulon-decision-record+cbor`, and
MUST reject a token presented as a record or a record presented as a
token, on the content type, before the signature is checked and
before any claim is read (`MUST-DP-4`).

## The Decider's chain and checkpoints {#record-chain}

Decision Records chain on `prevRecordHash` the way Spend Receipts chain
on `prevReceiptHash`, and the Decider signs epoch checkpoints over
them with the checkpoint claim set of Section 11.1 of
{{CEDULON}} unchanged: `receiptCount` is the number of
records in the window, `chainHeadHash` is the SHA-256 of the last
record's COSE_Sign1 octets, and `totals` is a map from the three
decision kinds to decimal counts, `{"allow": n, "deny": n, "defer":
n}`, each rendered as a text string as the core renders its currency
totals. A verifier compares the totals it computes over the attested
records in the window against the signed map, and a difference is
`checkpoint-total-mismatch` as in the core.

Two records that claim the same position in a chain cannot both link
to it: the second record's `prevRecordHash` must be the first's hash,
so a Decider that signs two decisions under one nonce, or presents one
record twice to the same reader, breaks its own chain and the walk
names the break. A verifier MUST walk the chain over every presented
record that carries the pinned decider key, not only over the records
that verified, so that a record that claims the pin and fails the
rules is named by the walk rather than dropped from the population
without a word (`MUST-DP-5`).

What the walk establishes is bounded by what one reader holds. A
Decider can sign two successors to the same predecessor and show one
branch to one reader and the other branch to another; each reader
walks a linear chain that verifies, and neither walk names a break.
The earlier revision called the chain the equivocation control of
this profile, which overstated it and contradicted the core: Section
11 of {{CEDULON}} states that the presented chain alone cannot satisfy
the equivocation requirement, because its epochs are consecutive by
construction, and that the comparison which reaches a fork is between
the presented checkpoints and the copies a witness recorded
(`MUST-T11-3`). That rule applies to this profile unchanged. The
Decider's epoch checkpoints are the Signed Statements the witness
records, the verifier compares the witness's copies against the
presented chain, and two verified checkpoints for one epoch with
different hashes are `equivocation`. Where no witness was consulted,
the chain controls equivocation within the population one reader
holds and nothing beyond it, and a report MUST NOT present the chain
as settling more than that (the core's `MUST-T11-9`, with the nouns
renamed).

# Effect Extract Profile {#extract}

A verifier checks completeness against an Effect Extract, not against
the Decider's own records alone. The extract is the channel's account
of what happened, obtained independently of the Decider, and the
profile is only as strong as that independence ({{roots}}).

## Body and row schema {#extract-schema}

The extract body is one JSON document with exactly this shape:

| Member | JSON type |
|---|---|
| deciderId | string (non-empty) |
| channelId | string (non-empty) |
| windowStartMs | number (POSIX milliseconds, a safe integer) |
| windowEndMs | number (POSIX milliseconds, a safe integer, greater than `windowStartMs`) |
| effects | array of effect rows |

Each effect row is a JSON object with exactly these members:

| Member | JSON type |
|---|---|
| ref | string (non-empty; the reference the Decision Record named) |
| effectHash | string (SHA-256 of the effect's content, 64 lowercase hex) |
| effectClass | string (non-empty; a short class name the channel defines, such as a reply or a post, in the vocabulary the Decision Record's `effectClass` uses) |
| timestampMs | number (POSIX milliseconds, a safe integer, inside the window) |
| actor | string (optional; the party the effect reached) |

These member names are normative. The body and its rows follow the
core's rail extract (Section 9 of {{CEDULON}}) in every rule
that document states for a JSON body: the text is read for a repeated
member name before it is parsed and refused as `json-duplicate-key`;
integers are safe integers; the window is half-open and MUST end after
it starts; a missing member, a wrong type, an empty identifier, or a
hash outside the grammar is refused by name at both ends, by the
signer before it signs and by the verifier before it checks a
signature.

The profile departs from the rail extract at two points, and a reader
who knows the core should note both (`MUST-DP-6`):

- A member this document does not name is refused, on the body and on
  a row. The core lets a rail add members of its own because a rail is
  a system the profile does not control; an Effect Extract is produced
  by a process the deployment does control ({{roots}}), and the
  companion measured what a free member can do to a population
  ({{population}}). A later revision may open this once a channel that
  needs its own members is measured.
- A row whose `timestampMs` falls outside `[windowStartMs,
  windowEndMs)` makes the whole extract malformed, refused as
  `effect-outside-window` before any signature is checked. The core
  accepts such a rail extract and names the row
  (`extract-scope-mismatch`). Here the extract is the deployment's own
  document and a window it did not keep is a document it did not
  produce correctly: a signer applying this schema never produces such
  an extract, and a verifier refuses one that is presented as a
  document, whatever else it may also name about its rows. The trade
  is stated so it can be reversed: a single row out of place fails the
  whole window closed.

`effectHash` on a row is computed by the extract's signer over the
same octets a Decider hashes for its `effectHash` claim: the content
as the channel carried it. A deployment MUST state those octets once
for both sides; the companion's example channel hashes the UTF-8
octets of the message text.

## Authentication and scope {#extract-auth}

The extract is signed the way a rail extract is signed: Ed25519
{{RFC8032}} over the UTF-8 octets of the {{RFC8785}} encoding of the
body, with the signature as base64 and the signer's public key as a
SubjectPublicKeyInfo PEM beside the body, neither inside the signed
octets. It is a JSON document with a detached signature, not a COSE
object, and like the rail extract it has no media type. The earlier
revision gave as the reason that the core registers names only for
objects whose content type is checked inside a protected header; that
test decides what a name must be bound to, not whether a
representation needs one, and it is withdrawn as the reason. The
reason is {{population}}: which population a presented document
belongs to is the verifier's call, made by the profile it applies and
by the decider, channel, and window it declares (`MUST-DP-1`,
`MUST-DP-7`), and never the document's. That declaration is the typed
outer context a media type would otherwise supply. A name on the
extract would be a self-description the verifier is told not to
select on, and this document does not register one that its own rule
forbids relying on. The day an extract is itself wrapped as a Signed
Statement and needs a content type in a protected header, an
`application/cedulon-effect-extract+json` registration is the name to
make, without changing the verifier's rule; the extract is not
recorded with a witness today. Section 9.3 of {{CEDULON}}
applies unchanged: a
signature proves internal consistency and not origin; the verifier
MUST hold the extract signer's key out of band and MUST compare keys
as SubjectPublicKeyInfo DER; with no key held the guarantee is
conditional and `unauthenticated-extract` is reported; with a key
held, an extract that does not verify under it is
`extract-key-mismatch` and its rows are not reconciled
(`settlement-comparison-skipped`, the core's name for the same
condition).

The extract is scoped to one Decider, one channel, and one window,
and Section 9.4 of {{CEDULON}} applies with the nouns
renamed: a verifier that knows which Decider, channel, and window it
audits MUST check the extract against them and MUST fail closed on a
mismatch (`extract-scope-mismatch`); one that has not stated the
window MUST report `unstated-audit-window`, one that has not stated
the Decider or the channel MUST report `unstated-audit-scope`, and in
either case the guarantee is conditional. The strongest line this
profile can print, a balanced audit under an unconditional guarantee,
is true of one Decider, on one channel, over one window, and a report
that carries it MUST also carry those three (`MUST-DP-7`).

# Reconciliation {#reconciliation}

The verification algorithm of Section 11.4 of {{CEDULON}}
runs unchanged over this population: establish the subject, verify
the extract, check scope, resolve records against the decider root,
walk the chain, index both sides by `ref`, match, decode and walk the
checkpoints, consult the witness if one is supplied, and decide. This
section states only what the algorithm reads differently.

## What binds {#binding}

A Decision Record expects a row when its decision is `allow`, and
expects none when it is a refusal. For a `ref` that appears once on
each side:

- an allow and a row bind when the row's `effectHash` equals the
  record's `effectHash` and the row's `effectClass` equals the
  record's `effectClass`; a difference in the hash is
  `effect-mismatch` (the content that occurred is not the content
  that was allowed), and a difference in the class with the hash
  equal is `effect-class-mismatch` (the content that was allowed
  occurred as something else). The hash is compared first; a row
  that differs in both is reported for its content;
- an allow with no row is `decision-without-effect`;
- a row with no record is `effect-without-decision`;
- a row whose `ref` a refusal names is `effect-against-refusal`.

The last is the finding this profile exists for. A spend audit has no
row that should not be there in the same sense: an aborted receipt
that still carries its reference and a settlement under that
reference is reported by the core as a settlement without a receipt,
and it never told the two cases apart. Here a refusal that was
followed by the effect it refused is a different fact from an effect
nobody decided on, and it has its own name.

A `ref` that appears more than once on a side is `duplicate-ref` as in
the core, and the repeating reference is then reconciled by count
rather than by amount: there is nothing to sum. More rows than
records under one reference is `effect-without-decision`; more
records than rows is `decision-without-effect`.

There is no amount, no currency, no manifest, no terms, and no
counterparty axis on this profile. The core's `counterparty-unbound`
scope record is not emitted: `effectHash` binds the content of the
effect itself, which is more than a payee name ever bound on spend,
and `actor` on a row is carried for the reader, not measured. The
core's boundary rule applies unchanged: an unmatched item inside the
declared clock-skew allowance of a window edge is `boundary-deferred`,
and a closing-edge allow whose `ref` the following extract names is
carried, not a finding.

## Conservation {#conservation}

With `|R|` the in-scope Decision Records and `|E|` the effect rows, the
identities the core report publishes hold with the words changed:

~~~
|R|      = refusals + allows
refusals = deny + defer
allows   = matched + deferred + carried
           + unmatched + repeated + unreconciled
|E|      = matched + deferred
           + unmatched + repeated + unreconciled
matched on |R| equals matched on |E|
~~~

A report under this profile MUST publish these counts and MUST name
the population they were computed over (`MUST-DP-8`), for the reason
the core gives: a report whose counts do not close is a report that
lost a record somewhere, and a reader is entitled to see that without
re-running the audit. The report publishes refusals as one count, the
core's `aborted`; the split of that count into deny and defer is the
checkpoint's `totals` ({{record-chain}}), not a counter of the
report.

## Finding codes {#codes}

The identifiers below are for diagnostic output and are not an
interoperability surface, as Section 11.5 of {{CEDULON}}
states for the core's codes. Five are new to this profile:

| Code | Effect | Meaning |
|---|---|---|
| decision-without-effect | audit fails | An allow names a reference under which no effect occurred, or a reference had more records than rows |
| effect-without-decision | audit fails | An effect occurred under a reference no Decision Record names, or a reference had more rows than records |
| effect-against-refusal | audit fails | An effect occurred under a reference a refusal names |
| effect-mismatch | audit fails | The effect that occurred does not carry the content hash the allow named |
| effect-class-mismatch | audit fails | The effect that occurred carries the content hash the allow named and a class the allow did not |

The remaining codes a report under this profile can carry are the
core's, with the same effect on the verdict and the guarantee:
`duplicate-ref`, `boundary-deferred`, `receipt-chain-break` for a
break in the Decider's chain (signature, rule, or link),
`checkpoint-total-mismatch`, `checkpoint-head-mismatch`,
`window-coverage`, `equivocation`, `unauthenticated-extract`,
`extract-key-mismatch`, `extract-scope-mismatch`,
`extract-settlement-mismatch` (a caller-supplied row list that
disagrees with the extract), `settlement-comparison-skipped`,
`trust-key-unreadable`, `unauthenticated-issuer`,
`issuer-key-mismatch`, `carried-key-mismatch`,
`unstated-audit-window`, `unstated-audit-scope`, the witness codes,
and `malformed-policy-hash`; the other hash claims of a Decision
Record are refused at verification ({{record-rules}}) and reach the
chain walk rather than a malformed-hash code. Two code names carry a
spend noun onto this profile
(`receipt-chain-break`, `settlement-comparison-skipped`); they are
kept so that one catalogue serves both populations, and a later
revision may add decision-side aliases.
The codes the core defines for a Trade Manifest, a payee
countersignature, a beneficiary, or a counterparty are not reachable
on this profile.

The sentences a report prints beside those codes are another matter.
An operator reading a decision report SHOULD NOT have to translate
"settlement" as "effect" or "receipt" as "decision record"; an
implementation SHOULD print the sentence in the population's own
words, and the companion holds that under a test that runs every
conformance case and refuses a spend noun in any decision sentence.
Counter names in a returned structure are diagnostic and MAY keep the
core's names.

# Trust roots {#roots}

This profile has two roots, filling the core's issuer root and rail
root (Sections 10.1 and 9.3 of {{CEDULON}}):

The decider root:
: The key under which Decision Records and their checkpoints are
  attested. Everything Section 10.1 of the core states for the issuer
  root applies: a pinned key attests by signature, a carried key is
  not an identity, a record under another key is `issuer-key-mismatch`
  and covers nothing, and with no pin `unauthenticated-issuer` makes
  the guarantee conditional.

The effect-extract root:
: The key under which the Effect Extract is attested. Everything
  Section 9.3 of the core states for the rail key applies.

The core's payee, witness, decision-token, and manifest roots are not
used by this profile, except that a transparency witness MAY hold the
Decider's checkpoints exactly as it holds a Receipt Issuer's, with
the witness root and codes of the core unchanged.

What the two roots do not cover is the relation between them. The
profile's claim is only as strong as the independence of the party
that signs the Effect Extract from the party that signs the Decision
Records. Where the channel operator signs an export of its own log,
the extract root is that operator's key and the independence is the
operator's. Where the channel operator signs nothing, which is the
common case for a messaging platform, the extract is produced by a
capture process the deployment runs, and the deployment is stating,
by pinning that process's key, that the process is not the Decider
and cannot be told what to omit. A deployment MUST state which of the
two it has, and a verifier MUST treat the guarantee as conditional
where the extract root and the decider root are, or may be, the same
party (`MUST-DP-9`). The companion cannot measure that from the keys
alone; two keys can be held by one hand.

# Security Considerations {#security}

The core's threat analysis (Section 16 of {{CEDULON}})
applies where the nouns carry over: forgery and repudiation of a
signed record (T4), key leakage (T7), and suppression of checkpoints
(T11) are the same threats against a Decider that they are against a
Receipt Issuer, and the controls are the same. The threats below are
the ones this population adds or sharpens.

## D1: An effect occurs against a refusal

The agent, or something acting through its channel access, does what
the Decider refused. This is the threat the profile exists for. A
Decision Record for the refusal, with the reference it refused, and an
authenticated extract that carries an effect under that reference
make the event `effect-against-refusal`, and the audit fails. A
refusal that carried no reference cannot support this finding; the
effect is then `effect-without-decision`, which also fails the audit
but does not say it was refused. A Decider SHOULD carry the reference
on a refusal whenever the channel assigns one before the decision.

## D2: Effects without decisions

Something acts on the channel that never asked. Every such effect is
`effect-without-decision`. The control is the extract's completeness,
which is the extract root's independence ({{roots}}); a capture
process the Decider controls can leave the effect out.

## D3: Substitution of content

The Decider allows one content and the channel carries another. The
allow's `effectHash` and the row's `effectHash` are computed over the
same octets, and a difference is `effect-mismatch`. The control fails
open if the two sides hash different octets, which is why a
deployment MUST state the octets once for both ({{extract-schema}}).

## D4: The Decider signs below its own rules

A Decider produces a well-formed signature over a claim map that
breaks a rule this profile states: an allow with no reference or no
content hash, a refusal with a content hash, a hash outside the
grammar. Every such record is a record the reconciliation cannot
close or would close wrongly. The verifier applies the rules on the
decoded payload (`MUST-DP-3`) and walks the chain over every record
that claims the pin (`MUST-DP-5`), so the record is refused and named
rather than attested or dropped.

## D5: Equivocation on the record chain

The Decider signs two decisions for one request, or two successors to
one predecessor, and offers each to a different reader. Within one
reader's population the chain (`MUST-DP-5`) makes the second record
unlinkable: it names the same predecessor as the first, or none, and
the walk reports the break. Across readers the chain sees nothing:
each holds a linear chain that verifies. The control for that case is
the core's witness ({{record-chain}}): the Decider's epoch checkpoints
are recorded with a witness the verifier has pinned, a Transparency
Service {{RFC9943}} being one, and the copies the witness holds are
compared against the presented chain. A verifier that consulted no
witness has not measured cross-reader equivocation. The guarantee its
report prints is the core's, which is defined over the extract, the
pins, and the window and does not cover suppression or equivocation
beyond the presented chain when no witness was consulted (Section 11
of {{CEDULON}}, `MUST-T11-9`); measured on the companion, such a
report prints `unconditional` with no warning and no finding, and is
silent about the witness it was not given. The silence is this
revision's known gap: the claim is narrowed here, in the text, and a
report line that names an unconsulted witness is a change to the
reconciler both populations share, not made in this revision. A
deployment that needs the property records its checkpoints with a
witness and gives its readers the witness key.

## D6: The class of the effect is substituted

A row of a different class under the same reference and the same
content hash: the same text allowed as a reply and carried as a
post. The earlier revision named this as a gap, because the record
carried no claim for the class and a row of any class matched. The
record now carries `effectClass` under the Decider's signature
({{record-labels}}), an allow without one is refused
({{record-rules}}), and a row whose class differs from the allow's
with the content hash equal is `effect-class-mismatch` ({{binding}}).
What remains open is the vocabulary: the class names are the
channel's, this document does not fix them, and a deployment SHOULD
state them beside its statement of what it hashes so that two
readers compare the same words.

## D7: Silent defaults in capture

The process that turns a channel's log into Decision Records or
Effect Extract rows fills a missing value with a default, and the
default hashes to something. An allow with no stated content that is
hashed as the empty string produces a record that will match an empty
effect and mismatch every real one, with no finding that says the
content was never stated. Such a process MUST refuse the line by name
rather than fill it (`MUST-DP-10`). The companion's example adapter
did fill it until it was measured, and refuses it now.

## D8: The capture process is the Decider

The party that produces the Effect Extract is, or answers to, the
party that signed the Decision Records. Every finding in D1 and D2
can then be made to disappear by omission, and no signature check
detects it. This is the independence statement of {{roots}}
(`MUST-DP-9`), and it is a deployment fact the profile can name but
not prove. A verifier that holds both roots and cannot state their
independence has a conditional result, and MUST say so.

# Privacy Considerations {#privacy}

A Decision Record carries no request content and no effect content:
hashes of both, an opaque subject identifier, and a reason code. The
Effect Extract carries a reference, a class, a content hash, a time,
and optionally the identifier of the party the effect reached. The
core's Privacy Considerations (Section 15 of {{CEDULON}})
apply to what a transparency witness is given.

Two points are specific to this population. A content hash over a
short text is a fingerprint of that text: a reader who can guess the
message can confirm the guess. This revision hashes the plain content
octets, as the companion does, so that the two sides need no shared
secret to agree; a keyed or salted construction that would defeat the
guess is a claim-set change and is not defined here. A deployment
whose effects are short and guessable SHOULD treat the extract and
the records as confidential to the audit. The subject and actor
identifiers are opaque to the profile but need not be opaque to a
reader; a deployment SHOULD pseudonymize them before either object
leaves its control.

# IANA Considerations {#iana}

This document requests the registration of one media type in the
"Media Types" registry {{RFC6838}}, in the standards tree, carrying
the `+cbor` structured syntax suffix that {{RFC8949}} registers, on
the terms Section 17 of {{CEDULON}} states for that document's six:
it names the one COSE_Sign1 object this document defines and is
checked inside that object's protected header, which is why the name
cannot stay unregistered while that check stands. The Effect Extract
is a JSON document with a detached signature and has no media type;
{{extract-auth}} states why, and names the registration that would
become necessary if that changed. Registration in the standards tree requires IETF
approval; until then, an implementation outside a closed deployment
should treat the name as a placeholder that a registration may
change. The provisional registration procedure of {{RFC6838}} Section
5.2.1 is available to an Internet-Draft, and a provisional entry, if
one is made, is superseded by the registration this section requests.

The claim labels this document assigns, `-70501` through `-70513`
({{record-labels}}), lie in the Private Use range of the "CBOR Web
Token (CWT) Claims" registry {{RFC8392}}, integer values less than
-65536, and this document requests no assignment for them.

No other IANA action is requested.

## application/cedulon-decision-record+cbor {#iana-record}

Type name:
: application

Subtype name:
: cedulon-decision-record+cbor

Required parameters:
: N/A

Optional parameters:
: N/A

Encoding considerations:
: binary. A COSE_Sign1 structure {{RFC9052}} in deterministic CBOR
  {{RFC8949}}, untagged, as profiled in {{record}} and in Section 6 of
  {{CEDULON}}.

Security considerations:
: See {{security}} of this document. The object is signed by the party
  under audit; its evidentiary weight depends on the verifier holding
  the decider key out of band ({{roots}}) and on the verifier applying
  the claim rules of {{record-rules}} itself, never on a key the
  object carries or on the signer's word that the rules were applied.

Interoperability considerations:
: The claim set is a CBOR map with the labels and types stated in
  {{record-labels}}, encoded per {{RFC8949}} Section 4.2.1. A decoder
  refuses a duplicate key, an input beyond its stated bounds, and a
  non-empty unprotected header by name rather than accepting it, as
  Section 6 of {{CEDULON}} requires of every Cedulon object.
  A Decision Record and a Decision Token are distinct objects with
  distinct content types and are never accepted for one another.

Published specification:
: This document, {{record}}.

Applications that use this media type:
: Policy decision points and other deciders that log the decisions
  they take about an agent's actions, and auditors that reconcile
  those logs against the channels the actions occurred on.

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

# Implementation Status {#impl-status}

This section is to be removed before publishing as an RFC.

RFC 7942 {{RFC7942}} note.

Implementation:
: The profile is carried by the core document's companion
  implementation at <https://github.com/dogrucanemek-alt/cedulon>, on
  the same reconciler that implements the core, selected by a profile
  object rather than by a second code path. As of the commit this
  revision was written against, the tree carries the Decision Record
  and Effect Extract objects, the profile, twenty conformance cases
  covering the rules and departures this document states, and four
  offline fixtures for one example channel, a direct-message reply
  log. The two cases added with this revision were red before the
  claim was added: a row of a different class under a matching hash
  matched, and an allow signed without a class verified. The spend behaviour of the same reconciler is held byte for
  byte by a golden file of fifteen cases generated from the source
  before the profile seam was added.

Maturity:
: Prepared, not published. The code is on the companion's default
  branch and in no released package. Before merge the branch was read
  twice: by the author's own gate, re-running it from a second
  worktree, and by an outside model reading the whole diff and barred
  from changing it. The two readings found four defects in the first
  cut of this profile, each recorded in the companion's review log: a
  verifier that did not apply the signer's claim rules (D4), a
  spend-side crash on the wrong document ({{population}}), a spend
  warning leaking onto decision reports, and a document that counted
  its own cases wrong. All four were closed with a test that was red
  before the fix. A third pass moved the report vocabulary onto the
  profile.

: Not measured: a live channel log. The example adapter maps a proposed
  line format for a direct-message bridge; the bridge's actual field
  names were not read when this revision was written, and the adapter
  is written so that only its two line-mapping functions should move
  when they are. No independent implementation of this profile is
  known to the author; the one outside reading ran the companion's own
  suite, which is the same code agreeing with itself on a second
  machine. The -00 text was read by the author of {{AEB}} and
  {{OUTCOME}} against the tree the day it was posted; the four items
  that reading raised are the changes of this revision
  ({{changes}}). A cross-profile fixture, the same refusal and effect
  read by this profile and by {{OUTCOME}}, has been agreed and not
  yet built.

--- back

# Changes from -00 {#changes}
{:numbered="false"}

This section is to be removed before publishing as an RFC.

- `effectClass` is a claim on the Decision Record (`-70513`), required
  on an allow; a row of a different class under a matching hash is
  `effect-class-mismatch`. D6 is closed rather than named. Claim-set
  change; a twelve-label record is refused.
- The Decider's chain is no longer called the equivocation control of
  the profile. It names a break within one reader's population; a
  fork shown to two readers is the core's witness comparison,
  applied unchanged, and a report over an unwitnessed chain claims
  no more ({{record-chain}}, D5).
- The reason the Effect Extract has no media type is restated: the
  population is the verifier's declaration, not the document's
  ({{extract-auth}}). The protected-header test is withdrawn as the
  reason.
- The boundary to {{ABAK}}, {{AEB}}, and {{OUTCOME}} is stated in the
  introduction.

# Acknowledgments
{:numbered="false"}

This profile is the first concrete instance of the generalization the
core document reserves. The refusal that was followed by the effect
it refused, as a finding with its own name, came out of watching a
messaging assistant's decision log beside the channel's sent log and
finding that the spend vocabulary had no word for it.

Iman Schrock read -00 the day it was posted and raised the four
points this revision answers: the fork two readers cannot see, the
class that was not under the signature, the media-type reason that
did not hold, and the three documents that should be cited. The
sentence on what an effect against a refusal does and does not
establish is Ali Toygar Abak's, in his words.
