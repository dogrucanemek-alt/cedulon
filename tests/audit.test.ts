import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { audit, formatAudit } from "@cedulon/audit";
import {
  buildCheckpointClaims,
  signCheckpoint,
  type SignedCheckpoint,
} from "@cedulon/checkpoint";
import {
  counterSign,
  generateReceiptKeys,
  receiptHash,
  signReceipt,
  signReceiptUnchecked,
  type SignedReceipt,
} from "@cedulon/receipts";
import {
  RailLedger,
  generateExtractKeys,
  signRailExtract,
  type RailSettlement,
} from "@cedulon/x402-adapter";
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
    const amount = runBypass(undefined, "amount");
    assert.equal(amount.exitCode, 1);
    assert.match(amount.text, /settlement-mismatch/);
    const nullRef = runBypass(undefined, "null-ref");
    assert.equal(nullRef.exitCode, 1);
    assert.match(nullRef.text, /settled-without-ref/);
    const head = runBypass(undefined, "head");
    assert.equal(head.exitCode, 1);
    assert.match(head.text, /checkpoint-head-mismatch/);
  });
});

describe("adversarial bypasses — RED then GREEN", () => {
  it("6 RED then GREEN: same-ref wrong amount is settlement-mismatch", () => {
    const k = generateReceiptKeys();
    const receipts = chainReceipts(k, ["1"]);
    const wrong = [{ ref: "x402-n0", amount: "9", currency: "USD", timestampMs: 1_700_000_000_000 }];
    const red = audit({ receipts, checkpoints: [oneCheckpoint(k, receipts)], settlements: wrong });
    assert.equal(red.ok, false);
    assert.equal(red.findings.some((f) => f.code === "settlement-mismatch" && f.id === "x402-n0"), true);
    const green = audit({
      receipts,
      checkpoints: [oneCheckpoint(k, receipts)],
      settlements: settlementsOf(receipts),
    });
    assert.equal(green.ok, true);
  });

  it("7 RED then GREEN: settled null-ref is no longer exempt", () => {
    const k = generateReceiptKeys();
    const bad = signReceiptUnchecked(
      {
        payer: "p",
        payee: "q",
        amount: "5",
        currency: "USD",
        policyHash: "ph",
        manifestHash: null,
        noManifest: true,
        x402PaymentRef: null,
        timestampMs: 1_700_000_000_000,
        nonce: "ghost".padEnd(16, "0"),
        prevReceiptHash: null,
        outcome: "settled",
      },
      k.privateKeyPem,
      k.publicKeyPem,
    );
    assert.throws(() => signReceipt(bad.claims, k.privateKeyPem, k.publicKeyPem), /settled receipt requires rail ref/);
    const red = audit({ receipts: [bad], checkpoints: [oneCheckpoint(k, [bad])], settlements: [] });
    assert.equal(red.ok, false);
    assert.equal(red.findings.some((f) => f.code === "settled-without-ref" && f.id === "ghost".padEnd(16, "0")), true);
    const receipts = chainReceipts(k, ["1"]);
    const green = audit({
      receipts,
      checkpoints: [oneCheckpoint(k, receipts)],
      settlements: settlementsOf(receipts),
    });
    assert.equal(green.ok, true);
  });

  it("8 RED then GREEN: garbage chainHeadHash is checkpoint-head-mismatch", () => {
    const k = generateReceiptKeys();
    const receipts = chainReceipts(k, ["1"]);
    const garbage = signCheckpoint(
      { ...buildCheckpointClaims(1, receipts, 1_700_000_000_000, 1_700_000_000_010, null), chainHeadHash: "deadbeef" },
      k.privateKeyPem,
      k.publicKeyPem,
    );
    const red = audit({ receipts, checkpoints: [garbage], settlements: settlementsOf(receipts) });
    assert.equal(red.ok, false);
    assert.equal(red.findings.some((f) => f.code === "checkpoint-head-mismatch"), true);
    const green = audit({
      receipts,
      checkpoints: [oneCheckpoint(k, receipts)],
      settlements: settlementsOf(receipts),
    });
    assert.equal(green.ok, true);
  });
});

describe("new detections — RED then GREEN", () => {
  it("9 RED then GREEN: duplicate-ref on settlement and receipt", () => {
    const k = generateReceiptKeys();
    const receipts = chainReceipts(k, ["1", "2"]);
    const cloned = [
      receipts[0],
      signReceipt({ ...receipts[1].claims, x402PaymentRef: receipts[0].claims.x402PaymentRef }, k.privateKeyPem, k.publicKeyPem),
    ];
    const redReceipts = audit({
      receipts: cloned,
      checkpoints: [oneCheckpoint(k, cloned)],
      settlements: settlementsOf(cloned),
    });
    assert.equal(redReceipts.ok, false);
    assert.equal(redReceipts.findings.some((f) => f.code === "duplicate-ref"), true);
    const settlements = [
      ...settlementsOf(receipts),
      { ref: "x402-n0", amount: "1", currency: "USD", timestampMs: 1 },
    ];
    const redSettlements = audit({
      receipts,
      checkpoints: [oneCheckpoint(k, receipts)],
      settlements,
    });
    assert.equal(redSettlements.findings.some((f) => f.code === "duplicate-ref" && f.id === "x402-n0"), true);
    const green = audit({
      receipts,
      checkpoints: [oneCheckpoint(k, receipts)],
      settlements: settlementsOf(receipts),
    });
    assert.equal(green.ok, true);
  });

  it("10 RED then GREEN: equivocation is wired into audit()", () => {
    const k = generateReceiptKeys();
    const a = chainReceipts(k, ["1"]);
    const b = chainReceipts(k, ["2"]);
    const cp1 = signCheckpoint(buildCheckpointClaims(7, a, 1_700_000_000_000, 1_700_000_000_010, null), k.privateKeyPem, k.publicKeyPem);
    const cp2 = signCheckpoint(buildCheckpointClaims(7, b, 1_700_000_000_000, 1_700_000_000_010, null), k.privateKeyPem, k.publicKeyPem);
    const red = audit({ receipts: a, checkpoints: [cp1, cp2], settlements: settlementsOf(a) });
    assert.equal(red.ok, false);
    assert.equal(red.findings.some((f) => f.code === "equivocation" && f.id === "epoch-7"), true);
    const green = audit({ receipts: a, checkpoints: [cp1], settlements: settlementsOf(a) });
    assert.equal(green.ok, true);
  });

  it("11 RED then GREEN: window gap and overlap", () => {
    const k = generateReceiptKeys();
    const receipts = chainReceipts(k, ["1", "2"]);
    const gap = signCheckpoint(
      buildCheckpointClaims(1, [receipts[0]], 1_700_000_000_000, 1_700_000_000_001, null),
      k.privateKeyPem,
      k.publicKeyPem,
    );
    const redGap = audit({ receipts, checkpoints: [gap], settlements: settlementsOf(receipts) });
    assert.equal(redGap.findings.some((f) => f.code === "window-coverage" && f.id === "n1".padEnd(16, "0")), true);
    const a = signCheckpoint(
      buildCheckpointClaims(1, receipts, 1_700_000_000_000, 1_700_000_000_010, null),
      k.privateKeyPem,
      k.publicKeyPem,
    );
    const b = signCheckpoint(
      buildCheckpointClaims(2, receipts, 1_700_000_000_000, 1_700_000_000_010, null),
      k.privateKeyPem,
      k.publicKeyPem,
    );
    const redOverlap = audit({ receipts, checkpoints: [a, b], settlements: settlementsOf(receipts) });
    assert.equal(redOverlap.findings.some((f) => f.code === "window-coverage"), true);
    const green = audit({
      receipts,
      checkpoints: [oneCheckpoint(k, receipts)],
      settlements: settlementsOf(receipts),
    });
    assert.equal(green.ok, true);
  });

  it("12 RED then GREEN: aborted receipt is excluded from totals and matching", () => {
    const k = generateReceiptKeys();
    const settled = chainReceipts(k, ["1"]);
    const aborted = signReceipt(
      {
        payer: "p",
        payee: "q",
        amount: "99",
        currency: "USD",
        policyHash: "ph",
        manifestHash: null,
        noManifest: true,
        x402PaymentRef: null,
        timestampMs: 1_700_000_000_001,
        nonce: "abort-1".padEnd(16, "0"),
        prevReceiptHash: receiptHash(settled[0]),
        outcome: "aborted",
      },
      k.privateKeyPem,
      k.publicKeyPem,
    );
    const receipts = [...settled, aborted];
    const withAbort = signCheckpoint(
      buildCheckpointClaims(1, receipts, 1_700_000_000_000, 1_700_000_000_010, null),
      k.privateKeyPem,
      k.publicKeyPem,
    );
    assert.deepEqual(withAbort.claims.totals, { USD: "1" });
    assert.equal(withAbort.claims.receiptCount, 2);
    const green = audit({
      receipts,
      checkpoints: [withAbort],
      settlements: settlementsOf(settled),
    });
    assert.equal(green.ok, true);
    const badTotals = signCheckpoint(
      { ...withAbort.claims, totals: { USD: "100" } },
      k.privateKeyPem,
      k.publicKeyPem,
    );
    const red = audit({ receipts, checkpoints: [badTotals], settlements: settlementsOf(settled) });
    assert.equal(red.findings.some((f) => f.code === "checkpoint-total-mismatch"), true);
  });

  it("13 RED then GREEN: unsigned extract warns; signed extract verifies", () => {
    const k = generateReceiptKeys();
    const ek = generateExtractKeys();
    const receipts = chainReceipts(k, ["1"]);
    const settlements = settlementsOf(receipts);
    const unsigned = audit({ receipts, checkpoints: [oneCheckpoint(k, receipts)], settlements });
    assert.equal(unsigned.ok, true);
    assert.equal(unsigned.guarantee, "conditional");
    assert.equal(unsigned.warnings.some((f) => f.code === "unauthenticated-extract"), true);
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
    const green = audit({
      receipts,
      checkpoints: [oneCheckpoint(k, receipts)],
      settlements,
      extract,
    });
    assert.equal(green.ok, true);
    assert.equal(green.guarantee, "unconditional");
    assert.equal(green.warnings.length, 0);
    const bad = { ...extract, signature: "aa" };
    const red = audit({
      receipts,
      checkpoints: [oneCheckpoint(k, receipts)],
      settlements,
      extract: bad,
    });
    assert.equal(red.ok, true);
    assert.equal(red.guarantee, "conditional");
    assert.equal(red.warnings.some((f) => f.code === "unauthenticated-extract"), true);
    const ledger = new RailLedger();
    for (const s of settlements) ledger.record(s);
    const fromLedger = ledger.signedExtract(ek.privateKeyPem, ek.publicKeyPem);
    assert.equal(fromLedger.body.settlements.length, 1);
  });

  it("14 RED then GREEN: bad payee countersignature is countersign-bad", () => {
    const k = generateReceiptKeys();
    const payee = generateReceiptKeys();
    const receipts = chainReceipts(k, ["1"]);
    const good = counterSign(receipts[0], payee.privateKeyPem, payee.publicKeyPem);
    const raw = Buffer.from(good.counterCoseHex ?? "", "hex");
    raw[raw.length - 1] ^= 0x01;
    const bad = { ...good, counterCoseHex: raw.toString("hex") };
    const red = audit({
      receipts: [bad],
      checkpoints: [oneCheckpoint(k, [bad])],
      settlements: settlementsOf([bad]),
    });
    assert.equal(red.findings.some((f) => f.code === "countersign-bad"), true);
    const green = audit({
      receipts: [good],
      checkpoints: [oneCheckpoint(k, [good])],
      settlements: settlementsOf([good]),
    });
    assert.equal(green.ok, true);
  });
});
