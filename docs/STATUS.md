# Status

`npm run test:pre-release` is green on three hosted runners, where CI
runs the full pre-release suite as a non-root user and asserts every case:
433 of 433, none skipped, on Linux, macOS and Windows alike, at commit
448ef39 on 31 August 2026. `npx tsc --noEmit` is silent; `npm run audit`
exits 0 and the four bypass demos fail as designed. The four POSIX-mode
cases that used to skip on Windows now measure the DPAPI wrap of the
issuer key on that host, and the hosted Windows runner may create
symbolic links, so nothing skips there; on a Windows machine without that
privilege the four symbolic-link cases skip with a stated reason rather
than returning silently, so a local green run names what it did not
cover. The CI sentence above is the last hosted count; it is not restated
as a new total here. While the workspace
version is ahead of npm, `npm run test:all` also carries one deliberate red -
the gate that refuses to call a prepared version published; `npm run
test:pre-release` is the green one until the publish. `docs/RUN_AS_VERIFIER.md`
carries the exact output of each demo, and part of the suite checks that file
against what the commands actually print.

Those demos run on fixtures. `npm run demo:live` does not: it reads a real
Base Sepolia USDC window over an RPC endpoint and reconciles it against a
receipt chain. A 128-settlement window was read from the live chain and every
one of the 128 came back as `settlement-without-receipt`, at
`guarantee=conditional` — a chain read is not a signed extract from the rail
operator. That is the whole of what runs against a real rail today: reading.
Nothing here holds a wallet or signs a transaction.

`draft-dogru-cedulon` is posted on the IETF datatracker through `-08`
(2 September 2026), alongside the companion decision profile,
`draft-dogru-cedulon-decision-profile-01` (4 September 2026), and the two
`-00` direction seeds.
The repository is archived at `10.5281/zenodo.22099792`. The core packages
carry no runtime dependencies; `@cedulon/mcp-server` depends only on the
official MCP SDK.

`0.13.0` is published on npm, with a provenance attestation, and it is what a
reader now gets from an installed package: the decision profile, the second
population on the reconciler that `docs/UPGRADING.md` describes under its
heading, sections A to E. Checked from the published packages rather than
from this tree: a clean install of `@cedulon/mcp-server@0.13.0` in an empty
folder pulls nine `@cedulon` packages, `@cedulon/audit@0.13.0` among them
depending on `@cedulon/effect-extract`, and answers `initialize` reporting
`0.13.0`. All nine packages answer `0.13.0`, each with a SLSA v1
attestation, and each reporting `gitHead` `3637b62`; `@cedulon/effect-extract`
went out through its trusted publisher this time, with provenance, unlike
its first publish by hand the day before. The tagged run (5 September
2026, 22:50 to 22:57 UTC) was the first to run the nine-package loop behind
the pre-flight step, the first whose MCP Registry step ran and succeeded
(the listing answered `0.13.0`, `isLatest` true, from the workflow's own
OIDC login), and the first whose bundle job produced the release: it failed
once, ten seconds after the publish, because the registry's metadata said
`0.13.0` while the tarballs of `x402-adapter` and `audit` were not yet
served (404 for about eight minutes), and it succeeded on a rerun once they
were. The readback step asks `npm view` for the version and not for the
tarball; that gap is the next thing to close in the workflow. The
post-release job was red on the tagged run by design, because this file
still named `0.12.0`; this is the repair, and nothing was republished.
What it changes: `audit()` reads every presented document as the profile's
record and row types and never by the shape of the body; a Decision Record
signed below the signer's rules verifies false; a row of a different class
under a matching hash is `effect-class-mismatch`. Measured in this tree:
the spend golden file is unchanged byte for byte, and `MatchCounts.aborted`
counts deny and defer. Not measured: a live bridge log, an effect signer
that is not a test key, and policy-document binding (`terms()` returns
empty); unproven until a reader who did not write the branch runs the
cases against a measured log. The behaviour carried forward is unchanged:
an audit still reports `manifest-terms-mismatch` with the split 0.6.0
introduced, where with a usable issuer pin the departure is a finding that
fails the audit, and without a pin the same departure is a warning that
does not by itself fail it; and `requestHash` is still the SHA-256 of the
six-field canonical document in lowercase hex, the digest the posted `-03`
named a hash for without naming the octets.

`0.12.0` was the release before it, published on npm with a provenance
attestation. Checked from the published packages
rather than from this tree: a clean install of `@cedulon/mcp-server@0.12.0` in
an empty folder answers `initialize` reporting `0.12.0`, and the
`@cedulon/checkpoint@0.12.0` it installs exports `strictHexBytes` and no longer
mentions `verifyInclusionReceipt`. All eight packages answer `0.12.0`, each with
a SLSA v1 attestation, and each reporting `gitHead` `abd7abc`. The tagged run
published all eight, read them back, and then failed its own post-release
check because this file still named `0.11.0` as the published version; this
is the repair, and nothing was republished. That check sat in the publish job
ahead of the MCP Registry and bundle steps, so on this first tag neither ran:
the registry entry was pushed by hand and the bundle was built and attached
by hand, as recorded below, and the check now has a job of its own so it can
be red without blocking them; that arrangement is unproven until the next tag
runs it. What it adds: `verifyInclusionEnvelope` (the envelope check) and
`verifyInclusion(receipt, candidateHex, witnessKey)` (coverage of the bytes
the caller holds, MUST-T11-18), `strictHexBytes` and `validInclusionProof`,
which a clean install of 0.11.0 does not have; `verifyInclusionReceipt` is
gone. What it changes: a call that meant coverage has to present the
candidate bytes and a proof, and a candidate, `coseHex` or registered
statement that is not lowercase, even-length, non-empty hex is refused rather
than partly decoded; a proof whose index does not resolve to the root is
refused, and a malformed one is false from the verifier and
`witness-inclusion-invalid` from the audit, never an exception. The behaviour
carried forward is unchanged: an audit still
reports `manifest-terms-mismatch` with the split 0.6.0 introduced, where with a
usable issuer pin the departure is a finding that fails the audit, and
without a pin the same departure is a warning that does not by itself fail
it; and `requestHash` is still the SHA-256 of the six-field canonical
document in lowercase hex, the digest the posted `-03` named a hash for
without naming the octets.

The tree is ahead of npm in one way that matters for the next tag. The
decision profile brought a ninth public package, `@cedulon/effect-extract`,
at `0.12.0` in the workspace and never published: `npm view` answers 404
on 5 September 2026. `@cedulon/audit` on the default branch imports it at
runtime, so an audit published from this tree would not install until
effect-extract is on npm ahead of it. Two things hid that. The release
workflow's publish loops were typed by hand at eight packages, and the
post-release guard that compares every public package with npm read the
404 as "offline" and skipped, on every run, green. Both are repaired: the
loops are compared with the workspace by a test, a 404 fails the guard by
name, and the workflow now asks npm whether every package exists before it
sends anything, because a package that has never been published cannot go
out through trusted publishing (the publisher is configured on a settings
page the package has only after a first publish). The first publish of
effect-extract was therefore a step by hand, and it is done:
`@cedulon/effect-extract@0.12.0` went to npm on 4 September 2026 at
21:59 UTC from the author's login, without a provenance attestation, with
`gitHead` `9955382` (the tree that repaired the release path, not
`abd7abc`, which the other eight carry). Checked from the registry rather
than from this tree: `npm view` answers `0.12.0` with shasum
`6fc71529cafb442c47339af31412b21fd62cbcca`, a clean install in an empty
folder imports it and lists its seven exports, and `test:post-release` is
green on all nine. The ninth package's trusted publisher was then
configured on npmjs.com (GitHub Actions, `dogrucanemek-alt/cedulon`,
`release.yml`, `npm publish` allowed), read back from the package's
settings page on 5 September 2026; the pre-flight step passes, and
whether the tagged run publishes that package with provenance like the
other eight is unproven until a tag runs it.

`0.11.0` was the release before it, published on npm with a provenance
attestation. Checked from the published packages
rather than from this tree: a clean install of `@cedulon/mcp-server@0.11.0` in
an empty folder answers `initialize` reporting `0.11.0`, lists five tools, and
names `counts` in the descriptions of `cedulon_audit` and
`cedulon_export_ledger`; a clean `npm pack @cedulon/audit@0.11.0` carries the
`unreconciled` and `carried` classes and the gate that keeps a refused
extract's window from sieving the population. All eight packages answer
`0.11.0`, each with a SLSA v1 attestation whose build definition names
`refs/tags/v0.11.0` and `.github/workflows/release.yml`, and each reporting
`gitHead` `bad56de`. The tagged run published all eight and then failed its
own post-release check, because this file still named `0.10.0` as the
published version; this is the repair, and nothing was republished. What it
adds: a `counts` member on `AuditReport`, the finding object, the
`cedulon_audit` result and the ledger export, and two `counts` lines on the
printed report, which a clean install of 0.10.0 does not have. What it
changes: the report now publishes the class every receipt and row
landed in (submitted, attested, in scope, aborted, settled; matched, deferred,
carried into the next window, unmatched, repeated, unreconciled), numbers the
reconciliation already computed on its way to the findings. It refuses
nothing that used to pass; one input reads differently, a receipt object
presented twice in one array, which the issuer-chain walk used to fold into
one occurrence and now counts as two, so its findings name the duplicate. A
refused extract no longer sieves the receipts with the window it declared:
on that path every attested receipt is in the population and every settled
one is `unreconciled`. Round 5 of
`docs/EXTERNAL_REVIEW.md` found that two rows rightly leave a window's
accounting without a finding, a closing-edge receipt the next window names
and an aborted receipt, and that a reader could not tell such a window from
one that held none; both are closed by the member. No requirement in posted
`-08` asks for class counts, so no split is registered in
`conformance/counted-splits.ts`; the posted text lacks a rule the code has,
not the other way round. The behaviour carried forward is unchanged: an audit
still reports `manifest-terms-mismatch` with the split 0.6.0 introduced,
where with a usable issuer pin the departure is a finding that fails the
audit and without a pin the same departure is a warning that does not by
itself fail it; and `requestHash` is still the SHA-256 of the six-field
canonical document in lowercase hex, the digest the posted `-03` named a hash
for without naming the octets.

`0.10.0` was the release before it, published on npm with a provenance
attestation. Checked from the published packages
rather than from this tree: a clean install of `@cedulon/mcp-server@0.10.0` in
an empty folder answers `initialize` reporting `0.10.0` and lists `extract` on
`cedulon_audit`, and a clean `npm pack @cedulon/x402-adapter@0.10.0` carries
`malformed-extract-window`. All eight packages answer `0.10.0`, each with a
SLSA v1 attestation whose build definition names `refs/tags/v0.10.0` and
`.github/workflows/release.yml`, and each reporting `gitHead` `7b1c362`. The
tagged run published all eight and then failed its own post-release check,
because this file still named `0.9.0` as the published version; this is the
repair, and nothing was republished. What it adds: an `extract` input to
`cedulon_audit` on the MCP server and a `scope` member to that tool's result,
which a clean install of 0.9.0 does not have. What it changes: an audit asked over a rail
extract the caller presents runs over that document rather than the server's
own ledger, refuses rows added beside it as `extra-settlements-with-extract`,
and names the account, rail and window it was computed over, the member
`AuditReport` and the finding object have carried since 0.8.0; over the
server's own ledger the result names no scope, because none was declared.
`cedulon_export_ledger` is unchanged. Posted `-07` described the MCP result as
carrying no scope field and said the widening ships with the package that
carries it; this is that package, and `-08`, posted on 2 September 2026 after
it, widens `MUST-T10-19` to name it and states the window rule, so no split is
registered in `conformance/counted-splits.ts`. The
behaviour carried forward is unchanged: an audit still reports
`manifest-terms-mismatch` with the split 0.6.0 introduced, where with a
usable issuer pin the departure is a finding that fails the audit and
without a pin the same departure is a warning that does not by itself fail
it; and `requestHash` is still the SHA-256 of the six-field canonical
document in lowercase hex, the digest the posted `-03` named a hash for
without naming the octets.

`0.9.0` was the release before it, published on npm with a provenance
attestation. Checked from the published package
rather than from this tree: a clean `npm pack @cedulon/audit@0.9.0` in an empty
folder carries the `extractRejected` gate and the `settlement-comparison-skipped`
warning. All eight packages answer `0.9.0`, each with a SLSA v1 attestation whose
build definition names `refs/tags/v0.9.0`, and each reporting `gitHead`
`9228b6e`. What it changes: an
extract a stated rail pin refuses no longer supplies a settlement finding.
Until this version the audit reported `extract-key-mismatch` and then
reconciled that refused document's rows anyway, so a body the verifier had
rejected could still name `settlement-mismatch` against an honest receipt or
report money as unaccounted for. `MUST-T10-20` closes it on the reasoning
`MUST-T8-9` already gives for a refused Trade Manifest: a charge that no key
stands behind is one a forged document can invent. The skipped comparison is
reported rather than silent, as `settlement-comparison-skipped`, the one new
member of `FINDING_CODES`. The behaviour carried forward is unchanged: an audit
still reports `manifest-terms-mismatch` with the split 0.6.0 introduced, where
with a usable issuer pin the departure is a finding that fails the audit and
without a pin the same departure is a warning that does not by itself fail it;
and `requestHash` is still the SHA-256 of the six-field canonical document in
lowercase hex, the digest the posted `-03` named a hash for without naming the
octets. `-07`, posted on 2 September 2026, states this rule and the scope
rules 0.8.0 added, so `conformance/counted-splits.ts` carries no living
split: the two that stood against posted `-06` closed with it.

`0.8.0` was the release before it, published on npm with a provenance
attestation. Checked from the published package
rather than from this tree: a clean `npm pack @cedulon/audit@0.8.0` in an empty
folder carries `unstated-audit-scope`, the `AuditScope` type, and the repaired
unpinned-witness warning. The release step that verifies the registry answered
red on the way out: six packages reported the new version and `audit` was still
serving `0.7.0` two seconds after its own publish returned success. That was
read-after-write propagation, not a failed publish - all eight answer `0.8.0`
now - and the step it exposed asked once with no retry, so it now asks again
with a bound. What it changes: an audit
declares the settlement path it was computed over, not only the period. A
verifier that pins a rail key but names no account and no rail now gets
`unstated-audit-scope` and a conditional guarantee, on the same reasoning that
made an unstated period conditional; and a report computed over an extract
names the account, rail and window that extract declared, in the
operator-facing text and in the returned finding object both, while a report
with no extract has no declared population to name. An account that can settle on a second rail has a
settlement path no presented extract covers, and until this bump a balanced
line could not be told apart from one that covered every path. The posted `-06`
stated neither requirement: that was a living split, registered as
`V-T10-18-unstated-audit-scope` in `conformance/counted-splits.ts` until
`-07`, posted on 2 September 2026, stated both. Behaviour carried forward unchanged:
`manifest-terms-mismatch` keeps its split - with a usable issuer pin the walk
is the attested set and the departure is a finding, without a pin the same
departure is a warning that does not by itself fail the audit - and
`requestHash` is the SHA-256 of the six-field canonical document in lowercase
hex, the digest the posted `-03` named a hash for without naming.

`0.7.0` was the release before this one, and the first with a provenance
attestation: it was built and sent by the tagged `release.yml` run rather than
from anyone's laptop, so a reader can check where the bytes came from as well
as what they do. `0.8.0` carries the same attestation. What it changes: an amount is
checked as text at every boundary before anything parses it, so `"01"` is
answered `malformed-amount` rather than reinterpreted as `1` and printed back
as `"1"`, and `signManifest` holds the grammar `signReceipt` has always held.
Verification answers `false` for bytes it cannot read and never throws; the
name of a refusal (`cbor-too-large`, `cbor-too-deep`, `cbor-duplicate-key`) is
asked of the bytes through `coseDecodeRefusal`, after an interim shape that
rethrew those names left a 65KB checkpoint able to crash `audit()`. Behaviour
carried forward unchanged: `manifest-terms-mismatch` keeps its split - with a
usable issuer pin the walk is the attested set and the departure is a finding,
without a pin the same departure is a warning that does not by itself fail the
audit - and `requestHash` is the SHA-256 of the six-field canonical document in
lowercase hex, the digest the posted `-03` named a hash for without naming.

`0.6.0` was the release before it. It names
the CBOR refuse codes (`cbor-eof`, `cbor-too-deep`, `cbor-too-large`,
`cbor-unsupported`, `cbor-duplicate-key`) and the audit input bound
(`audit-too-large`) that used to surface as a `RangeError` or an
unbounded walk. It also narrows `manifest-terms-mismatch`: with a
usable issuer pin the walk is the attested set and the charge is a
finding; without a pin the same departure is a warning and does not by
itself fail the audit. It also binds `requestHash` as SHA-256 of the
six-field canonical document (lowercase hex); the posted draft names a
hash but not the digest.

Checked from the published packages rather than from this tree: a clean install
of `@cedulon/audit@0.6.0` in an empty folder reports no terms finding for a
receipt the pinned issuer key does not attest, reports the same departure as a
warning when no issuer key is pinned, and still reports a finding and `ok:
false` for a departure the pinned key does attest. A clean install of
`@cedulon/core@0.6.0` returns a 64-character lowercase hex digest from
`requestHashOf`, matching the value the conformance run records.

Nine packages are published on npm at `0.13.0`, so the server runs without a
clone: `npx -y @cedulon/mcp-server`. 0.5.0 carries `MUST-T4-17` and
`MUST-T8-9`, and it breaks: an audit that used to return a clean
unconditional result over a receipt carrying the hash of terms it departs from
now reports `manifest-terms-mismatch` and fails. Checked from the published
package rather than from this tree: a clean install of `@cedulon/audit@0.5.0`
in an empty folder reports that finding for a receipt of 99 against a manifest
of 1, with the guarantee still unconditional, because every root was supplied
and the statement being made is not in doubt. 0.3.0 was the breaking release and
`docs/UPGRADING.md` says what breaks and why; the short version is that a
verifier which kept the old behaviour would keep reporting a clean audit over a
forged receipt. 0.3.1 breaks nothing further: it repairs three defects an
independent runner found on Linux, and a fourth found while repairing them.
0.4.0 does break: the payment path refuses a presented Trade Manifest that no
supplied key attributes, where it used to settle against the key the manifest
carried. The same release adds that fifth trust root to the audit path, which
reports rather than refuses, and names the external-rail bound on T12 in the
draft. The extract-evidence exits from `indeterminate` are built and red-then-green: authenticated presence settles late, authenticated full-window absence releases the authority. The reversing-entry branch of `MUST-T12-4` still has no evidence object, so T12-4 is executed for the extract branch and open for the reversal branch.

Checked from npm rather than from this tree: a clean install of
`@cedulon/mcp-server@0.13.0` answers `initialize` reporting `0.13.0`, lists
five tools, and names `counts` on `cedulon_audit` and `cedulon_export_ledger`;
the install pulls nine `@cedulon` packages, and `@cedulon/audit@0.13.0`
declares `@cedulon/effect-extract` among its dependencies, which
`@cedulon/audit@0.12.0` did not. A clean install of
`@cedulon/checkpoint@0.13.0` exports `strictHexBytes`,
`validInclusionProof`, `verifyInclusionEnvelope` and `verifyInclusion`, and
nothing named `verifyInclusionReceipt`; a clean pack of `@cedulon/audit@0.12.0`
reads its layer-2 candidate through `strictHexBytes` and its proof through
`validInclusionProof`, and still carries the
`unreconciled` and `carried` classes 0.11.0 added and the gate that keeps a
refused extract's window from sieving the population. A clean pack of
`@cedulon/audit@0.11.0` in an empty folder carries the
`unreconciled` and `carried` classes this version adds and the gate that keeps
a refused extract's window from sieving the population, and still carries the
`extractRejected` gate that stops a refused extract supplying a settlement
finding and the `settlement-comparison-skipped` warning that says the
reconciliation did not run, which 0.9.0 added. The release before this one,
0.10.0, added `extract` on `cedulon_audit` and the `malformed-extract-window`
refusal, which a clean pack of `@cedulon/x402-adapter@0.11.0` still carries.
The release before that carried
`unstated-audit-scope`, the `AuditScope` type on the report and the finding
object, and the unpinned-witness warning that no longer says a check ran on a
branch that runs none. The one before those answered its own three: an oversized
checkpoint comes back as a finding naming `cbor-too-large` instead of taking
the audit down, an extract carrying a non-finite number verifies false and
leaves the guarantee conditional instead of throwing, and both `signManifest`
and `signReceipt` refuse an amount spelled `01`. The same
check against the 0.5.0 packages found that the
installed `dist/session.js` refuses a lock it cannot take with a reason rather
than an exception and checks the state path before reading its fingerprint, and
that the
installed `@cedulon/audit` carries the finding codes that round added -
`issuer-key-mismatch`, `countersign-key-mismatch`, `countersign-missing`,
`witness-entry-unattributable` and the three `unauthenticated-*` warnings.
`padNonce` is gone from the installed `@cedulon/receipts`, and `verifyReceipt`
and `verifyInclusionReceipt` took the key to check against. 0.12.0 (prepared,
not published) splits that surface into `verifyInclusionEnvelope` and
`verifyInclusion`. `0.2.x` predates all
of it and `0.1.0` predates `-01` as well.

Every tool the server exposes carries a title and the hint that applies to it:
four read-only, and `cedulon_spend`, which appends a receipt and is therefore
neither destructive nor idempotent. All five declare `openWorldHint: false`,
which is a measurement rather than a claim: this package and the six it depends
on contain no HTTP client and no socket, and their only dependency outside the
project is the MCP SDK. A test reads those annotations off the wire, so a tool
added without them fails the suite instead of failing a review.

Identity on this server is the process boundary, said plainly so nobody reads
more into it. The stdio transport runs as the user who started the process;
that account is the principal, and there is no in-band authentication - a
username or token field would authenticate nothing the OS has not already
decided, and building one would suggest a separation the transport cannot
provide. The roles the protocol names are key possession, not accounts:

| Role | Holds | Can |
|---|---|---|
| Issuer | the receipt signing key (this server's state file) | sign receipts and checkpoints |
| Payee | a countersigning key | countersign a receipt it accepts |
| Witness | a witness key | co-sign checkpoints for transparency |
| Decision (PDP) | a decision-token key | sign Decision Tokens |
| Manifest publisher | a manifest key | sign Trade Manifests |
| Auditor | public pins only, no secret | verify and audit, on a machine the issuer does not control |
| Operator | the OS account owning the state file | start and stop the server; is the principal |

The auditor row is the product's whole claim, so it is worth repeating: an
auditor holds nothing secret and runs elsewhere. Two issuers must not share one
state file - `MUST-T12-3` makes that failure loud rather than silent - and a
multi-tenant server would be a different product with a database and row-level
isolation, deliberately not this one.

`@cedulon/base-extract` and `@cedulon/mcp-guard` are not published and are
marked `private`, so a workspace publish skips them rather than relying on
this sentence staying true. Both build to `dist` like the other packages;
they are packable and unpublished. `demo:live` imports `base-extract`.

`npm run mcpb` packs the released package into an `.mcpb` bundle for one-click
desktop install. The 0.13.0 bundle was built and unpacked: its manifest states
`0.13.0` and the server inside it installs `@cedulon/mcp-server@^0.13.0`. Every
`@cedulon` package inside it reads `0.13.0`, nine of them, with no older copy left beside them. The builder installs the published version rather than the
working tree, so it refuses to build a version npm does not have; that is what
keeps the bundle honest about what a user receives.

The 0.13.0 bundle is attached to the GitHub release `v0.13.0` as
`cedulon-0.13.0.mcpb`, 3,877,165 bytes, SHA-256
`b705d792ec15839d083b30a7c5095e39a20148461b179c89496da2e810cb5ee3`, built and
attached by the tagged run's release job (on its rerun) rather than by hand,
and the release notes, taken from the 0.13.0 section of `docs/UPGRADING.md`
by `scripts/release-notes.ts`, carry that digest. On 5 September the asset
was downloaded back through the GitHub CLI and hashed the same. The 0.12.0
bundle before it, `cedulon-0.12.0.mcpb` (3,861,094 bytes, SHA-256
`2bbb9972a5af93f9db22fdcfa1c26a769d4a185e6ab47cab1d475edae1ded851`), was
built and attached by hand on 3 September and downloaded back twice.
The release was created by hand, as `v0.11.0` had been (3,859,661 bytes,
`ebaa32f0…069e67`): `release.yml` carried a job for it on the `v0.12.0` tag,
but that job never started, because the post-release check ahead of it in the
publish job failed as it does on every tagged run. The check has its own job
now, and the bundle job is unproven until the next tag runs it.

The bundle's manifest declares its privacy policy at
<https://cedulon.com/privacy.html>, which is also linked from the README that
ships inside the package. A missing or incomplete privacy policy is an outright
rejection from the Anthropic connector directory, so a test checks the manifest
declaration, the HTTPS scheme, and the shipped README together. The desktop
extension submission form was filed twice: on 27 August 2026 with the 0.2.4
bundle, and on 3 September 2026 with the 0.12.0 bundle, the second filed as
a new submission rather than as an update to the first. Anthropic states that
it does not respond to every submission; as of 3 September it has not
responded to either, and this sentence said nothing had been submitted until
that day, which was wrong for a week.

Smithery lists the server as `dogrucanemek/cedulon` since 3 September 2026
(release `9cc8b89c`, published with `@smithery/cli` 4.11.1 from a bundle). The
bundle it holds is the 0.12.0 bundle with one difference: the manifest's
`tools` list is removed and `tools_generated` is set, 3,860,925 bytes, SHA-256
`21f34d9250c8351df6cf88146f0824add165a5502d306afbacf2fedb0aba4afd`. The
reason is a disagreement between two specifications: the CLI copies the
manifest's `tools` entries into a server card that requires an `inputSchema`
on each, and the MCPB manifest validator refuses an `inputSchema` on a tool
entry, so a manifest that lists its tools cannot be published there and a
manifest that could be published is not a valid bundle; the tools list was
the thing to drop. Read back from the listing the same day, before anything
was typed into its settings: no description and no tools were shown, the
score read 28/100, and the hosted URL the publish command printed answered
404. The card is what the CLI sent, name and version; it is not what the
server exposes. The description, homepage and repository were then entered
by hand in the listing's settings, after which the page showed them and the
score read 52/100; the tools are still not listed there, because nothing
the CLI sends carries them. The `v0.12.0` GitHub release carries the
unaltered bundle.

The server is listed on Glama at `dogrucanemek-alt/cedulon`. License and
quality both grade A, Install Server is active, and the release listed there is
0.5.0. That number moves when Glama is actually updated, not when npm is, and it
sat at 0.2.3 for three releases: anyone installing from that listing was getting
the payment path from before 0.4.0 refused an unattributable manifest. Glama
builds from its own spec rather than the `Dockerfile` here, and it builds the
commit it last synced rather than the one on the remote, so the head is worth
checking before a build and not after. The 0.5.0 build ran against `5b080e6`,
started, and listed five tools.

The server is listed in the MCP Registry as `io.github.dogrucanemek-alt/cedulon`,
where `0.13.0` is the current version (`isLatest`), read back from the registry
API rather than from the publish command's own output, on 5 September at
about 23:00 UTC, pushed by the tagged run's own registry step through its
OIDC login, minutes after `0.13.0` had gone to npm: the first tag on which
that step ran. On 3 September the `0.12.0` entry had been pushed by hand,
forty minutes after the npm publish, because the post-release check then sat
ahead of the registry step and failed as it does on every tagged run; the
check has its own job now and the step ran. `server.json` is the entry it
was published from, and the listing names `@cedulon/mcp-server` at the same
`0.13.0`. On that
reading the two channels are in step. The `0.11.0` listing had been pushed by
hand the same way on 2 September at 23:59 UTC. The search endpoint
answered a stale version for a short while after an earlier publish returned;
the versions endpoint is what settles it, and a reader checking the listing
right after a publish should ask that one.

That is a dated observation and not a claim about now. The listing moves whenever
someone runs `mcp-publisher`, this page is not notified when they do, and an
earlier revision of this paragraph asserted the listing could not have moved
between two readings. It could, and it did: the entry sat at `0.7.0` for two
releases and then caught up in one push. What is stated here is the reading and
its date; whether the numbers still agree is a question for the registry, and
`tests/published-as.test.ts` asks it rather than trusting this sentence. That
test asks two things and keeps them apart: whether the version this page names
was ever served, which holds at this commit forever, and whether it is the one
served today, which a pinned commit cannot promise. At a commit the listing has
moved past, the second reports "this pin is fine, the world moved" instead of a
failure; a checkout whose own version is the one being served still fails when
this page names the one before it. Nicholas Templeman reproduced `da7bf9b` on 5
September, after 0.13.0 shipped, and got the red that told him nothing about
which of the two had failed; that is the run this distinction comes from.

`release.yml` still sends packages to npm from the tag. It now also carries an
MCP Registry step (`mcp-publisher login github-oidc` then `publish`) after the
npm readback and the post-release suite. The tree now carries the step; it is
unproven until the next tag runs it. Until that tag runs, the registry entry
still moves when someone runs `mcp-publisher` by hand and can lag behind npm -
it spent half a day on `0.6.0` while npm served `0.7.0` - so when the numbers
differ, this paragraph is where both get named. Earlier listings: `0.2.1` announced itself as `0.2.0`
over `initialize`, because the version was written out a second time in the
source; `0.2.2` replaced that. `tests/release-manifest.test.ts` and the version
check in `tests/mcp-server.test.ts` compare those declarations against each
other.

Round 1 of external review is folded in, and the normative points it produced
are written into `spec/draft-dogru-cedulon-01.md`, posted on the datatracker
as rev 01. See `docs/EXTERNAL_REVIEW.md` for the findings and what changed.

Round 2 produced `spec/draft-dogru-cedulon-02.md`, posted as rev 02. Two
readers showed that the checkpoint carried the T11 guarantee while nothing
registered it or read it back: the anchoring section profiled only the receipt,
no verification step consumed a transparency receipt, equivocation could not
fire against a chain its own rules make consecutive, and a window total had no
redaction rule. `MUST-T11-10` through `MUST-T11-14` close those, and
`MUST-T9-5` carries the window total into the privacy requirements.

Round 3 came from a static review by an outside reader and was measured rather
than repeated: each claim was reproduced with a probe before any code moved.
The heaviest was a complete bypass. `MUST-T10-8` says a rail extract must be
verified against a key supplied out of band, "not against a key the extract
carries" - but that lesson had been applied to the rail extract alone. Receipts,
checkpoints, decision tokens and transparency inclusion receipts were still
verified against the key travelling inside them, so an attacker who never
touched the issuer key could mint their own, sign a receipt for an unauthorised
settlement, and the audit reported nothing at all.

`audit()` now takes `issuerTrust` and `witnessTrust` beside `trust`, and
`verifyReceipt`, `verifyCheckpoint`, `verifyDecisionToken` and
`verifyInclusionReceipt` each took the key to check against as an optional
argument. 0.12.0 (prepared, not published) replaces that last name with
`verifyInclusionEnvelope` (envelope) and `verifyInclusion` (candidate bytes). A receipt that does not answer to the pinned issuer is reported as
`issuer-key-mismatch` and is not counted as coverage, so the settlement it named
stays reported. An audit given no issuer or witness key says so
(`unauthenticated-issuer`, `unauthenticated-witness`) instead of reaching an
unconditional guarantee. The same round closed a policy limit with no lower
bound, an `allowedTools` list a caller could skip by omitting the field, a nonce
padding that made two different requests share one receipt nonce, and a state
file that stored the signing key with no mode and no atomic write.

Round 4 is the first one filed against posted archive bytes rather
than a working tree. A reader ran the -04 Appendix A vectors against
the exact datatracker bytes before reading, confirmed both signatures
and byte-for-byte re-encoding, and then filed a first-failure list:
eight points where an independent implementation could no longer be
built from the text, one question, and three mechanical defects. The
sharpest was an appendable countersignature that could fail an honest
audit - the same lesson `MUST-T8-9` already encoded, missed one object
over. The repairs landed in two waves on master (eleven commits to
`94f07e9`, two more to `c263834`), every guard red before its fix, and
`spec/draft-dogru-cedulon-05.md` carries the text side; see
`docs/EXTERNAL_REVIEW.md` Round 4 for the per-item record.

A second pass over the same round, prompted by an independent reader, found that
half a fix is its own failure mode. Setting a forged receipt aside for matching
was not enough while the totals, the head and the chain still walked the whole
submitted list: one receipt from a key the verifier had already rejected wrote
"the checkpoint lied" and "the chain is broken" against an honest issuer, and
noise like that argues for switching the pin off. The same shape appeared in the
witness: an unpinned inclusion receipt could carry a rival body for an epoch and
have the honest issuer reported for equivocating. Both now reason only over what
the pinned roots attest. `payeeTrust` closes the countersignature, which travels
beside the issuer signature without being covered by it; `issuerTrust` accepts a
list of keys so an honest rotation does not read as a wall of findings; and the
policy engine now checks a decision token against the key it signs with rather
than the key the token carries.

A third pass, again from the same reader, found the same shape once more, and
one of them inside the fix itself. An issuer pin nothing could be read from left
every submitted receipt attested, so a forged receipt counted as coverage again
and the report closed on "the pin is broken" while the naked settlement went
unmentioned - a broken setting granting trust instead of withholding it. One
mistyped key in a rotation list no longer discards the others. The
countersignature and redaction checks, and the witness's withheld check, now read
the attested set like everything else.

A fourth pass answered the same question again. An unreadable pin correctly
attests nothing, but it was also taking the receipts' own defects down with it -
a duplicate rail ref and a settled receipt with no ref are facts about the
submitted set, not claims about who signed it. A transparency entry with its
body removed accused whoever was under audit whenever no issuer key was pinned.
And naming a payee key created an expectation that deleting the countersignature
silently cancelled, so an attacker could remove their own failed forgery and the
report went back to unconditional.

That fix in turn re-opened the door it had just closed, one layer down: asking
the self-consistency question of everything submitted let an attacker mint a
receipt claiming a rail ref the honest issuer already used, and the duplicate was
reported against the honest set. It is asked of the accepted receipts now, and of
everything only when there is no accepted set to speak of.

A fifth pass found the swing had moved rather than stopped. Scoping the
self-consistency question to the accepted set silenced what a rejected receipt
says about itself, so those two questions are now separated by what they accuse:
a defect keyed by the offending receipt is always reported, a clash keyed by a
shared rail ref only among receipts the verifier accepts. Requiring a body before
a log entry may accuse anyone had silenced a real withholding as soon as the body
was stripped, so an entry nobody can attribute is now a warning rather than
nothing. And an unreadable issuer pin was cancelling the payee expectation it had
nothing to do with.

The state file got the rest of that pass. Comparing the file against what the
session last saw does not survive two writers that both read first: ten
concurrent pairs lost six receipts with both sides reporting success. The compare
and the write are under an exclusive lock now. `stateProtection` walks the whole
path rather than the immediate parent, since a grandparent anyone can write lets
the parent be renamed away with the key in it, and symlinks are refused at every
save rather than only at startup. The live receipt issuer signs through a
`Signer` (`pemSigner`); the state file still stores the PEM pair.

The sharpest finding of the whole round came from that lock rather than from the
audit engine. The server settled, appended the receipt, and saved - so a save
that failed left the rail ledger holding a settlement whose receipt existed only
in memory. Restart, and it is a settlement with no receipt: the exact condition
this project exists to make impossible, produced by the server itself. Settling
and saving now happen under one lock, and a spend whose record cannot be written
is refused before any money moves.

Holding the settle and the save under one lock was not enough on its own: an I/O
failure still left the payment complete in memory with the disk unchanged, and
the next successful save wrote out a payment the caller had been told failed. The
operation is now undone as a unit - receipt, ledger row, nonce and payment slot -
and refused with a reason the operator can act on. `reload()` ends the
wedged-after-conflict state. `cedulon_audit` takes the trust roots, without which
it was checking this server's records against this server's own key.

Two platform facts are recorded rather than papered over. The state file mode is
0600 where the filesystem honours it and has no effect on Windows or on mounts
that ignore POSIX modes, so `stateProtection` is now read back off the file
instead of inferred from `process.platform` - it said `owner-only` over a
world-readable file on a Windows drive mounted in WSL. And two servers sharing a
state path used to lose a receipt to whichever renamed last; a save over a state
the session did not produce now fails loudly. `stateProtection` also reads the
containing directory, distinguishes an absent file from an unprotected one, and
the server refuses a state path that is a symlink.

The spec side of this is closed in `-03`, written after the code it describes,
which is the order that was got wrong once already. `MUST-T10-8` now has its
counterpart for receipts and checkpoints (`MUST-T4-9`), for decision tokens
(`MUST-T6-6`) and for inclusion receipts (`MUST-T11-15`). That draft is posted
on the IETF datatracker.

On Windows the issuer private key is written as a CurrentUser DPAPI blob
(`keys.receiptPrivateDpapi`); the rest of the state file stays clear.
`stateProtection` reports `encrypted-at-rest` only after the file is
re-read as a blob and this process has unprotected it and signed with it.
A blob that cannot be opened is `cedulon-state-key-unreadable` and does
not mint a replacement key. POSIX still writes the PEM. macOS Keychain
is not built. The hosted Windows job's last published count is unchanged
in the opening paragraph until that job is measured again.

Not measured on this host: a second Windows user reading the file, and
PID reuse on a stale lock. `demo:unguarded` remains the intentional hole.

To reproduce any of the above, see `docs/RUN_AS_VERIFIER.md`.
