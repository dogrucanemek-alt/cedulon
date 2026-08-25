# `@cedulon/x402-adapter`

HTTP 402 adapter and a mock rail ledger. `gatedSettle` is the only path
that may issue a receipt.

```ts
import { gatedSettle } from "@cedulon/x402-adapter";

const result = gatedSettle(engine, input, keys, nowMs);
```

Repository: https://github.com/dogrucanemek-alt/cedulon
