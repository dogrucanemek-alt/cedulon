# draft-abak-agent-control-delivery-evidence-00 accounting rules, applied here

This probe takes the Section 6 vocabulary of
draft-abak-agent-control-delivery-evidence-00 — per-instruction dispositions,
the selection requirement, the two population-conservation identities, and the
conditions on an aggregate result — and applies it to the settlement reconciler
this repository ships. It was written because that draft's author asked for a
mapping from Cedulon's finding codes onto his vocabulary, and it was reported
to the SCITT list on 1 September 2026.

It is a worked example from an adjacent domain. It is **not** an implementation
of that draft and is not offered as one.

## Run

Copy `population-probe.mjs` into an empty directory **outside this repository**:

    npm init -y
    npm i @cedulon/audit@0.8.0 @cedulon/receipts@0.8.0 @cedulon/checkpoint@0.8.0 @cedulon/x402-adapter@0.8.0
    node population-probe.mjs

Running it from inside this workspace measures the wrong thing. The four
imports would resolve to the packages in this tree rather than to the published
0.8.0, and every sentence the probe prints about what a released package
carries would then be a sentence about the working copy. That is the same
mistake the file exists to catch, so the run instruction is part of the claim
rather than a convenience.

It exits 0 on a clean run and 1 when the set of finding codes the installed
package exports is not the set the mapping covers. That catches a code added or
removed. It does not catch a code whose name stayed while its meaning moved;
only re-reading the emitting site catches that.

## What it reports

**Part 1 — the mapping.** Every finding code `@cedulon/audit` exports, against
the draft's classes. Of the 49 exported at 0.8.0: 16 speak to an instruction, 1
to a record, 1 names an exclusion, 3 are issuer-side aggregate evidence that
belongs to neither population, 2 cannot be given a side because the same code
is emitted for a receipt row and for a settlement row, and 26 carry no
disposition on their own. The probe computes those counts from the package it
imported; they are not copied from here, and this paragraph will go stale
before the probe does.

**Part 2 — the selection rule.** Cedulon's native output is many-to-one against
instructions: one malformed receipt emits seven codes, one of them twice,
across the record, matching, chain, checkpoint and scope layers. A disposition
is one verdict, so a precedence is needed before any mapping can exist. The
precedence is Cedulon's, not the draft's; Section 6.2 permits selection among
duplicate or superseding *records*, which is a different object.

**Parts 3 and 4 — the conservation check.** One row per Minimum Conformance
Case, then the three rows that leave a window's accounting, each against a
control that shows the row would otherwise have been counted.

## What it found here

Two open defects, recorded in `docs/EXTERNAL_REVIEW.md` under Round 5.

A settlement left unmatched inside the opening clock-skew boundary is reported
as `boundary-deferred`, and the warning names the row and the rule, so a reader
can rebuild the receiver-record side. A receipt left unmatched inside the
closing boundary whose ref appears in `nextExtract` is dropped with no finding
and no warning, and the summary is `audit: balanced`. The behaviour is right in
both — the row belongs to the neighbouring window and charging it here would be
a false positive — but the exclusion is published on one side and hidden on the
other, and the hidden side is the one the completeness claim is about.

An `aborted` receipt is the same gap without an exclusion: correct to have no
row on the extract, and absent from the report as well, so nothing separates a
window holding one refused spend from a window holding none.

Both are one requirement. The report publishes findings and an aggregate, not
the class counts Section 6.4 asks for.

## Cases beyond the probe (3 September 2026)

`cases-0.12.0.mjs` runs ten further audits used in the review of the
draft-abak `-01` candidate: balanced runs with and without a pinned rail key,
window and scope; the closing-boundary receipt a following window names; an
aborted receipt; the many-to-one malformed record; a refused extract; no
extract at all; and an extract for a different account. It prints the report
fields the review quoted (`ok`, `guarantee`, `summary`, `counts`, `scope`,
findings, warnings). Run it the same way as the probe, from an empty directory
against the published packages; substitute `0.8.0` for `0.12.0` to reproduce
the older column. The setup helpers are copied from the probe rather than
imported, so the probe file and its pinned digest do not change.
