import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { audit } from "@cedulon/audit";
import {
  MemoryTransparencyService,
  anchorCheckpoint,
  buildCheckpointClaims,
  signCheckpoint,
  statementHashOfCheckpoint,
  type SignedCheckpoint,
} from "@cedulon/checkpoint";
import { fixtureEd25519Pems } from "@cedulon/cose";
import {
  generateReceiptKeys,
  receiptHash,
  signReceipt,
  type SignedReceipt,
} from "@cedulon/receipts";
import { generateExtractKeys, signRailExtract, type RailSettlement } from "@cedulon/x402-adapter";

function chainReceipts(
  keys: { privateKeyPem: string; publicKeyPem: string },
  amounts: string[],
): SignedReceipt[] {
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
        nonce: `n${i}`.padEnd(16, "0"),
        prevReceiptHash: prev,
        outcome: "settled",
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

function oneCheckpoint(
  keys: { privateKeyPem: string; publicKeyPem: string },
  receipts: SignedReceipt[],
  epoch = 1,
  prev: string | null = null,
): SignedCheckpoint {
  return signCheckpoint(
    buildCheckpointClaims(epoch, receipts, 1_700_000_000_000, 1_700_000_000_010, prev),
    keys.privateKeyPem,
    keys.publicKeyPem,
  );
}

function trustedExtract(
  receipts: SignedReceipt[],
  checkpoints: SignedCheckpoint[],
  extra: Record<string, unknown> = {},
) {
  const ek = generateExtractKeys();
  const settlements = settlementsOf(receipts);
  const extract = signRailExtract(
    {
      accountId: "acct-1",
      railId: "mock-rail",
      windowStartMs: 1_700_000_000_000,
      windowEndMs: 1_700_000_000_010,
      settlements,
    },
    ek.privateKeyPem,
    ek.publicKeyPem,
  );
  return audit({
    receipts,
    checkpoints,
    settlements,
    extract,
    trust: {
      publicKeyPem: ek.publicKeyPem,
      accountId: "acct-1",
      railId: "mock-rail",
      windowStartMs: 1_700_000_000_000,
      windowEndMs: 1_700_000_000_010,
    },
    ...extra,
  });
}

describe("A — transparency witness on the audit path", () => {
  it("RED: checkpoint-withheld when the log has a checkpoint the chain does not present", () => {
    const k = generateReceiptKeys();
    const receipts = chainReceipts(k, ["1"]);
    const presented = oneCheckpoint(k, receipts, 1);
    const withheld = signCheckpoint(
      buildCheckpointClaims(2, receipts, 1_700_000_000_010, 1_700_000_000_020, statementHashOfCheckpoint(presented)),
      k.privateKeyPem,
      k.publicKeyPem,
    );
    const ts = new MemoryTransparencyService(fixtureEd25519Pems());
    const presentedReceipt = anchorCheckpoint(ts, presented);
    const withheldReceipt = anchorCheckpoint(ts, withheld);
    const report = audit({
      receipts,
      checkpoints: [presented],
      settlements: settlementsOf(receipts),
      inclusionReceipts: [presentedReceipt, withheldReceipt],
    });
    assert.equal(report.ok, false);
    assert.equal(
      report.findings.some((f) => f.code === "checkpoint-withheld"),
      true,
      `expected checkpoint-withheld, got ${JSON.stringify(report.findings)}`,
    );
    assert.equal(
      report.findings.some((f) => f.code === "window-coverage"),
      false,
      "withheld is not window-coverage",
    );
  });

  it("checkpoint-not-anchored is a warning when the witness is configured but this checkpoint has no receipt", () => {
    const k = generateReceiptKeys();
    const receipts = chainReceipts(k, ["1"]);
    const cp = oneCheckpoint(k, receipts);
    const report = trustedExtract(receipts, [cp], { inclusionReceipts: [] });
    assert.equal(report.ok, true);
    assert.equal(report.guarantee, "conditional");
    assert.equal(
      report.warnings.some((f) => f.code === "checkpoint-not-anchored"),
      true,
    );
    assert.equal(
      report.findings.some((f) => f.code === "checkpoint-not-anchored"),
      false,
    );
  });

  it("a holding witness lifts T11 conditionality (trusted extract stays unconditional)", () => {
    const k = generateReceiptKeys();
    const receipts = chainReceipts(k, ["1"]);
    const cp = oneCheckpoint(k, receipts);
    const ts = new MemoryTransparencyService(fixtureEd25519Pems());
    const inc = anchorCheckpoint(ts, cp);
    const report = trustedExtract(receipts, [cp], { inclusionReceipts: [inc] });
    assert.equal(report.ok, true);
    assert.equal(report.guarantee, "unconditional");
    assert.equal(report.warnings.length, 0);
  });

  it("omitting inclusionReceipts keeps today's report (backward compatible)", () => {
    const k = generateReceiptKeys();
    const receipts = chainReceipts(k, ["1"]);
    const cp = oneCheckpoint(k, receipts);
    const without = trustedExtract(receipts, [cp]);
    const alsoWithout = trustedExtract(receipts, [cp]);
    assert.equal(without.ok, alsoWithout.ok);
    assert.deepEqual(without.findings, alsoWithout.findings);
    assert.deepEqual(without.warnings, alsoWithout.warnings);
    assert.equal(without.guarantee, "unconditional");
    assert.equal(
      without.warnings.some((f) => f.code === "checkpoint-not-anchored" || f.code === "checkpoint-withheld"),
      false,
    );
    assert.equal(
      without.findings.some((f) => f.code === "checkpoint-not-anchored" || f.code === "checkpoint-withheld"),
      false,
    );
  });

  it("window-coverage still fires on its own condition, without a withheld finding", () => {
    const k = generateReceiptKeys();
    const receipts = chainReceipts(k, ["1", "2"]);
    const gap = signCheckpoint(
      buildCheckpointClaims(1, [receipts[0]], 1_700_000_000_000, 1_700_000_000_001, null),
      k.privateKeyPem,
      k.publicKeyPem,
    );
    const report = audit({
      receipts,
      checkpoints: [gap],
      settlements: settlementsOf(receipts),
    });
    assert.equal(
      report.findings.some((f) => f.code === "window-coverage"),
      true,
    );
    assert.equal(
      report.findings.some((f) => f.code === "checkpoint-withheld"),
      false,
    );
  });
});

describe("B — equivocation via the witness", () => {
  it("RED: same epoch, one checkpoint presented, a different verified copy in the witness", () => {
    const k = generateReceiptKeys();
    const a = chainReceipts(k, ["1"]);
    const b = chainReceipts(k, ["2"]);
    const presented = signCheckpoint(
      buildCheckpointClaims(7, a, 1_700_000_000_000, 1_700_000_000_010, null),
      k.privateKeyPem,
      k.publicKeyPem,
    );
    const other = signCheckpoint(
      buildCheckpointClaims(7, b, 1_700_000_000_000, 1_700_000_000_010, null),
      k.privateKeyPem,
      k.publicKeyPem,
    );
    const ts = new MemoryTransparencyService(fixtureEd25519Pems());
    const presentedReceipt = anchorCheckpoint(ts, presented);
    const otherReceipt = anchorCheckpoint(ts, other);
    const report = audit({
      receipts: a,
      checkpoints: [presented],
      settlements: settlementsOf(a),
      inclusionReceipts: [presentedReceipt, otherReceipt],
    });
    assert.equal(report.ok, false);
    assert.equal(
      report.findings.some((f) => f.code === "equivocation" && f.id === "epoch-7"),
      true,
      `expected equivocation on epoch 7, got ${JSON.stringify(report.findings)}`,
    );
  });
});

describe("C — checkpoint totals redaction", () => {
  it("RED: redacted totals warn and stay conditional, and do not fail", () => {
    const k = generateReceiptKeys();
    const receipts = chainReceipts(k, ["1"]);
    const cp = oneCheckpoint(k, receipts);
    const redacted = { ...cp, omitted: ["totals"] as Array<keyof typeof cp.claims> };
    const report = trustedExtract(receipts, [redacted]);
    assert.equal(report.ok, true);
    assert.equal(report.guarantee, "conditional");
    assert.equal(
      report.warnings.some((f) => f.code === "checkpoint-totals-redacted"),
      true,
    );
  });

  it("redacted totals do not produce checkpoint-total-mismatch", () => {
    const k = generateReceiptKeys();
    const receipts = chainReceipts(k, ["1"]);
    const cp = oneCheckpoint(k, receipts);
    const redacted = {
      ...cp,
      claims: { ...cp.claims, totals: {} },
      omitted: ["totals"] as Array<keyof typeof cp.claims>,
    };
    const report = audit({
      receipts,
      checkpoints: [redacted],
      settlements: settlementsOf(receipts),
    });
    assert.equal(
      report.findings.some((f) => f.code === "checkpoint-total-mismatch"),
      false,
      `redacted totals must not be a mismatch: ${JSON.stringify(report.findings)}`,
    );
  });

  it("an empty totals object is not a redaction", () => {
    const k = generateReceiptKeys();
    const receipts = chainReceipts(k, ["1"]);
    const empty = signCheckpoint(
      { ...buildCheckpointClaims(1, receipts, 1_700_000_000_000, 1_700_000_000_010, null), totals: {} },
      k.privateKeyPem,
      k.publicKeyPem,
    );
    const report = audit({
      receipts,
      checkpoints: [empty],
      settlements: settlementsOf(receipts),
    });
    assert.equal(report.ok, false);
    assert.equal(
      report.findings.some((f) => f.code === "checkpoint-total-mismatch"),
      true,
    );
    assert.equal(
      report.warnings.some((f) => f.code === "checkpoint-totals-redacted"),
      false,
    );
  });

  it("structural field redaction is fail-closed", () => {
    const k = generateReceiptKeys();
    const receipts = chainReceipts(k, ["1"]);
    const cp = oneCheckpoint(k, receipts);
    const redacted = { ...cp, omitted: ["epoch"] as Array<keyof typeof cp.claims> };
    const report = audit({
      receipts,
      checkpoints: [redacted],
      settlements: settlementsOf(receipts),
    });
    assert.equal(report.ok, false);
  });
});
