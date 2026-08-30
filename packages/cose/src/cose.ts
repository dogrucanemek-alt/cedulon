import { createHash, createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import { asArray, asMap, cborMap, decodeCbor, encodeCbor, hexToBytes, mapGet, namedDecodeRefusal } from "./cbor.ts";

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
export const CTY_COUNTERSIGN = "application/cedulon-countersign+cbor";

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

/**
 * The same key can be written as PEM or as bare base64 SPKI, and PEM itself
 * tolerates different line widths. Comparing the DER bytes asks whether two
 * spellings name the same key; comparing the text asks whether they were typed
 * the same way. Returns null when the input is not a public key at all, which a
 * caller has to tell apart from a key that simply does not match.
 */
export function toSpkiDer(key: string): Buffer | null {
  const trimmed = key.trim();
  const attempt = trimmed.includes("-----BEGIN")
    ? { key: trimmed, format: "pem" as const }
    : {
        key: Buffer.from(trimmed.replace(/\s+/g, ""), "base64"),
        format: "der" as const,
        type: "spki" as const,
      };
  try {
    return createPublicKey(attempt as Parameters<typeof createPublicKey>[0]).export({
      type: "spki",
      format: "der",
    });
  } catch {
    return null;
  }
}

/** True only when both spellings resolve to the same public key. */
export function sameSpkiKey(a: string, b: string): boolean {
  const left = toSpkiDer(a);
  const right = toSpkiDer(b);
  return left !== null && right !== null && left.equals(right);
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

/**
 * Why a set of COSE bytes could not be read, when the answer is a bound this
 * profile names rather than a signature verdict (MUST-T4-18, MUST-T4-19).
 * Returns null when the bytes decode - a false from verifyCoseSign1 then means
 * what it says, that the signature did not verify.
 *
 * This is a separate question on purpose. An earlier repair made
 * verifyCoseSign1 rethrow the named refusals so a caller could report them,
 * which put every caller one forgotten try/catch away from turning a refused
 * input into an uncaught exception - the crash MUST-T4-19 forbids, moved one
 * level up. Four callers were wrapped, five were missed, and a 65KB checkpoint
 * took a whole audit down. Verification now answers false for anything it
 * cannot read, which is fail-closed on its own, and a caller that wants to name
 * the reason asks for it here. Forgetting to ask costs a less specific message;
 * it cannot cost a crash.
 */
export function coseDecodeRefusal(bytes: Uint8Array): string | null {
  try {
    const msg = decodeCoseSign1(bytes);
    decodeProtectedHeader(msg.protectedHeader);
    // The payload is CBOR in every object this profile defines; a bound hit
    // while reading it is the same class of refusal as one hit above it.
    decodeCbor(msg.payload);
    return null;
  } catch (err) {
    return namedDecodeRefusal(err);
  }
}

/** The same question for the hex encoding these objects travel as. */
export function coseDecodeRefusalHex(coseHex: string | undefined | null): string | null {
  if (!coseHex) {
    return null;
  }
  try {
    return coseDecodeRefusal(hexToBytes(coseHex));
  } catch {
    // Not even hex. Whatever it is, it is not a bound this profile names.
    return null;
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
