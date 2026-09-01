# Technical annex — Cedulon, 1 September 2026

This annex accompanies the design-partner page and carries everything that
moves with the code: what is published, what the suite reports, what the
implementation refuses to do, and where it runs ahead of the posted
specification. The page it accompanies carries scope, acceptance, workshare and
ownership, and does not move when a release does. When a release moves, this
file is reissued with a new date and the page is left alone.

Pinned to `@cedulon/*@0.9.0`, published from commit `9228b6e`.

Every figure below was read from the published package or from the run that
produced it, not from a working tree. Where something could not be read today,
the entry says so and says when it was last read.

## 1. What is published

Eight packages answer `0.9.0` as `latest` on npm: `audit`, `checkpoint`,
`core`, `cose`, `manifest`, `mcp-server`, `receipts`, `x402-adapter`.

Each carries a SLSA v1 provenance attestation. Read from the attestation rather
than inferred: its build definition names `refs/tags/v0.9.0` and
`.github/workflows/release.yml`, the publisher is GitHub Actions under trusted
publishing, and every package reports `gitHead` `9228b6e`. That record, rather
than our word for it, is what says where the bytes came from.

How the release itself went, because "published" on its own would leave out
the part worth knowing. The tagged `v0.9.0` run published all eight packages and
then **ended red on its own post-release verification**. Two things failed
there, neither of them the publish: `docs/STATUS.md` still named `0.8.0` as the
published version, which is exactly what that check exists to catch, and one
`npm pack` of a version published seconds earlier returned `ETARGET` before the
registry had propagated it. Commit `5139517` repaired the stale sentences by
re-measuring each of them from the installed package, and its four hosted CI
jobs are green. The post-release suite passes at that commit. The packages
described below are the ones the tagged run published; nothing was republished
to fix the documents.

Measured from installs rather than from this repository:

- A clean install of `@cedulon/mcp-server@0.9.0` answers `initialize` reporting
  `0.9.0`, read from the raw JSON-RPC reply.
- A clean pack of `@cedulon/audit@0.9.0` in an empty folder carries the
  `extractRejected` gate and the `settlement-comparison-skipped` warning.
- The `.mcpb` bundle was built and unpacked: manifest `0.9.0`, the server inside
  installing `@cedulon/mcp-server@^0.9.0`, and all eight `@cedulon` packages
  inside reading `0.9.0` with no older copy beside them.

The MCP Registry listing is a separate channel and is behind. Dated
observation: it served `0.7.0` when read on 1 September. A later attempt the
same day did not get an answer from the registry host, so that is the last
reading rather than a current one, and this entry states the observation rather
than asserting the listing has not moved since. What is known about the
mechanism, separately from the observation: the release workflow does not touch
the listing, which moves when someone runs `mcp-publisher`. On the last reading
a reader installing from the listing got two releases behind npm.

## 2. What the suite reports

At `9228b6e`, three hosted runners neither party keeps — Linux, macOS and
Windows — each asserted every case: **442 tests, 442 passed, 0 failed, 0
skipped**. The figures are from the run logs, not from a local run.

A fourth Linux job ran **3 tests, 3 passed, 0 failed, 0 skipped**. It exercises
the non-root path and is a permissions check, not a coverage claim; it is named
here so a green badge is not read as four full runs.

What is skipped and where: four POSIX-mode cases (42, 70, 76, 83) skip on a
Windows host that cannot create a symbolic link, and state the reason rather
than passing silently, so a green run there names what it did not cover. None
of the three hosted runs skipped anything. A pass on one platform is one
platform's sentence.

## 3. What the implementation refuses to do

Each of these was reproduced against the published `0.9.0` packages rather than
described from the source.

**A rail extract refused by the pinned trust key supplies no settlement
finding, and the report says the reconciliation was skipped.** Pin a rail key,
present an extract signed by a different key, and the report carries
`extract-key-mismatch` and `settlement-comparison-skipped`. It carries no
`settlement-mismatch`, no `settlement-without-receipt` and no
`receipt-without-settlement` out of that document's rows. The refusal is the
finding; the refused body is not the evidence the audit convicts with
(`MUST-T10-20`). Two controls hold the claim up: move the same unmatched row
away from the boundary and it is a finding, and hand the same receipt a next
window that does not name its reference and it hardens into one — so the
silence is a refusal to charge, not a row that was never counted.

**An object that fails attribution has its content left uncompared.** Pin an
issuer key, present a checkpoint signed by another key with deliberately wrong
totals, and the report carries `issuer-key-mismatch` and says nothing about
totals: the comparison never runs.

**A refused Trade Manifest supplies no charge.** Where a stated publisher pin
refuses the manifest, neither `manifest-terms-mismatch` nor `delivery-mismatch`
is read out of its body (`MUST-T8-9`).

**A settlement with no receipt behind it is named, not folded away.** It is
reported by its reference and amount rather than as a generic finding.

**A completeness guarantee that cannot be established says so.** A verifier that
pins a rail key but names no account and no rail gets `unstated-audit-scope` and
a conditional guarantee, and a report computed over an extract names the
account, rail and window that extract declared.

## 4. Where the code runs ahead of the posted specification

The posted Internet-Draft is `-06`. The working revision is `-07` and is not
posted. Two departures are registered in `conformance/counted-splits.ts` rather
than left for a reader to find, each with a vector that fails if the behaviour
and the register disagree:

- `V-T10-18-unstated-audit-scope`, for `MUST-T10-18` and `MUST-T10-19`: the
  companion warns on an unstated account or rail and names the path it covered;
  posted `-06` states neither.
- `V-T10-20-refused-extract-charges`, for `MUST-T10-20`: the companion reads no
  charge out of a refused extract and says the comparison was skipped; posted
  `-06` reports the refusal and is silent on what the refused body may still be
  used for.

Both close when `-07` is posted.

## 5. Open defects, named here rather than left to be found

From `docs/EXTERNAL_REVIEW.md`, Round 5. Two findings are recorded there and
both are open. Their shared cause is recorded with them: the report publishes
findings and an aggregate, not class counts, so a reader cannot rebuild the
population from what it prints.

**1. One exclusion is published and the other is not.** A settlement left
unmatched inside the opening clock-skew boundary is reported as
`boundary-deferred` with the row and the rule named, so the receiver-record side
stays reconstructible. A receipt left unmatched inside the closing boundary
whose reference appears in the next window's extract is dropped with no finding
and no warning, and the summary reads `balanced`. The behaviour is right in both
— the row belongs to the neighbouring window and charging it would be a false
positive — but the exclusion is published on one side and hidden on the other,
and the hidden side is the one the completeness claim is about.

**2. A receipt that positively did not settle receives no class.** It is correct
for a refused spend to have no row on the extract; it is also absent from the
report, so nothing separates a window holding one refused spend from a window
holding none.

Both are the one gap seen from two sides, and the change that would close them
is `AuditReport` carrying counts it already computes. That is the intended
direction rather than a tested result, and both are recorded as open rather
than described as done.

## 6. What this annex is not

It is not a statement of production readiness, and it does not restate the
engagement. The authenticated external-rail path is built during the engagement
rather than deployed from a shelf: the suite exercises a controlled in-process
ledger rather than a rail that authenticates what it reports, and that gap is
what the engagement is for. Scope, acceptance, workshare and ownership are on
the page this annex accompanies, and are unchanged by anything here.
