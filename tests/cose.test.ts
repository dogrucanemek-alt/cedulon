import assert from "node:assert/strict";
import { decode as decodeCborX } from "cbor-x";
import { describe, it } from "node:test";
import {
  bytesToHex,
  cborMap,
  decodeCbor,
  decodeCoseSign1,
  encodeCbor,
  encodeProtectedHeader,
  fixtureEd25519Pems,
  hexToBytes,
  mapGet,
  signCoseSign1,
  verifyCoseSign1,
} from "@cedulon/cose";
import {
  claimsFromCbor,
  claimsToCbor,
  generateReceiptKeys,
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
  { name: "hi", hex: "626869", build: () => encodeCbor("hi") },
  { name: "empty-map", hex: "a0", build: () => encodeCbor(cborMap([])) },
  { name: "alg-header", hex: "a10127", build: () => encodeCbor(cborMap([[1, -8]])) },
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
  nonce: "n1",
  prevReceiptHash: null,
  outcome: "aborted",
};

/** Encoded by this profile; locked so encoder drift fails the suite. */
const FIXTURE_CLAIMS_CBOR_HEX =
  "ac18646770617965722d3118656770617965652d311866613118676355534418686261611869f6186af5186bf6186c1b0000018bcfe56800186d626e31186ef6186f6761626f72746564";

describe("deterministic CBOR", () => {
  for (const v of RFC_VECTORS) {
    it(`vector ${v.name} matches RFC hex`, () => {
      assert.equal(bytesToHex(v.build()), v.hex);
      assert.deepEqual(decodeCbor(hexToBytes(v.hex)), decodeCbor(v.build()));
    });
  }

  it("protected header is a10127", () => {
    assert.equal(bytesToHex(encodeProtectedHeader()), "a10127");
  });

  it("sorts map keys by encoded key length then bytes", () => {
    const hex = bytesToHex(encodeCbor(cborMap([[100, "a"], [1, "b"]])));
    const decoded = decodeCbor(hexToBytes(hex));
    assert.ok(decoded && typeof decoded === "object" && "$map" in decoded);
  });
});

describe("independent cbor-x decoder", () => {
  it("decodes our claim map field-for-field", () => {
    const encoded = claimsToCbor(FIXTURE_CLAIMS);
    assert.equal(bytesToHex(encoded), FIXTURE_CLAIMS_CBOR_HEX);
    const foreign = decodeCborX(Buffer.from(encoded)) as Record<string | number, unknown>;
    assert.equal(foreign[100], "payer-1");
    assert.equal(foreign[101], "payee-1");
    assert.equal(foreign[102], "1");
    assert.equal(foreign[103], "USD");
    assert.equal(foreign[104], "aa");
    assert.equal(foreign[105], null);
    assert.equal(foreign[106], true);
    assert.equal(foreign[107], null);
    assert.equal(Number(foreign[108]), 1_700_000_000_000);
    assert.equal(foreign[109], "n1");
    assert.equal(foreign[110], null);
    assert.equal(foreign[111], "aborted");
    const roundTrip = claimsFromCbor(encoded);
    assert.deepEqual(roundTrip, FIXTURE_CLAIMS);
  });

  it("decodes COSE_Sign1 as a 4-array", () => {
    const keys = fixtureEd25519Pems();
    const payload = claimsToCbor(FIXTURE_CLAIMS);
    const cose = signCoseSign1(payload, keys.privateKeyPem);
    const foreign = decodeCborX(Buffer.from(cose)) as unknown[];
    assert.equal(foreign.length, 4);
    assert.ok(Buffer.isBuffer(foreign[0]) || foreign[0] instanceof Uint8Array);
    assert.ok(Buffer.isBuffer(foreign[2]) || foreign[2] instanceof Uint8Array);
    const payloadBuf = Buffer.from(foreign[2] as Uint8Array);
    const claims = decodeCborX(payloadBuf) as Record<number, unknown>;
    assert.equal(claims[100], "payer-1");
    assert.equal(claims[102], "1");
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

  it("fixture key produces a locked COSE hex prefix", () => {
    const keys = fixtureEd25519Pems();
    const signed = signReceipt(FIXTURE_CLAIMS, keys.privateKeyPem, keys.publicKeyPem);
    assert.ok(signed.coseHex);
    assert.equal(
      signed.coseHex,
      "8443a10127a0584aac18646770617965722d3118656770617965652d311866613118676355534418686261611869f6186af5186bf6186c1b0000018bcfe56800186d626e31186ef6186f6761626f72746564584067b0202b3716ef99dc1e845a07dc847662bb962c7f19a1657dce4f6036ba51f4667f58e20c1833c7078d101096b95ec974f531d28d54e013ba48ae89b209f30b",
    );
    assert.equal(verifyReceipt(signed), true);
    const msg = decodeCoseSign1(hexToBytes(signed.coseHex));
    assert.equal(bytesToHex(msg.protectedHeader), "a10127");
  });

  it("RED then GREEN: COSE byte tamper fails verify", () => {
    const keys = fixtureEd25519Pems();
    const signed = signReceipt(FIXTURE_CLAIMS, keys.privateKeyPem, keys.publicKeyPem);
    assert.equal(verifyReceipt(signed), true);
    const raw = Buffer.from(signed.coseHex ?? "", "hex");
    raw[raw.length - 1] ^= 0x01;
    const tampered = { ...signed, coseHex: raw.toString("hex") };
    assert.equal(verifyReceipt(tampered), false);
    assert.equal(verifyCoseSign1(raw, keys.publicKeyPem), false);
    assert.equal(verifyCoseSign1(hexToBytes(signed.coseHex ?? ""), keys.publicKeyPem), true);
  });

  it("RED then GREEN: claim object tamper fails COSE verify", () => {
    const k = generateReceiptKeys();
    const signed = signReceipt(FIXTURE_CLAIMS, k.privateKeyPem, k.publicKeyPem);
    assert.equal(verifyReceipt(signed), true);
    const tampered = { ...signed, claims: { ...signed.claims, amount: "9" } };
    assert.equal(verifyReceipt(tampered), false);
  });
});
