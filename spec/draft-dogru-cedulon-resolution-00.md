---
title: "Cedulon Resolutions: Closing a Deferred Decision with an Operator's Approval"
abbrev: Cedulon Resolutions
docname: draft-dogru-cedulon-resolution-00
date: 2026-09-22
category: info
ipr: trust200902
area: sec
workgroup:
keyword:
  - Cedulon
  - decision record
  - approval
  - deferral
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
  RFC8949:
  RFC9052:
informative:
  RFC9942:
  RFC9943:
  CEDULON-CORE:
    title: "Spend Receipts and Payment Rail Reconciliation for AI Agents"
    author:
      - ins: E. C. Dogru
        name: Emek Can Dogru
    date: 2026
    target: https://datatracker.ietf.org/doc/draft-dogru-cedulon-core/
  CEDULON-DP:
    title: "Cedulon Decision Profile: Reconciling an Agent's Decisions Against What Happened"
    author:
      - ins: E. C. Dogru
        name: Emek Can Dogru
    date: 2026
    target: https://datatracker.ietf.org/doc/draft-dogru-cedulon-decision-profile/
---

--- abstract

The Cedulon Decision Profile records one decision about an agent's
action as allow, deny or defer, and reconciles an allow against the
effect that followed it. It stops at the deferral. This document
specifies what closes one: a Resolution Record, signed by the party
that decided, naming the deferral it resolves, the operator who
approved it and the channel the approval arrived through. It states
that a deferral is closed at most once, that an approval carries a
validity window, that a re-request under a resolved reference is
answered from the resolution rather than executed again, and what a
verifier reports when a deferral is never closed. No new signature
format, media type or transport is defined.

--- middle

# Introduction

An agent asks to act. A policy answers allow, deny or defer. The
Decision Profile {{CEDULON-DP}} specifies the first two answers in
full: an allow is matched against exactly one effect, a deny expects
none. The third answer is a decision to decide later, and the profile
says nothing about later.

Later is where a person appears. A deferral is closed by an operator
who says yes or no, through some door, at some time, about one
request. If that closure is not written down beside the deferral, the
record of the run reads as though the agent acted on its own
authority; and if it is written down without saying which deferral it
closed, two open deferrals and one approval cannot be told apart.

This document specifies the record that closes a deferral, and the
four questions a verifier must be able to answer from the ledger
alone:

- Which deferral does this approval close?
- Who approved it, and through which door did the approval arrive?
- Was it still valid when the agent acted on it?
- Did the agent act once, or more than once, on one approval?

Nothing here weakens the reconciliation rules of {{CEDULON-DP}}. A
resolution produces a decision of the same shape, carried by the same
signature format, and the effect that follows it is reconciled by the
same rules.

## What this document does not define {#not-defined}

- How an operator authenticates. The channel is recorded; the
  authentication method behind it is a deployment matter.
- Who may approve what. Authority is a policy statement; this document
  records the identity the policy accepted and does not define roles.
- Which requests are deferred. That is the policy's decision.
- Any new media type, signature algorithm, or transport.

# Conventions and Definitions

{::boilerplate bcp14-tagged}

Deferred Decision:
: A Decision Record of {{CEDULON-DP}} whose decision is `defer`. It
  expects no effect and leaves the request unanswered.

Resolution Record:
: A Decision Record that names a Deferred Decision and closes it. Its
  decision is `allow` or `deny`.

Approver:
: The identity the Decider accepted as having authority over the
  deferred request. A person, or a service acting under a person's
  credential.

Approval Channel:
: The door the approval arrived through, as the Decider observed it,
  for example an operator command on the host or an authenticated
  request to the body's approval endpoint.

Resolution Window:
: The interval, declared by policy, during which a resolution may be
  acted on. Outside it the resolution is spent.

Re-request:
: A second request carrying the reference of a deferred request, sent
  after the deferral was resolved.

# The Resolution Record {#record}

A Resolution Record is a Decision Record as {{CEDULON-DP}} defines
one: a COSE_Sign1 {{RFC9052}} object over a CBOR {{RFC8949}} claim set,
signed by the Decider. It carries the claims that document defines,
with `decision` set to `allow` or `deny`, and two further ones.

| Label | Claim | Type |
|---|---|---|
| -70514 | resolves | tstr (the deferred record's reference) |
| -70515 | approver | map: `id` tstr, `channel` tstr |

The labels are provisional and move with the profile's own range; they
are not an interoperability surface until the family's labels are
registered together.

`resolves` names the deferral by the reference the deferred request
carried. `approver.id` is the identity the Decider accepted.
`approver.channel` is what the Decider observed, not what the
approving party claimed about itself.

No claim binds the resolution to the deferred record's bytes, and none
is needed. A Resolution Record carries the `requestHash` of the
deferral unchanged, so the two records name the same request by
content; {{MUST-RS-1}} makes the Decider re-check that hash before it
signs. The record chain of {{CEDULON-DP}} orders the pair.

A deployment MAY carry `resolves` and `approver` in a signed inputs
document whose hash the record names through `inputsHash` rather than
as claims of their own. The binding is the same strength: the hash is
inside the signed claim set either way. An implementation that does
this is noted in {{implementation-status}}.

## Rules {#rules}

A Resolution Record MUST name the deferral it closes through
`resolves`, and the record so named MUST be a Deferred Decision signed
by the same Decider. Before signing, the Decider MUST recompute the
hash of the request it is about to admit and refuse the resolution
unless it equals the `requestHash` the deferral carried, and the
Resolution Record MUST carry that same hash (`MUST-RS-1`). An operator
approves arguments, not a reference; a deployment that binds only the
reference approves whatever later arrives under it.

A deferral MUST be closed at most once. A second Resolution Record
naming the same deferral is a finding, and the first one stands
(`MUST-RS-2`). Which of the two is first is decided by the record
chain of {{CEDULON-DP}}, not by wall-clock time.

The approver identity and the channel MUST be signed into the
Resolution Record by the Decider at the moment it is written
(`MUST-RS-3`). A channel written afterwards, or asserted by the
approving party rather than observed by the Decider, is not evidence
of the door the approval came through.

A resolution MUST carry a Resolution Window, expressed as the policy
that was applied and the instant the resolution was signed
(`MUST-RS-4`). A request carrying a spent resolution is a new decision
and MUST NOT be answered from it. A Decider SHOULD record the moment a
deferral is found spent as a refusal of its own, naming what it
refused, rather than letting the deferral fall silent.

A Re-request under a resolved reference MUST be answered from the
resolution and MUST NOT produce a second execution of the deferred
request (`MUST-RS-5`). A deployment that cannot tell a first execution
from a second under the same reference MUST answer the Re-request as
an unknown outcome rather than act.

The effect rules of {{CEDULON-DP}} apply unchanged to the allow a
resolution carries: exactly one effect, its content hash named by the
record (`MUST-RS-6`). An allow whose effect cannot be found is
reported as an unknown outcome; it MUST NOT be reported as an effect
that occurred, and it MUST NOT be silently retried (`MUST-RS-7`).

An approval MUST NOT be inferred (`MUST-RS-8`). Silence, a timeout, an
absent denial and an operator's presence are not approvals; only a
Resolution Record is.

A verifier reporting over a window MUST state, for that window, how
many deferrals were opened, how many were resolved, how many were
spent unused, and how many remain open (`MUST-RS-9`). A report that
counts only the closed ones describes a different population than the
one the agent ran in.

# Verification {#verification}

Given a set of records over a declared window, and the trust root of
{{CEDULON-CORE}} for the Decider's key:

1. Verify each record's signature and claim set as {{CEDULON-DP}}
   requires. A record that fails there is not read further.
2. Collect the Deferred Decisions.
3. For each Resolution Record, resolve `resolves` to a Deferred
   Decision in the set, and check that the two records carry the same
   `requestHash`. A resolution whose deferral is absent from the
   window is reported, not dropped.
4. Check that no deferral is named by two resolutions.
5. For a resolution whose decision is `allow`, apply the effect
   reconciliation of {{CEDULON-DP}}: exactly one effect, matched by
   content hash.
6. For each Re-request in the window, check that it was answered from
   the resolution named by its reference, and that the window carries
   one execution for that reference.
7. Report the counts of {{MUST-RS-9}} and the findings below.

The result is not a bare pass. Each deferral in the window is
resolved, spent, open, or reported with a code.

# Finding codes {#codes}

The identifiers are for diagnostic output and are not an
interoperability surface, as {{CEDULON-CORE}} states for the core's
codes.

| Code | Effect | Meaning |
|---|---|---|
| `resolution-missing` | open | A deferral in the window has no resolution. |
| `resolution-duplicate` | finding | Two resolutions name one deferral. |
| `resolution-unattributable` | finding | A resolution names no approver, or a channel the Decider did not observe. |
| `resolution-orphan` | finding | A resolution names a deferral that is not in the window. |
| `resolution-request-changed` | finding | A resolution and its deferral name different requests. |
| `resolution-spent` | finding | A request was answered from a resolution outside its window. |
| `resolution-reexecuted` | finding | Two executions carry one resolved reference. |
| `resolution-outcome-unknown` | finding | A resolved allow has no effect and no evidence that it ran. |

# Security Considerations

An approval is a credential with a blast radius of one request. The
rules above keep that radius: one deferral, one resolution, one
execution, a stated window.

The Decider signs what it observed. A deployment where the approving
party writes its own channel into the record turns the channel into a
claim about itself; {{MUST-RS-3}} exists to prevent that, and a
verifier that cannot tell which party wrote the channel cannot rely on
it.

An operator under pressure is outside the reach of any format. What
the format can do is make the closure attributable and countable
afterwards, which is what {{MUST-RS-9}} is for: an unusual rate of
approvals is visible without reading any payload.

Clock skew between the Decider and the approving party is not a
binding: {{MUST-RS-1}} binds by content and reference, and the window
of {{MUST-RS-4}} is measured against the Decider's own clock. A
deployment that binds an approval to an action by comparing two
clocks has a different guarantee, and a weaker one.

A body that cannot append a record MUST refuse the request rather than
act on it. The invariant this document assumes from the core is that
no effect occurs without a record, not that every request produces
one.

# Privacy Considerations

`approver.id` identifies a person in most deployments. It is written
into a record that may be registered on a Transparency Service
{{RFC9943}} and read by parties who have no relationship with that
person. A deployment SHOULD use an identifier that is meaningful to
the operator of the system and opaque outside it, and the mapping is
not part of this document.

# IANA Considerations

This document defines no new media type, signature algorithm or
registry. A Resolution Record is a Decision Record and uses the media
type {{CEDULON-DP}} registers.

# Implementation Status {#implementation-status}

This section is to be removed before publishing as an RFC.

RFC 7942 note.

One implementation is named here. Same author as this document; not an
independent implementation.

Implementation:
: Verax, an MCP body that consumes the published `@cedulon/*`
  libraries. A deferred call is answered `deferred`; an operator
  approves it from the host command line or through the body's
  approval endpoint; the approver identity and the channel the body
  observed are written into a signed inputs document whose hash the
  Resolution Record names, which is the variant {{record}} permits.

Coverage:
: `MUST-RS-1` is implemented as the request-hash check rather than a
  record-bytes binding: an approval is refused when the pending
  arguments no longer hash to the value the deferral carried, and the
  resolution carries that hash. `MUST-RS-2` is implemented: a second
  approval of one deferral is refused as already resolved, and the
  ledger is consulted as well as the pending snapshot. `MUST-RS-3` is
  implemented through the inputs document. `MUST-RS-4` is implemented
  as a policy-configured lifetime, and an expired deferral is recorded
  as a signed refusal naming what it refused. `MUST-RS-5` is
  implemented through an admission lock, an in-flight registry and a
  per-reference namespace. `MUST-RS-6` and `MUST-RS-7` are implemented:
  an approved call that crashes between the record and the effect is
  answered as an unknown outcome rather than run a second time, which
  was measured by restarting the body mid-run. `MUST-RS-8` holds on
  the deferred path: nothing admits the request on the strength of
  silence or of an operator's presence. A retry is decided against the
  policy in force at that moment rather than the one that held when
  the call was first deferred, so a policy that no longer defers the
  request yields a fresh decision, recorded with the policy hash it
  applied; that is a new decision and not a resolution.
: `MUST-RS-9` is **not** implemented. The counts exist per deferral;
  there is no report that states them over a declared window.

Maturity:
: Research and pilot. Real payments have been authorised through this
  path, one of which was afterwards reconciled against a card
  statement. Witnesses are self or same-org, there is no third-party
  witness and no outside audit, and a deployment with two live
  customers has not been exercised.

--- back

# Acknowledgments
{:numbered="false"}

The deferral, the approval channel and the reference-reuse rule were
built before they were written down; the record of that work is the
reason this document could be short.
