---
title: "Cedulon Streaming Reconciliation: Continuous Completeness for Agent Spend"
abbrev: Cedulon Streaming
docname: draft-dogru-cedulon-streaming-00
date: 2026-08-26
category: info
submissiontype: independent
ipr: trust200902
area: sec
workgroup:
keyword:
  - Cedulon
  - reconciliation
  - streaming
  - completeness
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
    email: e.dogru@conarium.dev
normative:
  RFC2119:
  RFC8174:
informative:
  CEDULON:
    title: "Cedulon: An Audit Layer for Agent-to-Agent Commerce (work in progress)"
    author:
      - ins: E. C. Dogru
        name: Emek Can Dogru
    date: 2026-08
    target: https://github.com/dogrucanemek-alt/cedulon
---

--- abstract

Cedulon defines a batch reconciliation audit: given a window of spend
receipts, epoch checkpoints, and an authenticated rail extract, a
verifier proves completeness after the fact. Agent fleets
that spend continuously need the same property as a live signal: a
conscience that runs beside the payments rather than behind them. This
document proposes a streaming profile: short half-open micro-epochs, an
incremental checkpoint cadence, a watermark that separates provisional
from final findings, and rules for late-arriving settlements. The goal
is that "the books are balanced" becomes a continuously maintained,
externally checkable state instead of a periodic report. This is an
extension proposal to the Cedulon core document; its normative language
is provisional and the companion implementation does not implement it
yet.

--- middle

# Introduction

Batch audits answer "was last week clean?". Operators of continuously
spending agents ask a different question: "is this fleet clean right
now, and if not, which settlement broke it?" The gap between the two
is not a new primitive; it is cadence. The core Cedulon objects
(receipts, checkpoints, extracts) already chain and total; this
profile shortens their windows, defines when a window may be judged,
and names the states a finding passes through as evidence arrives.

This document is an extension seed for the Cedulon core specification
{{CEDULON}}. It is not an IETF working-group item, its keyword usage
is provisional, and the reference implementation does not yet
implement it. It is published to define the shape of the mechanism
early and to invite review.

# Terminology

{::boilerplate bcp14-tagged}

Micro-Epoch:
: A half-open window `[startMs, endMs)` of fixed short duration
  (seconds to minutes) carrying an incremental checkpoint, contiguous
  with its neighbors and covering the receipt chain with no gaps.

Watermark:
: A timestamp `finalizedUpToMs` before which the verifier has received
  the authenticated rail extract covering every closed micro-epoch.
  Windows entirely below the watermark are final; windows above it are
  provisional.

Provisional Finding:
: A reconciliation finding raised in a window not yet below the
  watermark; it MAY be resolved by evidence that arrives before
  finalization.

Final Finding:
: A finding in a finalized window. It does not change; late evidence
  cannot erase it, only annotate it.

# Streaming Model (provisional)

1. Receipts and checkpoints follow the core profile unchanged; only
   the epoch duration shrinks. Consecutive micro-epochs MUST be
   contiguous and half-open, and every chained receipt MUST fall in
   exactly one micro-epoch.
2. The rail extract is consumed as an authenticated append-only feed
   segmented by the same windows. A window is eligible for
   finalization only when its extract segment is complete and
   authenticated.
3. The streaming verifier maintains, per window: matched pairs,
   unmatched settlements, unmatched receipts, and checkpoint totals.
   Findings in windows above the watermark are Provisional; when the
   watermark passes a window, its findings become Final and the
   window's verdict is immutable.
4. A settlement arriving for an already-final window is itself a
   finding (late-settlement), because a complete authenticated extract
   for that window had already been presented. One of the two extract
   presentations is wrong, and the conflict is the evidence.
5. The current watermark, the head checkpoint hash, and the count of
   open provisional findings form the fleet's live conscience tuple;
   publishing it (for example to a transparency log at a fixed cadence)
   lets outside parties observe that the books were continuously
   balanced without seeing individual trades.

# Security Considerations

Streaming changes when judgments are made, not what is judged; the
core trust analysis applies. The new surface is the watermark: an
operator who can stall the extract feed keeps windows provisional and
delays Final findings. Deployments SHOULD bound the distance between
wall clock and watermark and SHOULD treat a stalled watermark as an
availability finding in itself; silence, here too, is evidence. A
late-settlement conflict reveals that two inconsistent extracts were
presented; resolving which party misbehaved requires the extract
signatures, which is why unauthenticated feeds cannot finalize
anything.

# IANA Considerations

This document has no IANA actions.

--- back

# Acknowledgments
{:numbered="false"}

This seed accompanies the Cedulon core document and its companion
implementation at <https://github.com/dogrucanemek-alt/cedulon>.
