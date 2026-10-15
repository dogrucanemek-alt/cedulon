import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
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
  coseDecodeRefusalHex,
  decodeCbor,
  decodeCoseSign1,
  decodeProtectedHeader,
  encodeCbor,
  encodeCoseSign1,
  encodeProtectedHeader,
  fixtureEd25519Pems,
  hexToBytes,
  kidFromPublicKeyPem,
  NAMED_DECODE_REFUSALS,
  pemSigner,
  sigStructure,
  signCoseSign1,
  verifyCoseSign1,
} from "@cedulon/cose";
import { TEST_HASH } from "./hash-fixtures.ts";
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

/** Same claims with a grammar-valid policyHash, for tests that must sign. */
const SIGNABLE_CLAIMS: SpendReceiptClaims = { ...FIXTURE_CLAIMS, policyHash: TEST_HASH };

const FIXTURE_MANIFEST = {
  description: "fixture-goods",
  amount: "1",
  currency: "USD",
  // SHA-256 of an empty delivery: the spec defines this field as a digest
  // of the exact delivery bytes, so the fixture carries a well-formed one.
  acceptanceCriteriaHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  cancelCondition: "none",
  expiresAtMs: 1_700_000_000_000,
};

/** Locked claim-map encodings. Drift fails the suite. */
const FIXTURE_CLAIMS_CBOR_HEX =
  "ac3a000111706770617965722d313a000111716770617965652d313a0001117261313a00011173635553443a000111746261613a00011175f63a00011176f53a00011177f63a000111781b0000018bcfe568003a00011179706e3130303030303030303030303030303a0001117af63a0001117b6761626f72746564";

/** Posted -04 Appendix A receipt vector: signed with policyHash="aa". */
const VECTOR_RECEIPT_COSE_HEX_POSTED_04 =
  "845830a301320378206170706c69636174696f6e2f636564756c6f6e2d726563656970742b63626f72044806e3fd8fda29bb60a0587cac3a000111706770617965722d313a000111716770617965652d313a0001117261313a00011173635553443a000111746261613a00011175f63a00011176f53a00011177f63a000111781b0000018bcfe568003a00011179706e3130303030303030303030303030303a0001117af63a0001117b6761626f727465645840685c01aa778a850b9d35250406f092b6f5cb03fb3595930422533e28ac620ad439f5e7bd8ed1fa5ded90d4421a2de34f94d1d78d38a65812cb5315ee7f1cf403";

/** -05 appendix policyHash: SHA-256 of the UTF-8 octets of "cedulon/appendix-policy". */
const VECTOR_POLICY_HASH = "fca4142da8ad241d24928227893894f4b5365efb746a4529fe9df0119d10da2c";

/** Vector 1: fixture Ed25519 #1 + FIXTURE_CLAIMS with the -05 policyHash → COSE_Sign1 hex. */
const VECTOR_RECEIPT_COSE_HEX =
  "845830a301320378206170706c69636174696f6e2f636564756c6f6e2d726563656970742b63626f72044806e3fd8fda29bb60a058bbac3a000111706770617965722d313a000111716770617965652d313a0001117261313a00011173635553443a000111747840666361343134326461386164323431643234393238323237383933383934663462353336356566623734366134353239666539646630313139643130646132633a00011175f63a00011176f53a00011177f63a000111781b0000018bcfe568003a00011179706e3130303030303030303030303030303a0001117af63a0001117b6761626f7274656458400a24269b7521d409ebe462db297c3aa25b23d6c697aa4a864b1b3a3edb5b30537b34b048a797073eaee41af371effb68ecbb47b80e62d7e775e8cae5b066c30c";

/** Vector 2: same key + FIXTURE_MANIFEST → COSE_Sign1 hex. */
const VECTOR_MANIFEST_COSE_HEX =
  "845831a301320378216170706c69636174696f6e2f636564756c6f6e2d6d616e69666573742b63626f72044806e3fd8fda29bb60a05889a73a000112386d666978747572652d676f6f64733a0001123961313a0001123a635553443a0001123b7840653362306334343239386663316331343961666266346338393936666239323432376165343165343634396239333463613439353939316237383532623835353a0001123c646e6f6e653a0001123d1b0000018bcfe568003a0001123ef65840599b5b1cc7bfd3fe8b8e65cdd876652aeca13660e6bdccc93afe12188a295b20fdfe8e6e48ae447dc74ccb0f13383f0f43f0f67f288d61a6395e95e2038e320d";

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
    const signed = signReceipt(SIGNABLE_CLAIMS, k.privateKeyPem, k.publicKeyPem);
    assert.equal(signed.encoding, "cose");
    assert.ok(signed.coseHex);
    assert.equal(verifyReceipt(signed), true);
  });

  it("legacy JSON path still verifies", () => {
    const k = generateReceiptKeys();
    const signed = signReceiptJson(SIGNABLE_CLAIMS, k.privateKeyPem, k.publicKeyPem);
    assert.equal(signed.encoding, "json");
    assert.equal(verifyReceiptJson(signed), true);
    assert.equal(verifyReceipt(signed), true);
  });

  it("vector 1: fixture key + appendix claims equals locked receipt COSE hex", () => {
    // -05 regenerated the appendix vector: policyHash is the SHA-256 of
    // "cedulon/appendix-policy", in the Table 3 grammar the companion enforces.
    const keys = fixtureEd25519Pems();
    const signed = signReceipt(
      { ...FIXTURE_CLAIMS, policyHash: VECTOR_POLICY_HASH },
      keys.privateKeyPem,
      keys.publicKeyPem,
    );
    assert.equal(signed.coseHex, VECTOR_RECEIPT_COSE_HEX);
    assert.equal(verifyReceipt(signed, keys.publicKeyPem), true);
    const header = decodeProtectedHeader(decodeCoseSign1(hexToBytes(signed.coseHex ?? "")).protectedHeader);
    assert.equal(header.alg, -19);
    assert.equal(header.contentType, CTY_RECEIPT);
    assert.equal(
      VECTOR_POLICY_HASH,
      bytesToHex(createHash("sha256").update(Buffer.from("cedulon/appendix-policy", "utf8")).digest()),
    );
  });

  it("vector 1 (posted -04): the violating bytes still verify; the signer refuses their claims", () => {
    // Posted -04 Appendix A is signed with policyHash=aa. Table 3 of the same
    // draft names lowercase hex SHA-256. Companion enforces the table; the
    // frozen -04 bytes stay valid COSE and are not re-signed. Counted as
    // V-T4-appendix-a-policy-hash until -05 is posted.
    const keys = fixtureEd25519Pems();
    assert.equal(verifyCoseSign1(hexToBytes(VECTOR_RECEIPT_COSE_HEX_POSTED_04), keys.publicKeyPem, CTY_RECEIPT), true);
    const msg = decodeCoseSign1(hexToBytes(VECTOR_RECEIPT_COSE_HEX_POSTED_04));
    assert.equal(claimsFromCbor(msg.payload).policyHash, "aa");
    assert.throws(
      () => signReceipt(FIXTURE_CLAIMS, keys.privateKeyPem, keys.publicKeyPem),
      /malformed-policy-hash/,
    );
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

  it("RED then GREEN: a non-empty unprotected header is refused by name, not read past", () => {
    // The profile says the unprotected header MUST be empty. Measured before
    // this test: decodeCoseSign1 discarded whatever the second array element
    // carried, so a receipt with a stuffed unprotected map still verified and
    // still decoded, while its transport octets - the input to receiptHash -
    // had changed under it. The refusal keeps the transport octets the
    // profile hashes equal to the octets the profile allows.
    const keys = fixtureEd25519Pems();
    const arr = decodeCbor(hexToBytes(VECTOR_RECEIPT_COSE_HEX)) as unknown[];
    const stuffed = encodeCbor([arr[0], cborMap([[1, "stuffed"]]), arr[2], arr[3]] as never);
    assert.throws(() => decodeCoseSign1(stuffed), /cose-sign1-unprotected/);
    assert.equal(verifyCoseSign1(stuffed, keys.publicKeyPem, CTY_RECEIPT), false);
    // The name has to survive the public path too: a caller that reports
    // refusals by name reads them from here, and null would say "not a
    // bound this profile names" about a bound this profile names.
    assert.equal(coseDecodeRefusalHex(bytesToHex(stuffed)), "cose-sign1-unprotected");
    assert.equal(verifyCoseSign1(hexToBytes(VECTOR_RECEIPT_COSE_HEX), keys.publicKeyPem, CTY_RECEIPT), true);
  });

  it("RED then GREEN: COSE byte tamper fails verify", () => {
    const keys = fixtureEd25519Pems();
    const signed = signReceipt(SIGNABLE_CLAIMS, keys.privateKeyPem, keys.publicKeyPem);
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
    const signed = signReceipt(SIGNABLE_CLAIMS, k.privateKeyPem, k.publicKeyPem);
    assert.equal(verifyReceipt(signed), true);
    const tampered = { ...signed, claims: { ...signed.claims, amount: "9" } };
    assert.equal(verifyReceipt(tampered), false);
  });

  it("spec appendix vectors are byte-identical to locked tests", () => {
    // The draft under guard is the newest revision in the tree: this test
    // sat pinned to -01 while -04's appendix was being prepared, so a vector
    // change would have compared against a frozen file and passed or failed
    // for the wrong reason.
    const specDir = join(dirname(fileURLToPath(import.meta.url)), "..", "spec");
    const latest = readdirSync(specDir)
      .map((f) => /^draft-dogru-cedulon-(\d+)\.md$/.exec(f))
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => m[1])
      .sort((a, b) => Number(a) - Number(b))
      .at(-1);
    const spec = readFileSync(join(specDir, `draft-dogru-cedulon-${latest}.md`), "utf8");
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

// A message has one identity: receiptHash is SHA-256 over the transport octets,
// and the chain, the checkpoint head and every comparison downstream read that
// hash. A decoder that accepts a second spelling of the same value lets anyone
// holding a receipt mint a second identity for it without the key, because the
// signature covers the protected header and payload, not the outer array head.
describe("one encoding per value (RFC 8949 §4.2.1)", () => {
  const refusedAs = (name: string) => (err: unknown) => err instanceof Error && err.message === name;

  it("RED then GREEN: a head longer than it needs to be is refused by name", () => {
    for (const hex of ["1801", "190001", "1a00000001", "3800", "5800", "7800", "9800", "b800"]) {
      assert.throws(() => decodeCbor(hexToBytes(hex)), refusedAs("cbor-non-deterministic"), hex);
    }
  });

  it("RED then GREEN: map keys out of bytewise order are refused by name", () => {
    assert.throws(() => decodeCbor(hexToBytes("a202000100")), refusedAs("cbor-non-deterministic"));
  });

  it("RED then GREEN: text that is not UTF-8 is refused by name, not replaced", () => {
    for (const hex of ["61ff", "62c328", "63eda080"]) {
      assert.throws(() => decodeCbor(hexToBytes(hex)), refusedAs("cbor-invalid-text"), hex);
    }
    assert.equal(decodeCbor(hexToBytes("63efbfbd")), "�");
  });

  it("RED then GREEN: a negative integer below the safe range is refused, so decode and encode agree", () => {
    assert.throws(() => decodeCbor(hexToBytes("3b001fffffffffffff")), refusedAs("cbor-too-large"));
    assert.equal(decodeCbor(hexToBytes("3b001ffffffffffffe")), -Number.MAX_SAFE_INTEGER);
  });

  it("RED then GREEN: a signed message re-spelled without the key does not verify, and the refusal is named", () => {
    const k = fixtureEd25519Pems();
    const good = bytesToHex(signCoseSign1(encodeCbor(cborMap([[1, "x"]])), k.privateKeyPem, CTY_RECEIPT));
    assert.equal(verifyCoseSign1(hexToBytes(good), k.publicKeyPem, CTY_RECEIPT), true);
    const protectedLen = decodeCoseSign1(hexToBytes(good)).protectedHeader.length;
    const unprotectedAt = 2 + 2 * ((protectedLen < 24 ? 1 : 2) + protectedLen);
    assert.equal(good.slice(unprotectedAt, unprotectedAt + 2), "a0");
    const variants = [
      "9804" + good.slice(2),
      good.slice(0, unprotectedAt) + "b800" + good.slice(unprotectedAt + 2),
    ];
    for (const v of variants) {
      assert.equal(verifyCoseSign1(hexToBytes(v), k.publicKeyPem, CTY_RECEIPT), false, v.slice(0, 12));
      assert.equal(coseDecodeRefusalHex(v), "cbor-non-deterministic", v.slice(0, 12));
    }
  });

  it("the new refusals are on the named list", () => {
    assert.ok(NAMED_DECODE_REFUSALS.has("cbor-non-deterministic"));
    assert.ok(NAMED_DECODE_REFUSALS.has("cbor-invalid-text"));
  });

  it("the published vectors are already in the one encoding", () => {
    for (const hex of [VECTOR_RECEIPT_COSE_HEX, VECTOR_RECEIPT_COSE_HEX_POSTED_04, VECTOR_MANIFEST_COSE_HEX]) {
      const msg = decodeCoseSign1(hexToBytes(hex));
      assert.equal(bytesToHex(encodeCbor(decodeCbor(hexToBytes(hex)))), hex);
      assert.equal(bytesToHex(encodeCbor(decodeCbor(msg.protectedHeader))), bytesToHex(msg.protectedHeader));
      assert.equal(bytesToHex(encodeCbor(decodeCbor(msg.payload))), bytesToHex(msg.payload));
    }
  });
});

describe("the encoder refuses what the decoder refuses", () => {
  it("RED then GREEN: a map with a repeated key is not encoded", () => {
    assert.throws(() => encodeCbor(cborMap([[1, 0], [1, 1]])), (e: unknown) => e instanceof Error && e.message === "cbor-duplicate-key");
  });

  it("RED then GREEN: a string with a lone surrogate is not encoded", () => {
    assert.throws(() => encodeCbor("\uD800"), (e: unknown) => e instanceof Error && e.message === "cbor-invalid-text");
    assert.equal(bytesToHex(encodeCbor("�")), "63efbfbd");
  });
});

describe("COSE_Sign1 profile checks", () => {
  it("RED then GREEN: a key that is not Ed25519 is refused under alg -19", () => {
    const ed448 = generateKeyPairSync("ed448");
    const priv = ed448.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const pub = ed448.publicKey.export({ type: "spki", format: "pem" }).toString();
    assert.throws(() => signCoseSign1(encodeCbor(1), priv, CTY_RECEIPT), (e: unknown) => e instanceof Error && e.message === "cose-key-type");
    // A message an Ed448 key signed over a header that says -19, built by hand.
    const protectedHeader = encodeProtectedHeader({ alg: COSE_ALG_ED25519, kid: kidFromPublicKeyPem(pub), contentType: CTY_RECEIPT });
    const payload = encodeCbor(1);
    const signature = new Uint8Array(sign(null, Buffer.from(sigStructure(protectedHeader, payload)), priv));
    const msg = encodeCoseSign1({ protectedHeader, unprotected: {}, payload, signature });
    assert.equal(verifyCoseSign1(msg, pub, CTY_RECEIPT), false);
  });

  it("RED then GREEN: a protected header that names a critical parameter is refused, even when validly signed", () => {
    const k = fixtureEd25519Pems();
    const protectedHeader = encodeCbor(
      cborMap([[1, COSE_ALG_ED25519], [2, [99]], [3, CTY_RECEIPT], [4, kidFromPublicKeyPem(k.publicKeyPem)], [99, true]]),
    );
    const payload = encodeCbor(1);
    const signature = new Uint8Array(sign(null, Buffer.from(sigStructure(protectedHeader, payload)), k.privateKeyPem));
    const msg = encodeCoseSign1({ protectedHeader, unprotected: {}, payload, signature });
    assert.equal(verifyCoseSign1(msg, k.publicKeyPem, CTY_RECEIPT), false);
  });

  it("RED then GREEN: an empty expected content type is compared, not skipped", () => {
    const k = fixtureEd25519Pems();
    const msg = signCoseSign1(encodeCbor(1), k.privateKeyPem, CTY_RECEIPT);
    assert.equal(verifyCoseSign1(msg, k.publicKeyPem, ""), false);
    assert.equal(verifyCoseSign1(msg, k.publicKeyPem), true);
  });

  it("RED then GREEN: hex with characters that are not hex digits is refused", () => {
    for (const bad of ["01zz", "0g", "  ", "0x01"]) {
      assert.throws(() => hexToBytes(bad), (e: unknown) => e instanceof Error && e.message === "hex-not-hex", bad);
    }
    assert.deepEqual([...hexToBytes("00ff")], [0, 255]);
    assert.deepEqual([...hexToBytes("")], []);
  });
});

describe("one encoding per value: edges a second reading named", () => {
  const refusedAs = (name: string) => (err: unknown) => err instanceof Error && err.message === name;

  it("RED then GREEN: a PEM signer whose private key is not Ed25519 is refused", () => {
    // signReceipt and friends build their signer through pemSigner; the
    // header they write says Ed25519 whatever the private key is.
    const k = fixtureEd25519Pems();
    const ed448 = generateKeyPairSync("ed448");
    const priv448 = ed448.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    assert.throws(() => pemSigner(priv448, k.publicKeyPem), refusedAs("cose-key-type"));
    assert.equal(typeof pemSigner(k.privateKeyPem, k.publicKeyPem).sign, "function");
  });

  it("a leading byte order mark is kept, not stripped", () => {
    assert.equal(bytesToHex(encodeCbor("﻿")), "63efbbbf");
    assert.equal(decodeCbor(hexToBytes("63efbbbf")), "﻿");
  });

  it("a lone low surrogate is refused, and a valid astral pair is not", () => {
    assert.throws(() => encodeCbor("\uDC00"), refusedAs("cbor-invalid-text"));
    const astral = "😀";
    assert.equal(decodeCbor(encodeCbor(astral)), astral);
  });

  it("a repeated key that is not next to its twin in the input is still refused", () => {
    assert.throws(() => encodeCbor(cborMap([[1, 0], [2, 0], [1, 1]])), refusedAs("cbor-duplicate-key"));
  });

  it("map keys are ordered by their encoded bytes, not by number or by length", () => {
    // -1 encodes as 0x20 and 1 as 0x01, so 1 comes first.
    assert.equal(bytesToHex(encodeCbor(cborMap([[-1, 0], [1, 0]]))), "a201002000");
    assert.throws(() => decodeCbor(hexToBytes("a220000100")), refusedAs("cbor-non-deterministic"));
  });

  it("an eight-byte head for a small integer is refused", () => {
    assert.throws(() => decodeCbor(hexToBytes("1b0000000000000001")), refusedAs("cbor-non-deterministic"));
  });

  it("a message whose content type is the empty string verifies against the empty string only", () => {
    const k = fixtureEd25519Pems();
    const msg = signCoseSign1(encodeCbor(1), k.privateKeyPem, "");
    assert.equal(verifyCoseSign1(msg, k.publicKeyPem, ""), true);
    assert.equal(verifyCoseSign1(msg, k.publicKeyPem, CTY_RECEIPT), false);
  });
});
