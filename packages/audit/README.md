# `@cedulon/audit`

Compare a rail extract to the receipt chain and checkpoints. A settlement
without a receipt is a finding.

```ts
import { audit } from "@cedulon/audit";

const report = audit({ receipts, checkpoints, settlements });
// report.summary is "audit: balanced" or lists findings
```

Repository: https://github.com/dogrucanemek-alt/cedulon
