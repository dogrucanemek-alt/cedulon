# Interop run

Pin: check out the commit SHA you were mailed. This file travels inside
it, so if you are reading this from a checkout of that SHA you have the
right one. The SHA is not written here on purpose: a commit cannot name
itself, and every attempt leaves a pointer that goes stale the moment
the next commit lands or history is rewritten. Both sides quote the SHA
in the thread instead, where it is timestamped and cannot drift.

This is a clean-clone run for an independent implementer. It is not the
general verifier walkthrough; that is `docs/RUN_AS_VERIFIER.md`.

OS: written on Windows. Nicholas ran on macOS arm64 (Node 22.22.3,
lockfile). Iman ran on Linux. The commands below are the same on all
three if you use `npm ci` and Node 22. Shell differences: Unix `export`
vs PowerShell `$env:NAME = "..."`. Paths in this file use `/`.

Require:

- Node.js 22.x (22.22.3 is the version one runner already used)
- npm 10+
- the lockfile (`npm ci`, not a bare `npm install` that floats)

Do not restate the suite size. The runner prints its own totals.

## 1. Clean clone

```bash
git clone https://github.com/dogrucanemek-alt/cedulon
cd cedulon
git checkout PIN
npm ci
```

`cbor-x` is a test-only decoder. If the installer mentions `cbor-extract`,
leave its install script blocked. The suite uses the JavaScript path.

## 2. Typecheck (before the package build)

```bash
npx tsc --noEmit
```

```
```

`tsc` is silent. This is `npm run build` in this repository. A non-empty
stdout is a failure.

## 3. Tests

```bash
npm run test:all
```

Expect: exit 0, zero failed tests. The runner prints the count; this file
does not. This step is not replayed from inside `test:all` (that would
recurse). An outside runner executes it once, from a clean clone.

## 4. Completeness demo

```bash
npm run audit
```

```
audit: balanced
receipts=2
findings=0
guarantee=conditional
warn	unauthenticated-extract	rail extract is unsigned; completeness guarantee is conditional
warn	unauthenticated-issuer	no verifier-supplied issuer key; receipt and checkpoint signatures prove internal consistency, not that the named issuer produced them. Without one there is no way to tell a receipt from this issuer apart from any other, so every receipt submitted is weighed as one set and the completeness guarantee is conditional
```

The warnings are the point: a balance without a pinned extract and a pinned
issuer key is conditional. Exit 0.

## 5. Four bypasses, all FAIL

```bash
npm run demo:bypass
```

```
audit: 1 settlement without receipt → FAIL
```

Exit non-zero.

```bash
npm run demo:bypasses
```

```
missing	audit: 1 settlement without receipt → FAIL	guarantee=conditional
amount	audit: 1 finding(s) → FAIL	guarantee=conditional
null-ref	audit: 1 finding(s) → FAIL	guarantee=conditional
head	audit: 1 finding(s) → FAIL	guarantee=conditional
```

Exit 0 only when every bypass is caught.

## 6. Handshake the released server (network)

Optional. Needs npm. Sends `initialize` over stdio and expects the
released package to answer. This is not run from the in-repo suite.

```bash
# optional
npx -y @cedulon/mcp-server
```

```
(stdio JSON-RPC; send initialize, expect result.serverInfo.name = cedulon and result.serverInfo.version matching the installed package)
```

A local equivalent, offline, is `npm run mcp` against this tree; the
suite already handshakes that path.

## 7. Live extract (network, optional)

Needs `CEDULON_RPC_URL` and a Base Sepolia address with USDC activity.
Read-only. Not required for an interop report.

```bash
# optional
npm run demo:live
```

```
(usage line unless --address --from --to and CEDULON_RPC_URL are set; against an account whose receipts you do not hold, every settlement is settlement-without-receipt and guarantee=conditional)
```

## What this run proves

- The tree typechecks before packages are built.
- The suite is green.
- The audit names `guarantee=` on the passing path.
- The four bypass kinds fail.
- The published MCP server still answers `initialize` (if you ran §6).

## Runs by other people

The sections above are the clean-clone procedure. This section records runs that
other people actually performed, and states what each one does and does not
establish. A run is listed here only with the runner's consent and in the terms
they set.

### Vectors, independent stack — Tiago Pinto, 30–31 August 2026

Tiago Pinto (independent author and researcher, verifiable trust and AI
governance, <https://donttrustverify.pt>) ran the Appendix A vectors of
draft-dogru-cedulon-04 in his own Python environment, before reading the draft
for failure points, and against the IETF archive bytes rather than any copy from
this repository.

His environment line, the archive digests he ran against, and the digest of the
vector he rebuilt are recorded once, in the Implementation Status of the living
draft under `spec/`. They are not repeated here: two hand-kept copies of one
digest is one copy that goes stale, and the copy nobody posts is always that
one. A test in `tests/interop-run.test.ts` fails if any of them reappears in
this file.

Result reported: both Ed25519 signatures verify, the SPKI-derived kid is the one
Appendix A carries, and deterministic re-encoding reproduces both protected
headers and payloads byte for byte.

He then rebuilt the regenerated receipt vector **from the -05 text alone**, in
the same Python environment and against the archive bytes: protected header from
the profile rules, claim map with the policyHash computed as the SHA-256 of the
UTF-8 octets of `cedulon/appendix-policy`, deterministic CBOR, signed with the
RFC 8032 fixture key. The result is byte-identical to the published vector. Both
published signatures verify, and neither object is tag-wrapped.

**What this establishes, in the runner's own terms.** Consent to record it was
given as follows, and the scope limit is his, not ours:

> Yes, you have my consent to record the -04 vector run as the first independent
> run of those vectors outside the codebase, **not as an independent
> implementation**.

So: the published vectors are reproducible on a materially different stack, by
someone who did not run this code, from the archive bytes. That is what it says.
It is not evidence that the draft is sufficient to build a verifier from — that
question is open, and is the next contribution kind this file has no row for.

### Clean-clone suite runs

- Nicholas — macOS arm64, Node 22.22.3, lockfile.
- Iman — Linux.

These are runs of the procedure in §1–§5 above, from a clean clone of this
repository. They establish that the tree builds and the suite is green off a
fresh checkout on a host that is not the author's. They do not establish
anything about the text, because the text is not their input.

### Not yet recorded

An **independent implementation with independent vectors** — a verifier written
from the posted text, without reading this codebase, its repair commits or its
test suite. Tiago Pinto has said he is willing to attempt this against -05, with
the qualification that he has already seen parts of the public repository and
repository metadata during the -04 review, so it would not be a clean-room
implementation in the absolute sense. His stated method is to freeze his
implementation and his first-failure record before comparing either with the
codebase.

Until such a run exists, this file should not claim that the specification is
implementable from the text alone. Nothing above tests that.
