# `@cedulon/core`

Fail-closed spend policy and Decision Tokens. A missing or throwing engine
denies.

```ts
import { PolicyEngine } from "@cedulon/core";

const engine = new PolicyEngine({
  maxAmount: 10n, maxCumulative: 30n, maxPayments: 3, windowMs: 3_600_000,
});
const decision = engine.evaluate({
  amount: 1n, currency: "USD", payee: "payee-1", nonce: "n1", nowMs: Date.now(),
});
```

Repository: https://github.com/dogrucanemek-alt/cedulon
