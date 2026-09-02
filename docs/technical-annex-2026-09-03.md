# Technical annex — Cedulon, 3 September 2026

This annex accompanies the design-partner page and carries everything that
moves with the code: what is published, what the suite reports, what the
implementation refuses to do, and where it runs ahead of the posted
specification. The page it accompanies carries scope, acceptance, workshare and
ownership, and does not move when a release does. When a release moves, this
file is reissued with a new date and the page is left alone.

This issue replaces the annex of 2 September. Both things that annex was
pinned to moved on the same day: `0.10.0` went to npm, and `-08` was posted.
Sections 1, 2 and 4 are rewritten against the new state; sections 3, 5 and 6
are carried forward and were re-read today against the sources they name.

Pinned to `@cedulon/*@0.10.0`, published from commit `7b1c362`.

Every figure below was read from the published package or from the run that
produced it, not from a working tree. Where something could not be read today,
the entry says so and says when it was last read.

## 1. What is published

Eight packages answer `0.10.0` as `latest` on npm: `audit`, `checkpoint`,
`core`, `cose`, `manifest`, `mcp-server`, `receipts`, `x402-adapter`.

Each carries a SLSA v1 provenance attestation. Read from the attestation rather
than inferred: its build definition names `refs/tags/v0.10.0` and
`.github/workflows/release.yml`, the builder is GitHub-hosted Actions under
trusted publishing, and every package reports `gitHead` `7b1c362`. That record,
rather than our word for it, is what says where the bytes came from.

How the release went, because "published" on its own would leave out the part
worth knowing. The tagged `v0.10.0` run checked that the tag names the version
every package carries, built, ran the pre-release suite and the guards,
published all eight in dependency order, read each one back from the registry
until it answered, and then **ended red on its own post-release check**, for
the same reason the `v0.9.0` run did: `docs/STATUS.md` still named `0.9.0` as
the published version, because this repository does not write "published"
before the registry says so. Commit `0403fce` moved those sentences after
re-measuring each of them from an installed package, and nothing was
republished. The packages described below are the ones the tagged run
published.

Measured from installs on 2 September, against the published bytes:

- A clean install of `@cedulon/mcp-server@0.10.0` in an empty folder answers
  `initialize` reporting `0.10.0`, lists five tools, and carries `extract` on
  `cedulon_audit`, read from the raw JSON-RPC reply.
- A clean pack of `@cedulon/x402-adapter@0.10.0` carries the
  `malformed-extract-window` refusal this version adds. A clean pack of
  `@cedulon/audit@0.10.0` still carries the `extractRejected` gate and the
  `settlement-comparison-skipped` warning that `0.9.0` added.
- The `.mcpb` bundle was built from the released package and unpacked:
  manifest `0.10.0`, the server inside installing `@cedulon/mcp-server@^0.10.0`,
  and all eight `@cedulon` packages inside reading `0.10.0` with no older copy
  beside them.

Nothing under `packages/audit`, `checkpoint`, `core`, `cose`, `manifest` or
`receipts` has changed in source since `9228b6e`, the commit `0.9.0` was
published from; the code that moved in `0.10.0` is in `mcp-server` and
`x402-adapter`, and section 4 says what it is.

The MCP Registry listing is a separate channel. Dated observation: read on
2 September at 21:02 UTC, `io.github.dogrucanemek-alt/cedulon` serves `0.10.0`
as its latest entry, pointing at `@cedulon/mcp-server@0.10.0`, pushed by hand
with `mcp-publisher` after the npm release. The two channels are in step at
that reading. The mechanism is unchanged: the release workflow does not touch
the listing, so the next npm release puts the two out of step again until
`mcp-publisher` is run. The registry's search endpoint went on answering
`0.9.0` for a short while after the publish command returned; its versions
endpoint is what settled it, and the suite's registry guard, which asks the
registry and compares it with what `docs/STATUS.md` claims, read `0.10.0`.

## 2. What the suite reports

At `7b1c362`, the commit `0.10.0` was published from, three hosted runners
neither party keeps — Linux, macOS and Windows — each asserted every case:
**457 tests, 457 passed, 0 failed, 0 skipped**. A fourth Linux job ran
**3 tests, 3 passed, 0 failed, 0 skipped**; it exercises the non-root path and
is a permissions check, not a coverage claim. The figures are from the run
logs, not from a local run.

At `39c8997`, the head of `master` this annex describes, which adds the posted
`-08` render to the tree and touches nothing under `packages/`, the same four
jobs report the same figures, again from the run logs.

Of the fifteen tests added since `0.9.0`'s `442`, thirteen are guards on
documents, media-type names, the shape of the draft text, the registry
listing and the deposit line; two are behaviour: the MCP audit over a
presented extract with the refusals at its gate, and the window rule at both
ends of the extract signer.

What is skipped and where: four POSIX-mode cases (42, 70, 76, 83) skip on a
Windows host that cannot create a symbolic link, and state the reason rather
than passing silently, so a green run there names what it did not cover. None
of the hosted runs skipped anything. A pass on one platform is one platform's
sentence.

## 3. What the implementation refuses to do

Each of these was reproduced against the published `0.9.0` packages on
1 September, and the source behind each is unchanged in `0.10.0` (section 1
names the packages that did not move). The last one is new and was
reproduced against the tree at `39c8997`, where the published `0.10.0` code
lives unchanged.

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

**An extract whose window does not end after it starts is refused, by name,
before any signature is checked.** A correctly signed extract with its window
inverted and no rows came back from the `0.9.0` companion as a balanced audit
under an unconditional guarantee, which a review pass over the first cut of
`0.10.0` found. `railExtractShapeRefusal` now answers `malformed-extract-window`,
`signRailExtract` refuses to sign such a body, `verifyRailExtract` refuses it
before the signature, and the MCP gate refuses it as `extract: ...` before the
audit is asked anything, along with an empty account, rail or signature and a
key that is not a PEM.

## 4. Where the code runs ahead of the posted specification

The posted Internet-Draft is `-08`, posted on 2 September 2026 (Datatracker
submission 168495). The archive text is 297,193 bytes with SHA-256
`50923d1f87570d96b91436b1b37e0a182f3fee5163eeb2630b75904553998284`, and
`spec/draft-dogru-cedulon-08.txt` in the tree is the same bytes. The source and the reference implementation at that revision are
deposited at `10.5281/zenodo.22261546` as version `draft-08 (commit 39c8997)`;
the concept record `10.5281/zenodo.22099791` resolves to the newest deposit.

`-08` did two things, both of which the companion at `0.10.0` carries. It
widened `MUST-T10-19` from the two surfaces `-07` named to every structure an
implementation returns for an audit: the MCP `cedulon_audit` result now takes a
presented extract and carries `scope`, the account, rail and window it was
computed over, exactly when it ran over one; the ledger export is unchanged,
because its audit is over the in-process ledger and declares no population.
And it stated the shape rule the half-open window already implied: an extract
whose window does not end after it starts declares no population and is
refused as malformed by name, which is the last refusal in section 3.

`conformance/counted-splits.ts` is empty, and the guard that reads it fires in
both directions. Nothing in the published `0.10.0` packages runs ahead of `-08`
at this reading, and nothing in `-08` is unmet by them.

## 5. Open defects, named here rather than left to be found

From `docs/EXTERNAL_REVIEW.md`, Round 5. Two findings are recorded there and
both are open; re-read on 3 September, both are still marked open. Their
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
