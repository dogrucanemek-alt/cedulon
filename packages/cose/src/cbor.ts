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

function compareEncodedKeys(a: Buffer, b: Buffer): number {
  if (a.length !== b.length) {
    return a.length - b.length;
  }
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) {
      return a[i] - b[i];
    }
  }
  return 0;
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

export function decodeCbor(bytes: Uint8Array): CborVal {
  const r = { bytes: Buffer.from(bytes), offset: 0 };
  const value = readVal(r);
  if (r.offset !== r.bytes.length) {
    throw new Error("cbor-trailing");
  }
  return value;
}

function readVal(r: { bytes: Buffer; offset: number }): CborVal {
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
  const n = readLength(r, ai);
  if (major === MT_UINT) return n;
  if (major === MT_NINT) return -1 - n;
  if (major === MT_BSTR) {
    const slice = r.bytes.subarray(r.offset, r.offset + n);
    r.offset += n;
    return new Uint8Array(slice);
  }
  if (major === MT_TSTR) {
    const slice = r.bytes.subarray(r.offset, r.offset + n);
    r.offset += n;
    return slice.toString("utf8");
  }
  if (major === MT_ARRAY) {
    const arr: CborVal[] = [];
    for (let i = 0; i < n; i += 1) {
      arr.push(readVal(r));
    }
    return arr;
  }
  if (major === MT_MAP) {
    const entries: Array<[CborVal, CborVal]> = [];
    for (let i = 0; i < n; i += 1) {
      entries.push([readVal(r), readVal(r)]);
    }
    return cborMap(entries);
  }
  throw new Error("cbor-unsupported");
}

function readLength(r: { bytes: Buffer; offset: number }, ai: number): number {
  if (ai < 24) return ai;
  if (ai === 24) {
    const v = r.bytes[r.offset];
    r.offset += 1;
    return v;
  }
  if (ai === 25) {
    const v = r.bytes.readUInt16BE(r.offset);
    r.offset += 2;
    return v;
  }
  if (ai === 26) {
    const v = r.bytes.readUInt32BE(r.offset);
    r.offset += 4;
    return v;
  }
  if (ai === 27) {
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
  return Uint8Array.from(Buffer.from(hex, "hex"));
}
