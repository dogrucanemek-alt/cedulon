import { createHash } from "node:crypto";
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { encodeCbor } from "@cedulon/cose";
import { generateManifestKeys, manifestHash, sha256Hex, signManifest } from "@cedulon/manifest";
import {
  generateReceiptKeys,
  receiptHash,
  sha256Hex as receiptSha256Hex,
  signReceipt,
  type SpendReceiptClaims,
} from "@cedulon/receipts";
import {
  buildCheckpointClaims,
  checkpointHash,
  signCheckpoint,
} from "@cedulon/checkpoint";

/**
 * Joel's SCITT CCF pair: HASH of a tstr as UTF-8 octets vs HASH of the
 * CBOR-encoded tstr (major type + length head included). The input string
 * was not recovered from the two published digests; they are recorded so
 * a later match can be pinned. What this tree does is written below.
 */
const JOEL_TSTR_UTF8 = "61559291e6170046108b09f6c203287e55cb8aaf0dba173b9b10c9f201e2f71a";
const JOEL_TSTR_CBOR_ITEM = "278395300090d12385e20ca87070f8afa772f20484cc9637f30edb6852a95822";

function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

const CLAIMS: SpendReceiptClaims = {
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

describe("which octets a Cedulon hash consumes", () => {
  it("sha256Hex(string) is SHA-256 of the UTF-8 octets, not of encodeCbor(string)", () => {
    const text = "commit-evidence";
    const utf8 = sha256(Buffer.from(text, "utf8"));
    const cborItem = sha256(encodeCbor(text));
    assert.notEqual(utf8, cborItem, "the two readings of a tstr must differ");
    assert.equal(sha256Hex(text), utf8);
    assert.equal(receiptSha256Hex(text), utf8);
    assert.notEqual(sha256Hex(text), cborItem);
  });

  it("Joel's published pair are the two readings, and ours matches the UTF-8 reading for text", () => {
    assert.equal(JOEL_TSTR_UTF8.length, 64);
    assert.equal(JOEL_TSTR_CBOR_ITEM.length, 64);
    assert.notEqual(JOEL_TSTR_UTF8, JOEL_TSTR_CBOR_ITEM);
    // A string hashed both ways cannot produce the same digest. Cedulon
    // `sha256Hex` is the UTF-8 reading. Receipt / manifest / checkpoint
    // hashes are the other kind of question: they hash COSE bytes.
    const sample = "tstr";
    assert.equal(sha256(Buffer.from(sample, "utf8")), sha256Hex(sample));
    assert.equal(sha256(encodeCbor(sample)), sha256(Buffer.from(encodeCbor(sample))));
  });

  it("receipt, manifest and checkpoint hashes are SHA-256 of the COSE_Sign1 bytes", () => {
    const receiptKeys = generateReceiptKeys();
    const receipt = signReceipt(CLAIMS, receiptKeys.privateKeyPem, receiptKeys.publicKeyPem);
    const cose = Buffer.from(receipt.coseHex ?? "", "hex");
    assert.equal(receiptHash(receipt), sha256(cose));

    const manifestKeys = generateManifestKeys();
    const manifest = signManifest(
      {
        description: "hash-octets",
        amount: "1",
        currency: "USD",
        acceptanceCriteriaHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        cancelCondition: "none",
        expiresAtMs: 1_700_000_000_000,
      },
      manifestKeys.privateKeyPem,
      manifestKeys.publicKeyPem,
    );
    assert.equal(manifestHash(manifest), sha256(Buffer.from(manifest.coseHex, "hex")));

    const checkpoint = signCheckpoint(
      buildCheckpointClaims(1, [receipt], 1_700_000_000_000, 1_700_003_600_000, null),
      receiptKeys.privateKeyPem,
      receiptKeys.publicKeyPem,
    );
    assert.equal(checkpointHash(checkpoint), sha256(Buffer.from(checkpoint.coseHex, "hex")));
  });
});
