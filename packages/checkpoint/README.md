# `@cedulon/checkpoint`

Epoch checkpoints (totals, chain head, previous hash) and an in-process
transparency log stub.

```ts
import { buildCheckpointClaims, signCheckpoint } from "@cedulon/checkpoint";

const claims = buildCheckpointClaims(1, receipts, startMs, endMs, null);
const checkpoint = signCheckpoint(claims, privateKeyPem, publicKeyPem);
```

## Inclusion receipts

New receipts from `MemoryTransparencyService.register` use the RFC 9162
Merkle Tree Hash (Section 2.1): leaf `HASH(0x00 || entry)`, interior
node `HASH(0x01 || left || right)`. A new receipt carries:

```ts
{
  statementHash, // SHA-256(statement); COSE label 1
  index,         // COSE label 2
  treeHead,      // COSE label 3
  alg: "rfc9162-sha256", // beside the COSE; not signed
  treeSize,              // beside the COSE; not signed
  leafHash,              // HASH(0x00 || statement); beside the COSE; not signed
  inclusionProof: { leafIndex, siblings, alg: "rfc9162-sha256", treeSize },
  issuerPublicKeyPem,
  coseHex,
}
```

`alg`, `treeSize`, and `leafHash` are not inside the log-signed payload.
The signed fields are `statementHash`, `index`, and `treeHead`, and
verification is against that signed root. A proof with `treeSize`
greater than `2^32 - 1` is refused.

```ts
import { verifyInclusion, verifyInclusionDetailed } from "@cedulon/checkpoint";

const ok: boolean = verifyInclusion(receipt, candidateHex, witnessKey);
const detailed = verifyInclusionDetailed(receipt, candidateHex, witnessKey);
// { ok: boolean, legacyTree: boolean }
```

`verifyInclusion` stays a boolean. Call `verifyInclusionDetailed` when
you need `legacyTree`. A receipt that omits `alg` uses the older
domain-separation-free walk; a verifying legacy receipt returns
`legacyTree: true`. An unknown `alg` is refused.

Repository: https://github.com/dogrucanemek-alt/cedulon
