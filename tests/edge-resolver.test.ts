import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import * as cedulonAudit from "@cedulon/audit";
import { formatAudit, toFindingObject, type AuditInput, type AuditReport, type Finding } from "@cedulon/audit";

import {
  DEFAULT_SKEW,
  E,
  S,
  SKEW,
  chain,
  decisionAudit,
  decisionRecord,
  effectRow,
  railExtract,
  spendAudit,
} from "./edge-resolver-fixtures.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * What each scenario reported before a deferral said what would resolve it,
 * recorded on master c78f3f1. Adding `needs` must leave every verdict, code,
 * id, detail and count where it was.
 */
const BASELINE = JSON.parse(
  readFileSync(join(root, "tests", "fixtures", "edge-resolver-baseline.json"), "utf8"),
) as Record<string, Pick<AuditReport, "ok" | "findings" | "warnings" | "counts">>;

function withoutNeeds(report: AuditReport): Pick<AuditReport, "ok" | "findings" | "warnings" | "counts"> {
  const strip = (f: Finding): Finding => {
    const { needs: _needs, ...rest } = f;
    return rest;
  };
  return {
    ok: report.ok,
    findings: report.findings.map(strip),
    warnings: report.warnings.map(strip),
    counts: report.counts,
  };
}

function deferral(report: AuditReport, id: string): Finding {
  const w = report.warnings.find((x) => x.code === "boundary-deferred" && x.id === id);
  assert.ok(w, `no boundary-deferred warning for ${id}: ${JSON.stringify(report.warnings)}`);
  return w;
}

const receiptOpen = () => spendAudit({ receipts: chain([{ ref: "r-open", timestampMs: S + 50, nonce: "n-open" }]) });
const receiptClose = () => spendAudit({ receipts: chain([{ ref: "r-close", timestampMs: E - 10, nonce: "n-close" }]) });
const rowOpen = () => spendAudit({ rows: [{ ref: "w-open", timestampMs: S + 10 }] });
const rowClose = () => spendAudit({ rows: [{ ref: "w-close", timestampMs: E - 10 }] });

describe("edge resolver: a boundary-deferred warning says what would resolve it", () => {
  it("opening-edge receipt: the previous window's extract, ending where this one starts, with a row in its facing band", () => {
    const { report } = receiptOpen();
    assert.deepEqual(deferral(report, "n-open".padEnd(16, "-")).needs, {
      evidence: "previousExtract",
      ref: "r-open",
      windowEndMs: S,
      rowFromMs: S - SKEW,
      rowToMs: S,
    });
  });

  it("closing-edge receipt: the following window's extract, starting where this one ends, with a row in its facing band", () => {
    const { report } = receiptClose();
    assert.deepEqual(deferral(report, "n-close".padEnd(16, "-")).needs, {
      evidence: "nextExtract",
      ref: "r-close",
      windowStartMs: E,
      rowFromMs: E,
      rowToMs: E + SKEW,
    });
  });

  it("opening-edge row: a presented receipt that names the ref; nothing checks where that receipt sits, so no band is given", () => {
    const { report } = rowOpen();
    assert.deepEqual(deferral(report, "w-open").needs, { evidence: "receipts", ref: "w-open" });
  });

  it("closing-edge row: a presented receipt that names the ref", () => {
    const { report } = rowClose();
    assert.deepEqual(deferral(report, "w-close").needs, { evidence: "receipts", ref: "w-close" });
  });

  it("the verdict, codes, ids, details and counts are the ones recorded before needs existed", () => {
    assert.deepEqual(withoutNeeds(receiptOpen().report), BASELINE.receiptOpen);
    assert.deepEqual(withoutNeeds(receiptClose().report), BASELINE.receiptClose);
    assert.deepEqual(withoutNeeds(rowOpen().report), BASELINE.rowOpen);
    assert.deepEqual(withoutNeeds(rowClose().report), BASELINE.rowClose);
  });

  it("a receipt hardened by a silent previous extract carries no needs, and no other warning does", () => {
    const { report } = spendAudit({
      receipts: chain([{ ref: "r-open", timestampMs: S + 50, nonce: "n-open" }]),
      previousExtract: railExtract([], S - 3_600_000, S),
    });
    assert.deepEqual(withoutNeeds(report), BASELINE.hardened);
    for (const f of [...report.findings, ...report.warnings]) {
      assert.equal(f.needs, undefined, `${f.code} ${f.id} carries needs`);
    }
    for (const w of receiptOpen().report.warnings) {
      if (w.code !== "boundary-deferred") assert.equal(w.needs, undefined, `${w.code} carries needs`);
    }
  });

  it("decision profile: the same four answers, in the profile's own default allowance", () => {
    const report = decisionAudit(
      [decisionRecord({ ref: "d-close", timestampMs: E - 10, nonce: "n-dclose".padEnd(16, "-") })],
      [effectRow("e-open", S + 10)],
    );
    assert.deepEqual(withoutNeeds(report), BASELINE.decision);
    assert.deepEqual(deferral(report, "e-open").needs, { evidence: "receipts", ref: "e-open" });
    assert.deepEqual(deferral(report, "n-dclose".padEnd(16, "-")).needs, {
      evidence: "nextExtract",
      ref: "d-close",
      windowStartMs: E,
      rowFromMs: E,
      rowToMs: E + DEFAULT_SKEW,
    });
  });
});

describe("edge resolver: doing what needs says resolves the item", () => {
  it("an extract built from the opening-edge needs carries the receipt, and the deferral is gone", () => {
    const need = deferral(receiptOpen().report, "n-open".padEnd(16, "-")).needs!;
    assert.equal(need.evidence, "previousExtract");
    const { report } = spendAudit({
      receipts: chain([{ ref: "r-open", timestampMs: S + 50, nonce: "n-open" }]),
      previousExtract: railExtract([{ ref: need.ref, timestampMs: need.rowFromMs! }], need.windowEndMs! - 3_600_000, need.windowEndMs!),
    });
    assert.equal(report.counts.receipts.carried, 1, JSON.stringify(report.counts));
    assert.equal(report.warnings.some((w) => w.code === "boundary-deferred"), false);
    assert.equal(report.ok, true, JSON.stringify(report.findings));
  });

  it("an extract built from the closing-edge needs carries the receipt; rowToMs is exclusive", () => {
    const need = deferral(receiptClose().report, "n-close".padEnd(16, "-")).needs!;
    assert.equal(need.evidence, "nextExtract");
    const inside = spendAudit({
      receipts: chain([{ ref: "r-close", timestampMs: E - 10, nonce: "n-close" }]),
      nextExtract: railExtract([{ ref: need.ref, timestampMs: need.rowToMs! - 1 }], need.windowStartMs!, need.windowStartMs! + 3_600_000),
    }).report;
    assert.equal(inside.counts.receipts.carried, 1, JSON.stringify(inside.counts));
    const atEnd = spendAudit({
      receipts: chain([{ ref: "r-close", timestampMs: E - 10, nonce: "n-close" }]),
      nextExtract: railExtract([{ ref: need.ref, timestampMs: need.rowToMs! }], need.windowStartMs!, need.windowStartMs! + 3_600_000),
    }).report;
    assert.equal(atEnd.counts.receipts.carried, 0);
    assert.equal(atEnd.findings.some((f) => f.code === "receipt-without-settlement"), true);
  });

  it("presenting a receipt that names the deferred row's ref matches it", () => {
    const need = deferral(rowOpen().report, "w-open").needs!;
    assert.equal(need.evidence, "receipts");
    const { report } = spendAudit({
      receipts: chain([{ ref: need.ref, timestampMs: S - 500, nonce: "n-prior" }]),
      rows: [{ ref: "w-open", timestampMs: S + 10 }],
    });
    // The match is the point here. That receipt sits before this window, so
    // this window's checkpoint does not cover it and the report says so
    // (window-coverage and the checkpoint comparisons); that is coverage, not
    // the pairing.
    assert.equal(report.counts.settlements.matched, 1, JSON.stringify(report.counts));
    assert.equal(report.warnings.some((w) => w.code === "boundary-deferred"), false);
  });
});

describe("edge resolver: the operator output lists what to fetch", () => {
  const all = () =>
    spendAudit({
      receipts: chain([
        { ref: "r-open", timestampMs: S + 50, nonce: "n-open" },
        { ref: "r-close", timestampMs: E - 10, nonce: "n-close" },
      ]),
      rows: [
        { ref: "w-open", timestampMs: S + 10 },
        { ref: "w-close", timestampMs: E - 10 },
      ],
    }).report;

  it("one need line per deferred item, after the warn lines, in warning order", () => {
    const report = all();
    const lines = formatAudit(report).split("\n");
    const needLines = lines.filter((l) => l.startsWith("need\t"));
    const expected = report.warnings
      .filter((w) => w.code === "boundary-deferred")
      .map((w) => {
        const n = w.needs!;
        if (n.evidence === "previousExtract") return `need\tpreviousExtract\t${n.ref}\twindowEndMs=${n.windowEndMs} row in [${n.rowFromMs},${n.rowToMs})`;
        if (n.evidence === "nextExtract") return `need\tnextExtract\t${n.ref}\twindowStartMs=${n.windowStartMs} row in [${n.rowFromMs},${n.rowToMs})`;
        return `need\treceipts\t${n.ref}`;
      });
    assert.equal(expected.length, 4);
    assert.deepEqual(needLines, expected);
    assert.ok(needLines.includes(`need\tpreviousExtract\tr-open\twindowEndMs=${S} row in [${S - SKEW},${S})`));
    assert.ok(needLines.includes(`need\tnextExtract\tr-close\twindowStartMs=${E} row in [${E},${E + SKEW})`));
    assert.ok(needLines.includes("need\treceipts\tw-open"));
    assert.ok(needLines.includes("need\treceipts\tw-close"));
    const lastWarn = lines.map((l) => l.startsWith("warn\t")).lastIndexOf(true);
    const firstNeed = lines.findIndex((l) => l.startsWith("need\t"));
    assert.ok(firstNeed > lastWarn, "need lines come after the warn lines");
  });

  it("no deferral, no need line", () => {
    const { report } = spendAudit({
      receipts: chain([{ ref: "r-open", timestampMs: S + 50, nonce: "n-open" }]),
      previousExtract: railExtract([], S - 3_600_000, S),
    });
    assert.equal(formatAudit(report).split("\n").some((l) => l.startsWith("need\t")), false);
  });

  it("the finding object carries the same needs", () => {
    const report = all();
    const object = toFindingObject(report);
    assert.deepEqual(
      object.warnings.filter((w) => w.needs).map((w) => w.needs),
      report.warnings.filter((w) => w.code === "boundary-deferred").map((w) => w.needs),
    );
  });
});

type PresentedEntry = {
  kind: "record" | "row";
  source: "receipts" | "settlements" | "extract" | "previousExtract" | "nextExtract";
  id: string;
  ref: string | null;
  timestampMs: number;
  codes: string[];
};
type PresentedInRange = (input: AuditInput, report: AuditReport, fromMs: number, toMs: number) => PresentedEntry[];

describe("presentedInRange: what was presented inside [from, to), with the codes the report gave it", () => {
  const lookup = (cedulonAudit as unknown as { presentedInRange?: PresentedInRange }).presentedInRange;

  function scene() {
    return spendAudit({
      receipts: chain([
        { ref: "r-open", timestampMs: S + 50, nonce: "n-open" },
        { ref: "r-close", timestampMs: E - 10, nonce: "n-close" },
      ]),
      rows: [
        { ref: "w-open", timestampMs: S + 10 },
        { ref: "w-close", timestampMs: E - 10 },
      ],
      previousExtract: railExtract([{ ref: "p1", timestampMs: S - 500 }], S - 3_600_000, S),
    });
  }

  it("is exported", () => {
    assert.equal(typeof lookup, "function");
  });

  it("lists records and rows from every presented source in the interval, ordered by time", () => {
    assert.equal(typeof lookup, "function");
    const { input, report } = scene();
    const entries = lookup!(input, report, S - SKEW, S + 100);
    assert.deepEqual(
      entries.map((e) => [e.kind, e.source, e.id, e.ref, e.timestampMs]),
      [
        ["row", "previousExtract", "p1", "p1", S - 500],
        ["row", "extract", "w-open", "w-open", S + 10],
        ["record", "receipts", "n-open".padEnd(16, "-"), "r-open", S + 50],
      ],
    );
  });

  it("joins each entry to the codes the report gave its id", () => {
    assert.equal(typeof lookup, "function");
    const { input, report } = scene();
    const byId = new Map(lookup!(input, report, S - SKEW, S + 100).map((e) => [e.id, e.codes]));
    // The silent previous extract hardens the opening-edge receipt.
    assert.deepEqual(byId.get("n-open".padEnd(16, "-")), ["receipt-without-settlement"]);
    assert.deepEqual(byId.get("w-open"), ["boundary-deferred"]);
    assert.deepEqual(byId.get("p1"), []);
  });

  it("the interval is half-open and nothing outside it is listed", () => {
    assert.equal(typeof lookup, "function");
    const { input, report } = scene();
    const ids = lookup!(input, report, S - SKEW, S + 50).map((e) => e.id);
    assert.deepEqual(ids, ["p1", "w-open"]);
    assert.deepEqual(lookup!(input, report, E - 10, E).map((e) => e.id).sort(), ["n-close".padEnd(16, "-"), "w-close"].sort());
    assert.deepEqual(lookup!(input, report, E, E + 1), []);
  });
});
