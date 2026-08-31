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

`draft-dogru-cedulon` is posted on the IETF datatracker through `-06`
(31 August 2026), alongside the two companion `-00` drafts.
The repository is archived at `10.5281/zenodo.22099792`. The core packages
carry no runtime dependencies; `@cedulon/mcp-server` depends only on the
official MCP SDK.

`0.8.0` is prepared in this tree and is not a published npm release; npm still
serves `0.7.0`, and a reader checking a claim against an installed package will
find the older behaviour until this bump ships. What it changes: an audit
declares the settlement path it was computed over, not only the period. A
verifier that pins a rail key but names no account and no rail now gets
`unstated-audit-scope` and a conditional guarantee, on the same reasoning that
made an unstated period conditional; and a report computed over an extract
names the account, rail and window that extract declared, in the
operator-facing text and in the returned finding object both, while a report
with no extract has no declared population to name. An account that can settle on a second rail has a
settlement path no presented extract covers, and until this bump a balanced
line could not be told apart from one that covered every path. The posted `-06`
states neither requirement: that is a living split, registered as
`V-T10-18-unstated-audit-scope` in `conformance/counted-splits.ts`, and it
closes when `-07` is posted. Behaviour carried forward unchanged:
`manifest-terms-mismatch` keeps its split - with a usable issuer pin the walk
is the attested set and the departure is a finding, without a pin the same
departure is a warning that does not by itself fail the audit - and
`requestHash` is the SHA-256 of the six-field canonical document in lowercase
hex, the digest the posted `-03` named a hash for without naming.

`0.7.0` is published on npm, and it is the first release with a provenance
attestation: it was built and sent by the tagged `release.yml` run rather than
from anyone's laptop, so a reader can check where the bytes came from as well
as what they do. What it changes: an amount is
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

Eight packages are published on npm at `0.7.0`, so the server runs without a
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
`@cedulon/mcp-server@0.7.0` answers `initialize` reporting `0.7.0`. A clean
install of the same release was also asked the three things this version
changed, from the installed package rather than the tree: an oversized
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
and `verifyInclusionReceipt` take the key to check against. `0.2.x` predates all
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
desktop install. The 0.7.0 bundle was built and unpacked: its manifest states
`0.7.0` and the server inside it installs `@cedulon/mcp-server@^0.7.0`. Every
`@cedulon` package inside it reads `0.7.0`, with no older copy left beside them. The builder installs the published version rather than the
working tree, so it refuses to build a version npm does not have; that is what
keeps the bundle honest about what a user receives.

The bundle's manifest declares its privacy policy at
<https://cedulon.com/privacy.html>, which is also linked from the README that
ships inside the package. A missing or incomplete privacy policy is an outright
rejection from the Anthropic connector directory, so a test checks the manifest
declaration, the HTTPS scheme, and the shipped README together. Nothing has been
submitted to that directory yet. Smithery takes an HTTPS endpoint or a bundle;
neither has been submitted there either.

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
where `0.7.0` is the current version (`isLatest`), read back from the registry
API rather than from the publish command's own output. `server.json` is the entry
it was published from, so the registry and npm now serve the same release,
including the two crash repairs 0.7.0 makes.

The two still move separately on purpose. `release.yml` publishes to npm from
the tag with no long-lived credential, and it does not publish to the MCP
Registry, because `mcp-publisher` authenticates through its own GitHub device
flow and whether it accepts Actions OIDC has not been measured here; adding it
untested would put a claim in that workflow nobody checked. Until it is
measured, the registry entry is pushed by hand and can lag behind npm - it
spent half a day on `0.6.0` while npm served `0.7.0` - so when the numbers
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
`verifyInclusionReceipt` each take the key to check against as an optional
argument. A receipt that does not answer to the pinned issuer is reported as
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
