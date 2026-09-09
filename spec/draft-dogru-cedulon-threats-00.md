---
title: "Cedulon Threat Narratives"
abbrev: Cedulon Threats
docname: draft-dogru-cedulon-threats-00
date: 2026-09-09
category: info
submissiontype: independent
ipr: trust200902
area: sec
workgroup:
keyword:
  - Cedulon
  - threat
  - audit
stand_alone: true
smart_quotes: false
pi:
  - toc
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
  RFC8174:
informative:
  CEDULON-CORE:
    title: "Cedulon Core: Spend Receipts and Rail Reconciliation for Agent Commerce"
    author:
      - ins: E. C. Dogru
        name: Emek Can Dogru
    date: 2026
    target: https://github.com/dogrucanemek-alt/cedulon/blob/master/spec/draft-dogru-cedulon-core-00.md
  CEDULON-CHECKPOINT:
    title: "Cedulon Checkpoints: Epoch Witnesses and Transparency"
    author:
      - ins: E. C. Dogru
        name: Emek Can Dogru
    date: 2026
    target: https://github.com/dogrucanemek-alt/cedulon/blob/master/spec/draft-dogru-cedulon-checkpoint-00.md
---

--- abstract

This document records the threat narratives, attack paths and measured
runs that sit behind the Cedulon core requirements. It does not define
those requirements. T11 (checkpoint suppression) is recorded in the
checkpoint companion, not here.

--- middle

# Introduction

{::boilerplate bcp14-tagged}

The core document {{CEDULON-CORE}} is authoritative for protocol
requirements. This document is informational. A requirement identifier
that appears here is a citation, not a definition. The texts below
are the narratives that used to sit in the repository threat model
and, for T12, in the core Security Considerations. T11 lives in
{{CEDULON-CHECKPOINT}}, not here.

# T1: Prompt injection leads to unauthorized spend

An attacker plants instructions in tool output, a web page, or a retrieved
document. The agent then calls a spend tool outside the principal's intent.

Policy is not derived from model text. The PDP evaluates structured
fields only. A spend tool call that lacks a valid, unexpired,
signature-verified manifest MAY proceed only as `noManifest` and MUST
still pass limit, velocity, and scope checks. Defined in {{CEDULON-CORE}}:
MUST-T1-1, MUST-T1-2.

# T2: Runaway agent (loop spend)

A stuck tool loop or recursive planner issues many payments.

Velocity and cumulative-limit counters live in the PDP. Fail-closed:
if the engine is missing or throws, the result is deny. Defined in
{{CEDULON-CORE}}: MUST-T2-1, MUST-T2-2, MUST-T2-3, MUST-T2-4.

# T3: Replay of payment authority

An observer replays a signed payment payload, mandate, or Cedulon
decision token.

Every gated spend carries a unique nonce. The nonce store rejects a
second use. Manifests expire. Decision tokens are single-use and
bound to request bytes. Defined in {{CEDULON-CORE}}: MUST-T3-1,
MUST-T3-2, MUST-T3-3, MUST-T3-4.

# T4: Receipt forgery or repudiation

A party alters a receipt, invents a receipt, or denies a real spend.

Receipts are signed. Verification covers the signed bytes. A hash
chain links receipts. Tamper of one byte fails verify. Defined in
{{CEDULON-CORE}}: MUST-T4-1 through MUST-T4-21 as the core table lists.

# T5: Policy bypass via direct rail access

The agent or an attacker calls the rail (x402 facilitator, wallet,
card API) without the PDP.

The only payment function is the adapter that calls the PDP first.
Deployments must make ungated rail credentials unavailable to the
model. Defined in {{CEDULON-CORE}}: MUST-T5-1, MUST-T5-2.

# T6: TOCTOU between policy check and payment

An allow is computed; the request is then swapped (payee, amount)
before the rail sees it; or a second payment uses the same allow.

The adapter pays only the exact fields hashed into the single-use
decision. Defined in {{CEDULON-CORE}}: MUST-T6-1, MUST-T6-2,
MUST-T6-4, MUST-T6-5, MUST-T6-6.

# T7: Signing-key leakage

Keys leak from disk, logs, or a prompt. Forged manifests or receipts
follow.

This tree ships mock keys only. The requirements still constrain any
later real key. MUST-T7-2, MUST-T7-5 and MUST-T7-6 are defined in
{{CEDULON-CORE}}, including the measured-protection and symlink
refusals; this document does not redefine them.

# T8: Counterparty price gouging or defective delivery

The payee ships a different artifact, or the price exceeds the signed
offer.

The Trade Manifest binds price and an acceptance-criteria hash before
payment. After delivery, a Dispute Evidence Bundle packages manifest,
receipt, and delivery hash. Cedulon does not adjudicate and MUST NOT
take custody. MUST-T8-custody is defined in {{CEDULON-CORE}}.

# T9: PII leakage into the transparency log

A SCITT statement or public receipt carries names, addresses, or full
amounts that should stay private.

Log-facing encodings offer redaction. Anchors store hashes when the
operator chooses privacy mode. Defined in {{CEDULON-CORE}}:
MUST-T9-1, MUST-T9-2, MUST-T9-5.

# T10: Secret spend via rail bypass

An operator, leaked credential, or a second binary can still settle
on the rail and omit the Receipt Issuer. Validity checks on the
receipts that do exist stay green.

Completeness, not validity: reconcile the rail extract to Spend
Receipt payment refs. A settlement without a receipt is a finding
identified by the settlement ref. The audit fails closed. Defined in
{{CEDULON-CORE}}: MUST-T10-1 through MUST-T10-20 as the core table lists.

# T12: Settlement without a recorded receipt

The threats above are about a counterparty, a rail or an attacker.
This one is about the issuer's own implementation, and it produces
exactly the condition the rest of this document exists to make
detectable.

An issuer that settles a payment, appends the receipt in memory and
then persists its state has three steps where it could have two
outcomes. If the write fails, the rail holds a settlement and the
receipt exists nowhere durable. The next start reads a state that
does not contain it, and the audit reports
`settlement-without-receipt` against an honest issuer that did
everything its own policy asked. The evidence is missing because the
issuer lost it, not because anyone hid it, and nothing in the report
can tell those apart.

MUST-T12-1, MUST-T12-2, MUST-T12-3 and MUST-T12-4 are defined in
{{CEDULON-CORE}}. The measured runs sit on the in-process
`RailLedger` and the session tests.

Ordering:
: Settle-then-record is the natural order to write and the wrong one
  to ship. The record is what makes the settlement accountable, so the
  record is what has to be secured first (`MUST-T12-1`), and a
  settlement that cannot be recorded has to be undone everywhere the
  issuer still controls, including the nonce and the allowance it
  never used (`MUST-T12-2`). Once value has entered a rail the issuer
  does not control, a local snapshot cannot retract it. Persistence
  failing after that point leaves the outcome indeterminate
  (`MUST-T12-4`).

Recovery:
: A durable-state conflict is not necessarily fatal, but it MUST NOT
  be silent. The reason reported has to separate the cases an operator
  would act on differently (`MUST-T12-3`): a write that conflicted
  with another writer, a write that failed, and a state another
  process is holding.

Observability:
: A violation of this threat is not visible in the evidence a verifier
  receives. The audit sees a settlement with no receipt and reports
  `settlement-without-receipt`, which is the same finding an adversary
  would produce. That is why the requirements fall on the issuer
  rather than on the verifier.


# Security Considerations {#security}

This document is informational. It restates attack paths already
named in the core and checkpoint companions. It defines no new
protocol requirements and introduces no new wire formats.

# IANA Considerations {#iana}

This document has no IANA actions.
