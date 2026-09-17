---
title: "Cedulon Checkpoints: Epoch Witnesses and Transparency"
abbrev: Cedulon Checkpoints
docname: draft-dogru-cedulon-checkpoint-00
date: 2026-09-17
category: info
ipr: trust200902
area: sec
workgroup:
keyword:
  - Cedulon
  - checkpoint
  - witness
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
  RFC8174:
  RFC6838:
  RFC8949:
  RFC9052:
  RFC9942:
  RFC9943:
informative:
  CEDULON-CORE:
    title: "Spend Receipts and Payment Rail Reconciliation for AI Agents"
    author:
      - ins: E. C. Dogru
        name: Emek Can Dogru
    date: 2026
    target: https://github.com/dogrucanemek-alt/cedulon/blob/master/spec/draft-dogru-cedulon-core-00.md
---

--- abstract

This document specifies epoch checkpoints, the transparency witness
and the anchoring of checkpoints as SCITT Signed Statements for the
Cedulon audit layer. The spend receipt, rail-extract reconciliation
and trust-root rules live in the companion Cedulon Core document.
A verifier that pins a witness key can detect a withheld or rolled-back
checkpoint; without that pin the suppression guarantee is conditional.

--- middle

# Introduction

The core document {{CEDULON-CORE}} defines the spend receipt and the
reconciliation of those receipts against an authenticated rail extract.
That result says nothing about whether the issuer published a complete
checkpoint chain for the same window. This document states that chain,
the witness that makes suppression visible, and the two media types
those objects carry.

# Terminology

{::boilerplate bcp14-tagged}

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

## Checkpoint claims {#redaction}

An epoch checkpoint MUST be COSE_Sign1-signed with the header profile
in {{CEDULON-CORE}} (COSE Profile) and MUST bind all of the following
(`MUST-T11-1`):

epoch, `startMs`, `endMs`, `receiptCount`, `chainHeadHash`,
`totals`, and `prevCheckpointHash`.

The checkpoint window is half-open `[startMs, endMs)`
(`MUST-T11-7`). `receiptCount` MUST equal the number of receipts
(settled and aborted) whose `timestampMs` falls in that window.
`chainHeadHash` MUST equal `receiptHash` of the last receipt in that
window - the last link, in issuer order (the `prevReceiptHash` chain,
as step 6 of {{CEDULON-CORE}} defines it), of the chain
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

A verifier that
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
two named tiers.

**Tier 1 - the witness receipt.** The witness returns a co-signature
over the statement hash of what it recorded: a COSE_Sign1 whose
payload binds the statement hash, the entry index, and the witness's
tree head. Verifying it establishes exactly one sentence - "the
witness signed for this hash" - and nothing more; in particular it
does not establish membership in an append-only log. The receipt is
a signature over a statement rather than a proof of log membership.
The {{RFC9942}} citation applies in tier 2, where its mechanics are
actually performed.

On the wire the witness receipt is a COSE_Sign1 under {{CEDULON-CORE}} (COSE Profile),
signed by the witness key, with content type
`application/cedulon-inclusion+cbor` ({{iana-inclusion}}). Its payload
is a deterministic CBOR map carrying three entries and is not a CWT
claim set: label `1` is the statement hash, label `2` the entry index,
label `3` the tree head. The two hashes are text strings holding the
lowercase hexadecimal of a 32-octet SHA-256, the statement hash taken
over the octets of the statement the witness recorded; the entry index
is an unsigned integer. The hash strings are compared as issued and are
not passed through the hash-claim grammar the claim sets use; the
revision that moves them to byte strings will close that difference.
Entries under other labels are not defined, and a verifier of this
revision does not refuse them. The map carries no statement body: a
receipt that travels with the body carries it beside the COSE object,
not inside it ({{witness-root}}, `MUST-T11-17`). A receipt whose
content type is another value, or whose payload lacks one of the three
entries or carries one of another type, does not verify: the content
type is the check {{CEDULON-CORE}} (COSE Profile) makes on every object of this
profile, and the payload map is the one this paragraph states.

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
finding they produce (`MUST-T11-2`). They are numbered
for reference, not to require an evaluation order: no step
short-circuits another, and an implementation may evaluate them in any
order that produces the same set of findings.

The data dependencies are named, because "any order" read naively
would break them. Step 5 decides which witness receipts, and which
statement bodies, survive checking; steps 4 and 6 consume what
survives. Step 1 decides which checkpoints verified, and step 4 compares
only those together with what step 5 admitted. An implementation
that ran a consumer against an unchecked producer would not produce
the same set of findings, so those orders are not among the
permitted ones.

These steps consume two products of {{CEDULON-CORE}} (Verification
algorithm): the working set that the issuer-pin step decides, and
the `ref` index that step 7 of {{CEDULON-CORE}} builds. The chain walk that
defines issuer order is step 6 of {{CEDULON-CORE}}. A fail-severity
finding these steps produce is a finding step 11 of {{CEDULON-CORE}}
treats as failing the audit (`MUST-T10-4`).

When a step names an identifier in backticks, that identifier
SHOULD be used for the condition in diagnostic output. The
normative requirement is the behaviour: report the condition,
identified by the `ref` or other handle given in the step. The
identifiers are not an interoperability surface.

1. Decode each checkpoint. Reject a failed signature, and reject a
   `kid` that does not match the key obtained for the checkpoint
   issuer, on the same terms as a receipt (`MUST-T4-8`). Require
   `receiptCount`, `chainHeadHash`, and `totals` to match the
   receipts of the working set in `[startMs, endMs)` as defined above
   (`MUST-T11-2`); a receipt step 4 of {{CEDULON-CORE}} rejected is not among them,
   or a forged receipt could satisfy a checkpoint count. The identifier `checkpoint-total-mismatch`
   SHOULD be used for a failed signature, a wrong `receiptCount`,
   or totals that disagree, and `checkpoint-head-mismatch` for a
   `chainHeadHash` that is not the last link, in issuer order
   (step 6 of {{CEDULON-CORE}}), of the chain inside `[startMs, endMs)` - "last
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
2. Every chained receipt MUST fall in exactly one checkpoint
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
3. Walk checkpoints in epoch order. `prevCheckpointHash` MUST
    equal the SHA-256 of the previous checkpoint COSE bytes, or null
    for genesis (`MUST-T11-4`). The identifier
    `checkpoint-total-mismatch` SHOULD be used for a broken chain,
    which is the fourth condition its table row names.
4. If two successfully verified checkpoints share an epoch number
    and have different hashes, the verifier MUST report
    equivocation (`MUST-T11-3`). The identifier `equivocation`
    SHOULD be used for this condition. The checkpoints compared
    here are those presented **together with** any carried by
    verified witness receipts (step 5). A presented chain
    that satisfies `MUST-T11-8` (step 2) cannot raise this finding on
    its own, because its epochs are consecutive and no two of its
    members share an epoch. A copy recorded by a witness
    is where the second one is found.
5. If witness receipts were supplied, verify them against the
    out-of-band witness key ({{witness-root}}); receipts that
    cannot be checked that way are not evidence in either direction
    and the verifier reports that it left them out (`MUST-T11-15`);
    the identifier `unauthenticated-witness` SHOULD be used for this
    condition.
    Discard any whose signature fails (`MUST-T11-10`). A surviving
    receipt whose statement body verifies against the issuer root is
    a statement that issuer published; one that does not is another
    party's, and is not this issuer equivocating (`MUST-T11-16`).
    The survivors are the recorded statement hashes used in step 6. Where a receipt also carries
    the statement body, discard that body unless its statement hash
    equals the one the receipt binds and it verifies as a
    checkpoint; the surviving bodies are what step 4 compares.
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
6. Compare the surviving witness records against the presented
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

## Finding codes

The identifiers below are for diagnostic output. They are not an
interoperability surface. The codes the core algorithm can produce
are listed in {{CEDULON-CORE}} (Finding codes). A condition that
makes the audit fail is a finding. A condition that only makes the
completeness guarantee conditional is a warning. Warnings MUST still
appear in operator-facing output (`MUST-T10-14`).

| Code | Effect | Meaning |
|---|---|---|
| checkpoint-total-mismatch | audit fails | Totals, count, signature, or checkpoint chain failed. The signature branch is reached where no issuer pin has already excluded the checkpoint: under a pin a checkpoint that does not verify is `issuer-key-mismatch` and never reaches the totals comparison |
| checkpoint-head-mismatch | audit fails | `chainHeadHash` is not the last link, in issuer order, of the chain inside the window, or the expected head could not be computed at all because the last receipt on the chain refused canonical encoding; the refusal is named and is not a signature verdict |
| equivocation | audit fails | Two distinct hashes for one epoch |
| window-coverage | audit fails | Gap, overlap, or non-adjacent / non-consecutive windows |
| unauthenticated-witness | conditional | No verifier-supplied witness key; inclusion receipts were left out of the comparison |
| witness-entry-unattributable | conditional | The witness holds a statement this chain does not present, carrying no body to say whose it is |
| checkpoint-withheld | audit fails | A verified witness receipt binds a checkpoint the presented chain does not contain |
| checkpoint-not-anchored | guarantee conditional | A witness was supplied and holds no verified receipt for this checkpoint |
| checkpoint-totals-redacted | guarantee conditional | The checkpoint was signed with `totals` null, so the totals comparison could not be made |
| witness-inclusion-invalid | audit fails | The tier-2 candidate bytes and inclusion proof do not reproduce a witness-signed tree head, or a candidate was supplied without a proof (`MUST-T11-18`) |
| witness-inclusion-not-exercised | conditional | Witness receipts were supplied and no tier-2 pair was, so log membership was not proven (`MUST-T11-19`). The code says nothing about whether any of those receipts verified: it is reported on presentation, and an unpinned or unverifiable inclusion receipt reaches it alongside `unauthenticated-witness` |

# SCITT Anchoring {#anchoring}

A Receipt Issuer or relying party MAY construct a SCITT Signed
Statement whose payload is either the Spend Receipt COSE object or a
privacy profile ({{CEDULON-CORE}} (Privacy Considerations)) and register it with a Transparency
Service {{RFC9943}}. The service returns a COSE receipt
{{RFC9942}}. Embedding that receipt yields a Transparent Statement.
Cedulon does not define a new transparency algorithm.

An epoch checkpoint MUST be registrable on the same terms
(`MUST-T11-14`), as `SHOULD-T11-5` asks. Its Signed Statement carries
the checkpoint COSE_Sign1 object as the payload and
`application/cedulon-checkpoint+cbor` as the content type, which is
among the media types {{iana}} asks to have registered and which,
until then, is a placeholder like the rest. Nothing else about
registration differs from a receipt.

## T11: Checkpoint suppression or rollback {#security}

MUST-T11-1 (the checkpoint label set) and MUST-T11-12 (totals
conditionality) are defined in the core document {{CEDULON-CORE}}.
The remaining T11 identities are defined here.

| ID | Requirement |
|---|---|
| MUST-T11-2 | Verifiers MUST reject a checkpoint whose signature fails, whose totals do not match settled receipts in the declared window, whose `receiptCount` is wrong, or whose `chainHeadHash` is not the hash of the last in-window receipt in issuer order (the `prevReceiptHash` chain). Where the signed totals are null, MUST-T11-12 governs instead: there is no total to disagree with, the comparison is reported as skipped, and the count and chain-head checks still apply. |
| MUST-T11-3 | Two verified checkpoints for the same epoch with different hashes MUST be reported as equivocation. The checkpoints compared are those presented together with those carried by verified witness receipts; a presented chain that satisfies MUST-T11-8 cannot raise it on its own, because its epochs are consecutive. |
| MUST-T11-4 | A broken checkpoint hash chain MUST fail verification. |
| SHOULD-T11-5 | Checkpoints SHOULD be registered with a Transparency Service when one is configured. |
| MAY-T11-6 | A test deployment MAY use an in-process append-only log as the witness. |
| MUST-T11-7 | Checkpoint windows MUST be half-open `[startMs, endMs)`. Every chained receipt MUST fall in exactly one window. |
| MUST-T11-8 | Presented checkpoint epochs MUST be consecutive and adjacent windows MUST meet at `endMs = next.startMs`. |
| MUST-T11-9 | Prefix-deletion and suppression claims that go beyond the presented chain are conditional on an external transparency witness. A report MUST NOT present a completeness guarantee as settling suppression when no witness was consulted. |
| MUST-T11-10 | Witness receipts are an optional, separate input. A verifier given none MUST behave as it did without this input. A receipt MUST have its signature verified before it counts for anything. Where a receipt also carries the statement body, that body MUST NOT be relied on unless its statement hash equals the one the receipt binds and it verifies as a checkpoint; a discarded body does not discard its receipt. |
| MUST-T11-11 | A verified receipt binding a checkpoint absent from the presented chain MUST be reported as a withheld checkpoint, and MUST NOT be reported as a window coverage failure. A presented checkpoint with no verified receipt, where a witness was supplied, MUST be reported and makes the guarantee conditional. |
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
: `kid` identifies the verification key. This -00 does not specify
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

# IANA Considerations {#iana}

This document requests the registration of two media types in the
"Media Types" registry {{RFC6838}}, in the standards tree.
Registration in the standards tree requires IETF approval; the
provisional registration procedure of {{RFC6838}} Section 5.2.1 is
available to an Internet-Draft in the meantime.
The names are the same names the core document {{CEDULON-CORE}}
uses for these objects.

## application/cedulon-checkpoint+cbor {#iana-checkpoint}

Type name:
: application

Subtype name:
: cedulon-checkpoint+cbor

Encoding considerations:
: binary. A COSE_Sign1 structure {{RFC9052}} in deterministic CBOR
  {{RFC8949}}, untagged, as
  profiled in {{redaction}} and {{CEDULON-CORE}} (COSE Profile); the same object is
  the payload of the Signed Statement {{anchoring}} registers.

Security considerations:
: See {{security}} of this document. A checkpoint carries the
  suppression guarantee for its window ({{witness}}). Its evidentiary
  weight depends on a pinned issuer key ({{CEDULON-CORE}} (The issuer root)) and never on
  the key it carries; where no such key is held the signature is still
  checked against the carried key, which establishes internal
  consistency only.

Interoperability considerations:
: As for application/cedulon-receipt+cbor; the labels are those of
  the checkpoint table in {{CEDULON-CORE}} (Claim labels), and `totals` signed as
  null is a redaction, not a malformed claim.

Published specification:
: This document, {{redaction}}.

Applications that use this media type:
: As for application/cedulon-receipt+cbor, and transparency witnesses
  that co-sign or register checkpoints.

Required parameters, optional parameters, fragment identifier considerations, additional information, contact, intended usage, restrictions on usage, author, change controller:
: As for application/cedulon-receipt+cbor.

## application/cedulon-inclusion+cbor {#iana-inclusion}

Type name:
: application

Subtype name:
: cedulon-inclusion+cbor

Encoding considerations:
: binary. A COSE_Sign1 structure in deterministic CBOR, untagged, as
  profiled in {{CEDULON-CORE}} (COSE Profile), whose payload is the three-entry map
  {{witness}} states: statement hash, entry index, tree head.

Security considerations:
: See {{security}} of this document. A witness receipt verified under
  the key it carries establishes that some log is internally
  consistent and nothing about which log; it carries evidentiary
  weight only under a witness key held out of band ({{witness-root}},
  `MUST-T11-15`). It attests a statement hash, not membership in an
  append-only log; membership is tier 2 of {{witness}} and needs the
  candidate statement and an inclusion proof beside the receipt.

Interoperability considerations:
: As for application/cedulon-receipt+cbor, except that the payload is
  not a CWT claim set: its three labels are local to the map and are
  stated, with their types, in {{witness}}.

Published specification:
: This document, {{witness}}.

Applications that use this media type:
: Transparency witnesses that co-sign the statements they record, and
  verifiers that hold witness receipts for a period under audit.

Required parameters, optional parameters, fragment identifier considerations, additional information, contact, intended usage, restrictions on usage, author, change controller:
: As for application/cedulon-receipt+cbor.
