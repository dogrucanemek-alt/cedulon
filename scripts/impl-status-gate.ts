/**
 * The Implementation Status count is compared against the run that just
 * produced it. A posted revision's sentence is frozen; the living core
 * document carries the count.
 *
 * Found 2026-09-09: core-00 said "all three assert every case, 548 of 548";
 * the real figure was 559. The same sentence had said 457 in -09 when the
 * real figure was 548, and two revisions went out with nobody noticing. The
 * number was written by hand and nothing on earth compared it to a run.
 *
 * Found 2026-11-25: summing every <testsuite tests="N"> double-counted nested
 * describes. Node's JUnit reporter emits a parent suite whose tests attribute
 * is the child-suite count, then emits each child with its own tests
 * attribute; adding every attribute counted the nested cases twice. The Node
 * summary's `tests` line and the <testcase> element count agreed; the gate
 * did not.
 *
 * Four ways were considered and dropped:
 *
 *  - Running the suite from inside the suite: recursion, and it doubles the
 *    slowest gate we have.
 *  - Counting `it(` calls statically: wrong by construction here, because
 *    conformance vectors and the JCS pairs generate cases in a loop. A count
 *    that is quietly low is worse than no count.
 *  - Leaning on a committed counter file: two hand-maintained declarations
 *    instead of one, free to go stale together.
 *  - Asking CI over the network: makes an offline gate depend on a service,
 *    and answers about a commit that is not necessarily this one.
 *
 * What is done instead: the pre-release run writes a JUnit report, and this
 * gate counts the <testcase> elements of that report. There is no second
 * declaration to maintain, no network, no second execution -- and it runs on
 * all three hosted runners, which is exactly the claim the sentence makes.
 * The report is not committed; a stale copy cannot stand in for a run that
 * did not happen. A cross-check refuses a total that disagrees with the same
 * run's Node summary, or with a sum of suite attributes that nested suites
 * have inflated.
 */

import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";

import { livingCoreDraftPath } from "./latest-draft.ts";

export type SuiteCounters = { tests: number; failures: number; skipped: number };

function countCaseOutcome(
  body: string,
): { failed: boolean; skipped: boolean } {
  // A skipped case may still carry a failure element in some reporters; treat
  // skip as the outcome Node's summary uses for that case.
  if (/<skipped[\s/>]/.test(body)) return { failed: false, skipped: true };
  if (/<failure[\s/>]/.test(body) || /<error[\s/>]/.test(body)) {
    return { failed: true, skipped: false };
  }
  return { failed: false, skipped: false };
}

/**
 * Count real cases from <testcase> elements. Nested <testsuite tests="N">
 * attributes are not added: a parent suite's attribute can name its child
 * suites, and summing every attribute then counts those cases twice.
 */
export function countersFromJUnit(xml: string): SuiteCounters {
  if (![...xml.matchAll(/<testsuite\b/g)].length) {
    throw new Error("no <testsuite> element in the JUnit report");
  }
  // Self-closing <testcase .../> and <testcase>...</testcase> both occur in
  // Node's JUnit output; do not let [^>]* swallow the '/' of '/>'.
  const cases = [...xml.matchAll(/<testcase\b[\s\S]*?(?:\/>|<\/testcase>)/g)];
  const total = { tests: cases.length, failures: 0, skipped: 0 };
  for (const c of cases) {
    const outcome = countCaseOutcome(c[0]!);
    if (outcome.skipped) total.skipped += 1;
    else if (outcome.failed) total.failures += 1;
  }
  return total;
}

/** Sum every <testsuite tests|failures|skipped> attribute. Nested suites inflate this. */
export function suiteAttributeCounters(xml: string): SuiteCounters {
  const suites = [...xml.matchAll(/<testsuite\s([^>]*)>/g)];
  if (suites.length === 0) throw new Error("no <testsuite> element in the JUnit report");
  const total = { tests: 0, failures: 0, skipped: 0 };
  for (const suite of suites) {
    const attrs = suite[1]!;
    for (const key of ["tests", "failures", "skipped"] as const) {
      const m = new RegExp(`${key}="(\\d+)"`).exec(attrs);
      if (!m) throw new Error(`<testsuite> has no ${key} attribute`);
      total[key] += Number(m[1]);
    }
  }
  return total;
}

/**
 * Read the Node test-runner summary block (`ℹ tests N` / `tests N`, and the
 * matching fail / skipped lines).
 */
export function countersFromNodeSummary(text: string): SuiteCounters {
  const tests = /(?:^|\n)\s*(?:ℹ\s+)?tests\s+(\d+)\s*(?:\n|$)/.exec(text);
  if (!tests) throw new Error("no Node summary `tests` line");
  const failures =
    /(?:^|\n)\s*(?:ℹ\s+)?fail\s+(\d+)\s*(?:\n|$)/.exec(text) ??
    /(?:^|\n)\s*(?:ℹ\s+)?failed\s+(\d+)\s*(?:\n|$)/.exec(text);
  const skipped = /(?:^|\n)\s*(?:ℹ\s+)?skipped\s+(\d+)\s*(?:\n|$)/.exec(text);
  return {
    tests: Number(tests[1]),
    failures: failures ? Number(failures[1]) : 0,
    skipped: skipped ? Number(skipped[1]) : 0,
  };
}

/**
 * When the JUnit <testcase> total disagrees with the same run's Node summary,
 * or with a sum of suite attributes, say why. Nested suites are the known
 * cause of attribute-sum drift.
 */
export function countConsistencyFailures(
  fromTestcases: SuiteCounters,
  {
    suiteAttrs,
    nodeSummary,
  }: { suiteAttrs?: SuiteCounters; nodeSummary?: SuiteCounters } = {},
): string[] {
  const failures: string[] = [];
  if (nodeSummary && fromTestcases.tests !== nodeSummary.tests) {
    failures.push(
      `JUnit <testcase> count is ${fromTestcases.tests} but the Node summary reports tests ${nodeSummary.tests}`,
    );
  }
  if (suiteAttrs && fromTestcases.tests !== suiteAttrs.tests) {
    failures.push(
      `<testcase> count is ${fromTestcases.tests} but summing <testsuite tests> attributes yields ${suiteAttrs.tests}; ` +
        `nested <testsuite> elements inflate the attribute sum — count <testcase> elements, not suite totals`,
    );
  }
  return failures;
}

/** The sentence under guard, with its line breaks flattened. */
export function claimedCount(spec: string): { passed: number; total: number; sentence: string } {
  const flat = spec.replace(/\s+/g, " ");
  const m = /all three assert every case, (\d+) of (\d+), with none skipped/.exec(flat);
  if (!m) {
    throw new Error(
      "the Implementation Status sentence no longer matches the shape this gate reads; " +
        "update scripts/impl-status-gate.ts together with the text",
    );
  }
  return { passed: Number(m[1]), total: Number(m[2]), sentence: m[0] };
}

/**
 * `noSkips` follows the claim, not the machine. The sentence says none are
 * skipped *on the three hosted runners*, and the sentence right after it says
 * a local Windows box without symbolic-link privilege skips four POSIX-mode
 * cases on purpose. Burning red on that developer would be the false positive
 * that gets a guard switched off.
 */
export function implStatusFailures(
  spec: string,
  counters: SuiteCounters,
  { noSkips = false, specPath }: { noSkips?: boolean; specPath?: string } = {},
): string[] {
  const failures: string[] = [];
  const claim = claimedCount(spec);

  if (claim.passed !== claim.total) {
    failures.push(`the sentence claims ${claim.passed} of ${claim.total}; those have to be equal`);
  }
  if (counters.failures > 0) {
    failures.push(`the run reports ${counters.failures} failing cases; the sentence claims none`);
  }
  if (noSkips && counters.skipped > 0) {
    failures.push(`the run skipped ${counters.skipped} cases; the sentence claims none skipped`);
  }
  if (claim.total !== counters.tests) {
    const named = `spec/${basename(specPath ?? livingCoreDraftPath("."))}`;
    failures.push(
      `the sentence says ${claim.total} cases, the run measured ${counters.tests}; ` +
        `fix the sentence in ${named}`,
    );
  }
  return failures;
}

function main(): void {
  const living = livingCoreDraftPath(".");
  const [
    reportPath = ".suite-count.xml",
    specPath = living,
    summaryPath = ".suite-node-summary.txt",
  ] = process.argv.slice(2);
  const xml = readFileSync(reportPath, "utf8");
  const counters = countersFromJUnit(xml);
  const suiteAttrs = suiteAttributeCounters(xml);
  const nodeSummary = existsSync(summaryPath)
    ? countersFromNodeSummary(readFileSync(summaryPath, "utf8"))
    : undefined;
  const noSkips = Boolean(process.env.CI);
  const failures = [
    ...countConsistencyFailures(counters, { suiteAttrs, nodeSummary }),
    ...implStatusFailures(readFileSync(specPath, "utf8"), counters, {
      noSkips,
      specPath,
    }),
  ];
  if (failures.length > 0) {
    for (const failure of failures) console.error(`impl-status: ${failure}`);
    process.exit(1);
  }
  const skips = counters.skipped > 0 ? `, ${counters.skipped} skipped locally` : ", none skipped";
  console.log(`impl-status: the sentence and the run agree - ${counters.tests} cases${skips}`);
}

if (import.meta.filename === process.argv[1]) main();
