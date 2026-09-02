# Technical annex — Cedulon, 2 September 2026

This annex accompanies the design-partner page and carries everything that
moves with the code: what is published, what the suite reports, what the
implementation refuses to do, and where it runs ahead of the posted
specification. The page it accompanies carries scope, acceptance, workshare and
ownership, and does not move when a release does. When a release moves, this
file is reissued with a new date and the page is left alone.

This issue replaces the annex of 1 September. The release did not move; the
posted specification did. `-07` was posted on 2 September, and the two
departures the previous issue registered under section 4 closed with it, so an
annex that still named them would describe a gap that no longer exists. What
changed is confined to sections 1, 2 and 4. Sections 3, 5 and 6 are carried
forward and were re-read today against the sources they name.

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
than our word for it, is what says where the bytes came from. Re-read on
2 September from the registry record of `@cedulon/audit`: `latest` is still
`0.9.0`, `gitHead` is still `9228b6e`, the attestation is still attached, and
no newer version has been published. Nothing under `packages/` has changed in
the repository since `9228b6e` either, so the published bytes and the head of
`master` agree on what the code does.

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

Measured from installs on 1 September, against the same `0.9.0` bytes that are
still what the registry serves:

- A clean install of `@cedulon/mcp-server@0.9.0` answers `initialize` reporting
  `0.9.0`, read from the raw JSON-RPC reply.
- A clean pack of `@cedulon/audit@0.9.0` in an empty folder carries the
  `extractRejected` gate and the `settlement-comparison-skipped` warning.
- The `.mcpb` bundle was built and unpacked: manifest `0.9.0`, the server inside
  installing `@cedulon/mcp-server@^0.9.0`, and all eight `@cedulon` packages
  inside reading `0.9.0` with no older copy beside them.

The MCP Registry listing is a separate channel. Dated observation: read on
2 September, `io.github.dogrucanemek-alt/cedulon` serves `0.9.0` as its latest
entry, pointing at `@cedulon/mcp-server@0.9.0`, and that entry reached the
listing on 1 September at 22:01 UTC. The previous issue of this annex recorded
`0.7.0`, read earlier on 1 September; the listing moved after that reading,
which is why this entry states an observation with its time rather than a
standing fact. The mechanism is unchanged: the release workflow does not touch
the listing, which moves when someone runs `mcp-publisher`, so the next npm
release puts the two channels out of step again until that is run. The suite
now asks the registry what it serves and compares the answer with what
`docs/STATUS.md` claims, and skips rather than fails when the registry host does
not answer.

## 2. What the suite reports

At `9228b6e`, three hosted runners neither party keeps — Linux, macOS and
Windows — each asserted every case: **442 tests, 442 passed, 0 failed, 0
skipped**. The figures are from the run logs, not from a local run.

A fourth Linux job ran **3 tests, 3 passed, 0 failed, 0 skipped**. It exercises
the non-root path and is a permissions check, not a coverage claim; it is named
here so a green badge is not read as four full runs.

At `8f30dc9`, the head of `master` on 2 September, the same three runners each
report **453 tests, 453 passed, 0 failed, 0 skipped**, and the non-root job
again 3 of 3, read from those run logs. The eleven tests added since `9228b6e`
are guards: on the documents in the tree, on the media-type names the packages
carry against the names the draft registers, on the shape of the `-07` text,
and on the registry listing. None of them touches `packages/`, so the figures
at `9228b6e` remain the ones for the published bytes and the figures at
`8f30dc9` are the ones for the tree a reader clones today.

What is skipped and where: four POSIX-mode cases (42, 70, 76, 83) skip on a
Windows host that cannot create a symbolic link, and state the reason rather
than passing silently, so a green run there names what it did not cover. None
of the hosted runs skipped anything. A pass on one platform is one platform's
sentence.

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

The posted Internet-Draft is `-07`, posted on 2 September 2026. The archive
text is 293,167 bytes with SHA-256
`f9f56d1f63326925fd095977ef0f31b8e2b85d79646cc8b3023cb3307feeac6a`, and
`spec/draft-dogru-cedulon-07.txt` in the tree is the same bytes. The source and
the reference implementation at that revision are deposited at
`10.5281/zenodo.22254039` as version `draft-07 (commit 099dae0)`; the concept
record `10.5281/zenodo.22099791` resolves to the newest deposit.

The two departures the 1 September issue registered here closed with that
posting. `-07` states `MUST-T10-18` and `MUST-T10-19` — an unstated account or
rail leaves the guarantee conditional, and the report names the account, rail
and window it was computed over — and `MUST-T10-20` — a refused extract
supplies no charge, and the skip is reported. That is what the companion
already did against `-06`. `conformance/counted-splits.ts` is empty on `master`
since `23e80f8`, and its comment carries the history of every split before
these two. The vectors `V-T10-18-unstated-audit-scope` and
`V-T10-20-refused-extract-charges` stay in the suite as ordinary conformance
rows, each with a note saying what it was a split against and when it closed.
The guard that reads the register fires in both directions — a split in the
runner that is not registered, and a registered entry that no longer
corresponds to a split — and is proved with synthetic entries rather than a
live one, so the proof does not depend on a divergence existing.

Nothing in the published `0.9.0` packages runs ahead of `-07` at this reading.
One place where the text is narrower than a reader might assume, named here so
it is not read as a claim: `MUST-T10-19` covers the printed report and the
finding object. The MCP result and the ledger export return the finding list
and the guarantee without a scope field, and `-07`'s change note says so.
Widening the requirement to every returned structure is scheduled with the next
package version and the next revision of the draft; it is a stated intention,
not a shipped behaviour.

## 5. Open defects, named here rather than left to be found

From `docs/EXTERNAL_REVIEW.md`, Round 5. Two findings are recorded there and
both are open; re-read on 2 September, both are still marked open. Their
shared cause is recorded with them: the report publishes findings and an
aggregate, not class counts, so a reader cannot rebuild the population from
what it prints.

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
