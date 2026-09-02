import { TEST_HASH } from "./hash-fixtures.ts";
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { audit, formatAudit, toFindingObject, type AuditCounts, type AuditReport } from "@cedulon/audit";
import { buildCheckpointClaims, signCheckpoint, type SignedCheckpoint } from "@cedulon/checkpoint";
import { generateReceiptKeys, receiptHash, signReceipt, type SignedReceipt } from "@cedulon/receipts";
import {
  generateExtractKeys,
  signRailExtract,
  type RailSettlement,
  type SignedRailExtract,
} from "@cedulon/x402-adapter";

const NOW = 1_700_000_000_000;
const WINDOW_END = NOW + 3_600_000;
const OPENING = NOW + 1_000;
const MIDDLE = NOW + 1_800_000;
const CLOSING = WINDOW_END - 1;

type Keys = { privateKeyPem: string; publicKeyPem: string };

type Spec = {
  ref: string | null;
  at: number;
  nonce: string;
  outcome?: "settled" | "aborted";
};

/** One issuer's chain, each receipt linked to the one before it. */
function chain(keys: Keys, specs: Spec[]): SignedReceipt[] {
  const out: SignedReceipt[] = [];
  for (const spec of specs) {
    out.push(
      signReceipt(
        {
          payer: "payer",
          payee: "payee-1",
          amount: "1",
          currency: "USD",
          policyHash: TEST_HASH,
          manifestHash: null,
          noManifest: true,
          x402PaymentRef: spec.ref,
          timestampMs: spec.at,
          nonce: spec.nonce.padEnd(16, "-"),
          prevReceiptHash: out.length === 0 ? null : receiptHash(out[out.length - 1]),
          outcome: spec.outcome ?? "settled",
        },
        keys.privateKeyPem,
        keys.publicKeyPem,
      ),
    );
  }
  return out;
}

/** One checkpoint over the whole chain, so window coverage is not the finding under test. */
function checkpointOver(keys: Keys, receipts: SignedReceipt[]): SignedCheckpoint {
  return signCheckpoint(
    buildCheckpointClaims(1, receipts, NOW - 120_000, WINDOW_END + 120_000, null),
    keys.privateKeyPem,
    keys.publicKeyPem,
  );
}

function row(ref: string, timestampMs: number): RailSettlement {
  return { ref, amount: "1", currency: "USD", timestampMs };
}

function extract(
  rail: Keys,
  settlements: RailSettlement[],
  windowStartMs = NOW,
  windowEndMs = WINDOW_END,
): SignedRailExtract {
  return signRailExtract(
    { accountId: "acct", railId: "rail", windowStartMs, windowEndMs, settlements },
    rail.privateKeyPem,
    rail.publicKeyPem,
  );
}

function trustFor(rail: Keys) {
  return {
    publicKeyPem: rail.publicKeyPem,
    accountId: "acct",
    railId: "rail",
    windowStartMs: NOW,
    windowEndMs: WINDOW_END,
  };
}

/** The two population-conservation identities every report must satisfy. */
function assertConserved(counts: AuditCounts): void {
  const r = counts.receipts;
  const s = counts.settlements;
  assert.equal(r.inScope, r.aborted + r.settled, "in-scope receipts split into aborted and settled");
  assert.equal(
    r.settled,
    r.matched + r.deferred + r.carried + r.unmatched + r.repeated + r.unreconciled,
    "every settled receipt lands in exactly one class",
  );
  assert.equal(
    s.rows,
    s.matched + s.deferred + s.unmatched + s.repeated + s.unreconciled,
    "every settlement row lands in exactly one class",
  );
  assert.equal(r.matched, s.matched, "a match is one receipt against one row");
  assert.ok(r.attested <= r.submitted);
  assert.ok(r.inScope <= r.attested);
}

function counted(report: AuditReport): AuditCounts {
  assert.ok(report.counts, "the report carries counts");
  assertConserved(report.counts!);
  return report.counts!;
}

describe("Round 5: the report publishes the class counts it already computes", () => {
  it("1 RED then GREEN: a closing-edge receipt the next window names is counted as carried, not dropped", () => {
    const honest = generateReceiptKeys();
    const rail = generateExtractKeys();
    const receipts = chain(honest, [
      { ref: "ref-match", at: MIDDLE, nonce: "n-match" },
      { ref: "ref-late", at: CLOSING, nonce: "n-late" },
    ]);
    const report = audit({
      receipts,
      checkpoints: [checkpointOver(honest, receipts)],
      extract: extract(rail, [row("ref-match", MIDDLE)]),
      nextExtract: extract(rail, [row("ref-late", WINDOW_END)], WINDOW_END, WINDOW_END + 1_000),
      issuerTrust: { publicKeyPem: honest.publicKeyPem },
      trust: trustFor(rail),
    });
    // The behaviour Round 5 accepted: balanced, no finding, no warning; the
    // row belongs to the neighbouring window.
    assert.equal(report.summary, "audit: balanced", report.findings.map((f) => f.code).join(","));
    assert.equal(report.warnings.some((w) => w.code === "boundary-deferred"), false);
    // What it asked for: the exclusion is visible in the count.
    const c = counted(report);
    assert.equal(c.receipts.submitted, 2);
    assert.equal(c.receipts.settled, 2);
    assert.equal(c.receipts.matched, 1);
    assert.equal(c.receipts.carried, 1);
    assert.equal(c.receipts.unmatched, 0);
    assert.equal(c.settlements.rows, 1);
    assert.equal(c.settlements.matched, 1);
  });

  it("2 RED then GREEN: an aborted receipt is counted as aborted, so a refused spend is not absent", () => {
    const honest = generateReceiptKeys();
    const rail = generateExtractKeys();
    const receipts = chain(honest, [{ ref: null, at: MIDDLE, nonce: "n-abort", outcome: "aborted" }]);
    const report = audit({
      receipts,
      checkpoints: [checkpointOver(honest, receipts)],
      extract: extract(rail, []),
      issuerTrust: { publicKeyPem: honest.publicKeyPem },
      trust: trustFor(rail),
    });
    assert.equal(report.summary, "audit: balanced", report.findings.map((f) => f.code).join(","));
    const c = counted(report);
    assert.equal(c.receipts.submitted, 1);
    assert.equal(c.receipts.inScope, 1);
    assert.equal(c.receipts.aborted, 1);
    assert.equal(c.receipts.settled, 0);
    assert.equal(c.settlements.rows, 0);
  });

  it("3: matched, deferred, unmatched and repeated rows each land in one class and the identities hold", () => {
    const honest = generateReceiptKeys();
    const rail = generateExtractKeys();
    const receipts = chain(honest, [
      { ref: "ref-match", at: MIDDLE, nonce: "n-match" },
      { ref: "ref-only-receipt", at: MIDDLE, nonce: "n-only-r" },
      { ref: "ref-dup", at: MIDDLE, nonce: "n-dup-a" },
      { ref: "ref-dup", at: MIDDLE + 1, nonce: "n-dup-b" },
      { ref: "ref-late", at: CLOSING, nonce: "n-late" },
    ]);
    const rows = [
      row("ref-match", MIDDLE),
      row("ref-only-row", MIDDLE),
      row("ref-early", OPENING),
      row("ref-dup", MIDDLE),
    ];
    const report = audit({
      receipts,
      checkpoints: [checkpointOver(honest, receipts)],
      extract: extract(rail, rows),
      issuerTrust: { publicKeyPem: honest.publicKeyPem },
      trust: trustFor(rail),
    });
    const c = counted(report);
    assert.deepEqual(c.receipts, {
      submitted: 5,
      attested: 5,
      inScope: 5,
      aborted: 0,
      settled: 5,
      matched: 1,
      deferred: 1,
      carried: 0,
      unmatched: 1,
      repeated: 2,
      unreconciled: 0,
    });
    assert.deepEqual(c.settlements, {
      rows: 4,
      matched: 1,
      deferred: 1,
      unmatched: 1,
      repeated: 1,
      unreconciled: 0,
    });
    assert.equal(report.findings.filter((f) => f.code === "receipt-without-settlement").length, 1);
    assert.equal(report.findings.filter((f) => f.code === "settlement-without-receipt").length, 1);
  });

  it("4: a receipt the issuer pin rejects is submitted but not attested; one outside the window is attested but not in scope", () => {
    const honest = generateReceiptKeys();
    const stranger = generateReceiptKeys();
    const rail = generateExtractKeys();
    const own = chain(honest, [
      { ref: "ref-match", at: MIDDLE, nonce: "n-match" },
      { ref: "ref-outside", at: WINDOW_END + 60_000, nonce: "n-outside" },
    ]);
    const foreign = chain(stranger, [{ ref: "ref-foreign", at: MIDDLE, nonce: "n-foreign" }]);
    const report = audit({
      receipts: [...own, ...foreign],
      checkpoints: [checkpointOver(honest, own)],
      extract: extract(rail, [row("ref-match", MIDDLE)]),
      issuerTrust: { publicKeyPem: honest.publicKeyPem },
      trust: trustFor(rail),
    });
    const c = counted(report);
    assert.equal(c.receipts.submitted, 3);
    assert.equal(c.receipts.attested, 2);
    assert.equal(c.receipts.inScope, 1);
    assert.equal(c.receipts.matched, 1);
  });

  it("5: when the pinned rail key refuses the extract, every row is unreconciled and no class is claimed", () => {
    const honest = generateReceiptKeys();
    const rail = generateExtractKeys();
    const otherRail = generateExtractKeys();
    const receipts = chain(honest, [{ ref: "ref-match", at: MIDDLE, nonce: "n-match" }]);
    const report = audit({
      receipts,
      checkpoints: [checkpointOver(honest, receipts)],
      extract: extract(otherRail, [row("ref-match", MIDDLE), row("ref-only-row", MIDDLE)]),
      issuerTrust: { publicKeyPem: honest.publicKeyPem },
      trust: trustFor(rail),
    });
    assert.equal(report.warnings.some((w) => w.code === "settlement-comparison-skipped"), true);
    const c = counted(report);
    assert.equal(c.receipts.settled, 1);
    assert.equal(c.receipts.unreconciled, 1);
    assert.equal(c.receipts.matched, 0);
    assert.equal(c.settlements.rows, 2);
    assert.equal(c.settlements.unreconciled, 2);
    assert.equal(c.settlements.matched, 0);
  });

  it("6: an audit with no extract still counts; deferred and carried stay zero without a boundary", () => {
    const honest = generateReceiptKeys();
    const receipts = chain(honest, [
      { ref: "ref-b", at: OPENING, nonce: "n-b" },
      { ref: "ref-a", at: CLOSING, nonce: "n-a" },
    ]);
    const report = audit({
      receipts,
      checkpoints: [checkpointOver(honest, receipts)],
      settlements: [row("ref-a", CLOSING)],
      issuerTrust: { publicKeyPem: honest.publicKeyPem },
    });
    const c = counted(report);
    assert.equal(report.scope, undefined);
    assert.equal(c.receipts.matched, 1);
    assert.equal(c.receipts.unmatched, 1);
    assert.equal(c.receipts.deferred, 0);
    assert.equal(c.receipts.carried, 0);
    assert.equal(c.settlements.rows, 1);
  });

  it("7: the finding object and the printed report carry the same counts", () => {
    const honest = generateReceiptKeys();
    const rail = generateExtractKeys();
    const receipts = chain(honest, [
      { ref: "ref-match", at: MIDDLE, nonce: "n-match" },
      { ref: null, at: MIDDLE + 1, nonce: "n-abort", outcome: "aborted" },
    ]);
    const report = audit({
      receipts,
      checkpoints: [checkpointOver(honest, receipts)],
      extract: extract(rail, [row("ref-match", MIDDLE)]),
      issuerTrust: { publicKeyPem: honest.publicKeyPem },
      trust: trustFor(rail),
    });
    const c = counted(report);
    const object = toFindingObject(report, 2);
    assert.deepEqual(object.counts, c);
    const printed = formatAudit(report, 2);
    assert.match(
      printed,
      /^counts\treceipts\tsubmitted=2 attested=2 in-scope=2 aborted=1 settled=1 matched=1 deferred=0 carried=0 unmatched=0 repeated=0 unreconciled=0$/m,
    );
    assert.match(
      printed,
      /^counts\tsettlements\trows=1 matched=1 deferred=0 unmatched=0 repeated=0 unreconciled=0$/m,
    );
    // Counts describe the population; the guarantee line and the scope line
    // still come first, and the warnings still close the report.
    const lines = printed.split("\n");
    assert.ok(lines.indexOf("guarantee=unconditional") < lines.findIndex((l) => l.startsWith("counts\t")));
    assert.ok(lines.findIndex((l) => l.startsWith("scope=")) < lines.findIndex((l) => l.startsWith("counts\t")));
  });
});
