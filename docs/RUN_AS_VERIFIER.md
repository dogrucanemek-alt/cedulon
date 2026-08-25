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

Expect: `tsc` silent, every test passing. The suite includes red-then-green
cases for COSE tamper, checkpoint equivocation, and each audit finding.

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

Bypass: the agent settles on the mock rail without a Spend Receipt.
Guardrails do not see it. Audit must (exit non-zero):

```bash
npm run demo:bypass
```

Expected stdout (exactly):

```
audit: 1 settlement without receipt → FAIL
```

## 4. Older demos (still required)

```bash
npm run demo
npm run tamper
```

`demo` prints a 3-allow / 97-block runaway with verified receipts.
`tamper` must exit non-zero and print `tamper detected`.

`npm run demo:unguarded` is the old hole: 100 allows and no completeness
check. Prefer `demo:bypass` to see that hole closed at audit time.

## 5. What you just proved

- A receipt whose COSE bytes were flipped does not verify.
- Two different checkpoints for one epoch are equivocation.
- A rail settlement with no receipt fails the audit and names the gap.
- A clean pair of receipts, settlements, and a checkpoint exits 0.

That is completeness: missing evidence is itself evidence.
