import { createHash, createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import { asArray, asMap, cborMap, decodeCbor, encodeCbor, mapGet } from "./cbor.ts";

/** RFC 9052 EdDSA. Deprecated for this profile; use Ed25519 (-19). */
export const COSE_ALG_EDDSA = -8;
/** Ed25519, RFC 9864. */
export const COSE_ALG_ED25519 = -19;
/** COSE header label alg. */
export const COSE_HDR_ALG = 1;
/** COSE header label content type. */
export const COSE_HDR_CONTENT_TYPE = 3;
/** COSE header label kid. */
export const COSE_HDR_KID = 4;

export const CTY_RECEIPT = "application/cedulon-receipt+cbor";
export const CTY_CHECKPOINT = "application/cedulon-checkpoint+cbor";
export const CTY_MANIFEST = "application/cedulon-manifest+cbor";
export const CTY_INCLUSION = "application/cedulon-inclusion+cbor";
export const CTY_DECISION = "application/cedulon-decision+cbor";

export type CoseSign1 = {
  protectedHeader: Uint8Array;
  unprotected: Record<string, never>;
  payload: Uint8Array;
  signature: Uint8Array;
};

export type ProtectedHeader = {
  alg: number;
  kid: Uint8Array;
  contentType: string;
};

export function kidFromPublicKeyPem(publicKeyPem: string): Uint8Array {
  const der = createPublicKey(publicKeyPem).export({ type: "spki", format: "der" });
  return new Uint8Array(createHash("sha256").update(der).digest().subarray(0, 8));
}

export function publicKeyPemFromPrivate(privateKeyPem: string): string {
  return createPublicKey(createPrivateKey(privateKeyPem))
    .export({ type: "spki", format: "pem" })
    .toString();
}

export function encodeProtectedHeader(header: ProtectedHeader): Uint8Array {
  return encodeCbor(
    cborMap([
      [COSE_HDR_ALG, header.alg],
      [COSE_HDR_CONTENT_TYPE, header.contentType],
      [COSE_HDR_KID, header.kid],
    ]),
  );
}

export function decodeProtectedHeader(bytes: Uint8Array): ProtectedHeader {
  const map = asMap(decodeCbor(bytes));
  const alg = mapGet(map, COSE_HDR_ALG);
  const contentType = mapGet(map, COSE_HDR_CONTENT_TYPE);
  const kid = mapGet(map, COSE_HDR_KID);
  if (typeof alg !== "number" || typeof contentType !== "string" || !(kid instanceof Uint8Array)) {
    throw new Error("cose-protected-header");
  }
  return { alg, contentType, kid };
}

export function sigStructure(protectedHeader: Uint8Array, payload: Uint8Array): Uint8Array {
  return encodeCbor(["Signature1", protectedHeader, new Uint8Array(0), payload]);
}

export function signCoseSign1(payload: Uint8Array, privateKeyPem: string, contentType: string): Uint8Array {
  const publicKeyPem = publicKeyPemFromPrivate(privateKeyPem);
  const protectedHeader = encodeProtectedHeader({
    alg: COSE_ALG_ED25519,
    kid: kidFromPublicKeyPem(publicKeyPem),
    contentType,
  });
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

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let d = 0;
  for (let i = 0; i < a.length; i += 1) {
    d |= a[i] ^ b[i];
  }
  return d === 0;
}

export function verifyCoseSign1(
  bytes: Uint8Array,
  publicKeyPem: string,
  expectedContentType?: string,
): boolean {
  try {
    const msg = decodeCoseSign1(bytes);
    const header = decodeProtectedHeader(msg.protectedHeader);
    if (header.alg !== COSE_ALG_ED25519) {
      return false;
    }
    if (!bytesEqual(header.kid, kidFromPublicKeyPem(publicKeyPem))) {
      return false;
    }
    if (expectedContentType && header.contentType !== expectedContentType) {
      return false;
    }
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
