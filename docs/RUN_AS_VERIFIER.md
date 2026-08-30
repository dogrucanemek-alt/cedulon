# Run as a verifier

You do not have to trust the authors. On a clean machine, clone this
repository and run the commands below. Wall time is under ten minutes
when Node.js 22+ and npm 10+ are already installed.

Sections 1 to 6 touch no network at all and every key is a fixture. Section 7
is optional and reads a live chain, but only reads it: Cedulon holds no wallet
and signs no transaction anywhere in this document.

Run as an ordinary user, not as root. Several cases make a directory
unwritable and then expect a payment to be refused, and root writes to an
unwritable directory regardless of its mode, so those cases report the payment
as having succeeded instead. In a container that means `--user` or a `su` to a
normal account; the author lost a run to this. Four cases skip on Windows
when the host cannot create a symbolic link (42, 70, 76, 83). File and
directory mode cases (40, 60, 68, 75) now measure the DPAPI wrap of the
issuer key rather than skipping. A green suite there still cannot hide a
symlink skip as a pass.
The undo after a failed write (80, 81) is exercised on Windows by marking the
state file read-only so the atomic rename fails. A green suite on Windows is
still a smaller claim than a green suite on Linux, and the report says which
platform it came from.

## 1. Clone and install

```bash
git clone https://github.com/dogrucanemek-alt/cedulon
cd cedulon
npm install
```

`cbor-x` is a test-only decoder. If the installer mentions `cbor-extract`,
leave its install script blocked. The suite uses the JavaScript path.

## 2. Typecheck and tests

```bash
npx tsc --noEmit
npm run test:all
```

A green suite on Windows is a smaller claim than a green suite on Linux.
The full pre-release suite as a non-root user on Linux, from this tree,
is a Docker run that copies the source and installs inside the container
so Windows `node_modules` binaries are not reused:

```bash
docker run --rm --user 1000:1000 \
  -v "$PWD:/src:ro" -w /tmp \
  node:22-bookworm \
  bash /src/scripts/posix-pre-release.sh
```

That copies the working tree. A copy of a Windows checkout can make
`git diff spec` dirty on Linux even when the host tree is clean. A
native Linux measurement clones the git objects and checks them out
inside the container (needs `git` in the image):

```bash
docker run --rm \
  -v "$PWD:/origin:ro" -w /tmp \
  node:22-bookworm \
  bash /origin/scripts/posix-native-bootstrap.sh
```

Expect: `tsc` silent, and every test passing. The run prints its own count at
the end; this file deliberately does not restate it, having twice told readers
a number the suite had already moved past. Input bounds a third-party
decoder must apply are in `docs/LIMITS.md`. The suite includes red-then-green
cases for COSE tamper, checkpoint equivocation, field-level settlement
matching, window coverage, signed extracts, extract binding and trust pinning,
and each audit finding.

Three of those tests run the commands printed below and compare the real output
to the blocks this file shows, so a stale expectation here fails the suite
rather than misleading you. Two more check that the sections are numbered once
each and that the cross-references point at sections that exist.

## 3. Completeness demo (the moat)

Balanced books (must exit 0):

```bash
npm run audit
```

Expected stdout:

```
audit: balanced
receipts=2
findings=0
guarantee=conditional
warn	unauthenticated-extract	rail extract is unsigned; completeness guarantee is conditional
warn	unauthenticated-issuer	no verifier-supplied issuer key; receipt and checkpoint signatures prove internal consistency, not that the named issuer produced them. Without one there is no way to tell a receipt from this issuer apart from any other, so every receipt submitted is weighed as one set and the completeness guarantee is conditional
```

Read the warnings before you trust the first line. This demo passes no rail
extract, no pin and no issuer key, so the books balance against what the issuer
itself recorded, checked against the key those same records carry. That is a
conditional result, and the audit says so. Section 8 shows what an
unconditional one requires.

Two roots, not one. The rail pin answers who reported the settlements;
`issuerTrust` answers who was entitled to issue receipts and checkpoints for
them. Without the second, anyone who can mint a keypair can sign a receipt for
a settlement they never made and the row stops looking uncovered - the receipt
verifies against the key it carries, which is a question that answers itself.
Receipts that do not match the pinned issuer are reported as
`issuer-key-mismatch` and left out of the reconciliation, so the settlement they
pointed at stays reported.

## 4. Four bypass kinds (must all fail)

The old hole was a rail settlement with no receipt. Three more holes
used to pass: a same-ref wrong amount, a settled receipt with a null
rail ref, and a garbage `chainHeadHash`. All four now fail.

Missing receipt (exit non-zero):

```bash
npm run demo:bypass
```

Expected stdout (exactly):

```
audit: 1 settlement without receipt → FAIL
```

Wrong amount, null-ref exemption, and garbage chain head:

```bash
npm run demo:bypasses
```

Expected stdout (four lines, all FAIL):

```
missing	audit: 1 settlement without receipt → FAIL	guarantee=conditional
amount	audit: 1 finding(s) → FAIL	guarantee=conditional
null-ref	audit: 1 finding(s) → FAIL	guarantee=conditional
head	audit: 1 finding(s) → FAIL	guarantee=conditional
```

Each line carries its guarantee for the same reason section 3 does: these runs
pass no signed extract and no pin, so a `FAIL` here is a failure against what
the issuer recorded. Section 8 is what raises that to unconditional.

`amount` names `settlement-mismatch`. `null-ref` names
`settled-without-ref`. `head` names `checkpoint-head-mismatch`.

## 5. Older demos (still required)

```bash
npm run demo
npm run tamper
```

`demo` prints a 3-allow / 97-block runaway with verified receipts. It also
prints `matchesAcceptance=false`, which is the intended result: the dispute
bundle describes a delivery that does not meet the acceptance criteria, and
`bundle_ok=true` requires exactly that mismatch to be provable.

`tamper` must exit non-zero and print `tamper detected`.

`npm run demo:unguarded` is the old hole: 100 allows and no completeness
check. Prefer `demo:bypass` / `demo:bypasses` to see that hole closed at
audit time.

## 6. What you just proved

- A receipt whose COSE bytes were flipped does not verify.
- Two different checkpoints for one epoch are equivocation.
- A rail settlement with no receipt fails the audit and names the gap.
- A same-ref wrong amount is `settlement-mismatch`.
- A settled receipt with a null rail ref is `settled-without-ref`.
- A garbage `chainHeadHash` is `checkpoint-head-mismatch`.
- A clean pair of receipts, settlements, and a checkpoint exits 0.

That is completeness: missing or mismatched evidence is itself evidence.

## 7. Optional: run it against a real chain

Everything above uses fixtures. This one reads a live rail. It is read-only:
no wallet, no key, no transaction is sent, and the endpoint below needs no
credential.

```bash
export CEDULON_RPC_URL=https://sepolia.base.org
npm run demo:live -- --address <0x...> --from <block> --to <block>
```

Pick any Base Sepolia address with USDC activity. Against an account whose
receipts you do not hold, every settlement the chain reports is a gap:

```
rail=base-sepolia-usdc
account=0x2e0c37b721124e2558baf75f6f8e6cc9f14aec29
window=2026-08-26T01:30:22.000Z..2026-08-26T01:46:32.001Z
settlements=128 total=200000 receipts=0
audit: 128 settlement without receipt → FAIL
```

Your numbers will differ; the shape is the point. `guarantee=conditional`,
because a chain read is not a signed extract from the rail operator — the
window is whatever you asked for, and nothing countersigned it. Exit is
non-zero whenever the window does not reconcile, which is the whole job:
the rail is not yours to edit, and what it reports has to be accounted for.

## 8. Pin the rail before you trust the extract

A signature on a rail extract proves internal consistency, not origin: a key
generated by whoever produced the object verifies against itself. So the
guarantee is unconditional only when the verifier supplies the rail key out of
band, and `audit()` reconciles the rows the extract actually carries:

```ts
audit({
  receipts,
  checkpoints,
  extract,                                   // the signed extract is the subject
  trust: {
    publicKeyPem: railKeyYouAlreadyHold,     // never taken from the extract
    accountId: "acct-1",
    railId: "base-sepolia-usdc",
  },
  issuerTrust: {
    publicKeyPem: issuerKeyYouAlreadyHold,   // never taken from the receipts
  },
});
```

Without `trust` the report stays `conditional` and says why. With `trust`, a
mismatched key is `extract-key-mismatch`, a wrong account, rail, or short
window is `extract-scope-mismatch`, and a caller-supplied settlement array that
disagrees with the extract is `extract-settlement-mismatch` — the extract wins.

A third root appears once you configure a transparency witness: pass
`witnessTrust: { publicKeyPem: logKeyYouAlreadyHold }` alongside
`inclusionReceipts`. An inclusion receipt checked against the key it carries
says only that some log exists, and a log anyone can invent can assert an
anchoring, or hold a rival body for an epoch and have the honest issuer reported
for equivocating. So without the pin the inclusion receipts are left out of the
comparison entirely and the report warns with `unauthenticated-witness`; with
it, the body a pinned log holds still has to answer to `issuerTrust` before it
counts as something the issuer published.

A fourth, when receipts carry payee countersignatures: `payeeTrust` maps each
payee to the key you hold for them. `counterCoseHex` and `payeePublicKeyPem`
travel beside the issuer signature without being covered by it, so anyone
holding an honest receipt can append a countersignature of their own. Unpinned,
that is not payee approval; the report warns with
`unauthenticated-countersigner`. A pinned payee whose countersignature fails
verify, or is by another key, is `countersign-bad` or `countersign-key-mismatch`
as a warning: the bytes cannot be attributed to that payee, so they are
discarded as approval and do not fail the audit.

`issuerTrust.publicKeyPem` takes a list as well as a single key. An issuer that
rotated its key mid-window otherwise produces a wall of findings against honest
receipts, and the way out an operator reaches for is to stop pinning - so state
the keys you accept instead. One unreadable key in that list does not discard
the rest: it is reported as `trust-key-unreadable` while the readable keys stay
in use. A list nothing can be read from attests nothing at all, so every
settlement comes back uncovered - a broken setting withholds trust rather than
falling back to accepting whatever the objects carry.

Everything the pins reject is then left out of every inference that depends on
who signed: totals, checkpoint head, receipt chain, window coverage, the
countersignature questions, and redaction notices all read the attested set.
What the receipts say about themselves splits into two questions with two
different subjects. A defect keyed by the offending receipt - a settled receipt
naming no rail ref - accuses nobody else, so it is reported whoever signed it,
including a receipt the pins already rejected. A clash between two receipts is
keyed by the rail ref they share, and that ref may be one the honest issuer
legitimately used, so it is asked only of the receipts this verifier accepts.
Ask it of everything submitted and an attacker mints a receipt claiming a ref the
honest issuer already used, and the duplicate lands on the honest set.

With no issuer key at all there is no accepted set: nothing distinguishes a
receipt from the named issuer from any other, so every receipt submitted is
weighed together and an added one does reach these checks. That is what
`unauthenticated-issuer` means, and it is the reason the guarantee is
conditional - not a gap that pinning cannot close.
Otherwise one receipt from a key you already rejected writes "the checkpoint
lied" against an honest issuer, which is an argument for switching the pin off.
The same filter applies inside the witness: a shared transparency log holds
statements from everyone using it, and another issuer's epoch sitting there is
not yours being withheld.

The same argument applies to the receipts. Without `issuerTrust` every receipt
and checkpoint is checked against the key it carries, so an attacker who mints
their own keypair can issue a receipt for a settlement they were never
authorised to make and the naked row goes quiet. With `issuerTrust`, a receipt
from any other key is `issuer-key-mismatch` and is not counted as coverage, so
the settlement it named stays reported; an issuer key you supply but that cannot
be read is `trust-key-unreadable` on `id: "issuer"`, which is a broken setting
rather than evidence against the receipts. Every verify in the project takes the key
directly for callers outside `audit()`: `verifyReceipt(signed, issuerKey)`,
`verifyCheckpoint(signed, issuerKey)`, `verifyDecisionToken(signed, nowMs,
issuerKey)`, `verifyInclusionReceipt(signed, witnessKey)`,
`verifyManifest(signed, issuerKey)`, `verifyCounterSignature(signed, payeeKey)`,
`counterSign(receipt, payeePriv, payeePub, issuerKey)`, and the two checkpoint
helpers `findCheckpointChainBreak` and `findEquivocation`. `gatedSettle` takes
`manifestTrust` on its input. Omitting the key is always allowed and always
means the weaker question was asked.

The MCP server exposes the same choice: `cedulon_verify_receipt` takes
`expectIssuerKeyPem` and `expectPayeeKeyPem`, and reports
`checkedAgainstSuppliedKey` so a caller cannot mistake the weaker answer for the
stronger one. `cedulon_status` reports `stateProtection`, read back off the file rather than
inferred from the platform: `encrypted-at-rest` when the issuer key is a
measured DPAPI blob, `owner-only` when the file really carries mode 0600,
`unprotected-on-this-platform` otherwise - a clear PEM on a platform whose
mode bits are not the access control, and any mount that ignores POSIX
modes, such as a Windows drive seen from WSL - and
`in-memory` when no state path is configured, and `absent` when the path holds
no file yet, which is a different fact from a file with no protection. The
directory counts too: mode 0600 says who can open the file, and a directory
anyone can write says who can replace it. A state path that is a symlink is
refused outright, since whoever placed the link would otherwise decide what this
server starts up believing.

`payeeTrust` is an expectation as well as a check: name a payee key and a settled
receipt for that payee with no *attributable* countersignature is reported as
`countersign-missing`. Garbage and a foreign key are discarded, so they leave
the question open the same way a missing countersignature does.

A note on what `guarantee` means, because it is easy to read as a verdict. It is
a statement about the evidence, not about the books: `conditional` means some
part of the audit rested on something the verifier could not authenticate. A
report can be `ok: false` and `unconditional` at once, and that combination says
the shortfall is certain rather than contingent. The draft defines it this way -
"the guarantee is conditional on the extract being authentic" - so read `ok` and
the findings for the result, and `guarantee` for how much the evidence carried.

Two servers must not share one state path. Atomic writes stop a torn file, not a
lost one: both would load the same state, both append, and the later rename wins
while the other receipt disappears. Comparing the file against what this session
last saw is not enough either, because two writers that both read before either
wrote each see an unchanged file - measured over ten concurrent pairs, six lost a
receipt with both sides reporting success. The compare and the write happen under
an exclusive lock now: a second writer gets `cedulon-state-locked`, a stale lock
whose holder is gone is taken over, and a state this session did not produce is
still `cedulon-state-conflict`.

The settle and the save happen under one lock, and the whole of it is undone
together if the record cannot be written: no receipt kept in memory, no row left
on the rail ledger, and nothing carried out to disk by the next payment that
succeeds. The nonce and the payment slot are given back too, so a payer is not
charged a slot for a payment that never happened. A spend that cannot be recorded
is refused - `state-io` when the write failed, `state-conflict` when another
writer moved the file, `state-locked:<pid>` when someone else holds the lock, and
the pid is there because an operator cannot act on a lock without knowing whose
it is.

A conflict used to be permanent. `reload()` takes the file as it now stands and
returns the nonces this session was holding that the file does not have, so a
recovery cannot lose a receipt quietly.

A fifth, when a Trade Manifest is presented: `manifestTrust` is the publisher
key you hold out of band. Without a presented manifest there is nothing to
pin, and a no-manifest deployment is silent. With a presented manifest and no
pin the report warns `unauthenticated-manifest` and the guarantee is
conditional; with a pin the manifest does not answer to, `manifest-key-mismatch`
fails the audit.

`cedulon_audit` takes `trust`, `issuerTrust`, `witnessTrust`, `payeeTrust` and
`manifestTrust`.
Without them the tool was auditing this server's records against this server's
own key, so every answer it could give was conditional and no caller could change
that.

The settle and the save happen under one lock, and the write is proven possible
before any money moves. The other order - settle, append, save - leaves the rail
holding a settlement whose receipt exists only in memory when the save fails;
restart the server and that is a settlement with no receipt, which is the single
condition this project exists to make impossible. A spend that cannot be
recorded is refused with `state-conflict` instead.

`stateProtection` walks every directory on the path, not just the last one: a
grandparent anyone can write lets the parent be renamed away with the key inside
it. A directory that is open to others but sticky - a shared `/tmp` - is fine,
which is exactly the case sticky exists for. Anything symlinked on that path is
refused, at startup and again at every save, since a path checked once is a path
that can be replaced afterwards. `absent` can appear beside a non-zero
`receiptCount`: the ledger is in memory and the file is gone, which is worth
telling apart from a file with no protection.

## 9. How to verify this version

`docs/LIMITS.md` is the bound table a third-party decoder has to apply.

The software bill of materials is produced from `package-lock.json` with
no extra dependency:

```bash
npm run sbom > sbom.cdx.json
```

The document is CycloneDX 1.5. Running the command twice must emit the
same bytes: the timestamp inside is fixed so a clock cannot make two
honest runs look like two different trees.

npm trusted publishing is the maintainer's step, not yours. The release
workflow requests `id-token: write` and publishes with `--provenance`.
After a version is on the registry, check the attestation rather than
the tarball's mtime:

```bash
npm view @cedulon/cose@0.5.0 dist.integrity
npm audit signatures
```

`npm pack` of the same package twice lists the same files in the same
order. The `.tgz` bytes themselves may differ: ustar stores a
modification time. Compare the member list, not the archive hash.
