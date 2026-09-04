# Upgrading to 0.3.0

0.3.0 is a breaking release. It came out of five rounds of adversarial review
against 0.2.4, and the changes are the kind that have to break: a verifier that
kept the old behaviour would keep reporting a clean audit over a forged receipt.

## 0.13.0 (prepared, not published)

A. The five money-shaped axes behind `audit()` now sit on
`ReconciliationProfile` (`packages/audit/src/profile.ts`). Today's spend
walk moved behind `SPEND_PROFILE`; texts and order did not move. The
profile also owns the three one-sided match sentences
(`recordWithoutRowDetail`, `rowWithoutRecordDetail`,
`rowAgainstRefusalDetail`), the counterparty axis
(`counterpartyUnbound`, null on a profile that has none), and the
population: `audit()` reads every presented document as the profile's
record and row types, never by the shape of the body, so a rail extract
carrying an extra `effects` member is still a rail extract. Report
sentences that both profiles can emit are built from
`ReconciliationProfile.words`; the spend list is today's English. The tree
now carries `tests/spend-golden.test.ts` (fifteen cases generated from
the pre-seam source); unproven until a change that should have shifted
a finding fails that file. `docs/DECISION_PROFILE.md` is the
decision-side note.

B. The tree now carries `DecisionRecordClaims` and `SignedDecisionRecord`
(`packages/core/src/decision-record.ts`, CWT `-70501`…`-70512`, content
type `application/cedulon-decision-record+cbor`) and
`@cedulon/effect-extract` (`EffectRow` / `EffectExtractClaims`).
`decisionRecordHash` hashes the COSE Sign1 bytes, the same input
`receiptHash` uses on the COSE path. `verifyDecisionRecord` re-applies
the signer's claim rules (hash grammar; allow requires `ref` and
`effectHash`; deny and defer carry no `effectHash`) on the decoded
payload, so a record signed below `signDecisionRecord` verifies false;
under a pinned decider key the chain walk names it. Under a pin the
signature is checked against the pin and the carried key is a surface,
as it is for a receipt: a swapped carried key is `carried-key-mismatch`
and the record stays attested. `timestampMs` is refused unless it is a
non-negative safe integer. `@cedulon/effect-extract` no longer exports
a media type name: the extract is a JSON body with a detached
signature, as the rail extract is, and has none. `buildCheckpointClaims` takes two
optional functions after the previous-checkpoint hash: `totalsFn`
(default `totalsFromReceipts`) and `headHashFn` (default `receiptHash`).
The tree now carries those objects; unproven until a foreign verifier
round-trips a record it did not mint.

C. `DECISION_PROFILE` binds allow to an effect row on `effectHash`, and
treats deny/defer as the aborted class. Four codes join the catalogue:
`decision-without-effect`, `effect-without-decision`,
`effect-against-refusal`, `effect-mismatch`. `FINDING_CODES` is 54; the
schema enum lists the same 54. `interop/mizan-ig` turns two proposed
JSONL files into that audit. The tree now carries eighteen conformance
cases and four offline fixtures; unproven until the live bridge log is
measured and only `fromBridgeLine` / `fromMetaLine` have to move.
`AuditInput.trust` on this profile is the effect-extract signer;
`issuerTrust` is the decider. `terms()` is empty: policy binding is not
exercised. The behaviour carried forward is unchanged: an audit still
reports `manifest-terms-mismatch` with the split 0.6.0 introduced, where
with a usable issuer pin the departure is a finding that fails the
audit, and without a pin the same departure is a warning that does not
by itself fail it; and `requestHash` is still the SHA-256 of the
six-field canonical document in lowercase hex, the digest the posted
`-03` named a hash for without naming the octets.

D. `effectClass` is now a signed Decision Record claim (`-70513`,
`tstr / null`). The thirteen labels are always present. An allow
without a non-empty class is `allow-requires-effect-class` at sign and
at verify. A refusal may name the class it refused or carry null.
`DECISION_PROFILE.bind` compares `effectHash` first; equal hash and a
different class is `effect-class-mismatch`. `FINDING_CODES` is 55; the
schema enum lists the same 55. Twenty conformance cases. A -00 record
with the twelve-label map is refused by this reader as
`decision-record-tstr-or-null` (measured: `decisionRecordFromCbor` on
a twelve-pair CBOR map; the missing `-70513` is `undefined`, not CBOR
null). `verifyDecisionRecord` on those bytes returns false. There is
no distribution of -00 records (companion + IG adapter only).

What breaks: nothing on the spend path; the golden test in
`tests/spend-golden.test.ts` compares byte for byte. Callers of
`buildCheckpointClaims` that already passed five arguments keep compiling;
the two new parameters are optional. A verifier that still accepts a
twelve-label Decision Record will not read this tree's records, and
this tree will not attest that verifier's -00 records.

## 0.12.0: the inclusion verifier binds to the bytes the caller holds

A. `release.yml` now logs in with `mcp-publisher login github-oidc` and publishes
the repo-root `server.json` after the npm readback and the post-release suite.
The tree now carries the step; it is unproven until the next tag runs it. A tag
that reached npm and then failed this step is still a completed npm release;
the later step does not roll it back.

B. After those steps a second job builds `cedulon-<tag>.mcpb`, refuses a
manifest whose version is not the tag, and attaches the file to the GitHub
release (creating the release if it is missing). The tree now carries the
step; it is unproven until the next tag runs it.

The workflow answers to tags only: the `workflow_dispatch` trigger is gone,
because a manual run had `github.ref` on a branch, skipped the tag guard and
still ran the npm publish steps; the `publish` job carries the tag condition
at job level as well. The release notes are the whole UPGRADING section for
the tag, produced by `scripts/release-notes.ts` and written on both the
create and the upload path; the bundle's manifest is read with `unzip` and
Node rather than Python. `tests/release-workflow.test.ts` holds that shape,
`tests/release-notes.test.ts` the notes.

C. The public inclusion verifier now binds the receipt to the candidate bytes
the caller holds. `verifyInclusionReceipt` is gone. The envelope check (signature
plus `{statementHash, index, treeHead}`) is `verifyInclusionEnvelope`. Coverage
is `verifyInclusion(receipt, candidateHex, witnessKey)`, which hashes the
candidate, requires a proof, and accepts only when the leaf, index, and
reproduced root match the signed envelope. Why: the same defect we wrote into
the CCF -04 Last Call (a receipt verified without `HASH(candidate)` equality
establishes inclusion, not coverage) was measured on this API on 3 September.

What breaks: `verifyInclusionReceipt` is gone; a call that verified an envelope
now reads `verifyInclusionEnvelope`, and a call that meant to check that a
receipt covers the bytes you hold now reads `verifyInclusion(receipt,
candidateHex, witnessKey)` and fails without a proof.

A review pass over the first cut found two more holes, both closed here. Hex
was read with `Buffer.from(hex, "hex")`, which stops at the first character it
cannot read and keeps what it decoded so far: a candidate of `aazz` hashed like
`aa`, a receipt whose `coseHex` carried a trailing suffix verified as the
receipt without it, and the in-memory log registered an empty statement. The
checkpoint package now reads hex in one place (`strictHexBytes`: lowercase,
even length, at least one byte, nothing else) and `register`, the envelope
check, `verifyInclusion` and the audit's layer-2 input all refuse anything
else; `register` throws `statement-hex`. And a proof was applied without
looking at its shape: an empty path at index 1 returned the leaf unchanged, so
a witness-signed envelope whose tree head was that leaf passed, and a `null`
path threw out of the public verifier. `validInclusionProof` now names the
shape (a non-negative safe-integer index, 32-byte lowercase siblings, and an
index that resolves to the root when the path ends); `verifyInclusion` answers
false to anything else without throwing, `applyInclusionProof` refuses it by
name, and the audit reports `witness-inclusion-invalid`. The path's depth is
not capped: a safe-integer index resolves under any path of 53 levels or
more, and the walk is one hash per level. A third reader found the shape
check was still read with `Array.prototype.every`, which skips holes, so a
sparse array with one filled slot passed and the walk met `undefined`; the
check walks by index now, and the two remaining loose readers in the package
(`decodeInclusionPayload`, and the leaf and sibling hashes under
`applyInclusionProof`) refuse anything that is not lowercase hex of the right
length by name.

The behaviour carried forward is unchanged: an audit still reports
`manifest-terms-mismatch` with the split 0.6.0 introduced, where with a
usable issuer pin the departure is a finding that fails the audit, and
without a pin the same departure is a warning that does not by itself fail
it; and `requestHash` is still the SHA-256 of the six-field canonical
document in lowercase hex, the digest the posted `-03` named a hash for
without naming the octets.

## 0.11.0: the report counts what it classed

This one adds a member and prints two lines. It refuses nothing that used to
pass, and it changes the findings on one input only, a receipt object
presented twice in one array (under "What breaks").

`AuditReport` gains `counts`: how many receipts were submitted, attested, in
scope, aborted and settled, and of the settled ones how many were matched,
deferred, carried into the next window, unmatched, repeated or left
unreconciled; and on the settlement side the rows and the same classes less
`carried`. The reconciliation computed every one of these on its way to the
findings; what changes is that the report now publishes them. Every settled
receipt and every row lands in exactly one class, so the totals add up on
both sides, `matched` is the same number on each, and a reader can check the
population against the findings rather than take the summary's word for it.

Why. Round 5 of `docs/EXTERNAL_REVIEW.md` ran the accounting rules of a
neighbouring draft over this reconciler and two did not pass, for one reason:
two rows leave a window's accounting correctly and without a finding, and the
report gave a reader no way to tell such a window from one that held no such
row. A settled receipt inside the closing clock-skew boundary whose ref the
following window carries belongs to that window's report; it was dropped here
with no finding and no warning, and `audit: balanced` read the same whether
the row existed or not. It is now `carried`. An `aborted` receipt is right to
have no row on the extract and no finding; it was absent from the report
altogether, and a window holding one refused spend read the same as a window
holding none. It is now `aborted`. Neither is a new check. The behaviour that
excluded the rows was right and is unchanged; the exclusion is now reported.

The member is on every surface the report reaches. The finding object carries
`counts` (`docs/finding-object.schema.json` names the shape as an optional
envelope member; `docs/FINDING_OBJECT.md` counts that among the changes that
are not a version bump, and the object version stays 1). Optional in the
portable object because the posted draft asks no implementation for class
counts and another producer may not compute them; this implementation always
emits it, and that is a promise of this package, not of the schema. `formatAudit` prints
two `counts` lines, one per side, after the guarantee and scope lines and
before the warnings, so the documented `npm run audit` output in
`docs/RUN_AS_VERIFIER.md` and `docs/INTEROP_RUN.md` grew those two lines. The
`receipts` total in the finding object and the `receipts=` line of the printed
report are now `counts.receipts.submitted`, the number the audit measured; the
second parameter of `toFindingObject` and `formatAudit` is still accepted so
existing calls compile, and is not read. The `cedulon_audit` result on the MCP server carries
`counts` beside `scope`, and `cedulon_export_ledger` carries the counts of the
in-process audit it exports, because an export is a structure returned for
that audit and the counts are never absent the way a scope can be.

When the pinned rail key refuses the presented extract the comparison does
not run (`settlement-comparison-skipped`, 0.9.0). The counts say so in their
own terms: every attested settled receipt and every row is `unreconciled`, no
other class is claimed, and the identities still hold. Painting zeros into
`matched` and `unmatched` there would have read as a comparison that found
nothing. The refused document does not get to sieve that population either:
its declared window is no more evidence than its rows, so on that path
`inScope` is every attested receipt, as it is when no extract was presented.
The scope line still names what the presented document declared, refused or
not, and the finding beside it says it was refused.

A review pass over the first cut of this release found two defects the
identities could not see. A refused extract still sieved the receipts with
the window it declared, so a forged document declaring a far-off window
emptied the population and every count came back zero with the identities
intact. And the issuer-chain walk tracked receipts by object identity, so one
receipt object presented twice counted as one attested receipt while every
other check counted two. Both are fixed in this tree; the tests that watched
them fail are numbers 9 and 10 in `tests/audit-counts.test.ts`.

What breaks: nothing at the boundary. A consumer of the finding object that
validates against the version-1 schema from an older tree will see an
unknown envelope member; the schema in this tree names it. A type that
constructs `AuditReport` or `FindingObject` literals now needs `counts`. A
caller that passed something other than the submitted count as the receipt
total gets the measured number instead; every caller in this tree outside the
test that exercises the change passed the submitted count, and the documented
output did not move. One input reads differently: a receipt object presented
twice in one array was folded into a single occurrence by the issuer-chain
walk, which tracked receipts by object identity, while every other check
already counted two. The walk now tracks positions, so the findings name the
duplicate (`duplicate-ref`, the checkpoint totals and head) where they used to
be silent, and `attested` counts both occurrences.

Where this stands against the posted draft. No requirement in `-08` asks for
class counts; `MUST-T10-19` asks the report to name its population, and this
member says what became of every row in it. The two Round 5 findings are
closed by it, and `conformance/counted-splits.ts` registers no split, because
the posted text lacks a rule the code has, not the other way round; the next
revision can state one if the neighbouring draft's vocabulary settles.

The behaviour carried into this release is unchanged and still current. An
audit still reports `manifest-terms-mismatch` with the split 0.6.0 introduced:
with a usable issuer pin the walk is the attested set and the departure is a
finding that fails the audit; without a pin the same departure is a warning
that does not by itself fail it. And `requestHash` is still the SHA-256 of the
six-field canonical document in lowercase hex, the digest the posted `-03`
named a hash for without naming the octets.

## 0.10.0: an audit over a presented extract says what it covered

This one adds an input and a member, and it refuses one shape that used to
pass: an extract whose window does not end after it starts. It changes no
finding.

`cedulon_audit` on the MCP server now takes `extract`: a signed rail extract
the caller was presented with, in the shape `signRailExtract` produces
(`{ body: { accountId, railId, windowStartMs, windowEndMs, settlements,
clockSkewMs? }, signature, publicKeyPem }`). Present, that document is the
settlement side of the audit and this server's in-process ledger is not
consulted: the rail operator's signed statement has standing the server's own
simulation of a rail does not, and the two cannot both be the population.
The receipt side is still this server's own receipt chain and checkpoints, so
an extract for an account or rail this server did not settle on reports this
server's receipts as unmatched; that is the correct reading of that pairing,
and the tool description says so. Rows added through `extraSettlements`
beside an `extract` are refused as `extra-settlements-with-extract` rather
than reconciled with a warning, on the reasoning `MUST-T10-20` gives from the
other side: a row added beside the signed document is a charge no rail key
stands behind. An empty list adds no row and is accepted. A malformed
`extract` is refused as `extract: ...` before anything is reconciled: the gate
applies the rule the library itself applies before it signs or verifies an
extract (`railExtractShapeRefusal`: safe-integer window and timestamps, the
amount grammar on every row, a non-negative clock skew, and from this release
a window that ends after it starts), and on top of it refuses an empty
account or rail, an empty signature, and a public key that is not a PEM. A
missing member is not coerced into an empty string, an empty one is not
accepted, and `null` is a presented value that is refused rather than read as
"no extract", because an audit would otherwise name an account nobody
declared or answer a question the caller did not ask. A review pass over the
first cut of this release found that a negative clock skew, an empty
signature and an inverted window walked through a type-only gate and came
back as a balanced audit, the inverted window under an unconditional
guarantee; the gate now names what is wrong with the document instead.

What breaks: `railExtractShapeRefusal` gains one clause,
`malformed-extract-window`, for a body whose `windowEndMs` is not greater
than its `windowStartMs`. `signRailExtract` refuses to sign such a body and
`verifyRailExtract` refuses it before the signature, so an integration that
produced one will see a named refusal where it used to see a signature. The
window is half-open and nothing honest produces an empty or inverted one; the
posted draft states the rule from `-08`.

The result gains `scope`: the account, rail and window the audit was computed
over, present exactly when it ran over a presented extract and absent when it
ran over the server's own ledger, which declares no population. That is the
member `AuditReport` and the finding object have carried since 0.8.0, on one
more surface. `cedulon_export_ledger` is unchanged: its audit is always over
the in-process ledger, so it has no declared scope to name, and a member that
is always absent would say nothing.

Where this stands against the posted draft. `-07` states `MUST-T10-19` for the
printed report and the finding object, and says in its own change note that
the MCP result and the ledger export return the finding list and the guarantee
without a scope field, and that a revision widening the requirement to every
returned structure will ship with the package that carries it. This is that
package: the MCP result now carries the member, and the next revision widens
the requirement to name it. No rule in `-07` is unmet by this release and none
is stated by it that the companion lacks, so `conformance/counted-splits.ts`
registers no split for it; what runs ahead of the posted text is a
description, not a requirement.

The behaviour carried into this release is unchanged and still current. An
audit still reports `manifest-terms-mismatch` with the split 0.6.0 introduced:
with a usable issuer pin the walk is the attested set and the departure is a
finding that fails the audit; without a pin the same departure is a warning
that does not by itself fail it. And `requestHash` is still the SHA-256 of the
six-field canonical document in lowercase hex, the digest the posted `-03`
named a hash for without naming the octets.

## 0.9.0: a refused extract stops being evidence

This one changes what a report says about an extract the verifier has already
refused, and a caller reading individual findings will see the difference.

Since 0.5.0 a verifier that pins a rail key and is handed an extract signed by
some other key gets `extract-key-mismatch` and a failed audit. Until this
release the audit then went on to reconcile that document's rows anyway, so the
same report could name `settlement-mismatch` against an honest receipt, or
report money as unaccounted for, out of a body it had just rejected. An
attacker who can present an extract signs their own and chooses the amounts the
accusation is written from. The audit still failed either way; what they could
choose was who it appeared to accuse.

`MUST-T10-20` closes it. Where a stated rail pin refuses the extract, no
settlement finding is read out of that document: not a mismatch, not an
unaccounted settlement, and not a receipt left unmatched by rows the refused
document omits. This is `MUST-T8-9`'s rule for a refused Trade Manifest applied
on the money axis, for the reason that requirement already gives: a charge that
no key stands behind is one a forged document can invent against an honest
payer.

Saying nothing would have been the other failure, and this release does not
make it. A reader cannot tell a comparison that found nothing from one that
never ran, so the report carries a new warning, `settlement-comparison-skipped`,
naming what did not happen. It makes the guarantee conditional, which
`extract-key-mismatch` already did. A pinned key the verifier cannot decode is
`trust-key-unreadable`, is the verifier's own configuration fault rather than a
refusal of the document, and does not reach this rule.

What breaks: an integration that read `settlement-mismatch` from a report
whose extract failed its pin will stop seeing it. That finding was never
attributable and should not have been acted on, but code that counted findings
will count fewer. `FINDING_CODES` gains one member, so a consumer that
enumerates it exhaustively should take the new list.

The behaviour carried into this release is unchanged and still current. An
audit still reports `manifest-terms-mismatch` with the split 0.6.0 introduced:
with a usable issuer pin the walk is the attested set and the departure is a
finding that fails the audit; without a pin the same departure is a warning
that does not by itself fail it. And `requestHash` is still the SHA-256 of the
six-field canonical document in lowercase hex, the digest the posted `-03`
named a hash for without naming the octets.

The two splits that stood against posted `-06` are closed: `-07`, posted on
2 September 2026, states this rule and the scope rules 0.8.0 added
(`MUST-T10-18`, `MUST-T10-19`, `MUST-T10-20`), so
`conformance/counted-splits.ts` carries no living split and the published
0.9.0 packages and the posted draft agree on all three.

## 0.8.0: an audit says which settlement path it covered

This one does not refuse anything new. It stops a result from being read as
wider than it was measured.

An extract covers one account on one rail over one window. Since 0.5.0 a
verifier that stated no period got `unstated-audit-window` and a conditional
guarantee, because otherwise the extract is free to define the period it
reports on. The account and the rail are the same kind of axis and never got
the same treatment. A verifier that pinned a rail key and named neither now
gets `unstated-audit-scope`, also a warning, and the guarantee is conditional
for the same reason. If you pin a key, name the account and the rail as well;
`RailTrustPin` already carried both fields and they were only ever compared
when you supplied them.

`AuditReport` gained `scope` and so did the finding object: the account, rail
and window the extract declared, present whenever an extract was, absent when
none was presented. `formatAudit` prints it as a `scope=` line beside
`guarantee=`. The JSON schema in `docs/finding-object.schema.json` allows the
new member; a consumer that rejected unknown members against the old schema
should take the new one. Nothing that was in the object moved or changed
meaning.

What this is for: an account able to settle on a second rail has a settlement
path no presented extract covers. A spend that left that way is not an
unmatched row, it is outside the declared population, which is the bypass T10
is named after. A balanced audit under an unconditional guarantee has always
been a statement about one account on one rail over one window, and until this
release the report did not say so. Enumerating an account's rails is still the
deployment's statement; no extract can be asked to prove that enumeration is
complete.

The behaviour carried into this release is unchanged and still current. An
audit still reports `manifest-terms-mismatch` with the split 0.6.0 introduced:
with a usable issuer pin the walk is the attested set and the departure is a
finding that fails the audit; without a pin the same departure is a warning
that does not by itself fail it. And `requestHash` is still the SHA-256 of the
six-field canonical document in lowercase hex, the digest the posted `-03`
named a hash for without naming the octets.

The posted `-06` states neither requirement, so this release runs ahead of the
draft. It opened the living split `V-T10-18-unstated-audit-scope`, registered
in `conformance/counted-splits.ts` for `MUST-T10-18` and `MUST-T10-19`: the
companion warned and named its scope where the posted draft was silent. The
difference closed on 2 September 2026, when `-07` was posted stating both. For
what that file carries now, read the current release's section rather than this one.

## 0.7.0: the amount grammar at every boundary, and refusals that answer

This one breaks, and it breaks two things that used to be accepted.

A boundary now checks the amount as text before anything parses it. `spend` on
the MCP server and the tool guard both took the caller's string, ran it through
`BigInt()`, and printed the result back: `"01"` entered as `1n` and left as
`"1"`. The octets `MUST-T8-2` compares were gone before the gate ever saw them,
and one number had two spellings. Both boundaries now answer
`malformed-amount` for a spelling the grammar forbids - `"01"`, `" 1"`,
`"0x10"`, `"1n"`, `""` - and `signManifest` refuses the same set, which
`signReceipt` has refused since -00. A manifest that stated `"01"` stated terms
no honest spend could match: the receipt carries `"1"` and the gate calls it a
mismatch. Callers that were sending non-canonical spellings and relying on the
reinterpretation will now be refused; send the canonical decimal string.

Verification answers instead of throwing. `verifyCoseSign1`,
`verifyReceipt`, `verifyCheckpoint`, `verifyManifest`,
`verifyCounterSignature`, `verifyInclusionReceipt` and `verifyDecisionToken`
return `false` for bytes they cannot read - a decoder bound, a duplicate key,
anything malformed - and never throw. The name of that refusal is a separate
question, asked of the bytes: `coseDecodeRefusal` and `coseDecodeRefusalHex`
return `cbor-too-large`, `cbor-too-deep`, `cbor-duplicate-key`, or `null` when
the bytes decode and the verdict really was the signature. An interim shape had
verification rethrow those names so a caller could report them; that put every
caller one forgotten `try` away from an uncaught exception, and a 65KB
checkpoint took a whole `audit()` down. Fail-closed is the default now, and
naming the reason is opt-in. If you wrapped a Cedulon verifier in a `try/catch`
for named refusals, the catch is dead - read the name from the bytes instead.

The behaviour those refusals report is unchanged and still current. An audit
still reports `manifest-terms-mismatch` with the split 0.6.0 introduced: with a
usable issuer pin the walk is the attested set and the departure is a finding
that fails the audit; without a pin the same departure is a warning and does not
by itself fail it, because a charge no key stands behind is one a forged receipt
can invent. `requestHash` is still the SHA-256 of the six-field canonical
document, lowercase hex; `-04` states the digest and the exact JSON shape that
`-03` left to the reader.

Both divergences from the posted draft are closed, and they closed by the
draft moving rather than by the code being talked into agreeing. `-04` is
posted. MUST-T8-9 now states the two-branch form this tree implements: with a
usable issuer pin an unpinned departure fails the audit, without one it is
reported and does not, because a charge no key stands behind is one a forged
receipt can invent against an honest payer. MUST-T3-4 now names SHA-256, the
RFC 8785 encoding, and the request document member by member, which is what
this tree binds. A reader implementing the posted draft literally now matches
a 0.7.0 token.

The conformance runner records that: the two `-03` / `-04` divergences are
ordinary vectors now, checked against the draft instead of recorded as
departing from it. The request-hash vector carries the expected digest, which
the draft's silence used to forbid: writing one while `-03` named no digest
would have recorded this implementation's answer as though it were the
specification's.

The split that stood against posted `-05` is closed: `-06` states the rule
(`MUST-T4-20`), so a rail extract whose JSON text repeats a member name is
refused as `json-duplicate-key` by the draft as well as by this tree, and
`conformance/counted-splits.ts` carries no living split. The refusal is
still ahead of the published packages rather than in them: `@cedulon/*@0.7.0`
on npm parses extract text with `JSON.parse`, which keeps the last value and
drops the evidence of the other. The next published version carries the
refusal.

**What to change:** send canonical decimal amounts. Delete a `try/catch`
written for a rethrown decoder refusal, and read the name from the bytes with
`coseDecodeRefusalHex` where you want to report it. A `false` from a verifier
means unverified, whatever the reason - it is fail-closed on its own.

## 0.6.0: named refuse codes, input bounds, and a narrower terms charge

This one breaks. Inputs that used to throw `RangeError` (a truncated CBOR length
header, nesting past the stack) now throw named `cbor-eof`,
`cbor-too-deep`, `cbor-too-large`, `cbor-unsupported`, or
`cbor-duplicate-key`. An audit whose receipt, settlement, checkpoint,
or inclusion list exceeds the bound in `docs/LIMITS.md` is refused with
`audit-too-large`. A third-party decoder that does not apply the same
bounds is answering a different question.

It also narrows `manifest-terms-mismatch`. 0.5.0 reported that finding
and set `ok: false` whenever a presented receipt named the manifest and
departed from its terms, pinned or not. This tree does not. With a
usable issuer pin the walk is the attested set and the charge is a
finding: a receipt that does not verify under the pinned key cannot
invent a terms violation. Without a pin the same departure is reported
as a warning (`severity: "warn"`) and does not by itself fail the
audit. `manifest-covers-no-receipt` is unchanged — it is still a
warning over the presented list, because asking whether a hash was
named is not the same as charging a party with breaking the terms they
signed.

The published draft `-03` (MUST-T8-9) says an unpinned departure is
reported as `manifest-terms-mismatch` and fails the audit. This tree
does not fail the audit on that path. The difference will be closed in
`-04`, with the reason. A reader who implements `-03` and runs 0.6.0
should take the split from this section, not discover it in production.

The published draft `-03` (MUST-T3-4 / MUST-T6-1) says a Decision
Token is bound to a hash of the six request fields, and does not name
the octets or the digest. This tree binds SHA-256 of the six-field
canonical JSON document (lowercase hex), the same digest and encoding
`policyHash` already uses. A reader who implements `-03` as the
canonical JSON without a digest, or as SHA-256 of some other encoding,
will not match a 0.6.0 token. The difference will be closed in `-04`,
with the reason.

**What to change:** catch the named codes instead of `RangeError`. Do
not treat a missing catch as "the input was accepted". If you treated
`ok: false` as the signal that a receipt broke its terms, stop: that
signal is now only a terms finding, and a terms finding is raised only
when a usable pin attests the receipt. A warning on the same code is
not a fail. The eight packages are published on npm at `0.6.0`.

## 0.5.0: a bound receipt that breaks its terms fails the audit

This one breaks. `audit()` used to report `guarantee=unconditional` over a
receipt whose `manifestHash` matched a presented Trade Manifest while
the receipt amount, currency, or settlement time departed from those
terms (`amount=99` against a manifest of `1`). `MUST-T8-2` and
`MUST-T3-3` already refused that spend at the gate; the verifier had
no counterpart, so a settled record that the gate would have denied
still looked clean. It now reports `manifest-terms-mismatch` and
`ok: false`. `MUST-T4-17` (a presented manifest that no receipt
names) is in the same release.

**What to change:** if you treat `ok: true` and `guarantee=unconditional`
as "the window was spent under these terms", read the new finding. A
receipt that does not name the manifest is not judged against it. A
no-manifest audit is unchanged.

## 0.4.0: the payment path refuses an unattributable manifest

This one breaks. `gatedSettle` used to accept a presented Trade Manifest with no
`manifestTrust`, verify it against the key the manifest itself carried, settle, and write
that manifest's hash into the receipt. A payer could be handed terms signed by anyone and
the receipt would record them as if the named party had agreed. It now answers `402` with
`manifest-unauthenticated` when a manifest is presented and no key is supplied for it.

**What to change:** if you pass `manifest` to `gatedSettle`, pass `manifestTrust` with it -
the key you hold out of band for the party you believe you are dealing with. If you have no
such key, do not present the manifest; a request with no manifest is unaffected and
`unguardedSettle` is unchanged, being the demonstration hole it has always been.

The audit path was given the same root one release earlier and reports the doubt rather
than refusing, which is the right split: an audit describes what it found, a payment
decides whether money moves. Reporting doubt after settling is not a report, it is a
regret.

## The manifest root in the audit path: not a breaking change

The manifest root is **not** a breaking change in `audit()`. `audit()` grew two optional
fields, `manifest` and `manifestTrust`. Callers that present no Trade Manifest
see the same report they saw on 0.3.1. A no-manifest deployment is still
silent. What 0.3.1 did in silence, and what this names, is the other case: a
manifest is presented and the verifier has no pin, or a pin it cannot read, or
a pin the manifest does not answer to.

- Presented, no pin: warning `unauthenticated-manifest`, guarantee
  `conditional`. The audit does not fail.
- Presented, pin unreadable: finding `trust-key-unreadable` on `id:
  "manifest"`. The audit fails.
- Presented, pin does not match: finding `manifest-key-mismatch`. The audit
  fails.

`verifyManifest` still takes an optional pin, the same way `verifyReceipt`
does. `true` without a pin means internally consistent, not authentic.
`verifyRailExtract` now takes the same optional pin (`MUST-T10-8` at the
function, not only later in `audit()`). Omitting it keeps the old self-check.

`cedulon_audit` accepts `manifest` and `manifestTrust` beside the other
roots it already took.

## 0.3.1: no new breakage, four repairs

Nothing in this section changes in 0.3.1. It repairs defects that only appear
away from the platform 0.3.0 was written on, three of them reported by an
independent runner who cloned the tagged commit and ran the suite on Linux, and
a fourth found while repairing those.

- A directory that cannot be written refuses the lock before it refuses the
  record. Only `EEXIST` was recognised there, so the refusal arrived as an
  uncaught exception instead of `{ ok: false, reason: "state-io" }`. If you
  wrapped `spend()` in a try/catch to survive that, the throw it caught is gone
  and the refusal now comes back as a value. **Keep the catch.** `spend()` still
  throws `cedulon-state-symlink` when the state path, or any directory above it,
  has been replaced by a link. That one is deliberate: it is a refusal to write
  to a destination the caller did not choose, and it must not be mistaken for a
  payment that merely failed.
- The state path is checked for symbolic links **before** the fingerprint is
  read, not after. A replaced path used to produce a fingerprint mismatch and be
  reported as `state-conflict`, which reads as another writer rather than as a
  hijacked destination. It now raises `cedulon-state-symlink`, as documented.
- The test covering that guarantee called `require` in a package declared as
  ESM, so it never reached its assertion. The guarantee was untested on every
  platform, not weakly tested on one.
- `npm pack --json` returns an array in npm 10.9 and an object in earlier
  versions; the packaging check accepts both.

## Why the audit answers differently

Every signed object used to be verified against the key it carried. A receipt
verifies against the key inside the receipt; a checkpoint against the key inside
the checkpoint. That is a question which answers itself, and it meant an attacker
who never touched the issuer key could mint their own, sign a receipt for a
settlement they were never authorised to make, and the audit reported nothing at
all.

`audit()` now takes the roots the verifier holds out of band:

```ts
audit({
  receipts,
  checkpoints,
  extract,
  trust:       { publicKeyPem: railKey },              // as before
  issuerTrust: { publicKeyPem: issuerKey },            // new
  witnessTrust:{ publicKeyPem: logKey },               // new, with inclusionReceipts
  payeeTrust:  { "payee-1": payeeKey },                // new, with countersignatures
});
```

`issuerTrust` and `witnessTrust` also accept a list of keys, so a rotation does
not turn honest receipts into a wall of findings.

**An audit with no roots is not an error, but it is not unconditional either.**
It reports `unauthenticated-issuer`, `unauthenticated-witness` and
`unauthenticated-countersigner` as warnings and the guarantee stays
`conditional`. Code that asserted `guarantee === "unconditional"` without passing
the roots will now fail, and that is the point of the release.

New finding codes: `issuer-key-mismatch`, `countersign-key-mismatch`,
`countersign-missing`, `witness-entry-unattributable`, and the three
`unauthenticated-*` warnings above. Consumers already have to carry unknown codes
without treating the report as healthier - see `docs/FINDING_OBJECT.md`.

## Why a short nonce is now refused

`padNonce` widened a short nonce to the minimum length, so `"a"` and `"a0"`
became one receipt nonce while the policy engine still counted them as two
requests. The specification asks for at least 128 bits of randomness in that
field; padding satisfied the length and none of the requirement. `padNonce` is
gone, and a nonce shorter than 16 bytes is refused with `nonce-too-short` on
every path that mints a receipt.

If you were relying on the padding, generate the nonce properly instead:

```ts
import { randomBytes } from "node:crypto";
const nonce = randomBytes(16).toString("hex");
```

## Why a payment can now be refused for a reason that is not policy

`cedulon_spend` used to settle, append the receipt, and then save. A save that
failed left the rail ledger holding a settlement whose receipt existed only in
memory - restart the server and that is a settlement with no receipt, which is
the one condition this project exists to make impossible.

Settling and saving are one operation now, and the whole of it is undone if the
record cannot be written. New deny reasons:

| reason | meaning | what to do |
|---|---|---|
| `state-io` | the state file could not be written | check disk, permissions, the directory mode |
| `state-conflict` | another writer changed the file | call `reload()`, or restart; two servers must not share a state path |
| `state-locked:<pid>` | that process holds the write lock | it is named so you can act on it |
| `amount-not-positive` | zero or negative amount | it used to reopen an exhausted budget |
| `nonce-too-short` | fewer than 16 bytes of nonce | see above |

`reload()` is new: it takes the state file as it now stands and returns the
nonces this session was holding that the file does not have, so a recovery cannot
lose a receipt quietly.

## Other behaviour worth knowing

- `mcp-guard` no longer assumes your paying tool is called `spend` or `pay`.
  Pass `spendTools` with your own names; the old pair is the default, and a
  default is not coverage.
- `cedulon_verify_receipt` takes `expectIssuerKeyPem` / `expectPayeeKeyPem` and
  reports `issuerCheckedAgainstSuppliedKey` / `payeeCheckedAgainstSuppliedKey`,
  so a caller cannot mistake the weaker answer for the stronger one.
- `cedulon_audit` takes the same four roots as `audit()`.
- `cedulon_status` reports `stateProtection`, read off the file rather than
  guessed from the platform: `owner-only`, `unprotected-on-this-platform`,
  `encrypted-at-rest`, `absent`, or `in-memory`.
- On Windows the issuer private key is wrapped with DPAPI (`CurrentUser`)
  before it is written. The rest of the state file stays clear. The optional
  entropy is the UTF-8 bytes of `cedulon-state-v1` (not a secret; it only
  keeps this app's blobs apart from other CurrentUser data). A file that
  already holds a blob is never rewritten as a PEM. A blob that cannot be
  unprotected refuses to open (`cedulon-state-key-unreadable`) and does not
  mint a replacement key. POSIX still writes the PEM.
- The state path is refused if anything on it is a symlink.

## What is still open, on purpose

- On Windows the issuer private key is a CurrentUser DPAPI blob
  (`encrypted-at-rest` when that wrap is measured). Cases 40, 60, 68 and 75
  now assert the blob and the report rather than skipping. POSIX file and
  directory modes are still not the access control there; the mode-bit half of
  those cases stays on Linux. Cases 42, 70, 76 and 83 skip when the host
  cannot create a symbolic link (Windows without Developer Mode returns
  `EPERM`). Cases 80 and 81, the undo after a failed write, do run on
  Windows: a read-only state file makes the atomic rename fail the same way a
  POSIX directory mode 0500 does. macOS Keychain wrapping is not built.
- `demo:unguarded` still allows 100 payments with no gate. That is the hole the
  rest of the demos exist to show closed.
- SMB and UNC shares, and a second Windows user account reading the state file,
  have not been measured.
