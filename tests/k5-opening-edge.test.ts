import { TEST_HASH } from "./hash-fixtures.ts";
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { audit } from "@cedulon/audit";
import { generateReceiptKeys, signReceipt, type SignedReceipt } from "@cedulon/receipts";
import { generateExtractKeys, signRailExtract, type SignedRailExtract } from "@cedulon/x402-adapter";

const NOW = 1_700_000_000_000;
const WINDOW_END = NOW + 3_600_000;
const OPENING = NOW + 1_000;
const CLOSING = WINDOW_END - 1;

function receipt(
  keys: { privateKeyPem: string; publicKeyPem: string },
  ref: string,
  timestampMs: number,
  nonce: string,
): SignedReceipt {
  return signReceipt(
    {
      payer: "payer",
      payee: "payee-1",
      amount: "1",
      currency: "USD",
      policyHash: TEST_HASH,
      manifestHash: null,
      noManifest: true,
      x402PaymentRef: ref,
      timestampMs,
      nonce: nonce.padEnd(16, "-"),
      prevReceiptHash: null,
      outcome: "settled",
    },
    keys.privateKeyPem,
    keys.publicKeyPem,
  );
}

function extract(
  rail: { privateKeyPem: string; publicKeyPem: string },
  ref: string,
  timestampMs: number,
  windowStartMs = NOW,
  windowEndMs = WINDOW_END,
): SignedRailExtract {
  return signRailExtract(
    {
      accountId: "acct",
      railId: "rail",
      windowStartMs,
      windowEndMs,
      settlements: [{ ref, amount: "1", currency: "USD", timestampMs }],
    },
    rail.privateKeyPem,
    rail.publicKeyPem,
  );
}

describe("K5 opening edge is ref-first only (the 7-row table)", () => {
  it("1: ref on this extract, receipt timestamp outside the window — ref-first holds", () => {
    const honest = generateReceiptKeys();
    const rail = generateExtractKeys();
    const signed = receipt(honest, "ref-edge", NOW - 60_000, "n-prior");
    const report = audit({
      receipts: [signed],
      checkpoints: [],
      extract: extract(rail, "ref-edge", OPENING),
      issuerTrust: { publicKeyPem: honest.publicKeyPem },
      trust: {
        publicKeyPem: rail.publicKeyPem,
        accountId: "acct",
        railId: "rail",
        windowStartMs: NOW,
        windowEndMs: WINDOW_END,
      },
    });
    assert.equal(report.findings.some((f) => f.code === "receipt-without-settlement"), false);
    assert.equal(report.findings.some((f) => f.code === "settlement-without-receipt"), false);
  });

  it("2: unmatched settled receipt inside closing δ is boundary-deferred", () => {
    const honest = generateReceiptKeys();
    const rail = generateExtractKeys();
    const signed = receipt(honest, "ref-late", CLOSING, "n-late");
    const report = audit({
      receipts: [signed],
      checkpoints: [],
      extract: extract(rail, "other", NOW + 1_800_000),
      issuerTrust: { publicKeyPem: honest.publicKeyPem },
      trust: {
        publicKeyPem: rail.publicKeyPem,
        accountId: "acct",
        railId: "rail",
        windowStartMs: NOW,
        windowEndMs: WINDOW_END,
      },
    });
    assert.equal(report.findings.some((f) => f.code === "receipt-without-settlement"), false);
    assert.equal(
      report.warnings.some((w) => w.code === "boundary-deferred" && w.id === signed.claims.nonce),
      true,
    );
  });

  it("3: unmatched opening-δ row, no nextExtract — boundary-deferred, ok", () => {
    const honest = generateReceiptKeys();
    const rail = generateExtractKeys();
    const report = audit({
      receipts: [],
      checkpoints: [],
      extract: extract(rail, "open-1", OPENING),
      issuerTrust: { publicKeyPem: honest.publicKeyPem },
      trust: {
        publicKeyPem: rail.publicKeyPem,
        accountId: "acct",
        railId: "rail",
        windowStartMs: NOW,
        windowEndMs: WINDOW_END,
      },
    });
    assert.equal(report.warnings.some((w) => w.code === "boundary-deferred" && w.id === "open-1"), true);
    assert.equal(report.findings.some((f) => f.code === "settlement-without-receipt"), false);
    assert.equal(report.ok, true);
  });

  it("4: closing deferred + nextExtract that names the ref closes", () => {
    const honest = generateReceiptKeys();
    const rail = generateExtractKeys();
    const signed = receipt(honest, "ref-late", CLOSING, "n-late");
    const report = audit({
      receipts: [signed],
      checkpoints: [],
      extract: extract(rail, "other", NOW + 1_800_000),
      nextExtract: extract(rail, "ref-late", WINDOW_END, WINDOW_END, WINDOW_END + 1_000),
      issuerTrust: { publicKeyPem: honest.publicKeyPem },
      trust: {
        publicKeyPem: rail.publicKeyPem,
        accountId: "acct",
        railId: "rail",
        windowStartMs: NOW,
        windowEndMs: WINDOW_END,
      },
    });
    assert.equal(report.findings.some((f) => f.code === "receipt-without-settlement"), false);
    assert.equal(
      report.warnings.some((w) => w.code === "boundary-deferred" && w.id === signed.claims.nonce),
      false,
    );
  });

  it("5: closing deferred + nextExtract that misses the ref hardens", () => {
    const honest = generateReceiptKeys();
    const rail = generateExtractKeys();
    const signed = receipt(honest, "ref-late", CLOSING, "n-late");
    const report = audit({
      receipts: [signed],
      checkpoints: [],
      extract: extract(rail, "other", NOW + 1_800_000),
      nextExtract: extract(rail, "someone-else", WINDOW_END, WINDOW_END, WINDOW_END + 1_000),
      issuerTrust: { publicKeyPem: honest.publicKeyPem },
      trust: {
        publicKeyPem: rail.publicKeyPem,
        accountId: "acct",
        railId: "rail",
        windowStartMs: NOW,
        windowEndMs: WINDOW_END,
      },
    });
    assert.equal(
      report.findings.some((f) => f.code === "receipt-without-settlement" && f.id === signed.claims.nonce),
      true,
    );
  });

  it("6 RED then GREEN: unmatched opening-δ row + foreign nextExtract stays deferred, ok", () => {
    const honest = generateReceiptKeys();
    const rail = generateExtractKeys();
    const report = audit({
      receipts: [],
      checkpoints: [],
      extract: extract(rail, "open-1", OPENING),
      nextExtract: extract(rail, "foreign", WINDOW_END, WINDOW_END, WINDOW_END + 1_000),
      issuerTrust: { publicKeyPem: honest.publicKeyPem },
      trust: {
        publicKeyPem: rail.publicKeyPem,
        accountId: "acct",
        railId: "rail",
        windowStartMs: NOW,
        windowEndMs: WINDOW_END,
      },
    });
    assert.equal(report.warnings.some((w) => w.code === "boundary-deferred" && w.id === "open-1"), true);
    assert.equal(report.findings.some((f) => f.code === "settlement-without-receipt"), false);
    assert.equal(report.ok, true);
  });

  it("7: prior-window receipt with the same ref closes the opening row; nextExtract does not reopen it", () => {
    const honest = generateReceiptKeys();
    const rail = generateExtractKeys();
    const signed = receipt(honest, "open-1", NOW - 60_000, "n-prior");
    const extractBody = extract(rail, "open-1", OPENING);
    const trust = {
      publicKeyPem: rail.publicKeyPem,
      accountId: "acct",
      railId: "rail",
      windowStartMs: NOW,
      windowEndMs: WINDOW_END,
    };
    const closed = audit({
      receipts: [signed],
      checkpoints: [],
      extract: extractBody,
      issuerTrust: { publicKeyPem: honest.publicKeyPem },
      trust,
    });
    assert.equal(closed.findings.some((f) => f.code === "settlement-without-receipt"), false);
    assert.equal(closed.findings.some((f) => f.code === "receipt-without-settlement"), false);
    const withNext = audit({
      receipts: [signed],
      checkpoints: [],
      extract: extractBody,
      nextExtract: extract(rail, "foreign", WINDOW_END, WINDOW_END, WINDOW_END + 1_000),
      issuerTrust: { publicKeyPem: honest.publicKeyPem },
      trust,
    });
    assert.equal(withNext.findings.some((f) => f.code === "settlement-without-receipt"), false);
    assert.equal(withNext.findings.some((f) => f.code === "receipt-without-settlement"), false);
  });
});
