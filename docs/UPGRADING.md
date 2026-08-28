# Upgrading to 0.3.0

0.3.0 is a breaking release. It came out of five rounds of adversarial review
against 0.2.4, and the changes are the kind that have to break: a verifier that
kept the old behaviour would keep reporting a clean audit over a forged receipt.

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
  `absent`, or `in-memory`.
- The state path is refused if anything on it is a symlink.

## What is still open, on purpose

- On Windows the file mode call succeeds and protects nothing; the access control
  there is the directory ACL and this server does not set it. `stateProtection`
  says `unprotected-on-this-platform` rather than pretending otherwise.
- `demo:unguarded` still allows 100 payments with no gate. That is the hole the
  rest of the demos exist to show closed.
- SMB and UNC shares, and a second Windows user account reading the state file,
  have not been measured.
