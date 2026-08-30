/** Deterministic CBOR (RFC 8949 §4.2.1) for Cedulon claim types. Zero deps. */

export type CborVal =
  | null
  | boolean
  | number
  | string
  | Uint8Array
  | CborVal[]
  | CborMap;

export type CborMap = { readonly $map: Array<[CborVal, CborVal]> };

export function cborMap(entries: Array<[CborVal, CborVal]>): CborMap {
  return { $map: entries };
}

export function isCborMap(value: CborVal): value is CborMap {
  return typeof value === "object" && value !== null && !Array.isArray(value) && !ArrayBuffer.isView(value) && "$map" in value;
}

const MT_UINT = 0;
const MT_NINT = 1;
const MT_BSTR = 2;
const MT_TSTR = 3;
const MT_ARRAY = 4;
const MT_MAP = 5;

export function encodeCbor(value: CborVal): Uint8Array {
  return Buffer.concat(encodeParts(value));
}

function encodeParts(value: CborVal): Buffer[] {
  if (value === null) {
    return [Buffer.from([0xf6])];
  }
  if (typeof value === "boolean") {
    return [Buffer.from([value ? 0xf5 : 0xf4])];
  }
  if (typeof value === "number") {
    if (!Number.isInteger(value) || !Number.isSafeInteger(value)) {
      throw new Error("cbor-non-integer");
    }
    return [encodeInt(value)];
  }
  if (typeof value === "string") {
    const utf8 = Buffer.from(value, "utf8");
    return [head(MT_TSTR, utf8.length), utf8];
  }
  if (value instanceof Uint8Array) {
    const bytes = Buffer.from(value);
    return [head(MT_BSTR, bytes.length), bytes];
  }
  if (isCborMap(value)) {
    const entries = value.$map.map(([k, v]) => {
      const key = Buffer.concat(encodeParts(k));
      const val = Buffer.concat(encodeParts(v));
      return { key, val };
    });
    entries.sort((a, b) => compareEncodedKeys(a.key, b.key));
    const parts: Buffer[] = [head(MT_MAP, entries.length)];
    for (const e of entries) {
      parts.push(e.key, e.val);
    }
    return parts;
  }
  const parts: Buffer[] = [head(MT_ARRAY, value.length)];
  for (const item of value) {
    parts.push(...encodeParts(item));
  }
  return parts;
}

/** RFC 8949 §4.2.1: bytewise lexicographic order of encoded keys. */
export function compareEncodedKeys(a: Buffer, b: Buffer): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    if (a[i] !== b[i]) {
      return a[i] - b[i];
    }
  }
  return a.length - b.length;
}

function encodeInt(n: number): Buffer {
  if (n >= 0) {
    return head(MT_UINT, n);
  }
  return head(MT_NINT, -1 - n);
}

function head(major: number, n: number): Buffer {
  const hi = major << 5;
  if (n < 24) {
    return Buffer.from([hi | n]);
  }
  if (n < 256) {
    return Buffer.from([hi | 24, n]);
  }
  if (n < 65536) {
    const b = Buffer.alloc(3);
    b[0] = hi | 25;
    b.writeUInt16BE(n, 1);
    return b;
  }
  if (n <= 0xffffffff) {
    const b = Buffer.alloc(5);
    b[0] = hi | 26;
    b.writeUInt32BE(n, 1);
    return b;
  }
  const b = Buffer.alloc(9);
  b[0] = hi | 27;
  b.writeBigUInt64BE(BigInt(n), 1);
  return b;
}

/** One signed object. The largest fixture COSE in this tree is a few hundred bytes. */
export const CBOR_MAX_BYTES = 65_536;
/** COSE_Sign1 is an array of four, header and claims are maps: depth 4 in honest use. */
export const CBOR_MAX_DEPTH = 16;
/** Arrays and maps. A receipt claim map has 12 keys. */
export const CBOR_MAX_ELEMENTS = 4_096;
/** Text and byte strings inside one value. */
export const CBOR_MAX_STRING = 16_384;

type Reader = { bytes: Buffer; offset: number };

function remaining(r: Reader): number {
  return r.bytes.length - r.offset;
}

export function decodeCbor(bytes: Uint8Array): CborVal {
  if (bytes.length > CBOR_MAX_BYTES) {
    throw new Error("cbor-too-large");
  }
  const r: Reader = { bytes: Buffer.from(bytes), offset: 0 };
  const value = readVal(r, 0);
  if (r.offset !== r.bytes.length) {
    throw new Error("cbor-trailing");
  }
  return value;
}

function readVal(r: Reader, depth: number): CborVal {
  if (depth > CBOR_MAX_DEPTH) {
    throw new Error("cbor-too-deep");
  }
  const ib = r.bytes[r.offset];
  if (ib === undefined) {
    throw new Error("cbor-eof");
  }
  r.offset += 1;
  const major = ib >> 5;
  const ai = ib & 31;
  if (ib === 0xf4) return false;
  if (ib === 0xf5) return true;
  if (ib === 0xf6) return null;
  // Major 6 is tags; major 7 is floats and unassigned simple values. Read the
  // length first and a 64-bit float's payload is treated as an integer, which
  // threw cbor-too-large. Reject the type before touching the payload.
  if (major > MT_MAP) {
    throw new Error("cbor-unsupported");
  }
  const n = readLength(r, ai);
  if (major === MT_UINT) return n;
  if (major === MT_NINT) return -1 - n;
  if (major === MT_BSTR || major === MT_TSTR) {
    if (n > CBOR_MAX_STRING) {
      throw new Error("cbor-too-large");
    }
    if (n > remaining(r)) {
      throw new Error("cbor-eof");
    }
    const slice = r.bytes.subarray(r.offset, r.offset + n);
    r.offset += n;
    return major === MT_TSTR ? slice.toString("utf8") : new Uint8Array(slice);
  }
  if (major === MT_ARRAY) {
    if (n > CBOR_MAX_ELEMENTS) {
      throw new Error("cbor-too-large");
    }
    if (n > remaining(r)) {
      throw new Error("cbor-eof");
    }
    const arr: CborVal[] = [];
    for (let i = 0; i < n; i += 1) {
      arr.push(readVal(r, depth + 1));
    }
    return arr;
  }
  if (n > CBOR_MAX_ELEMENTS) {
    throw new Error("cbor-too-large");
  }
  if (n * 2 > remaining(r)) {
    throw new Error("cbor-eof");
  }
  const entries: Array<[CborVal, CborVal]> = [];
  const seen = new Set<string>();
  for (let i = 0; i < n; i += 1) {
    const key = readVal(r, depth + 1);
    const val = readVal(r, depth + 1);
    const id = Buffer.from(encodeCbor(key)).toString("hex");
    if (seen.has(id)) {
      throw new Error("cbor-duplicate-key");
    }
    seen.add(id);
    entries.push([key, val]);
  }
  return cborMap(entries);
}

function readLength(r: Reader, ai: number): number {
  if (ai < 24) return ai;
  if (ai === 24) {
    if (remaining(r) < 1) throw new Error("cbor-eof");
    const v = r.bytes[r.offset];
    if (v === undefined) throw new Error("cbor-eof");
    r.offset += 1;
    return v;
  }
  if (ai === 25) {
    if (remaining(r) < 2) throw new Error("cbor-eof");
    const v = r.bytes.readUInt16BE(r.offset);
    r.offset += 2;
    return v;
  }
  if (ai === 26) {
    if (remaining(r) < 4) throw new Error("cbor-eof");
    const v = r.bytes.readUInt32BE(r.offset);
    r.offset += 4;
    return v;
  }
  if (ai === 27) {
    if (remaining(r) < 8) throw new Error("cbor-eof");
    const v = r.bytes.readBigUInt64BE(r.offset);
    r.offset += 8;
    if (v > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error("cbor-too-large");
    }
    return Number(v);
  }
  throw new Error("cbor-indefinite");
}

export function mapGet(map: CborMap, key: number | string): CborVal | undefined {
  for (const [k, v] of map.$map) {
    if (k === key) return v;
  }
  return undefined;
}

export function asMap(value: CborVal): CborMap {
  if (!isCborMap(value)) {
    throw new Error("cbor-not-map");
  }
  return value;
}

export function asArray(value: CborVal): CborVal[] {
  if (!Array.isArray(value)) {
    throw new Error("cbor-not-array");
  }
  return value;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("hex");
}

export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error("hex-odd");
  }
  if (hex !== hex.toLowerCase()) {
    throw new Error("hex-not-lowercase");
  }
  return Uint8Array.from(Buffer.from(hex, "hex"));
}

/**
 * The refusals MUST-T4-18 and MUST-T4-19 require to stay named. A decoder
 * bound that surfaces as "signature failed" has kept the bound and lost the
 * name, and an operator can no longer tell a limit from a forgery.
 */
export const NAMED_DECODE_REFUSALS: ReadonlySet<string> = new Set([
  "cbor-too-large",
  "cbor-too-deep",
  "cbor-duplicate-key",
]);

export function namedDecodeRefusal(err: unknown): string | null {
  const msg = err instanceof Error ? err.message : "";
  return NAMED_DECODE_REFUSALS.has(msg) ? msg : null;
}
