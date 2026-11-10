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
  statementHash, // SHA-256(statement); COSE label 1 (signed)
  index,         // COSE label 2 (signed)
  treeHead,      // COSE label 3 (signed)
  treeSize,      // COSE label 4 (signed); unsigned copy must match
  alg: "rfc9162-sha256", // COSE label 5 (signed); unsigned copy must match
  leafHash,      // HASH(0x00 || statement); beside the COSE; compared when present
  inclusionProof: { leafIndex, siblings, alg: "rfc9162-sha256", treeSize },
  issuerPublicKeyPem,
  coseHex,
}
```

The log-signed payload is the five-entry map above. `leafHash` is not
signed; when present it is recomputed from the candidate and compared.
The inclusion proof's `alg` and `treeSize` must equal the signed values.
A proof with `treeSize` greater than `2^32 - 1` is refused.
`applyInclusionProof` throws `inclusion-proof` for an RFC 9162 proof
(that helper is the legacy pad-even walk). Verifiers at 0.17.0 and
earlier do not verify a five-entry receipt.

```ts
import { verifyInclusion, verifyInclusionDetailed } from "@cedulon/checkpoint";

const ok: boolean = verifyInclusion(receipt, candidateHex, witnessKey);
const detailed = verifyInclusionDetailed(receipt, candidateHex, witnessKey);
// { ok: boolean, legacyTree: boolean }
```

`verifyInclusion` stays a boolean. Call `verifyInclusionDetailed` when
you need `legacyTree`. `legacyTree` is true when the signed payload is
the three-entry (-00) map and that walk was selected; false when the
payload is five-entry or cannot be read. A three-entry receipt must
omit unsigned `alg` and `treeSize`. An unknown `alg` is refused.

Repository: https://github.com/dogrucanemek-alt/cedulon
