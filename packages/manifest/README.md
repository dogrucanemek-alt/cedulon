# `@cedulon/manifest`

Signed trade manifests issued before payment.

```ts
import { signManifest, verifyManifest } from "@cedulon/manifest";

const signed = signManifest(body, privateKeyPem, publicKeyPem);
verifyManifest(signed);
```

Repository: https://github.com/dogrucanemek-alt/cedulon
