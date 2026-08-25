# `@cedulon/receipts`

Signed spend receipts. Default encoding is COSE_Sign1.

```ts
import { generateReceiptKeys, signReceipt, verifyReceipt } from "@cedulon/receipts";

const keys = generateReceiptKeys();
const receipt = signReceipt(claims, keys.privateKeyPem, keys.publicKeyPem);
verifyReceipt(receipt);
```

Repository: https://github.com/dogrucanemek-alt/cedulon
