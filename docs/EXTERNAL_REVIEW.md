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

Reported by Pablo Play.

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
(cases 14–17). Case 13 in `tests/audit.test.ts` was updated: it previously
asserted that a signed but unpinned extract yields an unconditional guarantee,
which encoded the defect described in finding 2.

## Pending for the next revision

Findings 1 and 2 change what a verifier is required to do, so they belong in
the draft rather than only in the implementation. The published -00 is frozen;
these are queued for -01:

- A verifier MUST obtain the rail key out of band. An extract key that is not
  pinned, or does not match the pin, cannot yield an unconditional guarantee.
- When an extract is supplied, reconciliation MUST run over the rows it
  carries. A settlement list from any other source MUST NOT substitute for it.
- A verifier MUST check that the extract covers the expected account, rail, and
  window, and MUST fail closed when it does not.
- A `ref` that repeats MUST still be reconciled by aggregate amount per
  currency, so the unaccounted amount is named.
