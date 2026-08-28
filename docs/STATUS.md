# Status

`npm run test:all` is green; `npx tsc --noEmit` is silent; `npm run audit`
exits 0 and the four bypass demos fail as designed. `docs/RUN_AS_VERIFIER.md`
carries the exact output of each demo, and part of the suite checks that file
against what the commands actually print.

Those demos run on fixtures. `npm run demo:live` does not: it reads a real
Base Sepolia USDC window over an RPC endpoint and reconciles it against a
receipt chain. A 128-settlement window was read from the live chain and every
one of the 128 came back as `settlement-without-receipt`, at
`guarantee=conditional` — a chain read is not a signed extract from the rail
operator. That is the whole of what runs against a real rail today: reading.
Nothing here holds a wallet or signs a transaction.

The three -00 drafts and `-02` (rev 02) are posted on the IETF datatracker.
The repository is archived at `10.5281/zenodo.22099792`. The core packages
carry no runtime dependencies; `@cedulon/mcp-server` depends only on the
official MCP SDK.

Eight packages are published on npm at `0.3.1`, so the server runs without a
clone: `npx -y @cedulon/mcp-server`. 0.3.0 was the breaking release and
`docs/UPGRADING.md` says what breaks and why; the short version is that a
verifier which kept the old behaviour would keep reporting a clean audit over a
forged receipt. 0.3.1 breaks nothing further: it repairs three defects an
independent runner found on Linux, and a fourth found while repairing them.

Checked from npm rather than from this tree: a clean install of
`@cedulon/mcp-server@0.3.1` answers `initialize` reporting `0.3.1`, the
installed `dist/session.js` refuses a lock it cannot take with a reason rather
than an exception and checks the state path before reading its fingerprint, and
the
installed `@cedulon/audit` carries the finding codes this round added -
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

`@cedulon/base-extract` and `@cedulon/mcp-guard` are not published and are
marked `private`, so a workspace publish skips them rather than relying on
this sentence staying true. Both build to `dist` like the other packages;
they are packable and unpublished. `demo:live` imports `base-extract`.

`npm run mcpb` packs the released package into an `.mcpb` bundle for one-click
desktop install. The 0.3.0 bundle was built and unpacked: its manifest states
`0.3.0` and the server inside it installs `@cedulon/mcp-server@^0.3.0`. The builder installs the published version rather than the
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
quality both grade A; the release listed there is still 0.2.3 and Install Server
is active. That number moves when Glama is actually updated, not when npm is. The
`Dockerfile` here is the image that was built and whose server answered
`initialize`, listed five tools, and returned a signed receipt.

The server is listed in the MCP Registry as `io.github.dogrucanemek-alt/cedulon`,
where `0.3.0` is the current version (`isLatest`), read back from the registry
API rather than from the publish command's own output. `server.json` is the entry
it was published from. Earlier listings: `0.2.1` announced itself as `0.2.0`
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
save rather than only at startup.

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

The spec side of this is still open: `MUST-T10-8` has no counterpart for
receipts, checkpoints, decision tokens or inclusion receipts. That belongs in a
later revision, written after the code it describes - which is the order that
was got wrong once already.

To reproduce any of the above, see `docs/RUN_AS_VERIFIER.md`.
