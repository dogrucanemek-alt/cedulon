import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  escapeReportText,
  formatAudit,
  toFindingObject,
  type AuditCounts,
  type AuditReport,
  type Finding,
} from "@cedulon/audit";
import { formatLiveExtractIds } from "../examples/demo/src/live-extract-ids.ts";

const EMPTY_COUNTS: AuditCounts = {
  receipts: {
    submitted: 1,
    attested: 1,
    inScope: 1,
    aborted: 0,
    settled: 1,
    matched: 0,
    deferred: 0,
    carried: 0,
    unmatched: 1,
    repeated: 0,
    unreconciled: 0,
  },
  settlements: {
    rows: 0,
    matched: 0,
    deferred: 0,
    unmatched: 0,
    repeated: 0,
    unreconciled: 0,
  },
};

const REAL_FINDING: Finding = {
  code: "settlement-without-receipt",
  id: "ref-honest",
  detail: "settled receipt has no matching rail row",
};

function reportWith(partial: Partial<AuditReport> & { scopeAccountId?: string; scopeRailId?: string }): AuditReport {
  const accountId = partial.scopeAccountId ?? "acct";
  const railId = partial.scopeRailId ?? "rail";
  const { scopeAccountId: _a, scopeRailId: _r, ...rest } = partial as Partial<AuditReport> & {
    scopeAccountId?: string;
    scopeRailId?: string;
  };
  return {
    ok: false,
    findings: [REAL_FINDING],
    warnings: [],
    guarantee: "conditional",
    summary: "audit: 1 finding(s) → FAIL",
    scope: {
      accountId,
      railId,
      windowStartMs: 1_700_000_000_000,
      windowEndMs: 1_700_003_600_000,
    },
    counts: EMPTY_COUNTS,
    ...rest,
  };
}

describe("formatAudit escapes untrusted text", () => {
  it("ESC in accountId does not appear raw, keeps line count, keeps the finding", () => {
    const attack =
      "\u001b[2J\u001b[Haudit: balanced\nfindings=0\nguarantee=unconditional\u001b[8m";
    const poisoned = formatAudit(reportWith({ scopeAccountId: attack }));
    const clean = formatAudit(reportWith({ scopeAccountId: "acct-safe" }));
    assert.equal(poisoned.includes("\u001b"), false, `raw ESC still present:\n${poisoned}`);
    assert.equal(
      poisoned.split("\n").length,
      clean.split("\n").length,
      `line counts differ: poisoned=${poisoned.split("\n").length} clean=${clean.split("\n").length}\n${poisoned}`,
    );
    assert.match(poisoned, /^settlement-without-receipt\tref-honest\t/m);
  });

  it("CR LF TAB in finding id and detail do not add physical lines", () => {
    const finding: Finding = {
      code: "settlement-without-receipt",
      id: "ref\rwith\nbreaks\tand-tab",
      detail: "detail\rhas\nnewlines\tand\ttabs",
    };
    const printed = formatAudit(reportWith({ findings: [finding] }));
    const clean = formatAudit(reportWith({}));
    assert.equal(
      printed.split("\n").length,
      clean.split("\n").length,
      `extra lines:\n${printed}`,
    );
    assert.equal(printed.includes("\r"), false);
    assert.equal(/\nsettlement-without-receipt\t/.test("\n" + printed) || printed.startsWith("settlement"), true);
    const findingLine = printed.split("\n").find((l) => l.startsWith("settlement-without-receipt\t"));
    assert.ok(findingLine, printed);
    assert.equal(findingLine!.includes("\\u0009"), true, findingLine);
    assert.equal(findingLine!.split("\t").length, 3, findingLine);
  });

  it("line/paragraph separators and bidi controls are not raw in the text report", () => {
    const bidi =
      "a\u2028b\u2029c\u202Ad\u202Be\u202Cf\u202Dg\u202Eh\u2066i\u2067j\u2068k\u2069l\u200Em\u200Fn\u061Co";
    const printed = formatAudit(
      reportWith({
        findings: [{ code: "settlement-without-receipt", id: bidi, detail: bidi }],
        warnings: [{ code: "unauthenticated-extract", id: bidi, detail: bidi }],
        scopeAccountId: bidi,
        scopeRailId: bidi,
      }),
    );
    for (const cp of [
      "\u2028",
      "\u2029",
      "\u202A",
      "\u202B",
      "\u202C",
      "\u202D",
      "\u202E",
      "\u2066",
      "\u2067",
      "\u2068",
      "\u2069",
      "\u200E",
      "\u200F",
      "\u061C",
    ]) {
      assert.equal(printed.includes(cp), false, `raw U+${cp.codePointAt(0)!.toString(16)} in:\n${printed}`);
    }
  });

  it("a literal backslash-u001b text stays distinct from an escaped ESC", () => {
    const literalText = "\\u001b";
    const realEsc = "\u001b";
    const fromLiteral = formatAudit(
      reportWith({ findings: [{ code: "settlement-without-receipt", id: literalText, detail: "x" }] }),
    );
    const fromEsc = formatAudit(
      reportWith({ findings: [{ code: "settlement-without-receipt", id: realEsc, detail: "x" }] }),
    );
    assert.match(fromLiteral, /\t\\\\u001b\t/);
    assert.match(fromEsc, /\t\\u001b\t/);
    assert.notEqual(fromLiteral, fromEsc);
  });

  it("LF inside report.summary cannot invent a findings=0 line", () => {
    const printed = formatAudit(
      reportWith({
        summary: "audit: 1 finding(s) → FAIL\nfindings=0\nguarantee=unconditional",
      }),
    );
    const lines = printed.split("\n");
    assert.equal(lines.some((l) => l === "findings=0"), false, printed);
    assert.match(printed, /^settlement-without-receipt\tref-honest\t/m);
  });

  it("toFindingObject leaves id detail and summary unescaped", () => {
    const summary = "line1\nfindings=0";
    const finding: Finding = {
      code: "settlement-without-receipt",
      id: "id\nwith\nbreaks",
      detail: "detail\u001bESC",
    };
    const object = toFindingObject(
      reportWith({
        summary,
        findings: [finding],
      }),
    );
    assert.equal(object.summary, summary);
    assert.equal(object.findings[0]!.id, finding.id);
    assert.equal(object.findings[0]!.detail, finding.detail);
    assert.equal(object.summary.includes("\n"), true);
    assert.equal(object.findings[0]!.detail.includes("\u001b"), true);
  });

  it("need.ref with LF stays on one need line", () => {
    const warn = (ref: string): Finding => ({
      code: "boundary-deferred",
      id: "w-open",
      detail: "settlement row deferred at opening edge",
      needs: { evidence: "receipts", ref },
    });
    const poisoned = formatAudit(reportWith({ warnings: [warn("ref\nwith\nLF")] }));
    const clean = formatAudit(reportWith({ warnings: [warn("ref-clean")] }));
    assert.equal(
      poisoned.split("\n").length,
      clean.split("\n").length,
      `extra lines from need.ref:\n${poisoned}`,
    );
    const needLines = poisoned.split("\n").filter((l) => l.startsWith("need\t"));
    assert.equal(needLines.length, 1, poisoned);
    assert.match(needLines[0]!, /need\treceipts\tref\\u000awith\\u000aLF$/);
  });

  it("a failing report whose summary is findings=0 does not print that balanced line first", () => {
    const printed = formatAudit(reportWith({ summary: "findings=0" }));
    const first = printed.split("\n")[0]!;
    assert.notEqual(first, "findings=0", printed);
    assert.equal(first.startsWith("findings=0"), false, printed);
    assert.equal(first, "summary\tfindings=0", printed);
    const builtIn = formatAudit(reportWith({}));
    assert.equal(builtIn.split("\n")[0], "audit: 1 finding(s) → FAIL", builtIn);
  });

  it("scope accountId and railId slash cannot swap field boundaries", () => {
    const left = formatAudit(reportWith({ scopeAccountId: "a/b", scopeRailId: "c" }));
    const right = formatAudit(reportWith({ scopeAccountId: "a", scopeRailId: "b/c" }));
    const leftScope = left.split("\n").find((l) => l.startsWith("scope="))!;
    const rightScope = right.split("\n").find((l) => l.startsWith("scope="))!;
    assert.notEqual(leftScope, rightScope, `${leftScope}\n${rightScope}`);
    assert.match(leftScope, /^scope=a\\u002fb\/c \[/);
    assert.match(rightScope, /^scope=a\/b\\u002fc \[/);
    const findingDetail = formatAudit(
      reportWith({
        findings: [{ code: "settlement-without-receipt", id: "id", detail: "path/with/slash" }],
      }),
    );
    assert.match(findingDetail, /\tpath\/with\/slash$/m);
  });

  it("lone surrogates zero-width tags and variation selectors are not raw", () => {
    const lonely = String.fromCharCode(0xd800);
    const zw = "a\u00adb\u200bc\u200cd\u200de\u2060f\u2061g\u2062h\u2063i\u2064j\ufeffk\u180el";
    const tag = String.fromCodePoint(0xe0001);
    const vs = "a\ufe00b" + String.fromCodePoint(0xe0100);
    const combining = "e\u0301";
    const printed = formatAudit(
      reportWith({
        findings: [
          { code: "settlement-without-receipt", id: lonely + zw, detail: tag + vs },
        ],
        scopeAccountId: combining,
      }),
    );
    assert.equal(printed.includes(lonely), false, printed);
    assert.equal(printed.includes("\u00ad"), false, printed);
    assert.equal(printed.includes("\u200b"), false, printed);
    assert.equal(printed.includes(tag), false, printed);
    assert.equal(printed.includes("\ufe00"), false, printed);
    assert.match(printed, /\\u\{e0001\}/);
    assert.match(printed, /\\u\{e0100\}/);
    assert.equal(printed.includes(combining), true, printed);
    assert.equal(escapeReportText(combining), combining);
  });

  it("live-audit identity lines use the same escape as the report", () => {
    const esc = "\u001b[2Jacct";
    const lines = formatLiveExtractIds(esc, "rail/with\tslash");
    assert.deepEqual(lines, [
      `rail=${escapeReportText("rail/with\tslash")}`,
      `account=${escapeReportText(esc)}`,
    ]);
    assert.equal(lines[1]!.includes("\u001b"), false);
    assert.equal(lines[0]!.includes("\t"), false);
    assert.match(lines[0]!, /\\u0009/);
  });
});
