# `@cedulon/audit`

Compare a rail extract to the receipt chain and checkpoints. A settlement
without a receipt is a finding.

```ts
import { audit } from "@cedulon/audit";

const report = audit({ receipts, checkpoints, settlements });
// report.summary is "audit: balanced" or lists findings
```

An unmatched receipt or row within the clock-skew allowance of a window
edge, which no presented adjacent extract resolves or hardens, is
reported as `boundary-deferred` rather than charged, and the warning's
`needs` says which document would resolve it: the previous or following
window's extract, or a receipt that names the row's ref.

```ts
import { auditWindows } from "@cedulon/audit";

const run = auditWindows({ windows: [w0, w1, w2], trust, issuerTrust });
// run.windows: each window's own report; run.findings: what the run adds
```

`auditWindows` audits consecutive windows as one run. Each window sees its
neighbours' extracts and is anchored on the last checkpoint the previous
window's audit attested. In the run's own findings, a row deferred at an
inner edge either resolves, when the adjacent window carried a receipt for
its ref, or becomes `settlement-without-receipt`, and only deferrals at the
run's two outer edges leave the run conditional; each window's own report
is returned as that window's audit made it. The rail pin, like the issuer
pin, takes one key or a list of keys.

```ts
import { checkPresentedForm, presentedInRange } from "@cedulon/audit";

checkPresentedForm(bundle);                       // [] or { object, member, problem }[]
presentedInRange(input, report, fromMs, toMs);    // what was presented in [fromMs, toMs)
```

`checkPresentedForm` reads a bundle against the presented form the core
draft fixes (section "The presented form") before an audit: missing and unlisted
members, hex and base64 spelling, encoding, claims against the COSE
octets, and the decoder floor. It does not verify signatures.

Repository: https://github.com/dogrucanemek-alt/cedulon
