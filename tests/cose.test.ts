import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { decode as decodeCborX } from "cbor-x";
import { describe, it } from "node:test";
import {
  COSE_ALG_ED25519,
  CTY_MANIFEST,
  CTY_RECEIPT,
  bytesToHex,
  cborMap,
  compareEncodedKeys,
  decodeCbor,
  decodeCoseSign1,
  decodeProtectedHeader,
  encodeCbor,
  encodeProtectedHeader,
  fixtureEd25519Pems,
  hexToBytes,
  kidFromPublicKeyPem,
  signCoseSign1,
  verifyCoseSign1,
} from "@cedulon/cose";
import { manifestHash, manifestToCbor, signManifest, verifyManifest } from "@cedulon/manifest";
import {
  RECEIPT_CLAIM,
  claimsFromCbor,
  claimsToCbor,
  generateReceiptKeys,
  isValidAmount,
  isValidNonce,
  signReceipt,
  signReceiptJson,
  verifyReceipt,
  verifyReceiptJson,
  type SpendReceiptClaims,
} from "@cedulon/receipts";

/** RFC 8949 appendix / common diagnostic encodings. */
const RFC_VECTORS: Array<{ name: string; hex: string; build: () => ReturnType<typeof encodeCbor> }> = [
  { name: "null", hex: "f6", build: () => encodeCbor(null) },
  { name: "false", hex: "f4", build: () => encodeCbor(false) },
  { name: "true", hex: "f5", build: () => encodeCbor(true) },
  { name: "1", hex: "01", build: () => encodeCbor(1) },
  { name: "-8", hex: "27", build: () => encodeCbor(-8) },
  { name: "-19", hex: "32", build: () => encodeCbor(-19) },
  { name: "hi", hex: "626869", build: () => encodeCbor("hi") },
  { name: "empty-map", hex: "a0", build: () => encodeCbor(cborMap([])) },
  { name: "alg-header-ed25519", hex: "a10132", build: () => encodeCbor(cborMap([[1, -19]])) },
];

const FIXTURE_CLAIMS: SpendReceiptClaims = {
  payer: "payer-1",
  payee: "payee-1",
  amount: "1",
  currency: "USD",
  policyHash: "aa",
  manifestHash: null,
  noManifest: true,
  x402PaymentRef: null,
  timestampMs: 1_700_000_000_000,
  nonce: "n1".padEnd(16, "0"),
  prevReceiptHash: null,
  outcome: "aborted",
};

const FIXTURE_MANIFEST = {
  description: "fixture-goods",
  amount: "1",
  currency: "USD",
  acceptanceCriteriaHash: "00",
  cancelCondition: "none",
  expiresAtMs: 1_700_000_000_000,
};

/** Locked claim-map encodings. Drift fails the suite. */
const FIXTURE_CLAIMS_CBOR_HEX =
  "ac3a000111706770617965722d313a000111716770617965652d313a0001117261313a00011173635553443a000111746261613a00011175f63a00011176f53a00011177f63a000111781b0000018bcfe568003a00011179706e3130303030303030303030303030303a0001117af63a0001117b6761626f72746564";

/** Vector 1: fixture Ed25519 #1 + FIXTURE_CLAIMS → COSE_Sign1 hex. */
const VECTOR_RECEIPT_COSE_HEX =
  "845830a301320378206170706c69636174696f6e2f636564756c6f6e2d726563656970742b63626f72044806e3fd8fda29bb60a0587cac3a000111706770617965722d313a000111716770617965652d313a0001117261313a00011173635553443a000111746261613a00011175f63a00011176f53a00011177f63a000111781b0000018bcfe568003a00011179706e3130303030303030303030303030303a0001117af63a0001117b6761626f727465645840685c01aa778a850b9d35250406f092b6f5cb03fb3595930422533e28ac620ad439f5e7bd8ed1fa5ded90d4421a2de34f94d1d78d38a65812cb5315ee7f1cf403";

/** Vector 2: same key + FIXTURE_MANIFEST → COSE_Sign1 hex. */
const VECTOR_MANIFEST_COSE_HEX =
  "845831a301320378216170706c69636174696f6e2f636564756c6f6e2d6d616e69666573742b63626f72044806e3fd8fda29bb60a0584aa73a000112386d666978747572652d676f6f64733a0001123961313a0001123a635553443a0001123b6230303a0001123c646e6f6e653a0001123d1b0000018bcfe568003a0001123ef65840898628b1524a44ca641b5058c7a47e71bd4ce1ca0782e03b511c23e0819c3771407d627216d0b104224ee82cacffbd21e66fe035ed5ce4ee85b7bcd9c560ad02";

describe("deterministic CBOR", () => {
  for (const v of RFC_VECTORS) {
    it(`vector ${v.name} matches RFC hex`, () => {
      assert.equal(bytesToHex(v.build()), v.hex);
      assert.deepEqual(decodeCbor(hexToBytes(v.hex)), decodeCbor(v.build()));
    });
  }

  it("protected header is alg -19, kid, and receipt content-type", () => {
    const keys = fixtureEd25519Pems();
    const kid = kidFromPublicKeyPem(keys.publicKeyPem);
    const hex = bytesToHex(
      encodeProtectedHeader({ alg: COSE_ALG_ED25519, kid, contentType: CTY_RECEIPT }),
    );
    assert.equal(hex, "a301320378206170706c69636174696f6e2f636564756c6f6e2d726563656970742b63626f72044806e3fd8fda29bb60");
    const decoded = decodeProtectedHeader(hexToBytes(hex));
    assert.equal(decoded.alg, -19);
    assert.equal(decoded.contentType, CTY_RECEIPT);
    assert.equal(bytesToHex(decoded.kid), "06e3fd8fda29bb60");
  });

  it("sorts map keys by RFC 8949 §4.2.1 bytewise lexicographic order", () => {
    const encoded24 = Buffer.from(encodeCbor(24));
    const encoded256 = Buffer.from(encodeCbor(256));
    assert.equal(encoded24.length < encoded256.length, true);
    assert.equal(compareEncodedKeys(encoded24, encoded256) < 0, true);
    const hex = bytesToHex(encodeCbor(cborMap([[100, "a"], [1, "b"]])));
    const decoded = decodeCbor(hexToBytes(hex));
    assert.ok(decoded && typeof decoded === "object" && "$map" in decoded);
  });

  it("hex encoders emit lowercase and reject uppercase", () => {
    assert.equal(bytesToHex(Uint8Array.from([0xab, 0xcd])), "abcd");
    assert.throws(() => hexToBytes("ABCD"), /hex-not-lowercase/);
  });
});

describe("independent cbor-x decoder", () => {
  it("decodes our claim map field-for-field", () => {
    const encoded = claimsToCbor(FIXTURE_CLAIMS);
    assert.equal(bytesToHex(encoded), FIXTURE_CLAIMS_CBOR_HEX);
    const foreign = decodeCborX(Buffer.from(encoded)) as Record<string | number, unknown>;
    assert.equal(foreign[RECEIPT_CLAIM.payer], "payer-1");
    assert.equal(foreign[RECEIPT_CLAIM.payee], "payee-1");
    assert.equal(foreign[RECEIPT_CLAIM.amount], "1");
    assert.equal(foreign[RECEIPT_CLAIM.currency], "USD");
    assert.equal(foreign[RECEIPT_CLAIM.policyHash], "aa");
    assert.equal(foreign[RECEIPT_CLAIM.manifestHash], null);
    assert.equal(foreign[RECEIPT_CLAIM.noManifest], true);
    assert.equal(foreign[RECEIPT_CLAIM.x402PaymentRef], null);
    assert.equal(Number(foreign[RECEIPT_CLAIM.timestampMs]), 1_700_000_000_000);
    assert.equal(foreign[RECEIPT_CLAIM.nonce], "n1".padEnd(16, "0"));
    assert.equal(foreign[RECEIPT_CLAIM.prevReceiptHash], null);
    assert.equal(foreign[RECEIPT_CLAIM.outcome], "aborted");
    const roundTrip = claimsFromCbor(encoded);
    assert.deepEqual(roundTrip, FIXTURE_CLAIMS);
  });

  it("decodes COSE_Sign1 as a 4-array", () => {
    const keys = fixtureEd25519Pems();
    const payload = claimsToCbor(FIXTURE_CLAIMS);
    const cose = signCoseSign1(payload, keys.privateKeyPem, CTY_RECEIPT);
    const foreign = decodeCborX(Buffer.from(cose)) as unknown[];
    assert.equal(foreign.length, 4);
    assert.ok(Buffer.isBuffer(foreign[0]) || foreign[0] instanceof Uint8Array);
    assert.ok(Buffer.isBuffer(foreign[2]) || foreign[2] instanceof Uint8Array);
    const payloadBuf = Buffer.from(foreign[2] as Uint8Array);
    const claims = decodeCborX(payloadBuf) as Record<number, unknown>;
    assert.equal(claims[RECEIPT_CLAIM.payer], "payer-1");
    assert.equal(claims[RECEIPT_CLAIM.amount], "1");
  });
});

describe("COSE_Sign1 receipts", () => {
  it("default sign path is COSE and verifies", () => {
    const k = generateReceiptKeys();
    const signed = signReceipt(FIXTURE_CLAIMS, k.privateKeyPem, k.publicKeyPem);
    assert.equal(signed.encoding, "cose");
    assert.ok(signed.coseHex);
    assert.equal(verifyReceipt(signed), true);
  });

  it("legacy JSON path still verifies", () => {
    const k = generateReceiptKeys();
    const signed = signReceiptJson(FIXTURE_CLAIMS, k.privateKeyPem, k.publicKeyPem);
    assert.equal(signed.encoding, "json");
    assert.equal(verifyReceiptJson(signed), true);
    assert.equal(verifyReceipt(signed), true);
  });

  it("vector 1: fixture key + claims equals locked receipt COSE hex", () => {
    const keys = fixtureEd25519Pems();
    const signed = signReceipt(FIXTURE_CLAIMS, keys.privateKeyPem, keys.publicKeyPem);
    assert.equal(signed.coseHex, VECTOR_RECEIPT_COSE_HEX);
    assert.equal(verifyReceipt(signed), true);
    const msg = decodeCoseSign1(hexToBytes(signed.coseHex ?? ""));
    const header = decodeProtectedHeader(msg.protectedHeader);
    assert.equal(header.alg, -19);
    assert.equal(header.contentType, CTY_RECEIPT);
    assert.equal(verifyCoseSign1(hexToBytes(VECTOR_RECEIPT_COSE_HEX), keys.publicKeyPem, CTY_RECEIPT), true);
  });

  it("vector 2: fixture key + manifest equals locked manifest COSE hex", () => {
    const keys = fixtureEd25519Pems();
    const signed = signManifest(FIXTURE_MANIFEST, keys.privateKeyPem, keys.publicKeyPem);
    assert.equal(signed.coseHex, VECTOR_MANIFEST_COSE_HEX);
    assert.equal(verifyManifest(signed), true);
    const header = decodeProtectedHeader(decodeCoseSign1(hexToBytes(signed.coseHex)).protectedHeader);
    assert.equal(header.alg, -19);
    assert.equal(header.contentType, CTY_MANIFEST);
    assert.equal(
      manifestHash(signed),
      bytesToHex(createHash("sha256").update(Buffer.from(signed.coseHex, "hex")).digest()),
    );
    const sameBytes = manifestHash({ ...signed, publicKeyPem: "-----BEGIN PUBLIC KEY-----\nNOT-THE-KEY\n-----END PUBLIC KEY-----\n" });
    assert.equal(sameBytes, manifestHash(signed));
  });

  it("RED then GREEN: COSE byte tamper fails verify", () => {
    const keys = fixtureEd25519Pems();
    const signed = signReceipt(FIXTURE_CLAIMS, keys.privateKeyPem, keys.publicKeyPem);
    assert.equal(verifyReceipt(signed), true);
    const raw = Buffer.from(signed.coseHex ?? "", "hex");
    raw[raw.length - 1] ^= 0x01;
    const tampered = { ...signed, coseHex: raw.toString("hex") };
    assert.equal(verifyReceipt(tampered), false);
    assert.equal(verifyCoseSign1(raw, keys.publicKeyPem, CTY_RECEIPT), false);
    assert.equal(verifyCoseSign1(hexToBytes(signed.coseHex ?? ""), keys.publicKeyPem, CTY_RECEIPT), true);
  });

  it("RED then GREEN: claim object tamper fails COSE verify", () => {
    const k = generateReceiptKeys();
    const signed = signReceipt(FIXTURE_CLAIMS, k.privateKeyPem, k.publicKeyPem);
    assert.equal(verifyReceipt(signed), true);
    const tampered = { ...signed, claims: { ...signed.claims, amount: "9" } };
    assert.equal(verifyReceipt(tampered), false);
  });

  it("spec appendix vectors are byte-identical to locked tests", () => {
    const spec = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "..", "spec", "draft-dogru-cedulon-01.md"),
      "utf8",
    );
    const compact = spec.replace(/[\s`~]/g, "");
    assert.equal(compact.includes(VECTOR_RECEIPT_COSE_HEX), true);
    assert.equal(compact.includes(VECTOR_MANIFEST_COSE_HEX), true);
  });

  it("amount grammar and nonce width", () => {
    assert.equal(isValidAmount("0"), true);
    assert.equal(isValidAmount("1"), true);
    assert.equal(isValidAmount("01"), false);
    assert.equal(isValidAmount("-1"), false);
    assert.equal(isValidNonce("n1"), false);
    assert.equal(isValidNonce("n1".padEnd(16, "0")), true);
    const k = generateReceiptKeys();
    assert.throws(
      () => signReceipt({ ...FIXTURE_CLAIMS, amount: "01" }, k.privateKeyPem, k.publicKeyPem),
      /amount grammar/,
    );
    assert.throws(
      () => signReceipt({ ...FIXTURE_CLAIMS, nonce: "short" }, k.privateKeyPem, k.publicKeyPem),
      /nonce-too-short/,
    );
  });
});
