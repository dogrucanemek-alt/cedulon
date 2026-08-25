import { createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import { asArray, cborMap, decodeCbor, encodeCbor } from "./cbor.ts";

/** COSE alg EdDSA (RFC 9052). */
export const COSE_ALG_EDDSA = -8;
/** COSE header label alg. */
export const COSE_HDR_ALG = 1;

export type CoseSign1 = {
  protectedHeader: Uint8Array;
  unprotected: Record<string, never>;
  payload: Uint8Array;
  signature: Uint8Array;
};

export function encodeProtectedHeader(alg: number = COSE_ALG_EDDSA): Uint8Array {
  return encodeCbor(cborMap([[COSE_HDR_ALG, alg]]));
}

export function sigStructure(protectedHeader: Uint8Array, payload: Uint8Array): Uint8Array {
  return encodeCbor(["Signature1", protectedHeader, new Uint8Array(0), payload]);
}

export function signCoseSign1(payload: Uint8Array, privateKeyPem: string): Uint8Array {
  const protectedHeader = encodeProtectedHeader();
  const toBeSigned = sigStructure(protectedHeader, payload);
  const signature = sign(null, Buffer.from(toBeSigned), privateKeyPem);
  return encodeCoseSign1({
    protectedHeader,
    unprotected: {},
    payload,
    signature: new Uint8Array(signature),
  });
}

export function encodeCoseSign1(msg: CoseSign1): Uint8Array {
  return encodeCbor([
    msg.protectedHeader,
    cborMap([]),
    msg.payload,
    msg.signature,
  ]);
}

export function decodeCoseSign1(bytes: Uint8Array): CoseSign1 {
  const arr = asArray(decodeCbor(bytes));
  if (arr.length !== 4) {
    throw new Error("cose-sign1-length");
  }
  if (!(arr[0] instanceof Uint8Array) || !(arr[2] instanceof Uint8Array) || !(arr[3] instanceof Uint8Array)) {
    throw new Error("cose-sign1-types");
  }
  return {
    protectedHeader: arr[0],
    unprotected: {},
    payload: arr[2],
    signature: arr[3],
  };
}

export function verifyCoseSign1(bytes: Uint8Array, publicKeyPem: string): boolean {
  try {
    const msg = decodeCoseSign1(bytes);
    const toBeSigned = sigStructure(msg.protectedHeader, msg.payload);
    return verify(null, Buffer.from(toBeSigned), publicKeyPem, Buffer.from(msg.signature));
  } catch {
    return false;
  }
}

export { bytesToHex as coseToHex, hexToBytes as coseFromHex } from "./cbor.ts";

/** RFC 8032 Ed25519 secret #1 — fixture only, never a production key. */
export const FIXTURE_ED25519_SEED_HEX =
  "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60";

export function fixtureEd25519Pems(): { publicKeyPem: string; privateKeyPem: string } {
  const seed = Buffer.from(FIXTURE_ED25519_SEED_HEX, "hex");
  const pkcs8 = Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), seed]);
  const privateKey = createPrivateKey({ key: pkcs8, format: "der", type: "pkcs8" });
  const publicKey = createPublicKey(privateKey);
  return {
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
  };
}

