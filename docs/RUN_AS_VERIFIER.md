# Run as a verifier

You do not have to trust the authors. On a clean machine, clone this
repository and run the commands below. Wall time is under ten minutes
when Node.js 22+ and npm 10+ are already installed.

Cedulon never talks to a network rail. All keys are fixtures.

## 1. Clone and install

```bash
git clone <path-to-this-repo> cedulon
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

Expect: `tsc` silent, **81** tests passing. The suite includes red-then-green
cases for COSE tamper, checkpoint equivocation, field-level settlement
matching, window coverage, signed extracts, and each audit finding.

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
```

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
missing	audit: 1 settlement without receipt → FAIL
amount	audit: 1 finding(s) → FAIL
null-ref	audit: 1 finding(s) → FAIL
head	audit: 1 finding(s) → FAIL
```

`amount` names `settlement-mismatch`. `null-ref` names
`settled-without-ref`. `head` names `checkpoint-head-mismatch`.

## 5. Older demos (still required)

```bash
npm run demo
npm run tamper
```

`demo` prints a 3-allow / 97-block runaway with verified receipts.
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
The guarantee is unconditional only when the rail extract is
authenticated.
