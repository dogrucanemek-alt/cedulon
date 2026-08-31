# Upgrading to 0.3.0

0.3.0 is a breaking release. It came out of five rounds of adversarial review
against 0.2.4, and the changes are the kind that have to break: a verifier that
kept the old behaviour would keep reporting a clean audit over a forged receipt.

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

A new living split stands against posted `-05`. A rail extract whose JSON
text repeats a member name is refused as `json-duplicate-key`. RFC 8785
takes I-JSON as input, and I-JSON objects carry no duplicate names;
`JSON.parse` keeps the last value and drops the evidence. The posted draft
does not state that refusal. The companion does. The difference is recorded
in `conformance/counted-splits.ts` as `V-T4-19-json-duplicate-key` and
closes when `-06` states the rule.

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
