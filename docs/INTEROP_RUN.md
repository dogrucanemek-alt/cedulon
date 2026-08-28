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
