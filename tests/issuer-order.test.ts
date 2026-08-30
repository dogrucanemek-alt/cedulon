import { TEST_HASH } from "./hash-fixtures.ts";
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { audit, type Finding } from "@cedulon/audit";
import { buildCheckpointClaims, signCheckpoint } from "@cedulon/checkpoint";
import { generateReceiptKeys, receiptHash, signReceipt, type SignedReceipt } from "@cedulon/receipts";
import { generateExtractKeys, signRailExtract } from "@cedulon/x402-adapter";

const NOW = 1_700_000_000_000;
const WINDOW_END = NOW + 3_600_000;

type Keys = { privateKeyPem: string; publicKeyPem: string };

function chainReceipts(keys: Keys, n: number): SignedReceipt[] {
  const out: SignedReceipt[] = [];
  let prev: string | null = null;
  for (let i = 0; i < n; i += 1) {
    const signed = signReceipt(
      {
        payer: "payer",
        payee: "payee-1",
        amount: "1",
        currency: "USD",
        policyHash: TEST_HASH,
        manifestHash: null,
        noManifest: true,
        x402PaymentRef: `ref-${i}`,
        timestampMs: NOW + i,
        nonce: `n${i}`.padEnd(16, "-"),
        prevReceiptHash: prev,
        outcome: "settled",
      },
      keys.privateKeyPem,
      keys.publicKeyPem,
    );
    out.push(signed);
    prev = receiptHash(signed);
  }
  return out;
}

function settlementsOf(receipts: SignedReceipt[]) {
  return receipts.map((r) => ({
    ref: r.claims.x402PaymentRef ?? r.claims.nonce,
    amount: r.claims.amount,
    currency: r.claims.currency,
    timestampMs: r.claims.timestampMs,
  }));
}

function findingBytes(findings: Finding[]): string {
  return JSON.stringify(findings.map((f) => ({ code: f.code, id: f.id, detail: f.detail })));
}

function reportBytes(report: { findings: Finding[]; warnings: Finding[] }): string {
  return JSON.stringify({
    findings: findingBytes(report.findings),
    warnings: findingBytes(report.warnings),
  });
}

describe("issuer order is the prevReceiptHash chain", () => {
  it("RED then GREEN: shuffled presentation yields a byte-identical finding set", () => {
    const honest = generateReceiptKeys();
    const rail = generateExtractKeys();
    const receipts = chainReceipts(honest, 3);
    const checkpoint = signCheckpoint(
      buildCheckpointClaims(1, receipts, NOW, WINDOW_END, null),
      honest.privateKeyPem,
      honest.publicKeyPem,
    );
    const extract = signRailExtract(
      {
        accountId: "acct",
        railId: "rail",
        windowStartMs: NOW,
        windowEndMs: WINDOW_END,
        settlements: settlementsOf(receipts),
      },
      rail.privateKeyPem,
      rail.publicKeyPem,
    );
    const base = {
      checkpoints: [checkpoint],
      extract,
      issuerTrust: { publicKeyPem: honest.publicKeyPem },
      trust: {
        publicKeyPem: rail.publicKeyPem,
        accountId: "acct",
        railId: "rail",
        windowStartMs: NOW,
        windowEndMs: WINDOW_END,
      },
    };
    const ordered = audit({ ...base, receipts });
    const shuffled = audit({ ...base, receipts: [receipts[2], receipts[0], receipts[1]] });
    assert.equal(reportBytes(shuffled), reportBytes(ordered));
    assert.equal(shuffled.ok, true);
    assert.equal(ordered.ok, true);
  });

  it("chainHeadHash last receipt is the last link of the chain in the window", () => {
    const honest = generateReceiptKeys();
    const receipts = chainReceipts(honest, 2);
    const checkpoint = signCheckpoint(
      buildCheckpointClaims(1, receipts, NOW, WINDOW_END, null),
      honest.privateKeyPem,
      honest.publicKeyPem,
    );
    const presentedLast = receipts[0];
    assert.notEqual(receiptHash(presentedLast), checkpoint.claims.chainHeadHash);
    const report = audit({
      receipts: [receipts[1], receipts[0]],
      checkpoints: [checkpoint],
      settlements: settlementsOf(receipts),
      issuerTrust: { publicKeyPem: honest.publicKeyPem },
    });
    assert.equal(
      report.findings.some((f) => f.code === "checkpoint-head-mismatch"),
      false,
      "head is the last chain link, not the last presented receipt",
    );
  });

  it("measured: zero checkpoints and a receipt is window-coverage", () => {
    const honest = generateReceiptKeys();
    const receipts = chainReceipts(honest, 1);
    const report = audit({
      receipts,
      checkpoints: [],
      settlements: settlementsOf(receipts),
      issuerTrust: { publicKeyPem: honest.publicKeyPem },
    });
    assert.equal(
      report.findings.some((f) => f.code === "window-coverage" && f.id === receipts[0].claims.nonce),
      true,
    );
    assert.equal(report.ok, false);
  });

  it("measured: a receipt after the last closed checkpoint is window-coverage (open epoch)", () => {
    const honest = generateReceiptKeys();
    const first = chainReceipts(honest, 1);
    const later = signReceipt(
      {
        ...first[0].claims,
        nonce: "n-open".padEnd(16, "-"),
        x402PaymentRef: "ref-open",
        timestampMs: WINDOW_END,
        prevReceiptHash: receiptHash(first[0]),
      },
      honest.privateKeyPem,
      honest.publicKeyPem,
    );
    const checkpoint = signCheckpoint(
      buildCheckpointClaims(1, first, NOW, WINDOW_END, null),
      honest.privateKeyPem,
      honest.publicKeyPem,
    );
    const report = audit({
      receipts: [first[0], later],
      checkpoints: [checkpoint],
      settlements: settlementsOf([first[0], later]),
      issuerTrust: { publicKeyPem: honest.publicKeyPem },
    });
    assert.equal(
      report.findings.some((f) => f.code === "window-coverage" && f.id === later.claims.nonce),
      true,
      "half-open window: timestamp === endMs is outside the last closed checkpoint",
    );
  });
});
