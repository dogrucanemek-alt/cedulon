# `@cedulon/checkpoint`

Epoch checkpoints (totals, chain head, previous hash) and an in-process
transparency log stub.

```ts
import { buildCheckpointClaims, signCheckpoint } from "@cedulon/checkpoint";

const claims = buildCheckpointClaims(1, receipts, startMs, endMs, null);
const checkpoint = signCheckpoint(claims, privateKeyPem, publicKeyPem);
```

Repository: https://github.com/dogrucanemek-alt/cedulon
