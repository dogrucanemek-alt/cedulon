# External review

The -00 announcement on the SCITT mailing list asked readers to run the pinned
commit and try to break it. This file records what came back and what changed
as a result. Findings are listed whether or not they were bypasses.

## Round 1 — commit `e681e24`, 2026-08-25

Two independent readers ran the pinned commit from a clean clone. Both
reproduced the published result: TypeScript silent, the suite passing, `npm run
audit` exit 0, and all four advertised bypass demos failing as designed.

### 1. A signed extract was never the subject of the audit — fixed

Reported by Iman Schrock (EMILIA).

`audit()` verified `input.extract` but reconciled a separate `input.settlements`
array. A validly signed extract could therefore carry an off-book settlement
while the caller passed `settlements: []`; with empty receipts and checkpoints
the report returned `ok: true`, `guarantee: "unconditional"`, `audit: balanced`.
That is a full bypass of the completeness claim, reached without forging
anything.

Fix: when an extract is supplied it is the subject of the audit. Reconciliation
runs over `extract.body.settlements`. A caller-supplied array that disagrees
with the extract is reported as `extract-settlement-mismatch` rather than
silently preferred.

### 2. The extract carried its own trust root — fixed

Reported by Iman Schrock (EMILIA).

`verifyRailExtract()` checks the signature against the `publicKeyPem` carried
inside the extract. An attacker-generated key therefore self-verifies and
produced an unconditional guarantee. The signature proved internal consistency,
not that the named rail produced the extract.

Fix: `audit()` accepts a verifier-supplied `trust` pin — the rail public key,
and optionally the expected account, rail, and window. Without a pin the report
stays `conditional` and states why. With a pin, a key that does not match is
`extract-key-mismatch` and an out-of-scope extract is
`extract-scope-mismatch`; both fail closed.

### 3. A repeated ref hid the amount that was unaccounted for — fixed

Reported by Pablo Play, with a written repro in
[issue #1](https://github.com/dogrucanemek-alt/cedulon/issues/1).

A settlement injected under an existing receipt's ref sent both entries down
the duplicate-ref path, which skipped them from the ref-keyed match. The audit
still failed, so this was not a bypass, but the surviving finding said only
that a ref appeared twice — the specific gap and its amount were never named.

Fix: refs that dedup are no longer skipped outright. Per currency, the
aggregate settled amount is compared against the aggregate receipted amount for
that ref, and a shortfall is reported as `settlement-without-receipt` naming
the amount that is unaccounted for.

## Coverage

Red-then-green cases for all three are in `tests/extract-binding.test.ts`
(cases 18–21). Case 13 in `tests/audit.test.ts` was updated: it previously
asserted that a signed but unpinned extract yields an unconditional guarantee,
which encoded the defect described in finding 2.

## Round 1b — self-review of the repair, same day

Before replying to the list, the repair was attacked on its own terms. Four
defects in it were found and closed; cases 22–25 cover them.

### 4. A pinned key was only checked when the signature already verified

The trust check sat on the `else` branch of the signature check, so an extract
whose signature did not verify skipped pin and scope comparison entirely and
returned `ok: true` with a warning. The worse input took the softer path. Once
a verifier states a pin, every way of failing to meet it is now a finding,
including a signature that does not verify.

### 5. A doubted extract still called itself unconditional

`guarantee` was derived from warnings alone, and `extract-key-mismatch` is a
finding. A report could therefore name a key mismatch and describe its own
guarantee as unconditional in the same breath. Findings that doubt the extract
now force `conditional`.

### 6. The operator-facing output hid the guarantee

`formatAudit` printed `audit: balanced / receipts=N / findings=0` and nothing
else, so a conditional pass looked identical to a pinned one in the only output
most people read. This is the same defect class as finding 3, shipped one layer
further out. `formatAudit` now prints the guarantee and every warning on both
the passing and the failing path.

### 7. An unreadable amount crashed the audit

A non-integer amount such as `"1.5"` threw out of `BigInt()` and took the whole
report down. An amount the audit cannot read is now reported as
`malformed-amount`.

## What is still true, and deliberately so

Without a pin, `ok` is still `true` and the summary still reads `audit:
balanced`; only `guarantee` and the warnings carry the difference. That follows
`MUST-T10-7` in -00, which makes an unauthenticated extract conditional rather
than failing. The defect was that nothing surfaced it; that is now fixed. Making
an unpinned audit fail outright would be a normative change and is not one this
implementation should make on its own.

Two further observations were named here as open. Both reporters agreed they
were the right next controls, and both are now implemented; cases 26–28 cover
them.

### 8. The pin was compared as PEM text — fixed

Text comparison tolerated whitespace differences but not envelope differences:
the same key published as bare base64 SPKI rather than PEM compared unequal, so
an honest rail could be reported as a mismatch. Keys are now compared as SPKI
DER bytes, and PEM or bare base64 are both accepted for the pin.

The same change separated two failures that used to look identical. A pin the
audit cannot read at all is now `trust-key-unreadable` rather than
`extract-key-mismatch`, so a broken local configuration is distinguishable from
an extract signed by the wrong key.

### 9. Rows outside the declared window were never checked — fixed

An extract declares a window and carries settlement rows. Nothing compared the
two, so an extract could claim to cover a period while carrying rows from
outside it. Each row outside the declared window is now
`extract-scope-mismatch`, named by its `ref`. This runs whether or not a key is
pinned, because it is a question about the extract's internal consistency
rather than about trust.

## Round 1 verification, by the reporters

Both reporters re-ran the repair independently rather than take the claim.

Iman Schrock verified commit `bdddc4c` from a clean worktree: TypeScript
passed, all 97 tests passed, and the audit exposed the conditional guarantee
and its warning as described. Iman declined the offer to add the attached test
file, on the grounds that cases 18–25 already cover both findings.

Pablo Play re-ran the original repro against the same commit before filing
issue #1, so the issue records the behaviour before and after the fix rather
than the original report alone. The output now names the gap:
`ref x402-real settled 8 USD against 1 USD receipted; 7 USD unaccounted`.

## What -00 already required

Finding 1 is not a gap in the draft. `MUST-T10-7` and the Rail Extract Profile
in -00 already say a verifier checks completeness against the rail extract and
not against the issuer's own receipts alone. The reference implementation
contradicted the document it shipped with, and 81 passing tests did not notice,
because every test happened to pass a settlement list that agreed with the
extract. The correction there was to the code, not to the specification.

## Pending for the next revision

The published -00 is frozen; these are queued for -01. One clarifies text that
is already there, two are new requirements:

- Clarification. -00 says a production verifier obtains the extract from the
  rail or from a signature the rail published, but the verification algorithm
  never says which key the signature is checked against. -01 states it: the
  rail key is obtained out of band, and an extract key that is absent or does
  not match cannot yield an unconditional guarantee.
- New. A verifier checks that the extract covers the expected account, rail,
  and window, and fails closed when it does not. -00 defines extract scope but
  the algorithm has no step that compares it against what the verifier
  expected.
- New. A `ref` that repeats is reconciled by aggregate amount per currency, so
  the unaccounted amount is named. -00 keys the match on each unique `ref`,
  which is what allowed a repeated ref to drop out of the comparison.
- New. The pinned key is compared as SPKI DER rather than as encoded text, so
  the same key in a different envelope is the same key.
- New. Every settlement row outside the extract's declared window is a named
  finding, so a declared window and the rows it carries cannot disagree
  silently.

The implementation also now emits finding codes that -00 does not define:
`extract-key-mismatch`, `extract-scope-mismatch`, `extract-settlement-mismatch`,
`trust-key-unreadable`, and `malformed-amount`. The finding code table moves to
-01 with them.
