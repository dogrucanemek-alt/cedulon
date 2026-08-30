import { sign } from "node:crypto";

/**
 * Process-local signing. The first implementation is a PEM pair; a KMS
 * adapter would satisfy the same shape without teaching every caller a
 * new key type. The state file still stores PEM — encryption is a later
 * step, not this one.
 */
export type Signer = {
  readonly publicKeyPem: string;
  sign(payload: Uint8Array): Uint8Array;
};

export function pemSigner(privateKeyPem: string, publicKeyPem: string): Signer {
  return {
    publicKeyPem,
    sign(payload: Uint8Array): Uint8Array {
      return new Uint8Array(sign(null, Buffer.from(payload), privateKeyPem));
    },
  };
}

export function asSigner(key: string | Signer, publicKeyPem?: string): Signer {
  if (typeof key !== "string") {
    return key;
  }
  if (typeof publicKeyPem !== "string") {
    throw new Error("signer-public-key");
  }
  return pemSigner(key, publicKeyPem);
}
