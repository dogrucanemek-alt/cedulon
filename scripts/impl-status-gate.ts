/**
 * The Implementation Status count is compared against the run that just
 * produced it.
 *
 * Found 2026-09-09: core-00 said "all three assert every case, 548 of 548";
 * the real figure was 559. The same sentence had said 457 in -09 when the
 * real figure was 548, and two revisions went out with nobody noticing. The
 * number was written by hand and nothing on earth compared it to a run.
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
 * gate reads the report of that run. There is no second declaration to
 * maintain, no network, no second execution -- and it runs on all three
 * hosted runners, which is exactly the claim the sentence makes. The report
 * is not committed; a stale copy cannot stand in for a run that did not
 * happen.
 */

import { readFileSync } from "node:fs";

export type SuiteCounters = { tests: number; failures: number; skipped: number };

/** Sum the per-file totals of a Node test-runner JUnit report. */
export function countersFromJUnit(xml: string): SuiteCounters {
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
  { noSkips = false }: { noSkips?: boolean } = {},
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
    failures.push(
      `the sentence says ${claim.total} cases, the run measured ${counters.tests}; ` +
        `fix the sentence in spec/draft-dogru-cedulon-core-00.md`,
    );
  }
  return failures;
}

function main(): void {
  const [reportPath = ".suite-count.xml", specPath = "spec/draft-dogru-cedulon-core-00.md"] =
    process.argv.slice(2);
  const counters = countersFromJUnit(readFileSync(reportPath, "utf8"));
  const noSkips = Boolean(process.env.CI);
  const failures = implStatusFailures(readFileSync(specPath, "utf8"), counters, { noSkips });
  if (failures.length > 0) {
    for (const failure of failures) console.error(`impl-status: ${failure}`);
    process.exit(1);
  }
  const skips = counters.skipped > 0 ? `, ${counters.skipped} skipped locally` : ", none skipped";
  console.log(`impl-status: the sentence and the run agree - ${counters.tests} cases${skips}`);
}

if (import.meta.filename === process.argv[1]) main();
