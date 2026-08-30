import { TEST_HASH } from "./hash-fixtures.ts";
import { strict as assert } from "node:assert";
import { decode as decodeCborX } from "cbor-x";
import { describe, it } from "node:test";

import {
  cborMap,
  decodeCbor,
  decodeCoseSign1,
  encodeCbor,
  isCborMap,
  type CborVal,
} from "@cedulon/cose";
import {
  claimsFromCbor,
  claimsToCbor,
  generateReceiptKeys,
  signReceipt,
  verifyReceipt,
  type SpendReceiptClaims,
} from "@cedulon/receipts";
import {
  generateManifestKeys,
  manifestFromCbor,
  manifestToCbor,
  signManifest,
  verifyManifest,
} from "@cedulon/manifest";
import {
  checkpointFromCbor,
  checkpointToCbor,
  signCheckpoint,
  verifyCheckpoint,
  type CheckpointClaims,
} from "@cedulon/checkpoint";
import { signRailExtract, verifyRailExtract } from "@cedulon/x402-adapter";

/** Written down so a finding can be replayed. */
const SEED = 20260829;

const CLAIMS: SpendReceiptClaims = {
  payer: "payer-1",
  payee: "payee-1",
  amount: "1",
  currency: "USD",
  policyHash: TEST_HASH,
  manifestHash: null,
  noManifest: true,
  x402PaymentRef: null,
  timestampMs: 1_700_000_000_000,
  nonce: "n1".padEnd(16, "0"),
  prevReceiptHash: null,
  outcome: "aborted",
};

const MANIFEST = {
  description: "fuzz-goods",
  amount: "1",
  currency: "USD",
  acceptanceCriteriaHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  cancelCondition: "none",
  expiresAtMs: 1_700_000_000_000,
};

const CHECKPOINT: CheckpointClaims = {
  epoch: 1,
  startMs: 1_700_000_000_000,
  endMs: 1_700_003_600_000,
  receiptCount: 1,
  chainHeadHash: TEST_HASH,
  totals: { USD: "1" },
  prevCheckpointHash: null,
};

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mutate(src: Uint8Array, rand: () => number, i: number): Uint8Array {
  const out = Uint8Array.from(src);
  const kind = i % 5;
  if (out.length === 0) return Uint8Array.of(0xff);
  if (kind === 0) {
    out[Math.floor(rand() * out.length)] ^= 1 + Math.floor(rand() * 255);
    return out;
  }
  if (kind === 1) {
    return out.subarray(0, Math.max(0, out.length - 1 - Math.floor(rand() * 8)));
  }
  if (kind === 2) {
    const extra = new Uint8Array(out.length + 1);
    extra.set(out);
    extra[out.length] = Math.floor(rand() * 256);
    return extra;
  }
  if (kind === 3) {
    const extra = new Uint8Array(out.length + 1);
    const at = Math.floor(rand() * out.length);
    extra.set(out.subarray(0, at));
    extra[at] = 0x00;
    extra.set(out.subarray(at), at + 1);
    return extra;
  }
  const at = Math.floor(rand() * out.length);
  // 0xff on a byte that is already 0xff is a no-op; the suite then
  // "accepts" the original object and the fuzz goes red at random.
  out[at] = out[at] === 0xff ? 0x00 : 0xff;
  return out;
}

function productError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return (
    err.name === "Error" &&
    /^(cbor-|cose-|claim-|manifest-|checkpoint-|hex-|totals-)/.test(err.message)
  );
}

function asKey(key: unknown): unknown {
  if (typeof key === "string" && /^-?\d+$/.test(key)) return Number(key);
  return key;
}

function sortPairs(pairs: unknown[]): unknown[] {
  return [...pairs].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

function oursToPlain(value: CborVal): unknown {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
    return value;
  }
  if (value instanceof Uint8Array) return Buffer.from(value).toString("hex");
  if (Array.isArray(value)) return value.map(oursToPlain);
  if (isCborMap(value)) {
    return sortPairs(value.$map.map(([k, v]) => [oursToPlain(k), oursToPlain(v)]));
  }
  return value;
}

function theirsToPlain(value: unknown): unknown {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
    return value;
  }
  if (typeof value === "bigint") return Number(value);
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    return Buffer.from(value).toString("hex");
  }
  if (Array.isArray(value)) return value.map(theirsToPlain);
  if (value instanceof Map) {
    return sortPairs([...value.entries()].map(([k, v]) => [theirsToPlain(k), theirsToPlain(v)]));
  }
  if (value && typeof value === "object") {
    return sortPairs(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [asKey(k), theirsToPlain(v)]),
    );
  }
  return String(value);
}

describe("parser fuzz and differential decoding", () => {
  it("RED then GREEN: a truncated length header is cbor-eof, not a RangeError", () => {
    // Measured before the bound checks: Uint8Array.of(0x19) threw
    // RangeError: Attempt to access memory outside buffer bounds.
    assert.throws(() => decodeCbor(Uint8Array.of(0x19)), { message: "cbor-eof" });
    assert.throws(() => decodeCbor(Uint8Array.of(0x1a, 0x00)), { message: "cbor-eof" });
    assert.throws(() => decodeCbor(Uint8Array.of(0x1b, 0x00, 0x00, 0x00, 0x00)), {
      message: "cbor-eof",
    });
  });

  it("a well-formed object still decodes after the bounds went in", () => {
    const bytes = claimsToCbor(CLAIMS);
    assert.deepEqual(claimsFromCbor(bytes), CLAIMS);
    assert.deepEqual(manifestFromCbor(manifestToCbor(MANIFEST)), MANIFEST);
    assert.deepEqual(checkpointFromCbor(checkpointToCbor(CHECKPOINT)), CHECKPOINT);
  });

  it("256 mutations of each signed object refuse without crashing", () => {
    const rand = mulberry32(SEED);
    const receiptKeys = generateReceiptKeys();
    const manifestKeys = generateManifestKeys();
    const receipt = signReceipt(CLAIMS, receiptKeys.privateKeyPem, receiptKeys.publicKeyPem);
    const manifest = signManifest(MANIFEST, manifestKeys.privateKeyPem, manifestKeys.publicKeyPem);
    const checkpoint = signCheckpoint(
      CHECKPOINT,
      receiptKeys.privateKeyPem,
      receiptKeys.publicKeyPem,
    );
    const extract = signRailExtract(
      {
        accountId: "acct",
        railId: "rail",
        windowStartMs: CLAIMS.timestampMs,
        windowEndMs: CLAIMS.timestampMs + 1,
        settlements: [{ ref: "r1", amount: "1", currency: "USD", timestampMs: CLAIMS.timestampMs }],
      },
      receiptKeys.privateKeyPem,
      receiptKeys.publicKeyPem,
    );

    const targets: Array<{ name: string; bytes: Uint8Array; verify: (b: Uint8Array) => boolean }> = [
      {
        name: "receipt",
        bytes: Buffer.from(receipt.coseHex ?? "", "hex"),
        verify: (b) => verifyReceipt({ ...receipt, coseHex: Buffer.from(b).toString("hex") }),
      },
      {
        name: "manifest",
        bytes: Buffer.from(manifest.coseHex, "hex"),
        verify: (b) => verifyManifest({ ...manifest, coseHex: Buffer.from(b).toString("hex") }),
      },
      {
        name: "checkpoint",
        bytes: Buffer.from(checkpoint.coseHex, "hex"),
        verify: (b) => verifyCheckpoint({ ...checkpoint, coseHex: Buffer.from(b).toString("hex") }),
      },
    ];

    for (const target of targets) {
      for (let i = 0; i < 256; i += 1) {
        const mutant = mutate(target.bytes, rand, i);
        assert.notDeepEqual(
          Buffer.from(mutant),
          Buffer.from(target.bytes),
          `${target.name} mutation ${i} left the bytes unchanged`,
        );
        let accepted = false;
        try {
          accepted = target.verify(mutant);
        } catch (err) {
          assert.ok(productError(err), `${target.name} #${i} threw ${err}`);
          accepted = false;
        }
        assert.equal(accepted, false, `${target.name} mutation ${i} was accepted`);
        try {
          decodeCoseSign1(mutant);
        } catch (err) {
          assert.ok(productError(err), `${target.name} decode #${i} threw ${err}`);
        }
        try {
          decodeCbor(mutant);
        } catch (err) {
          assert.ok(productError(err), `${target.name} cbor #${i} threw ${err}`);
        }
      }
    }

    for (let i = 0; i < 64; i += 1) {
      const body = {
        ...extract.body,
        settlements: extract.body.settlements.map((s) => ({ ...s, amount: String(100 + i) })),
      };
      assert.equal(verifyRailExtract({ ...extract, body }), false, `extract body mutation ${i}`);
      const sig = Buffer.from(extract.signature, "base64");
      sig[i % sig.length] ^= 0x01;
      assert.equal(
        verifyRailExtract({ ...extract, signature: sig.toString("base64") }),
        false,
        `extract signature mutation ${i}`,
      );
    }
  });

  it("differential: our decoder and cbor-x either agree or we fail closed", () => {
    const rand = mulberry32(SEED + 1);
    const honest = [
      claimsToCbor(CLAIMS),
      manifestToCbor(MANIFEST),
      checkpointToCbor(CHECKPOINT),
      encodeCbor("hi"),
      encodeCbor(cborMap([[1, "a"], [2, "b"]])),
    ];
    const crafted = [
      Uint8Array.of(0xa2, 0x01, 0x01, 0x01, 0x02), // map with key 1 twice
      Uint8Array.of(0x19),
      Uint8Array.of(0xfb, 0x3f, 0xf0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00),
    ];
    const splits: string[] = [];

    const consider = (bytes: Uint8Array, label: string) => {
      let ours: { ok: true; value: unknown } | { ok: false; message: string };
      try {
        ours = { ok: true, value: oursToPlain(decodeCbor(bytes)) };
      } catch (err) {
        ours = { ok: false, message: (err as Error).message };
      }
      let theirs: { ok: true; value: unknown } | { ok: false; message: string };
      try {
        theirs = { ok: true, value: theirsToPlain(decodeCborX(Buffer.from(bytes))) };
      } catch (err) {
        theirs = { ok: false, message: (err as Error).message };
      }
      if (ours.ok && theirs.ok) {
        const a = JSON.stringify(ours.value);
        const b = JSON.stringify(theirs.value);
        if (a !== b) {
          splits.push(`${label} both-accepted-disagree ours=${a} cbor-x=${b} hex=${Buffer.from(bytes).toString("hex")}`);
        }
      }
    };

    for (const [i, bytes] of honest.entries()) consider(bytes, `honest-${i}`);
    for (const [i, bytes] of crafted.entries()) consider(bytes, `crafted-${i}`);
    for (let i = 0; i < 128; i += 1) {
      consider(mutate(honest[i % honest.length]!, rand, i), `mutant-${i}`);
    }

    assert.deepEqual(splits, [], splits.join("\n"));
  });

  it("triple: our decoder, cbor-x, and a spec mini-decoder agree or we fail closed", () => {
    const rand = mulberry32(SEED + 2);
    const honest = [
      claimsToCbor(CLAIMS),
      manifestToCbor(MANIFEST),
      checkpointToCbor(CHECKPOINT),
      encodeCbor("hi"),
      encodeCbor(cborMap([[1, "a"], [2, "b"]])),
      encodeCbor(null),
      encodeCbor(true),
      encodeCbor(-19),
    ];
    const splits: string[] = [];

    const consider = (bytes: Uint8Array, label: string) => {
      const readings: Array<{ name: string; ok: boolean; value?: unknown }> = [];
      try {
        readings.push({ name: "ours", ok: true, value: oursToPlain(decodeCbor(bytes)) });
      } catch {
        readings.push({ name: "ours", ok: false });
      }
      try {
        readings.push({ name: "cbor-x", ok: true, value: theirsToPlain(decodeCborX(Buffer.from(bytes))) });
      } catch {
        readings.push({ name: "cbor-x", ok: false });
      }
      try {
        readings.push({ name: "spec", ok: true, value: oursToPlain(decodeCborSpec(bytes)) });
      } catch {
        readings.push({ name: "spec", ok: false });
      }
      const accepted = readings.filter((r) => r.ok);
      if (accepted.length < 2) return;
      const first = JSON.stringify(accepted[0]!.value);
      for (const other of accepted.slice(1)) {
        const next = JSON.stringify(other.value);
        if (first !== next) {
          splits.push(
            `${label} ${accepted[0]!.name}/${other.name} ${first} vs ${next} hex=${Buffer.from(bytes).toString("hex")}`,
          );
        }
      }
    };

    for (const [i, bytes] of honest.entries()) consider(bytes, `honest-${i}`);
    consider(Uint8Array.of(0xa2, 0x01, 0x01, 0x01, 0x02), "dup-key");
    for (let i = 0; i < 64; i += 1) {
      consider(mutate(honest[i % honest.length]!, rand, i), `mutant-${i}`);
    }
    assert.deepEqual(splits, [], splits.join("\n"));
  });
});

/**
 * RFC 8949 reader for the types this tree emits: unsigned/negative int,
 * bstr, tstr, array, map, false/true/null. No tags, no floats, no
 * indefinite lengths. Duplicate keys refuse. Test-only: not the product
 * decoder, so a shared bug with `decodeCbor` is less likely to hide.
 */
function decodeCborSpec(bytes: Uint8Array): CborVal {
  const buf = Buffer.from(bytes);
  let offset = 0;
  const take = (n: number): Buffer => {
    if (offset + n > buf.length) throw new Error("cbor-eof");
    const slice = buf.subarray(offset, offset + n);
    offset += n;
    return slice;
  };
  const additional = (ai: number): number => {
    if (ai < 24) return ai;
    if (ai === 24) return take(1)[0]!;
    if (ai === 25) return take(2).readUInt16BE(0);
    if (ai === 26) return take(4).readUInt32BE(0);
    if (ai === 27) {
      const n = take(8).readBigUInt64BE(0);
      if (n > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("cbor-too-large");
      return Number(n);
    }
    throw new Error("cbor-unsupported");
  };
  const read = (): CborVal => {
    const ib = take(1)[0]!;
    const major = ib >> 5;
    const ai = ib & 31;
    if (major === 0) return additional(ai);
    if (major === 1) return -1 - additional(ai);
    if (major === 2) return new Uint8Array(take(additional(ai)));
    if (major === 3) return take(additional(ai)).toString("utf8");
    if (major === 4) {
      const n = additional(ai);
      const out: CborVal[] = [];
      for (let i = 0; i < n; i += 1) out.push(read());
      return out;
    }
    if (major === 5) {
      const n = additional(ai);
      const seen = new Set<string>();
      const entries: Array<[CborVal, CborVal]> = [];
      for (let i = 0; i < n; i += 1) {
        const k = read();
        const id = Buffer.from(encodeCbor(k)).toString("hex");
        if (seen.has(id)) throw new Error("cbor-duplicate-key");
        seen.add(id);
        entries.push([k, read()]);
      }
      return cborMap(entries);
    }
    if (major === 7 && ai === 20) return false;
    if (major === 7 && ai === 21) return true;
    if (major === 7 && ai === 22) return null;
    throw new Error("cbor-unsupported");
  };
  const value = read();
  if (offset !== buf.length) throw new Error("cbor-trailing");
  return value;
}

