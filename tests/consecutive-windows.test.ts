import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import * as cedulonAudit from "@cedulon/audit";
import { audit, type AuditInput, type AuditReport, type Finding } from "@cedulon/audit";
import { buildCheckpointClaims, checkpointHash, signCheckpoint, type SignedCheckpoint } from "@cedulon/checkpoint";
import { generateReceiptKeys, receiptHash, signReceipt, type SignedReceipt } from "@cedulon/receipts";
import { generateExtractKeys, signRailExtract, type SignedRailExtract } from "@cedulon/x402-adapter";

import { TEST_HASH } from "./hash-fixtures.ts";

/**
 * core-05 T10: inside the allowance a single-window audit gives a warning
 * where an audit of consecutive windows gives a verdict. auditWindows runs the
 * windows as one: each window sees its neighbours' extracts, window i > 0 is
 * anchored on window i-1's last checkpoint, and a settlement row deferred at
 * an inner edge resolves only when the adjacent window carried a receipt for
 * its ref; with both bags presented, an unresolved one is the completeness
 * finding. The two outer edges of the run keep the warning.
 */
type WindowInput = Pick<AuditInput, "receipts" | "checkpoints"> & { extract: SignedRailExtract };
type WindowsReport = {
  ok: boolean;
  guarantee: AuditReport["guarantee"];
  summary: string;
  windows: AuditReport[];
  findings: Array<Finding & { window?: number }>;
  resolved: number;
};
type AuditWindows = (input: Omit<AuditInput, "receipts" | "checkpoints" | "extract" | "previousExtract" | "nextExtract"> & { windows: WindowInput[] }) => WindowsReport;

const auditWindows = (cedulonAudit as unknown as { auditWindows?: AuditWindows }).auditWindows;

const H = 3_600_000;
const S0 = 1_700_000_000_000;
const S1 = S0 + H;
const S2 = S1 + H;
const issuer = generateReceiptKeys();
const rail = generateExtractKeys();

function receipt(nonce: string, ref: string, timestampMs: number, prev: SignedReceipt | null): SignedReceipt {
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
      prevReceiptHash: prev ? receiptHash(prev) : null,
      outcome: "settled",
    },
    issuer.privateKeyPem,
    issuer.publicKeyPem,
  );
}

function checkpoint(epoch: number, receipts: SignedReceipt[], start: number, end: number, prev: SignedCheckpoint | null): SignedCheckpoint {
  return signCheckpoint(
    buildCheckpointClaims(epoch, receipts, start, end, prev ? checkpointHash(prev) : null),
    issuer.privateKeyPem,
    issuer.publicKeyPem,
  );
}

function extract(start: number, end: number, rows: Array<{ ref: string; timestampMs: number }>): SignedRailExtract {
  return signRailExtract(
    {
      accountId: "acct",
      railId: "rail",
      windowStartMs: start,
      windowEndMs: end,
      settlements: rows.map((r) => ({ ref: r.ref, amount: "1", currency: "USD", timestampMs: r.timestampMs })),
    },
    rail.privateKeyPem,
    rail.publicKeyPem,
  );
}

const pins = (start = S0, end = S2) => ({
  trust: { publicKeyPem: rail.publicKeyPem, accountId: "acct", railId: "rail", windowStartMs: start, windowEndMs: end },
  issuerTrust: { publicKeyPem: issuer.publicKeyPem },
});

const deferrals = (r: AuditReport) => r.warnings.filter((w) => w.code === "boundary-deferred");

describe("auditWindows: consecutive windows audited as one run", () => {
  it("is exported", () => {
    assert.equal(typeof auditWindows, "function");
  });

  it("a receipt at the inner edge whose row is in the next window resolves the row: no warning, no finding", () => {
    assert.equal(typeof auditWindows, "function");
    const r0 = receipt("cw-a", "ref-a", S1 - 10, null);
    const cp0 = checkpoint(1, [r0], S0, S1, null);
    const cp1 = checkpoint(2, [], S1, S2, cp0);
    const report = auditWindows!({
      ...pins(),
      windows: [
        { receipts: [r0], checkpoints: [cp0], extract: extract(S0, S1, []) },
        { receipts: [], checkpoints: [cp1], extract: extract(S1, S2, [{ ref: "ref-a", timestampMs: S1 + 100 }]) },
      ],
    });
    assert.equal(report.windows.length, 2);
    // One window alone defers the row; the run resolves it through the carry.
    assert.equal(deferrals(report.windows[1]!).length, 1, JSON.stringify(report.windows[1]!.warnings));
    assert.equal(report.windows[0]!.counts.receipts.carried, 1);
    assert.equal(report.resolved, 1);
    assert.deepEqual(report.findings, []);
    assert.equal(report.ok, true, JSON.stringify(report.windows.map((w) => w.findings)));
    assert.equal(report.guarantee, "unconditional", JSON.stringify(report.windows.map((w) => w.warnings.map((x) => x.code))));
  });

  it("a row at the inner edge with no receipt in either bag is settlement-without-receipt in the run", () => {
    assert.equal(typeof auditWindows, "function");
    const cp0 = checkpoint(1, [], S0, S1, null);
    const cp1 = checkpoint(2, [], S1, S2, cp0);
    const w1 = { receipts: [], checkpoints: [cp1], extract: extract(S1, S2, [{ ref: "ref-b", timestampMs: S1 + 100 }]) };
    const report = auditWindows!({
      ...pins(),
      windows: [{ receipts: [], checkpoints: [cp0], extract: extract(S0, S1, []) }, w1],
    });
    assert.deepEqual(
      report.findings.map((f) => [f.code, f.id, f.window]),
      [["settlement-without-receipt", "ref-b", 1]],
    );
    assert.equal(report.resolved, 0);
    assert.equal(report.ok, false);
    // The same window audited alone only defers it.
    const alone = audit({ ...pins(S1, S2), ...w1, anchorCheckpoint: cp0 });
    assert.equal(alone.ok, true);
    assert.equal(deferrals(alone).length, 1);
  });

  it("a receipt at the run's outer closing edge keeps its warning, and the guarantee stays conditional", () => {
    assert.equal(typeof auditWindows, "function");
    const r0 = receipt("cw-c", "ref-c", S0 + H / 2, null);
    const r1 = receipt("cw-d", "ref-d", S2 - 10, r0);
    const cp0 = checkpoint(1, [r0], S0, S1, null);
    const cp1 = checkpoint(2, [r1], S1, S2, cp0);
    const report = auditWindows!({
      ...pins(),
      windows: [
        { receipts: [r0], checkpoints: [cp0], extract: extract(S0, S1, [{ ref: "ref-c", timestampMs: S0 + H / 2 }]) },
        { receipts: [r1], checkpoints: [cp1], extract: extract(S1, S2, []) },
      ],
    });
    assert.deepEqual(report.findings, []);
    assert.equal(report.ok, true, JSON.stringify(report.windows.map((w) => w.findings)));
    assert.equal(deferrals(report.windows[1]!).length, 1);
    assert.equal(report.guarantee, "conditional");
  });

  it("window i > 0 is anchored on window i-1's last checkpoint, so a chain that began before it does not break", () => {
    assert.equal(typeof auditWindows, "function");
    const r0 = receipt("cw-e", "ref-e", S0 + H / 2, null);
    const r1 = receipt("cw-f", "ref-f", S1 + H / 2, r0);
    const cp0 = checkpoint(1, [r0], S0, S1, null);
    const cp1 = checkpoint(2, [r1], S1, S2, cp0);
    const w1 = { receipts: [r1], checkpoints: [cp1], extract: extract(S1, S2, [{ ref: "ref-f", timestampMs: S1 + H / 2 }]) };
    const alone = audit({ ...pins(S1, S2), ...w1 });
    assert.ok(alone.findings.some((f) => f.code === "receipt-chain-break"), "fixture: window 1 alone needs its anchor");
    const report = auditWindows!({
      ...pins(),
      windows: [{ receipts: [r0], checkpoints: [cp0], extract: extract(S0, S1, [{ ref: "ref-e", timestampMs: S0 + H / 2 }]) }, w1],
    });
    assert.deepEqual(report.windows.map((w) => w.findings), [[], []]);
    assert.equal(report.ok, true);
  });

  it("one settlement row cannot cover a receipt in its own window and be carried for one in the previous window", () => {
    assert.equal(typeof auditWindows, "function");
    const x = "ref-dup";
    const r0 = receipt("cw-g", x, S1 - 10, null);
    const r1 = receipt("cw-h", x, S1 + H / 2, r0);
    const cp0 = checkpoint(1, [r0], S0, S1, null);
    const cp1 = checkpoint(2, [r1], S1, S2, cp0);
    const report = auditWindows!({
      ...pins(),
      windows: [
        { receipts: [r0], checkpoints: [cp0], extract: extract(S0, S1, []) },
        { receipts: [r1], checkpoints: [cp1], extract: extract(S1, S2, [{ ref: x, timestampMs: S1 + 100 }]) },
      ],
    });
    // Each window alone is satisfied: window 0 carries r0, window 1 matches r1.
    assert.equal(report.windows[0]!.counts.receipts.carried, 1);
    assert.equal(report.windows[1]!.counts.receipts.matched, 1);
    assert.ok(report.findings.some((f) => f.code === "duplicate-ref" && f.id === x), JSON.stringify(report.findings));
    assert.equal(report.ok, false);
  });

  it("a row inside both bands of a short window is resolved by the inner neighbour's carry", () => {
    assert.equal(typeof auditWindows, "function");
    const L = 400_000; // shorter than twice the profile's 300000 ms allowance
    const T0 = S0;
    const T1 = S0 + L;
    const T2 = S0 + 2 * L;
    const y = "ref-both";
    const cp0 = checkpoint(1, [], T0, T1, null);
    const r = receipt("cw-i", y, T1 + 10, null);
    const cp1 = checkpoint(2, [r], T1, T2, cp0);
    const report = auditWindows!({
      ...pins(T0, T2),
      windows: [
        { receipts: [], checkpoints: [cp0], extract: extract(T0, T1, [{ ref: y, timestampMs: T0 + 200_000 }]) },
        { receipts: [r], checkpoints: [cp1], extract: extract(T1, T2, []) },
      ],
    });
    assert.equal(report.windows[1]!.counts.receipts.carried, 1, JSON.stringify(report.windows[1]!.counts));
    assert.equal(report.resolved, 1);
    assert.deepEqual(report.findings, []);
    assert.equal(report.ok, true, JSON.stringify(report.windows.map((w) => w.findings)));
  });

  it("resolving an inner row does not silence a receipt's outer-edge warning that happens to share the string", () => {
    assert.equal(typeof auditWindows, "function");
    const shared = "cw-col".padEnd(16, "-");
    const rc = receipt("cw-col", "ref-rc", S0 + 10, null); // nonce === shared, deferred at the run's outer opening edge
    const rn = receipt("cw-j", shared, S1 + 10, rc); // ref === shared, carried at window 1's opening edge
    const cp0 = checkpoint(1, [rc], S0, S1, null);
    const cp1 = checkpoint(2, [rn], S1, S2, cp0);
    const report = auditWindows!({
      ...pins(),
      windows: [
        { receipts: [rc], checkpoints: [cp0], extract: extract(S0, S1, [{ ref: shared, timestampMs: S1 - 100 }]) },
        { receipts: [rn], checkpoints: [cp1], extract: extract(S1, S2, []) },
      ],
    });
    assert.equal(report.resolved, 1);
    assert.deepEqual(report.findings, []);
    // rc is still deferred at the run's outer edge, so the run stays conditional.
    assert.equal(report.guarantee, "conditional", JSON.stringify(report.windows.map((w) => w.warnings.map((x) => [x.code, x.id]))));
  });

  it("window i > 0 is anchored on the last checkpoint the issuer pin attests, not on a foreign one with a higher epoch", () => {
    assert.equal(typeof auditWindows, "function");
    const stranger = generateReceiptKeys();
    const r0 = receipt("cw-k", "ref-k", S0 + H / 2, null);
    const r1 = receipt("cw-l", "ref-l", S1 + H / 2, r0);
    const cp0 = checkpoint(1, [r0], S0, S1, null);
    const foreign = signCheckpoint(buildCheckpointClaims(9, [r0], S0, S1, null), stranger.privateKeyPem, stranger.publicKeyPem);
    const cp1 = checkpoint(2, [r1], S1, S2, cp0);
    const report = auditWindows!({
      ...pins(),
      windows: [
        { receipts: [r0], checkpoints: [cp0, foreign], extract: extract(S0, S1, [{ ref: "ref-k", timestampMs: S0 + H / 2 }]) },
        { receipts: [r1], checkpoints: [cp1], extract: extract(S1, S2, [{ ref: "ref-l", timestampMs: S1 + H / 2 }]) },
      ],
    });
    assert.deepEqual(report.windows[1]!.findings, [], JSON.stringify(report.windows[1]!.findings));
  });

  it("windows that do not tile the stated run are extract-scope-mismatch on id windows, and the run fails", () => {
    assert.equal(typeof auditWindows, "function");
    const gap = 1_000;
    const cp0 = checkpoint(1, [], S0, S1, null);
    const cp1 = checkpoint(2, [], S1 + gap, S2 + gap, cp0);
    const report = auditWindows!({
      ...pins(S0, S2 + gap),
      windows: [
        { receipts: [], checkpoints: [cp0], extract: extract(S0, S1, []) },
        { receipts: [], checkpoints: [cp1], extract: extract(S1 + gap, S2 + gap, []) },
      ],
    });
    assert.ok(report.findings.some((f) => f.code === "extract-scope-mismatch" && f.id === "windows"), JSON.stringify(report.findings));
    assert.equal(report.ok, false);
  });

  it("a run whose first window does not start at the stated start is refused the same way", () => {
    assert.equal(typeof auditWindows, "function");
    const cp0 = checkpoint(1, [], S0, S1, null);
    const cp1 = checkpoint(2, [], S1, S2, cp0);
    const report = auditWindows!({
      ...pins(S0 - H, S2),
      windows: [
        { receipts: [], checkpoints: [cp0], extract: extract(S0, S1, []) },
        { receipts: [], checkpoints: [cp1], extract: extract(S1, S2, []) },
      ],
    });
    assert.ok(report.findings.some((f) => f.code === "extract-scope-mismatch" && f.id === "windows"), JSON.stringify(report.findings));
    assert.equal(report.ok, false);
  });
});
