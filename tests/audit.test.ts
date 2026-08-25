import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { audit, formatAudit } from "@cedulon/audit";
import {
  buildCheckpointClaims,
  signCheckpoint,
  type SignedCheckpoint,
} from "@cedulon/checkpoint";
import { generateReceiptKeys, receiptHash, signReceipt, type SignedReceipt } from "@cedulon/receipts";
import { RailLedger, type RailSettlement } from "@cedulon/x402-adapter";
import { runBypass } from "../examples/demo/src/bypass.ts";

function chainReceipts(keys: { privateKeyPem: string; publicKeyPem: string }, amounts: string[]): SignedReceipt[] {
  const out: SignedReceipt[] = [];
  let prev: string | null = null;
  amounts.forEach((amount, i) => {
    const signed = signReceipt(
      {
        payer: "p",
        payee: "q",
        amount,
        currency: "USD",
        policyHash: "ph",
        manifestHash: null,
        noManifest: true,
        x402PaymentRef: `x402-n${i}`,
        timestampMs: 1_700_000_000_000 + i,
        nonce: `n${i}`,
        prevReceiptHash: prev,
      },
      keys.privateKeyPem,
      keys.publicKeyPem,
    );
    out.push(signed);
    prev = receiptHash(signed);
  });
  return out;
}

function settlementsOf(receipts: SignedReceipt[]): RailSettlement[] {
  return receipts.map((r) => ({
    ref: r.claims.x402PaymentRef ?? r.claims.nonce,
    amount: r.claims.amount,
    currency: r.claims.currency,
    timestampMs: r.claims.timestampMs,
  }));
}

function oneCheckpoint(keys: { privateKeyPem: string; publicKeyPem: string }, receipts: SignedReceipt[]): SignedCheckpoint {
  return signCheckpoint(
    buildCheckpointClaims(1, receipts, 1_700_000_000_000, 1_700_000_000_010, null),
    keys.privateKeyPem,
    keys.publicKeyPem,
  );
}

describe("cedulon-audit detections", () => {
  it("1 RED then GREEN: settlement without receipt", () => {
    const k = generateReceiptKeys();
    const receipts = chainReceipts(k, ["1"]);
    const settlements = [
      ...settlementsOf(receipts),
      { ref: "bypass-n9", amount: "9", currency: "USD", timestampMs: 1 },
    ];
    const red = audit({ receipts, checkpoints: [oneCheckpoint(k, receipts)], settlements });
    assert.equal(red.ok, false);
    assert.equal(red.findings.some((f) => f.code === "settlement-without-receipt" && f.id === "bypass-n9"), true);
    assert.match(red.summary, /1 settlement without receipt → FAIL/);
    const green = audit({
      receipts,
      checkpoints: [oneCheckpoint(k, receipts)],
      settlements: settlementsOf(receipts),
    });
    assert.equal(green.ok, true);
    assert.equal(green.summary, "audit: balanced");
  });

  it("2 RED then GREEN: receipt without settlement", () => {
    const k = generateReceiptKeys();
    const receipts = chainReceipts(k, ["1", "2"]);
    const red = audit({
      receipts,
      checkpoints: [oneCheckpoint(k, receipts)],
      settlements: settlementsOf(receipts).slice(0, 1),
    });
    assert.equal(red.ok, false);
    assert.equal(red.findings.some((f) => f.code === "receipt-without-settlement"), true);
    const green = audit({
      receipts,
      checkpoints: [oneCheckpoint(k, receipts)],
      settlements: settlementsOf(receipts),
    });
    assert.equal(green.ok, true);
  });

  it("3 RED then GREEN: receipt chain break", () => {
    const k = generateReceiptKeys();
    const receipts = chainReceipts(k, ["1", "2"]);
    const broken = [
      receipts[0],
      signReceipt(
        { ...receipts[1].claims, prevReceiptHash: "deadbeef" },
        k.privateKeyPem,
        k.publicKeyPem,
      ),
    ];
    const red = audit({
      receipts: broken,
      checkpoints: [oneCheckpoint(k, broken)],
      settlements: settlementsOf(broken),
    });
    assert.equal(red.ok, false);
    assert.equal(red.findings.some((f) => f.code === "receipt-chain-break"), true);
    const green = audit({
      receipts,
      checkpoints: [oneCheckpoint(k, receipts)],
      settlements: settlementsOf(receipts),
    });
    assert.equal(green.ok, true);
  });

  it("4 RED then GREEN: checkpoint totals mismatch", () => {
    const k = generateReceiptKeys();
    const receipts = chainReceipts(k, ["1", "2"]);
    const bad = signCheckpoint(
      { ...buildCheckpointClaims(1, receipts, 1_700_000_000_000, 1_700_000_000_010, null), totals: { USD: "99" } },
      k.privateKeyPem,
      k.publicKeyPem,
    );
    const red = audit({ receipts, checkpoints: [bad], settlements: settlementsOf(receipts) });
    assert.equal(red.ok, false);
    assert.equal(red.findings.some((f) => f.code === "checkpoint-total-mismatch"), true);
    const green = audit({
      receipts,
      checkpoints: [oneCheckpoint(k, receipts)],
      settlements: settlementsOf(receipts),
    });
    assert.equal(green.ok, true);
  });

  it("5 GREEN: balanced extract, receipts, and checkpoint", () => {
    const k = generateReceiptKeys();
    const receipts = chainReceipts(k, ["1", "1", "1"]);
    const report = audit({
      receipts,
      checkpoints: [oneCheckpoint(k, receipts)],
      settlements: settlementsOf(receipts),
    });
    assert.equal(report.ok, true);
    assert.equal(report.findings.length, 0);
    assert.equal(formatAudit(report, receipts.length).includes("findings=0"), true);
    const ledger = new RailLedger();
    for (const s of settlementsOf(receipts)) ledger.record(s);
    assert.equal(RailLedger.fromJson(ledger.toJson()).length, 3);
  });

  it("bypass demo is caught by extract reconciliation", () => {
    const ran = runBypass();
    assert.equal(ran.exitCode, 1);
    assert.equal(ran.summary, "audit: 1 settlement without receipt → FAIL");
  });
});
