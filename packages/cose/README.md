# `@cedulon/cose`

Deterministic CBOR and COSE_Sign1 (Ed25519). Cedulon receipts, manifests,
checkpoints, and decision tokens share this encoder.

```ts
import { signCoseSign1, verifyCoseSign1, CTY_RECEIPT } from "@cedulon/cose";

const cose = signCoseSign1(payload, privateKeyPem, CTY_RECEIPT);
verifyCoseSign1(cose, publicKeyPem, CTY_RECEIPT);
```

Repository: https://github.com/dogrucanemek-alt/cedulon
