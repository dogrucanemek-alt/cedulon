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

const COUNTS_RECEIPTS =
  "counts\treceipts\tsubmitted=1 attested=1 in-scope=1 aborted=0 settled=1 matched=0 deferred=0 carried=0 unmatched=1 repeated=0 unreconciled=0";
const COUNTS_SETTLEMENTS =
  "counts\tsettlements\trows=0 matched=0 deferred=0 unmatched=0 repeated=0 unreconciled=0";
/** Same unforgeable marker `formatAudit` prints for a wrong-typed slot. */
const ABSENT = "\\u{0}";

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

function lineTags(printed: string): string[] {
  return printed.split("\n").map((l) => l.split("\t", 1)[0]!);
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
    assert.match(poisoned, /^finding\tsettlement-without-receipt\tref-honest\t/m);
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
    const findingLine = printed.split("\n").find((l) => l.startsWith("finding\tsettlement-without-receipt\t"));
    assert.ok(findingLine, printed);
    assert.equal(findingLine!.includes("\\u0009"), true, findingLine);
    assert.equal(findingLine!.split("\t").length, 4, findingLine);
    assert.equal(findingLine!.includes("\tref\t"), false, findingLine);
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

  it("LF inside report.summary cannot invent a result balanced line", () => {
    const printed = formatAudit(
      reportWith({
        summary:
          "audit: 1 finding(s) → FAIL\nresult\tbalanced\nfindings=0\nguarantee\tunconditional",
      }),
    );
    const lines = printed.split("\n");
    assert.equal(lines.some((l) => l === "result\tbalanced"), false, printed);
    assert.equal(lines.some((l) => l === "findings=0"), false, printed);
    assert.match(printed, /^finding\tsettlement-without-receipt\tref-honest\t/m);
    assert.equal(lines[1], "result\tfail findings=1", printed);
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

  it("every failing summary is summary-tagged; result is derived from the report", () => {
    const printed = formatAudit(reportWith({ summary: "findings=0" }));
    const lines = printed.split("\n");
    assert.equal(lines[0], "summary\tfindings=0", printed);
    assert.equal(lines[1], "result\tfail findings=1", printed);
    const builtIn = formatAudit(reportWith({}));
    assert.equal(builtIn.split("\n")[0], "summary\taudit: 1 finding(s) → FAIL", builtIn);
    assert.equal(builtIn.split("\n")[1], "result\tfail findings=1", builtIn);
  });

  it("a failing summary that looks like balanced cannot mint result balanced", () => {
    for (const summary of ["audit: balanced ", "audit: balanced x", "audit: balanced"]) {
      const printed = formatAudit(reportWith({ summary }));
      const lines = printed.split("\n");
      assert.equal(lines[0], `summary\t${escapeReportText(summary)}`, printed);
      assert.equal(lines[1], "result\tfail findings=1", printed);
      assert.equal(lines.some((l) => l === "result\tbalanced"), false, printed);
    }
  });

  it("finding and warning codes stay in tagged columns; equals stay literal after escapeReportText", () => {
    const printed = formatAudit(
      reportWith({
        findings: [{ code: "findings=0" as Finding["code"], id: "id", detail: "d" }],
        warnings: [{ code: "warn=code" as Finding["code"], id: "w", detail: "wd" }],
      }),
    );
    assert.match(printed, /^finding\tfindings=0\tid\td$/m);
    assert.match(printed, /^warning\twarn=code\twd$/m);
    const builtIn = formatAudit(reportWith({}));
    assert.match(builtIn, /^finding\tsettlement-without-receipt\tref-honest\t/m);
  });

  it("scope accountId and railId cannot swap field boundaries", () => {
    const left = formatAudit(reportWith({ scopeAccountId: "a/b", scopeRailId: "c" }));
    const right = formatAudit(reportWith({ scopeAccountId: "a", scopeRailId: "b/c" }));
    const leftScope = left.split("\n").find((l) => l.startsWith("scope\t"))!;
    const rightScope = right.split("\n").find((l) => l.startsWith("scope\t"))!;
    assert.notEqual(leftScope, rightScope, `${leftScope}\n${rightScope}`);
    assert.equal(
      leftScope,
      "scope\taccountId=a/b\trailId=c\twindowStartMs=1700000000000\twindowEndMs=1700003600000",
    );
    assert.equal(
      rightScope,
      "scope\taccountId=a\trailId=b/c\twindowStartMs=1700000000000\twindowEndMs=1700003600000",
    );
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

  it("every escape-set range leaves no raw sample and prints its escape", () => {
    // One sample per range escapeReportText treats as invisible or control.
    const samples: Array<{ cp: number; label: string }> = [
      { cp: 0x001b, label: "C0" },
      { cp: 0x007f, label: "DEL" },
      { cp: 0x009f, label: "C1" },
      { cp: 0x00ad, label: "soft-hyphen" },
      { cp: 0x034f, label: "CGJ" },
      { cp: 0x061c, label: "ALM" },
      { cp: 0x115f, label: "Hangul-choseong-filler" },
      { cp: 0x17b4, label: "Khmer-inherent-ah" },
      { cp: 0x180b, label: "Mongolian-FVS1" },
      { cp: 0xd800, label: "lone-surrogate" },
      { cp: 0x200b, label: "ZWSP" },
      { cp: 0x200e, label: "LRM" },
      { cp: 0x2028, label: "line-separator" },
      { cp: 0x2029, label: "paragraph-separator" },
      { cp: 0x202a, label: "LRE" },
      { cp: 0x2060, label: "WJ" },
      { cp: 0x2065, label: "invisible-plus-reserve" },
      { cp: 0x206a, label: "inhibit-symmetric-swapping" },
      { cp: 0x3164, label: "Hangul-filler" },
      { cp: 0xfe00, label: "VS1" },
      { cp: 0xfeff, label: "BOM" },
      { cp: 0xffa0, label: "halfwidth-Hangul-filler" },
      { cp: 0xfff0, label: "specials-reserve" },
      { cp: 0x1bca0, label: "shorthand-format" },
      { cp: 0x1d173, label: "musical-begin-beam" },
      { cp: 0xe0001, label: "tag" },
      { cp: 0xe0100, label: "VS17" },
    ];
    for (const { cp, label } of samples) {
      const raw = cp <= 0xffff ? String.fromCharCode(cp) : String.fromCodePoint(cp);
      const escaped = escapeReportText(raw);
      const expect =
        cp > 0xffff ? `\\u{${cp.toString(16)}}` : "\\u" + cp.toString(16).padStart(4, "0");
      assert.equal(escaped.includes(raw), false, `${label}: raw still in escapeReportText`);
      assert.equal(escaped, expect, `${label}: expected ${expect}, got ${escaped}`);
      const printed = formatAudit(
        reportWith({
          findings: [{ code: "settlement-without-receipt", id: raw, detail: "x" }],
        }),
      );
      assert.equal(printed.includes(raw), false, `${label}: raw in report`);
      assert.equal(printed.includes(expect), true, `${label}: escape missing in report`);
    }
    assert.equal(escapeReportText("e\u0301"), "e\u0301");
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

  it("TAB is escaped so it cannot forge a field separator", () => {
    assert.equal(escapeReportText("a\tb"), "a\\u0009b");
    const printed = formatAudit(
      reportWith({
        findings: [{ code: "settlement-without-receipt", id: "a\tb", detail: "c\td" }],
        scopeAccountId: "acct\tid",
      }),
    );
    const findingLine = printed.split("\n").find((l) => l.startsWith("finding\t"))!;
    assert.equal(findingLine.split("\t").length, 4, findingLine);
    assert.equal(findingLine.includes("\\u0009"), true, findingLine);
    const scopeLine = printed.split("\n").find((l) => l.startsWith("scope\t"))!;
    assert.equal(scopeLine.includes("\taccountId=acct\\u0009id\t"), true, scopeLine);
  });
});

describe("formatAudit tagged lines close the three remaining spoofs", () => {
  it("an invisible code point outside the escape set cannot mint result balanced", () => {
    const invisible = String.fromCodePoint(0xe0080);
    const summary = `audit: bala${invisible}nced`;
    const printed = formatAudit(reportWith({ summary }));
    const lines = printed.split("\n");
    assert.equal(lines[0], `summary\t${escapeReportText(summary)}`, printed);
    assert.equal(lines[0].includes(invisible), true, "U+E0080 stays in the summary field");
    assert.equal(lines[1], "result\tfail findings=1");
    assert.equal(lines.some((l) => l === "result\tbalanced"), false, printed);
    assert.equal(lines.some((l) => l === "audit: balanced"), false, printed);
  });

  it("finding code warn cannot equal a warning line", () => {
    const printed = formatAudit(
      reportWith({
        findings: [{ code: "warn" as Finding["code"], id: "id-1", detail: "looks-like-warn" }],
        warnings: [],
      }),
    );
    const findingLine = "finding\twarn\tid-1\tlooks-like-warn";
    assert.equal(printed.split("\n").includes(findingLine), true, printed);
    assert.equal(printed.split("\n").some((l) => l === "warning\twarn\tlooks-like-warn"), false, printed);
    assert.equal(printed.split("\n").some((l) => l.startsWith("warn\t")), false, printed);
  });

  it("railId that looks like a window cannot equal another scope triple", () => {
    const mimic = formatAudit(
      reportWith({
        scopeAccountId: "acct",
        scopeRailId: "rail [0,1)",
        scope: {
          accountId: "acct",
          railId: "rail [0,1)",
          windowStartMs: 10,
          windowEndMs: 20,
        },
      }),
    );
    const honest = formatAudit(
      reportWith({
        scope: {
          accountId: "acct",
          railId: "rail",
          windowStartMs: 0,
          windowEndMs: 1,
        },
      }),
    );
    const mimicScope = mimic.split("\n").find((l) => l.startsWith("scope\t"))!;
    const honestScope = honest.split("\n").find((l) => l.startsWith("scope\t"))!;
    assert.equal(
      mimicScope,
      "scope\taccountId=acct\trailId=rail \\u005b0\\u002c1\\u0029\twindowStartMs=10\twindowEndMs=20",
    );
    assert.equal(
      honestScope,
      "scope\taccountId=acct\trailId=rail\twindowStartMs=0\twindowEndMs=1",
    );
    assert.notEqual(mimicScope, honestScope);
  });

  it("two different scope triples never share a scope line; injected separators keep tags", () => {
    const a = formatAudit(
      reportWith({
        scope: { accountId: "a", railId: "b", windowStartMs: 1, windowEndMs: 2 },
      }),
    );
    const b = formatAudit(
      reportWith({
        scope: { accountId: "a", railId: "b", windowStartMs: 1, windowEndMs: 3 },
      }),
    );
    const c = formatAudit(
      reportWith({
        scope: { accountId: "a\tb", railId: "c", windowStartMs: 1, windowEndMs: 2 },
      }),
    );
    const scopeA = a.split("\n").find((l) => l.startsWith("scope\t"))!;
    const scopeB = b.split("\n").find((l) => l.startsWith("scope\t"))!;
    const scopeC = c.split("\n").find((l) => l.startsWith("scope\t"))!;
    assert.notEqual(scopeA, scopeB);
    assert.notEqual(scopeA, scopeC);
    // Real 1 vs "1" must not collide: the string is not a number slot value.
    const asNumber = formatAudit(
      reportWith({
        scope: { accountId: "a", railId: "b", windowStartMs: 1, windowEndMs: 2 },
      }),
    );
    const asString = formatAudit(
      reportWith({
        scope: {
          accountId: "a",
          railId: "b",
          windowStartMs: "1" as unknown as number,
          windowEndMs: 2,
        },
      }),
    );
    const scopeNum = asNumber.split("\n").find((l) => l.startsWith("scope\t"))!;
    const scopeStr = asString.split("\n").find((l) => l.startsWith("scope\t"))!;
    assert.equal(
      scopeNum,
      "scope\taccountId=a\trailId=b\twindowStartMs=1\twindowEndMs=2",
    );
    assert.equal(
      scopeStr,
      `scope\taccountId=a\trailId=b\twindowStartMs=${ABSENT}\twindowEndMs=2`,
    );
    assert.notEqual(scopeNum, scopeStr);
    const poisoned = formatAudit(
      reportWith({
        scopeAccountId: "acct\nsummary\tspoof",
        findings: [
          {
            code: "settlement-without-receipt",
            id: "id\tfinding\tx",
            detail: "d\nwarning\tz",
          },
        ],
      }),
    );
    const clean = formatAudit(reportWith({}));
    assert.equal(poisoned.split("\n").length, clean.split("\n").length, poisoned);
    assert.deepEqual(lineTags(poisoned), lineTags(clean));
  });

  it("golden balanced report matches the hand-written tagged text", () => {
    const report: AuditReport = {
      ok: true,
      findings: [],
      warnings: [
        {
          code: "unauthenticated-extract",
          id: "extract",
          detail: "no rail extract was supplied",
        },
      ],
      guarantee: "conditional",
      summary: "audit: balanced",
      scope: {
        accountId: "acct",
        railId: "rail",
        windowStartMs: 1_700_000_000_000,
        windowEndMs: 1_700_003_600_000,
      },
      counts: EMPTY_COUNTS,
    };
    assert.equal(
      formatAudit(report),
      [
        "summary\taudit: balanced",
        "result\tbalanced findings=0",
        "guarantee\tconditional",
        "scope\taccountId=acct\trailId=rail\twindowStartMs=1700000000000\twindowEndMs=1700003600000",
        COUNTS_RECEIPTS,
        COUNTS_SETTLEMENTS,
        "warning\tunauthenticated-extract\tno rail extract was supplied",
      ].join("\n"),
    );
  });

  it("golden failing report matches the hand-written tagged text", () => {
    assert.equal(
      formatAudit(reportWith({})),
      [
        "summary\taudit: 1 finding(s) → FAIL",
        "result\tfail findings=1",
        "finding\tsettlement-without-receipt\tref-honest\tsettled receipt has no matching rail row",
        "guarantee\tconditional",
        "scope\taccountId=acct\trailId=rail\twindowStartMs=1700000000000\twindowEndMs=1700003600000",
        COUNTS_RECEIPTS,
        COUNTS_SETTLEMENTS,
      ].join("\n"),
    );
  });
});

describe("formatAudit numeric slots never open a line", () => {
  const clean = formatAudit(reportWith({}));
  const cleanLines = clean.split("\n");
  const cleanTags = lineTags(clean);

  function assertStable(printed: string): void {
    assert.equal(printed.split("\n").length, cleanLines.length, printed);
    assert.deepEqual(lineTags(printed), cleanTags, printed);
    assert.equal(printed.split("\n").some((l) => l === "result\tbalanced"), false, printed);
    assert.equal(printed.split("\n").some((l) => l === "result\tbalanced findings=0"), false, printed);
    assert.equal(
      printed.split("\n")[1],
      "result\tinconsistent ok=invalid findings=invalid",
      printed,
    );
    assert.doesNotThrow(() => formatAudit(reportWith({})));
  }

  const tabObject = {
    toString() {
      return "0\nresult\tbalanced";
    },
  };

  const badNumbers: unknown[] = [
    "0\nresult\tbalanced",
    "1\nwarning\tfake\tdetail",
    NaN,
    Infinity,
    1.5,
    1n,
    tabObject,
  ];

  it("poisoned windowStartMs and windowEndMs keep tags and full lines", () => {
    for (const bad of badNumbers) {
      const printed = formatAudit(
        reportWith({
          scope: {
            accountId: "acct",
            railId: "rail",
            windowStartMs: bad as number,
            windowEndMs: bad as number,
          },
        }),
      );
      assertStable(printed);
      const scopeLine = printed.split("\n").find((l) => l.startsWith("scope\t"))!;
      assert.equal(
        scopeLine,
        `scope\taccountId=acct\trailId=rail\twindowStartMs=${ABSENT}\twindowEndMs=${ABSENT}`,
        printed,
      );
    }
  });

  it("poisoned count fields keep tags and full count lines", () => {
    for (const bad of ["9\nwarning\tx\ty", NaN, Infinity, -1, 1.5, 1n, tabObject]) {
      const counts = structuredClone(EMPTY_COUNTS);
      (counts.receipts as { submitted: unknown }).submitted = bad;
      (counts.settlements as { rows: unknown }).rows = bad;
      const printed = formatAudit(reportWith({ counts }));
      assertStable(printed);
      const receiptLine = printed.split("\n").find((l) => l.startsWith("counts\treceipts\t"))!;
      const settlementLine = printed.split("\n").find((l) => l.startsWith("counts\tsettlements\t"))!;
      assert.equal(
        receiptLine,
        `counts\treceipts\tsubmitted=${ABSENT} attested=1 in-scope=1 aborted=0 settled=1 matched=0 deferred=0 carried=0 unmatched=1 repeated=0 unreconciled=0`,
        printed,
      );
      assert.equal(
        settlementLine,
        `counts\tsettlements\trows=${ABSENT} matched=0 deferred=0 unmatched=0 repeated=0 unreconciled=0`,
        printed,
      );
    }
  });

  it("poisoned need bounds keep tags and full need lines", () => {
    for (const bad of ["0\nresult\tbalanced", NaN, Infinity, 1.5, 1n, tabObject]) {
      const warnings: Finding[] = [
        {
          code: "boundary-deferred",
          id: "w",
          detail: "deferred",
          needs: {
            evidence: "previousExtract",
            ref: "r",
            windowEndMs: bad as number,
            rowFromMs: bad as number,
            rowToMs: bad as number,
          },
        },
        {
          code: "boundary-deferred",
          id: "w2",
          detail: "deferred",
          needs: {
            evidence: "nextExtract",
            ref: "r2",
            windowStartMs: bad as number,
            rowFromMs: bad as number,
            rowToMs: bad as number,
          },
        },
      ];
      const cleanNeed = formatAudit(
        reportWith({
          warnings: [
            {
              code: "boundary-deferred",
              id: "w",
              detail: "deferred",
              needs: {
                evidence: "previousExtract",
                ref: "r",
                windowEndMs: 1,
                rowFromMs: 1,
                rowToMs: 2,
              },
            },
            {
              code: "boundary-deferred",
              id: "w2",
              detail: "deferred",
              needs: {
                evidence: "nextExtract",
                ref: "r2",
                windowStartMs: 1,
                rowFromMs: 1,
                rowToMs: 2,
              },
            },
          ],
        }),
      );
      const printed = formatAudit(reportWith({ warnings }));
      assert.equal(printed.split("\n").length, cleanNeed.split("\n").length, printed);
      assert.deepEqual(lineTags(printed), lineTags(cleanNeed), printed);
      assert.equal(printed.split("\n").some((l) => l === "result\tbalanced findings=0"), false, printed);
      assert.equal(
        printed.split("\n")[1],
        "result\tinconsistent ok=invalid findings=invalid",
        printed,
      );
      const needPrev = printed.split("\n").find((l) => l.startsWith("need\tpreviousExtract\t"))!;
      const needNext = printed.split("\n").find((l) => l.startsWith("need\tnextExtract\t"))!;
      assert.equal(
        needPrev,
        `need\tpreviousExtract\tr\twindowEndMs=${ABSENT} row in [${ABSENT},${ABSENT})`,
        printed,
      );
      assert.equal(
        needNext,
        `need\tnextExtract\tr2\twindowStartMs=${ABSENT} row in [${ABSENT},${ABSENT})`,
        printed,
      );
    }
  });

  it("equal-looking typed pairs never share a printed line", () => {
    const marker = ABSENT;
    const submittedAttestedSwapA = formatAudit(
      reportWith({
        counts: {
          ...EMPTY_COUNTS,
          receipts: {
            ...EMPTY_COUNTS.receipts,
            submitted: "1 attested=2" as unknown as number,
            attested: 3,
          },
        },
      }),
    );
    const submittedAttestedSwapB = formatAudit(
      reportWith({
        counts: {
          ...EMPTY_COUNTS,
          receipts: {
            ...EMPTY_COUNTS.receipts,
            submitted: 1,
            attested: "2 attested=3" as unknown as number,
          },
        },
      }),
    );
    const lineA = submittedAttestedSwapA.split("\n").find((l) => l.startsWith("counts\treceipts\t"))!;
    const lineB = submittedAttestedSwapB.split("\n").find((l) => l.startsWith("counts\treceipts\t"))!;
    assert.equal(
      lineA,
      `counts\treceipts\tsubmitted=${marker} attested=3 in-scope=1 aborted=0 settled=1 matched=0 deferred=0 carried=0 unmatched=1 repeated=0 unreconciled=0`,
    );
    assert.equal(
      lineB,
      `counts\treceipts\tsubmitted=1 attested=${marker} in-scope=1 aborted=0 settled=1 matched=0 deferred=0 carried=0 unmatched=1 repeated=0 unreconciled=0`,
    );
    assert.notEqual(lineA, lineB);

    const accountNum = formatAudit(
      reportWith({
        scope: {
          accountId: 1 as unknown as string,
          railId: "rail",
          windowStartMs: 1,
          windowEndMs: 2,
        },
      }),
    );
    const accountStr = formatAudit(
      reportWith({
        scope: { accountId: "1", railId: "rail", windowStartMs: 1, windowEndMs: 2 },
      }),
    );
    assert.notEqual(
      accountNum.split("\n").find((l) => l.startsWith("scope\t")),
      accountStr.split("\n").find((l) => l.startsWith("scope\t")),
    );

    const undefLiteral = formatAudit(
      reportWith({
        scope: {
          accountId: "undefined",
          railId: "rail",
          windowStartMs: 1,
          windowEndMs: 2,
        },
      }),
    );
    const undefAbsent = formatAudit(
      reportWith({
        scope: {
          accountId: undefined as unknown as string,
          railId: "rail",
          windowStartMs: 1,
          windowEndMs: 2,
        },
      }),
    );
    assert.notEqual(
      undefLiteral.split("\n").find((l) => l.startsWith("scope\t")),
      undefAbsent.split("\n").find((l) => l.startsWith("scope\t")),
    );

    const warnObject = formatAudit(
      reportWith({
        warnings: [
          {
            code: { toString: () => "warn" } as unknown as Finding["code"],
            id: "w",
            detail: "d",
          },
        ],
      }),
    );
    const warnString = formatAudit(
      reportWith({
        warnings: [{ code: "warn" as Finding["code"], id: "w", detail: "d" }],
      }),
    );
    assert.equal(
      warnObject.split("\n").find((l) => l.startsWith("warning\t")),
      `warning\t${marker}\td`,
    );
    assert.equal(warnString.split("\n").find((l) => l.startsWith("warning\t")), "warning\twarn\td");
    assert.notEqual(warnObject, warnString);

    const needBad = formatAudit(
      reportWith({
        warnings: [
          {
            code: "boundary-deferred",
            id: "w",
            detail: "deferred",
            needs: {
              evidence: "previousExtract",
              ref: "r",
              windowEndMs: "1" as unknown as number,
              rowFromMs: 1,
              rowToMs: 2,
            },
          },
        ],
      }),
    );
    const needGood = formatAudit(
      reportWith({
        warnings: [
          {
            code: "boundary-deferred",
            id: "w",
            detail: "deferred",
            needs: {
              evidence: "previousExtract",
              ref: "r",
              windowEndMs: 1,
              rowFromMs: 1,
              rowToMs: 2,
            },
          },
        ],
      }),
    );
    assert.notEqual(
      needBad.split("\n").find((l) => l.startsWith("need\t")),
      needGood.split("\n").find((l) => l.startsWith("need\t")),
    );
  });
});

describe("formatAudit missing scope fields do not throw", () => {
  function printScope(scope: AuditReport["scope"]): string {
    return formatAudit(
      reportWith({
        scope,
        warnings: [{ code: "unauthenticated-extract", id: "extract", detail: "refused" }],
      }),
    );
  }

  it("absent accountId railId null number object print without throwing", () => {
    const cases: Array<AuditReport["scope"]> = [
      { accountId: undefined as unknown as string, railId: "rail", windowStartMs: 1, windowEndMs: 2 },
      { accountId: "acct", railId: undefined as unknown as string, windowStartMs: 1, windowEndMs: 2 },
      {
        accountId: undefined as unknown as string,
        railId: undefined as unknown as string,
        windowStartMs: 1,
        windowEndMs: 2,
      },
      { accountId: null as unknown as string, railId: "rail", windowStartMs: 1, windowEndMs: 2 },
      { accountId: 7 as unknown as string, railId: "rail", windowStartMs: 1, windowEndMs: 2 },
      {
        accountId: { toString: () => "obj" } as unknown as string,
        railId: "rail",
        windowStartMs: 1,
        windowEndMs: 2,
      },
      { accountId: "acct", railId: null as unknown as string, windowStartMs: 1, windowEndMs: 2 },
      { accountId: "acct", railId: 9 as unknown as string, windowStartMs: 1, windowEndMs: 2 },
      {
        accountId: "acct",
        railId: { toString: () => "rail-obj" } as unknown as string,
        windowStartMs: 1,
        windowEndMs: 2,
      },
    ];
    for (const scope of cases) {
      let printed = "";
      assert.doesNotThrow(() => {
        printed = printScope(scope);
      });
      assert.match(printed, /^warning\tunauthenticated-extract\trefused$/m, printed);
      assert.match(printed, /^finding\tsettlement-without-receipt\tref-honest\t/m, printed);
      assert.equal(
        printed.split("\n")[1],
        "result\tinconsistent ok=invalid findings=invalid",
        printed,
      );
      const scopeLine = printed.split("\n").find((l) => l.startsWith("scope\t"))!;
      if (typeof scope!.accountId !== "string") {
        assert.equal(scopeLine.includes(`accountId=${ABSENT}`), true, scopeLine);
      }
      if (typeof scope!.railId !== "string") {
        assert.equal(scopeLine.includes(`railId=${ABSENT}`), true, scopeLine);
      }
    }
  });

  it("absent marker does not collide with empty string or literal undefined", () => {
    const absent = printScope({
      accountId: undefined as unknown as string,
      railId: undefined as unknown as string,
      windowStartMs: 1,
      windowEndMs: 2,
    });
    const empty = printScope({ accountId: "", railId: "", windowStartMs: 1, windowEndMs: 2 });
    const undefText = printScope({
      accountId: "undefined",
      railId: "undefined",
      windowStartMs: 1,
      windowEndMs: 2,
    });
    const absentScope = absent.split("\n").find((l) => l.startsWith("scope\t"))!;
    const emptyScope = empty.split("\n").find((l) => l.startsWith("scope\t"))!;
    const undefScope = undefText.split("\n").find((l) => l.startsWith("scope\t"))!;
    assert.equal(absentScope, `scope\taccountId=${ABSENT}\trailId=${ABSENT}\twindowStartMs=1\twindowEndMs=2`);
    assert.equal(emptyScope, "scope\taccountId=\trailId=\twindowStartMs=1\twindowEndMs=2");
    assert.equal(
      undefScope,
      "scope\taccountId=undefined\trailId=undefined\twindowStartMs=1\twindowEndMs=2",
    );
    assert.notEqual(absentScope, emptyScope);
    assert.notEqual(absentScope, undefScope);
  });
});

describe("formatAudit inconsistent ok and findings", () => {
  it("ok true with findings prints inconsistent, not balanced", () => {
    const printed = formatAudit(
      reportWith({
        ok: true,
        findings: [REAL_FINDING],
        summary: "audit: balanced",
      }),
    );
    assert.equal(printed.split("\n")[1], "result\tinconsistent ok=true findings=1", printed);
    assert.equal(printed.split("\n").some((l) => l === "result\tbalanced"), false, printed);
    assert.equal(printed.split("\n").some((l) => l === "result\tbalanced findings=0"), false, printed);
    assert.match(printed, /^finding\tsettlement-without-receipt\tref-honest\t/m);
  });

  it("ok false with zero findings keeps fail findings=0", () => {
    const printed = formatAudit(
      reportWith({
        ok: false,
        findings: [],
        summary: "audit: 0 finding(s) → FAIL",
      }),
    );
    assert.equal(printed.split("\n")[1], "result\tfail findings=0", printed);
  });

  it("ok true with zero findings prints balanced findings=0", () => {
    const printed = formatAudit(
      reportWith({
        ok: true,
        findings: [],
        summary: "audit: balanced",
        warnings: [{ code: "unauthenticated-extract", id: "extract", detail: "no extract" }],
      }),
    );
    assert.equal(printed.split("\n")[1], "result\tbalanced findings=0", printed);
  });

  it("non-boolean ok never prints balanced and never throws", () => {
    const badOk: unknown[] = ["false", "true", 1, 0, null, undefined, { ok: true }];
    for (const ok of badOk) {
      let printed = "";
      assert.doesNotThrow(() => {
        printed = formatAudit(
          reportWith({
            ok: ok as boolean,
            findings: [],
            summary: "audit: balanced",
          }),
        );
      });
      assert.equal(
        printed.split("\n")[1],
        "result\tinconsistent ok=invalid findings=invalid",
        `ok=${String(ok)}\n${printed}`,
      );
      assert.equal(printed.split("\n").some((l) => l.startsWith("result\tbalanced")), false, printed);
    }
  });

  it("non-array findings never prints balanced and never throws", () => {
    const badFindings: unknown[] = [null, { code: "x" }, { length: 0 }];
    for (const findings of badFindings) {
      let printed = "";
      assert.doesNotThrow(() => {
        printed = formatAudit(
          reportWith({
            ok: true,
            findings: findings as Finding[],
            summary: "audit: balanced",
          }),
        );
      });
      assert.equal(
        printed.split("\n")[1],
        "result\tinconsistent ok=invalid findings=invalid",
        printed,
      );
      assert.equal(printed.split("\n").some((l) => l.startsWith("result\tbalanced")), false, printed);
      assert.equal(printed.split("\n").some((l) => l.startsWith("finding\t")), false, printed);
    }
  });
});

describe("formatAudit prints from a plain one-read snapshot", () => {
  function resultFindingCount(printed: string): number | null {
    const line = printed.split("\n")[1] ?? "";
    if (line === "result\tbalanced findings=0") return 0;
    const m = /^result\t(?:fail|inconsistent ok=true) findings=(\d+)$/.exec(line);
    return m ? Number(m[1]) : null;
  }

  function withStringLength<T extends object>(items: T[], lengthValue: string): T[] {
    return new Proxy(items, {
      get(target, prop, receiver) {
        if (prop === "length") return lengthValue;
        return Reflect.get(target, prop, receiver);
      },
    });
  }

  it("a shifting findings getter is read once; result count equals printed finding lines", () => {
    const base = reportWith({
      ok: true,
      findings: [REAL_FINDING],
      summary: "audit: balanced",
      warnings: [{ code: "unauthenticated-extract", id: "extract", detail: "no extract" }],
    });
    let findingsReads = 0;
    const report = { ...base };
    Object.defineProperty(report, "findings", {
      configurable: true,
      enumerable: true,
      get() {
        findingsReads += 1;
        if (findingsReads === 1) return [];
        if (findingsReads === 2) return [REAL_FINDING];
        return [];
      },
    });
    const printed = formatAudit(report as AuditReport);
    assert.equal(findingsReads, 1, printed);
    const findingLines = printed.split("\n").filter((l) => l.startsWith("finding\t"));
    const n = resultFindingCount(printed);
    assert.notEqual(n, null, printed);
    assert.equal(n, findingLines.length, printed);
    assert.equal(
      printed.split("\n").some((l) => l === "result\tbalanced findings=0") && findingLines.length > 0,
      false,
      printed,
    );
  });

  it("a Proxy array whose length is a string cannot open a second result line", () => {
    const forged = "0\nresult\tbalanced findings=0";
    const printed = formatAudit(
      reportWith({
        ok: false,
        findings: withStringLength([REAL_FINDING], forged),
        warnings: withStringLength(
          [{ code: "unauthenticated-extract", id: "extract", detail: "no extract" }],
          "1\nresult\tbalanced findings=0",
        ),
      }),
    );
    const resultLines = printed.split("\n").filter((l) => l.startsWith("result\t"));
    assert.equal(resultLines.length, 1, printed);
    assert.equal(printed.includes("\nresult\t"), true, printed);
    assert.equal(
      printed.split("\n").filter((l) => l === "result\tbalanced findings=0").length,
      0,
      printed,
    );
  });

  it("finding code getter is read once", () => {
    let codeReads = 0;
    const finding = {
      get code() {
        codeReads += 1;
        return codeReads === 1 ? "settlement-without-receipt" : "receipt-without-settlement";
      },
      id: "ref-honest",
      detail: "settled receipt has no matching rail row",
    };
    const printed = formatAudit(reportWith({ findings: [finding as Finding] }));
    assert.equal(codeReads, 1, printed);
    assert.match(printed, /^finding\tsettlement-without-receipt\tref-honest\t/m);
    assert.equal(printed.includes("receipt-without-settlement"), false, printed);
  });

  it("throwing getters at report item and scope fields do not throw and print inconsistent", () => {
    const base = reportWith({});

    const reportThrows = { ...base };
    Object.defineProperty(reportThrows, "findings", {
      configurable: true,
      enumerable: true,
      get() {
        throw new Error("findings boom");
      },
    });
    let printed = "";
    assert.doesNotThrow(() => {
      printed = formatAudit(reportThrows as AuditReport);
    });
    assert.equal(printed.split("\n")[1], "result\tinconsistent ok=invalid findings=invalid", printed);

    const itemThrows = reportWith({
      findings: [
        {
          get code() {
            throw new Error("code boom");
          },
          id: "id",
          detail: "d",
        } as unknown as Finding,
      ],
    });
    assert.doesNotThrow(() => {
      printed = formatAudit(itemThrows);
    });
    assert.equal(printed.split("\n")[1], "result\tinconsistent ok=invalid findings=invalid", printed);

    const scopeThrows = reportWith({
      scope: {
        get accountId() {
          throw new Error("account boom");
        },
        railId: "rail",
        windowStartMs: 1,
        windowEndMs: 2,
      } as unknown as AuditReport["scope"],
    });
    assert.doesNotThrow(() => {
      printed = formatAudit(scopeThrows);
    });
    assert.equal(printed.split("\n")[1], "result\tinconsistent ok=invalid findings=invalid", printed);
  });

  it("each listed report field is read exactly once", () => {
    // Explicit list: if formatAudit starts reading another top-level key, the
    // Proxy records it and this equality fails without exporting snapshot keys.
    const expectedKeys = ["ok", "findings", "warnings", "guarantee", "summary", "scope", "counts"];
    const accessCounts: Record<string, number> = {};
    const base = reportWith({});
    const report = new Proxy(base, {
      get(target, prop, receiver) {
        if (typeof prop === "string") {
          accessCounts[prop] = (accessCounts[prop] ?? 0) + 1;
        }
        return Reflect.get(target, prop, receiver);
      },
    });
    formatAudit(report);
    assert.deepEqual(Object.keys(accessCounts).sort(), [...expectedKeys].sort());
    for (const key of expectedKeys) {
      assert.equal(accessCounts[key], 1, key);
    }
  });
});

describe("formatAudit absence is only undefined", () => {
  const MARKED_SCOPE = `scope\taccountId=${ABSENT}\trailId=${ABSENT}\twindowStartMs=${ABSENT}\twindowEndMs=${ABSENT}`;

  it("falsy scope values print a marked scope line and inconsistent, not balanced", () => {
    const balanced = formatAudit(
      reportWith({
        ok: true,
        findings: [],
        summary: "audit: balanced",
        warnings: [],
      }),
    );
    assert.equal(balanced.split("\n")[1], "result\tbalanced findings=0", balanced);

    for (const scope of [0, false, null, "", NaN] as unknown[]) {
      let printed = "";
      assert.doesNotThrow(() => {
        printed = formatAudit(
          reportWith({
            ok: true,
            findings: [],
            summary: "audit: balanced",
            warnings: [],
            scope: scope as AuditReport["scope"],
          }),
        );
      });
      assert.equal(
        printed.split("\n")[1],
        "result\tinconsistent ok=invalid findings=invalid",
        `scope=${String(scope)}\n${printed}`,
      );
      assert.equal(
        printed.split("\n").some((l) => l === "result\tbalanced findings=0"),
        false,
        printed,
      );
      const scopeLine = printed.split("\n").find((l) => l.startsWith("scope\t"));
      assert.equal(scopeLine, MARKED_SCOPE, `scope=${String(scope)}\n${printed}`);
    }
  });

  it("undefined scope omits the scope line and can stay balanced", () => {
    const printed = formatAudit(
      reportWith({
        ok: true,
        findings: [],
        summary: "audit: balanced",
        warnings: [],
        scope: undefined,
      }),
    );
    assert.equal(printed.split("\n")[1], "result\tbalanced findings=0", printed);
    assert.equal(
      printed.split("\n").some((l) => l.startsWith("scope\t")),
      false,
      printed,
    );
  });

  it("falsy needs values print a marked need line and inconsistent", () => {
    for (const needs of [0, false, null, "", NaN] as unknown[]) {
      const printed = formatAudit(
        reportWith({
          ok: true,
          findings: [],
          summary: "audit: balanced",
          warnings: [
            {
              code: "boundary-deferred",
              id: "w",
              detail: "deferred",
              needs: needs as Finding["needs"],
            },
          ],
        }),
      );
      assert.equal(
        printed.split("\n")[1],
        "result\tinconsistent ok=invalid findings=invalid",
        `needs=${String(needs)}\n${printed}`,
      );
      assert.equal(
        printed.split("\n").some((l) => l === "result\tbalanced findings=0"),
        false,
        printed,
      );
      const needLine = printed.split("\n").find((l) => l.startsWith("need\t"));
      assert.equal(needLine, `need\t${ABSENT}\t${ABSENT}`, `needs=${String(needs)}\n${printed}`);
    }
  });

  it("undefined needs omits the need line", () => {
    const printed = formatAudit(
      reportWith({
        warnings: [
          {
            code: "boundary-deferred",
            id: "w",
            detail: "deferred",
          },
        ],
      }),
    );
    assert.equal(
      printed.split("\n").some((l) => l.startsWith("need\t")),
      false,
      printed,
    );
  });

  it("evidence outside the three allowed values prints a marked need line, not receipts", () => {
    const allowed = ["previousExtract", "nextExtract", "receipts"] as const;
    const good = formatAudit(
      reportWith({
        warnings: [
          {
            code: "boundary-deferred",
            id: "w",
            detail: "deferred",
            needs: { evidence: "receipts", ref: "r" },
          },
        ],
      }),
    );
    assert.equal(
      good.split("\n").find((l) => l.startsWith("need\t")),
      "need\treceipts\tr",
      good,
    );

    for (const evidence of ["result", "receipt", "PreviousExtract", "", 0, null, true] as unknown[]) {
      const printed = formatAudit(
        reportWith({
          ok: true,
          findings: [],
          summary: "audit: balanced",
          warnings: [
            {
              code: "boundary-deferred",
              id: "w",
              detail: "deferred",
              needs: { evidence: evidence as "receipts", ref: "r" },
            },
          ],
        }),
      );
      assert.equal(
        printed.split("\n")[1],
        "result\tinconsistent ok=invalid findings=invalid",
        `evidence=${String(evidence)}\n${printed}`,
      );
      const needLine = printed.split("\n").find((l) => l.startsWith("need\t"))!;
      assert.equal(needLine, `need\t${ABSENT}\tr`, `evidence=${String(evidence)}\n${printed}`);
      assert.equal(needLine.startsWith("need\treceipts\t"), false, printed);
      for (const tag of allowed) {
        if (evidence === tag) continue;
        assert.equal(needLine.startsWith(`need\t${tag}\t`), false, printed);
      }
    }
  });

  it("revoked Proxy array as findings does not throw and prints inconsistent", () => {
    const { proxy, revoke } = Proxy.revocable([] as Finding[], {});
    revoke();
    let printed = "";
    assert.doesNotThrow(() => {
      printed = formatAudit(
        reportWith({
          ok: true,
          findings: proxy,
          summary: "audit: balanced",
        }),
      );
    });
    assert.equal(printed.split("\n")[1], "result\tinconsistent ok=invalid findings=invalid", printed);
  });

  it("formatAudit never throws on null, number, revoked report Proxy, or undefined", () => {
    const { proxy, revoke } = Proxy.revocable(reportWith({}), {});
    revoke();
    const cases: Array<{ label: string; report: unknown }> = [
      { label: "null", report: null },
      { label: "number", report: 5 },
      { label: "revokedProxy", report: proxy },
      { label: "undefined", report: undefined },
    ];
    for (const { label, report } of cases) {
      let printed = "";
      assert.doesNotThrow(() => {
        printed = formatAudit(report as AuditReport);
      }, label);
      assert.equal(
        printed,
        "result\tinconsistent ok=invalid findings=invalid",
        `input=${label}\n${printed}`,
      );
    }
  });
});
