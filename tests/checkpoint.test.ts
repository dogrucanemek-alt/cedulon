import { TEST_HASH, TEST_HASH_OTHER } from "./hash-fixtures.ts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fixtureEd25519Pems } from "@cedulon/cose";
import { NONCE_MIN_BYTES, generateReceiptKeys, signReceipt, type SpendReceiptClaims } from "@cedulon/receipts";
import {
  MemoryTransparencyService,
  anchorCheckpoint,
  anchorReceipt,
  buildCheckpointClaims,
  checkpointHash,
  findCheckpointChainBreak,
  findEquivocation,
  signCheckpoint,
  verifyCheckpoint,
} from "@cedulon/checkpoint";

function sampleClaims(nonce: string, amount = "1"): SpendReceiptClaims {
  return {
    payer: "p",
    payee: "q",
    amount,
    currency: "USD",
    policyHash: TEST_HASH,
    manifestHash: null,
    noManifest: true,
    x402PaymentRef: nonce,
    timestampMs: 1_700_000_000_000,
    nonce: nonce.padEnd(NONCE_MIN_BYTES, "-"),
    prevReceiptHash: null,
    outcome: "settled",
  };
}

describe("epoch checkpoints", () => {
  it("RED then GREEN: checkpoint byte tamper fails verify", () => {
    const k = generateReceiptKeys();
    const receipt = signReceipt(sampleClaims("n1"), k.privateKeyPem, k.publicKeyPem);
    const claims = buildCheckpointClaims(1, [receipt], 1, 2, null);
    const signed = signCheckpoint(claims, k.privateKeyPem, k.publicKeyPem);
    assert.equal(verifyCheckpoint(signed), true);
    const raw = Buffer.from(signed.coseHex, "hex");
    raw[raw.length - 1] ^= 0x01;
    const tampered = { ...signed, coseHex: raw.toString("hex") };
    assert.equal(verifyCheckpoint(tampered), false);
    assert.equal(verifyCheckpoint(signed), true);
  });

  it("RED then GREEN: equivocation on the same epoch", () => {
    const k = generateReceiptKeys();
    const a = signReceipt(sampleClaims("n1", "1"), k.privateKeyPem, k.publicKeyPem);
    const b = signReceipt(sampleClaims("n2", "2"), k.privateKeyPem, k.publicKeyPem);
    const cp1 = signCheckpoint(buildCheckpointClaims(7, [a], 1, 2, null), k.privateKeyPem, k.publicKeyPem);
    const cp2 = signCheckpoint(buildCheckpointClaims(7, [b], 1, 2, null), k.privateKeyPem, k.publicKeyPem);
    const hit = findEquivocation([cp1, cp2]);
    assert.ok(hit);
    assert.equal(hit.epoch, 7);
    assert.equal(hit.hashes.length, 2);
    assert.equal(findEquivocation([cp1, cp1]), null);
  });

  it("RED then GREEN: broken checkpoint chain is detected", () => {
    const k = generateReceiptKeys();
    const r = signReceipt(sampleClaims("n1"), k.privateKeyPem, k.publicKeyPem);
    const first = signCheckpoint(buildCheckpointClaims(1, [r], 1, 2, null), k.privateKeyPem, k.publicKeyPem);
    const secondOk = signCheckpoint(
      buildCheckpointClaims(2, [r], 2, 3, checkpointHash(first)),
      k.privateKeyPem,
      k.publicKeyPem,
    );
    const secondBroken = signCheckpoint(
      buildCheckpointClaims(2, [r], 2, 3, TEST_HASH_OTHER),
      k.privateKeyPem,
      k.publicKeyPem,
    );
    assert.equal(findCheckpointChainBreak([first, secondOk]), null);
    const brk = findCheckpointChainBreak([first, secondBroken]);
    assert.ok(brk);
    assert.equal(brk.reason, "broken-link");
    assert.equal(brk.index, 1);
  });
});

describe("mock transparency service", () => {
  it("registers a receipt and returns a verifiable inclusion receipt", () => {
    const issuer = fixtureEd25519Pems();
    const rk = generateReceiptKeys();
    const receipt = signReceipt(sampleClaims("n1"), rk.privateKeyPem, rk.publicKeyPem);
    const ts = new MemoryTransparencyService(issuer);
    const inc = anchorReceipt(ts, receipt);
    assert.equal(ts.verifyInclusion(inc), true);
    assert.equal(inc.index, 0);
    assert.equal(ts.size(), 1);
  });

  it("registers a checkpoint after a receipt", () => {
    const issuer = fixtureEd25519Pems();
    const rk = generateReceiptKeys();
    const receipt = signReceipt(sampleClaims("n1"), rk.privateKeyPem, rk.publicKeyPem);
    const cp = signCheckpoint(
      buildCheckpointClaims(1, [receipt], 1, 2, null),
      rk.privateKeyPem,
      rk.publicKeyPem,
    );
    const ts = new MemoryTransparencyService(issuer);
    const a = anchorReceipt(ts, receipt);
    const b = anchorCheckpoint(ts, cp);
    assert.equal(ts.verifyInclusion(a), true);
    assert.equal(ts.verifyInclusion(b), true);
    assert.equal(b.index, 1);
  });
});
