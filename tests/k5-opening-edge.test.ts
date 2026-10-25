import { TEST_HASH } from "./hash-fixtures.ts";
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { DEFAULT_CLOCK_SKEW_MS, audit } from "@cedulon/audit";
import { buildCheckpointClaims, signCheckpoint } from "@cedulon/checkpoint";
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

// Tiago, core-04 reading (22 Oct 2026), point 1 and the first mechanical point.
// The rail settles first and the issuer signs after (Section 3.2), so an honest
// payment can straddle either edge. All four quadrants defer; the adjacent
// window's extract resolves the receipt side, a receipt in the bag the row side.
const SKEW = DEFAULT_CLOCK_SKEW_MS;
const PREV_START = NOW - 3_600_000;

function rows(
  rail: { privateKeyPem: string; publicKeyPem: string },
  settlements: { ref: string; timestampMs: number }[],
  windowStartMs = NOW,
  windowEndMs = WINDOW_END,
): SignedRailExtract {
  return signRailExtract(
    {
      accountId: "acct",
      railId: "rail",
      windowStartMs,
      windowEndMs,
      settlements: settlements.map((s) => ({ ref: s.ref, amount: "1", currency: "USD", timestampMs: s.timestampMs })),
    },
    rail.privateKeyPem,
    rail.publicKeyPem,
  );
}

function pinFor(rail: { publicKeyPem: string }) {
  return { publicKeyPem: rail.publicKeyPem, accountId: "acct", railId: "rail", windowStartMs: NOW, windowEndMs: WINDOW_END };
}

function covered(keys: { privateKeyPem: string; publicKeyPem: string }, receipts: SignedReceipt[]) {
  return [signCheckpoint(buildCheckpointClaims(1, receipts, NOW, WINDOW_END, null), keys.privateKeyPem, keys.publicKeyPem)];
}

describe("Tiago core-04 #1: the opening-edge receipt and the closing-edge row defer too", () => {
  it("receipt at S+50 whose settlement (S-100) is on the previous extract is boundary-deferred, not an accusation", () => {
    const honest = generateReceiptKeys();
    const rail = generateExtractKeys();
    const signed = receipt(honest, "open-r", NOW + 50, "n-open-r");
    const report = audit({
      receipts: [signed],
      checkpoints: covered(honest, [signed]),
      extract: rows(rail, []),
      issuerTrust: { publicKeyPem: honest.publicKeyPem },
      trust: pinFor(rail),
    });
    assert.equal(report.findings.some((f) => f.code === "receipt-without-settlement"), false);
    assert.equal(
      report.warnings.some((w) => w.code === "boundary-deferred" && w.id === signed.claims.nonce),
      true,
    );
    assert.equal(report.ok, true);
  });

  it("previousExtract that names the ref closes the opening-edge receipt", () => {
    const honest = generateReceiptKeys();
    const rail = generateExtractKeys();
    const signed = receipt(honest, "open-r", NOW + 50, "n-open-r");
    const report = audit({
      receipts: [signed],
      checkpoints: covered(honest, [signed]),
      extract: rows(rail, []),
      previousExtract: rows(rail, [{ ref: "open-r", timestampMs: NOW - 100 }], PREV_START, NOW),
      issuerTrust: { publicKeyPem: honest.publicKeyPem },
      trust: pinFor(rail),
    } as Parameters<typeof audit>[0]);
    assert.equal(report.findings.some((f) => f.code === "receipt-without-settlement"), false);
    assert.equal(
      report.warnings.some((w) => w.code === "boundary-deferred" && w.id === signed.claims.nonce),
      false,
    );
    assert.equal(report.ok, true);
  });

  it("previousExtract that misses the ref hardens the opening-edge receipt", () => {
    const honest = generateReceiptKeys();
    const rail = generateExtractKeys();
    const signed = receipt(honest, "open-r", NOW + 50, "n-open-r");
    const report = audit({
      receipts: [signed],
      checkpoints: covered(honest, [signed]),
      extract: rows(rail, []),
      previousExtract: rows(rail, [{ ref: "someone-else", timestampMs: NOW - 500 }], PREV_START, NOW),
      issuerTrust: { publicKeyPem: honest.publicKeyPem },
      trust: pinFor(rail),
    } as Parameters<typeof audit>[0]);
    assert.equal(
      report.findings.some((f) => f.code === "receipt-without-settlement" && f.id === signed.claims.nonce),
      true,
    );
    assert.equal(report.ok, false);
  });

  it("previousExtract that does not end where this window starts is extract-scope-mismatch and resolves nothing", () => {
    const honest = generateReceiptKeys();
    const rail = generateExtractKeys();
    const signed = receipt(honest, "open-r", NOW + 50, "n-open-r");
    const report = audit({
      receipts: [signed],
      checkpoints: covered(honest, [signed]),
      extract: rows(rail, []),
      previousExtract: rows(rail, [{ ref: "open-r", timestampMs: NOW - 2_000 }], PREV_START, NOW - 1_000),
      issuerTrust: { publicKeyPem: honest.publicKeyPem },
      trust: pinFor(rail),
    } as Parameters<typeof audit>[0]);
    assert.equal(
      report.findings.some((f) => f.code === "extract-scope-mismatch" && f.id === "previousExtract"),
      true,
    );
    assert.equal(
      report.warnings.some((w) => w.code === "boundary-deferred" && w.id === signed.claims.nonce),
      true,
    );
    assert.equal(report.findings.some((f) => f.code === "receipt-without-settlement"), false);
  });

  it("unmatched row at E-100 (its receipt falls in the next window) is boundary-deferred", () => {
    const rail = generateExtractKeys();
    const report = audit({
      receipts: [],
      checkpoints: [],
      extract: rows(rail, [{ ref: "close-row", timestampMs: WINDOW_END - 100 }]),
      trust: pinFor(rail),
    });
    assert.equal(report.findings.some((f) => f.code === "settlement-without-receipt"), false);
    assert.equal(report.warnings.some((w) => w.code === "boundary-deferred" && w.id === "close-row"), true);
    assert.equal(report.ok, true);
  });
});

describe("Tiago core-04 mechanical 1: 'within clockSkewMs' is a distance of at most clockSkewMs, on both edges", () => {
  it("row exactly clockSkewMs after windowStartMs is deferred; one ms later it is not", () => {
    const rail = generateExtractKeys();
    const at = audit({ receipts: [], checkpoints: [], extract: rows(rail, [{ ref: "r-at", timestampMs: NOW + SKEW }]), trust: pinFor(rail) });
    assert.equal(at.warnings.some((w) => w.code === "boundary-deferred" && w.id === "r-at"), true);
    const past = audit({ receipts: [], checkpoints: [], extract: rows(rail, [{ ref: "r-past", timestampMs: NOW + SKEW + 1 }]), trust: pinFor(rail) });
    assert.equal(past.findings.some((f) => f.code === "settlement-without-receipt" && f.id === "r-past"), true);
  });

  it("row exactly clockSkewMs before windowEndMs is deferred; one ms earlier it is not", () => {
    const rail = generateExtractKeys();
    const at = audit({ receipts: [], checkpoints: [], extract: rows(rail, [{ ref: "c-at", timestampMs: WINDOW_END - SKEW }]), trust: pinFor(rail) });
    assert.equal(at.warnings.some((w) => w.code === "boundary-deferred" && w.id === "c-at"), true);
    const before = audit({ receipts: [], checkpoints: [], extract: rows(rail, [{ ref: "c-before", timestampMs: WINDOW_END - SKEW - 1 }]), trust: pinFor(rail) });
    assert.equal(before.findings.some((f) => f.code === "settlement-without-receipt" && f.id === "c-before"), true);
  });

  it("receipt exactly clockSkewMs after windowStartMs is deferred; one ms later it is not", () => {
    const honest = generateReceiptKeys();
    const rail = generateExtractKeys();
    const at = receipt(honest, "o-at", NOW + SKEW, "n-o-at");
    const atReport = audit({ receipts: [at], checkpoints: covered(honest, [at]), extract: rows(rail, []), issuerTrust: { publicKeyPem: honest.publicKeyPem }, trust: pinFor(rail) });
    assert.equal(atReport.warnings.some((w) => w.code === "boundary-deferred" && w.id === at.claims.nonce), true);
    const past = receipt(honest, "o-past", NOW + SKEW + 1, "n-o-past");
    const pastReport = audit({ receipts: [past], checkpoints: covered(honest, [past]), extract: rows(rail, []), issuerTrust: { publicKeyPem: honest.publicKeyPem }, trust: pinFor(rail) });
    assert.equal(pastReport.findings.some((f) => f.code === "receipt-without-settlement" && f.id === past.claims.nonce), true);
  });

  it("receipt exactly clockSkewMs before windowEndMs is deferred; one ms earlier it is not", () => {
    const honest = generateReceiptKeys();
    const rail = generateExtractKeys();
    const at = receipt(honest, "e-at", WINDOW_END - SKEW, "n-e-at");
    const atReport = audit({ receipts: [at], checkpoints: covered(honest, [at]), extract: rows(rail, []), issuerTrust: { publicKeyPem: honest.publicKeyPem }, trust: pinFor(rail) });
    assert.equal(atReport.warnings.some((w) => w.code === "boundary-deferred" && w.id === at.claims.nonce), true);
    const before = receipt(honest, "e-before", WINDOW_END - SKEW - 1, "n-e-before");
    const beforeReport = audit({ receipts: [before], checkpoints: covered(honest, [before]), extract: rows(rail, []), issuerTrust: { publicKeyPem: honest.publicKeyPem }, trust: pinFor(rail) });
    assert.equal(beforeReport.findings.some((f) => f.code === "receipt-without-settlement" && f.id === before.claims.nonce), true);
  });
});
