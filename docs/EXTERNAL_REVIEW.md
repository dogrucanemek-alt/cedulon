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

## Round 4 — draft-04 archive bytes, 2026-08-30

Tiago Pinto ran the Appendix A vectors against the exact IETF archive
bytes (Python 3.14.4, cbor2 6.1.4, cryptography 50.0.1) before reading
for failure points: both Ed25519 signatures verify, the SPKI-derived
kid matches, and deterministic re-encoding reproduces the protected
headers and payloads byte for byte. He then filed a first-failure list
- the point where an independent implementation could no longer be
built from the text - rather than a prose review: eight failures, one
question, three mechanical points. Every repair below landed with its
guard red before the fix; the branch history is the evidence.

### 1. Transparency receipt path vs RFC 9942 - fixed

Section 11.3 described a hash comparison while citing RFC 9942
verification mechanics, and the evidence bundle never carried the
candidate-entry bytes Section 5.2.1 consumes. Split into two named
tiers: the witness receipt (a co-signature over the statement hash)
and log membership (candidate bytes + inclusion proof, verified per
9942 §5.2.1 against a witness-signed tree head, exact receipt match
required). The in-process witness became a Merkle tree issuing
inclusion proofs, and absence of tier-2 inputs is reported as
not exercised. Code: `c263834`. Text: the -05 witness-section
rewrite, MUST-T11-18/19.

### 2. Key resolution in the unpinned branch - fixed

Step 4 said "reject" and "report issuer-key-mismatch" in the same
breath. Measured cell by cell (`a65a40a`), then decided: membership in
the attested set follows verification under the pinned root, read out
in one table, each cell a named condition plus a membership decision.
Measuring the cells surfaced a sibling of break 6: the carried PEM is
an unsigned surface, and swapping it off an honest receipt used to
drop the receipt. Now `carried-key-mismatch`, a warning, and the
receipt stays attested (`c263834`). Text: -05 step 4 table +
issuer-root rule.

### 3. Rail Extract construction - fixed

"The member names of that body are the rail's to define" contradicted
Table 8. One runtime schema now sits behind signing, verification and
the refusal channel (`00a791b`); Table 8 names are normative, added
members are free, and -05 carries the full signed body shape in JSON
terms, taken from the implementation.

### 4. Issuer order, chainHeadHash, zero checkpoints - fixed

"Issuer order" defined as the prevReceiptHash chain order; the
verifier rebuilds the chain from links and a shuffled presentation
yields a byte-identical finding set (`e5ebe22`). `chainHeadHash` binds
to the chain's last in-window link. Zero-checkpoint and open-epoch
behaviour measured (fail-closed window-coverage findings) and written
into -05 as measured; the false "nothing else feeds another step"
sentence replaced by the maintained dependency list.

### 5. Window boundary vs two honest clocks - fixed

A design gap, not a text gap: both honest verifiers reached the same
false finding at the boundary. Probes locked the failure (`5735c62`),
then the decision landed (`c263834`): ref binding governs membership
first, and an unmatched item within the extract-declared `clockSkewMs`
of the edge is `boundary-deferred`, resolving against the adjacent
window and hardening when that window arrives without it.
MUST-T10-17.

### 6. Appendable countersignature fails an honest audit - fixed

The sharpest point on the list, and the mirror of MUST-T8-9's own
lesson. Attack named red (`e6c76f6`), then fixed (`b630e83`): an
unattributable countersignature is discarded as approval evidence
with a warning, `countersign-missing` stays open under a pin, and the
verdict on the untouched issuer receipt cannot be moved by anything
appended beside it. Measured from both directions in the gate: the
pre-repair tree flipped ok=true to false on a junk blob; the repaired
tree holds the finding set byte-identical.

### 7. Counterparty binding - fixed

A manifest by A, a receipt paying B, and a matching extract row all
passed. Probes locked it (`5735c62`), then two optional bindings and
one scope statement landed (`c263834`): manifest `payee` compared
under MUST-T8-9's two branches, settlement-record `beneficiary`
compared against the receipt payee, and `counterparty-unbound`
reported when neither is present - a scope record, not an accusation.

### 8. Delivery hash bound to nothing - fixed

Optional `deliveredHash` (claim -70402) in the countersignature
payload binds the delivered bytes to the exact issuer receipt bytes
under the payee key; the acceptanceCriteriaHash comparison is
signed-to-signed (`delivery-mismatch`, MAY-T8-11), and the
Introduction's delivery question is conditioned on that evidence
(`c263834`; -05 text).

### Question: whose assertion is "allowed by policy"

The Receipt Issuer's signed assertion; the Decision Token is consumed
at the gate and the audit never sees it. -05 states the boundary in
those terms and names a receipt-to-token binding as a possible
extension rather than smuggling it in.

### Mechanical

Table 3's hash grammar (64 lowercase hex) moved into signers and
validators, named per claim (`cbcee11`, `2601b34`); the -04 Appendix A
receipt vector that violated it is registered as the counted split
V-T4-appendix-a-policy-hash and -05 regenerates the vector with a
computed digest. MAY-T8-9 renumbered MAY-T8-10. The lone-surrogate
escape permission removed: encoder refuses by name, verify surfaces
report rather than throw (`d58594b`, `09959af`), and a guard scans
the tree's vectors and fixtures for lone surrogates before the rule
can move again.

## Round 5 - accounting rules from a neighbouring draft, 2026-09-01

Not a reading of this code by an outside reviewer. The rules are the outside
part: draft-abak-agent-control-delivery-evidence-00 defines per-instruction
dispositions, a selection requirement, two population-conservation identities,
and conditions on any aggregate result. Its author asked for a mapping from this
profile's finding codes onto that vocabulary. Writing the mapping ran his rules
over this reconciler, and two of them did not pass.

The mapping and the checks are one runnable file. It is pinned here rather than
copied into this tree, so the bytes he holds and the bytes described here cannot
drift apart: `cedulon-abak-population-probe.mjs`, SHA-256
`84763271fafe050daf6277d398885685cb75216b6cf4d0ac65afc67d52e4c083`. It resolves
`@cedulon/*@0.8.0` from npm and needs no clone.

### 1. One exclusion is published and the other is not - open

Section 6.3 requires that records excluded before population construction be
reported with the exclusion rule and count, or the completeness claim is not
reproducible.

Two rows can leave a window's accounting here. A settlement left unmatched
inside the opening clock-skew boundary is reported as `boundary-deferred`, and
the warning names both the row and the rule, so the receiver-record side stays
reconstructible. A receipt left unmatched inside the closing boundary, whose ref
appears in `nextExtract`, is dropped with no finding and no warning (the
`nextRefs` branch in `packages/audit/src/index.ts`), and the summary is `audit:
balanced`. A reader holding that report cannot tell whether the issuer
population held one instruction or none.

The behaviour is right in both cases: the row belongs to the neighbouring
window, and charging it here would be a false positive. The probe runs a control
for each - move the settlement away from the boundary, or give the receipt a
next window that does not name its ref, and both harden into findings - so
neither is a row that was never counted in the first place. What is wrong is
only that the exclusion on the instruction side is unreportable, and that is the
side the completeness claim is about.

### 2. A receipt that positively did not settle receives no class - open

An `aborted` receipt is correct to have no row on the extract, and the audit
returns `balanced` with no finding. It is also absent from the report
altogether, so nothing distinguishes a window holding one refused spend from a
window holding none. Section 6.1's EXPLICIT_FAILURE exists to keep exactly that
visible.

### What would close both

The report publishes findings and an aggregate; it does not publish class
counts. Section 6.4's last requirement is the one it does not meet, and the two
findings above are that single gap seen from two sides. Closing it means
`AuditReport` carrying counts it already computes - how many rows were matched,
deferred, carried into the next window, unmatched, and refused - rather than any
new check.

### What the mapping showed about the codes themselves

Of the 49 codes `@cedulon/audit` exports, 18 speak to an instruction, 5 to a
record, and 1 names an exclusion. The remaining 25 are not dispositions at all:
they say the declared population does not stand, or the evidence does not, or
they belong to the transparency or terms layer. The codes are also many-to-one
against instructions - one malformed receipt emits seven of them, one twice,
across five layers - so a disposition mapping needs a precedence rule and a
record of what it discarded, which is what Section 6.2 already asks for.
