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

import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync, unlinkSync } from "node:fs";
import { basename } from "node:path";

import { livingCoreDraftPath } from "./latest-draft.ts";

export type SuiteCounters = { tests: number; failures: number; skipped: number };

/** Default path written at the start of `test:pre-release` and read by the gate. */
export const SUITE_RUN_STARTED_PATH = ".suite-run-started";

export type SuiteRunMarker = { startedAtMs: number; sourceIdentity: string };

/**
 * Content identity of the sources the impl-status claim answers to. Uses the
 * living core draft (the sentence under guard) so a shallow checkout still
 * produces a stable digest without needing `git rev-parse HEAD`.
 */
export function sourceTreeIdentity(
  root: string,
  read: (path: string) => string | Buffer = (path) => readFileSync(path),
): string {
  const living = livingCoreDraftPath(root);
  const rel = living.replace(/\\/g, "/").slice(root.replace(/\\/g, "/").length).replace(/^\//, "");
  const h = createHash("sha256");
  h.update(rel);
  h.update("\0");
  h.update(read(living));
  h.update("\0");
  return h.digest("hex");
}

/** Serialize the run-start marker (timestamp + source identity). */
export function formatSuiteRunMarker(marker: SuiteRunMarker): string {
  return `${marker.startedAtMs}\n${marker.sourceIdentity}\n`;
}

/** Parse a marker body. Legacy single-line timestamps have an empty identity. */
export function parseSuiteRunMarker(raw: string): SuiteRunMarker {
  const lines = raw.replace(/\r\n/g, "\n").trimEnd().split("\n");
  const startedAtMs = Number(lines[0]?.trim());
  const sourceIdentity = (lines[1] ?? "").trim();
  return { startedAtMs, sourceIdentity };
}

/**
 * Refuse suite reports that predate the run marker. A standalone gate against
 * leftover `.suite-count.xml` / `.suite-node-summary.txt` used to look green
 * without a fresh run; the marker is the freshness proof.
 */
export function reportFreshnessFailures(
  startedAtMs: number,
  reports: Array<{ path: string; mtimeMs: number }>,
): string[] {
  if (!Number.isFinite(startedAtMs) || startedAtMs <= 0) {
    return ["suite run start marker is not a positive timestamp"];
  }
  const failures: string[] = [];
  for (const report of reports) {
    if (report.mtimeMs < startedAtMs) {
      failures.push(
        `${report.path} mtime ${report.mtimeMs} is older than the run start ${startedAtMs}; refuse a stale suite report`,
      );
    }
  }
  return failures;
}

export function isEnoent(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && "code" in err && (err as { code?: string }).code === "ENOENT");
}

/**
 * Read the suite-run start marker and delete it. A second standalone gate
 * against the same leftover reports then fails for want of a marker, so a
 * successful old marker+report pair cannot be replayed after the sources
 * change. The CI path (`test:pre-release`) always stamps a fresh marker
 * before the suite, so one consume per run is the intended shape.
 *
 * Only a missing file after the read (ENOENT) is treated as already consumed;
 * any other unlink failure leaves the marker in place and fails the gate.
 */
export function consumeSuiteRunMarker(
  startedPath: string,
  { unlink = unlinkSync }: { unlink?: (path: string) => void } = {},
): SuiteRunMarker {
  if (!existsSync(startedPath)) {
    throw new Error(
      `no suite run start marker at ${startedPath}; refuse default suite reports without freshness proof`,
    );
  }
  const marker = parseSuiteRunMarker(readFileSync(startedPath, "utf8"));
  try {
    unlink(startedPath);
  } catch (err) {
    if (isEnoent(err)) {
      // A missing file after the read is still a consumed marker.
      return marker;
    }
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `suite run start marker at ${startedPath} could not be consumed: ${detail}`,
    );
  }
  return marker;
}

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
  if (nodeSummary) {
    if (fromTestcases.tests !== nodeSummary.tests) {
      failures.push(
        `JUnit <testcase> count is ${fromTestcases.tests} but the Node summary reports tests ${nodeSummary.tests}`,
      );
    }
    if (fromTestcases.failures !== nodeSummary.failures) {
      failures.push(
        `JUnit <testcase> failures are ${fromTestcases.failures} but the Node summary reports fail ${nodeSummary.failures}`,
      );
    }
    if (fromTestcases.skipped !== nodeSummary.skipped) {
      failures.push(
        `JUnit <testcase> skipped are ${fromTestcases.skipped} but the Node summary reports skipped ${nodeSummary.skipped}`,
      );
    }
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

export function runImplStatusGate(args: {
  reportPath: string;
  specPath: string;
  summaryPath: string;
  startedPath: string;
  noSkips?: boolean;
  /** Repo root used to recompute the source-tree identity (defaults beside the living draft). */
  root?: string;
  unlink?: (path: string) => void;
}): { ok: true; tests: number; skipped: number } | { ok: false; errors: string[] } {
  let marker: SuiteRunMarker;
  try {
    marker = consumeSuiteRunMarker(args.startedPath, { unlink: args.unlink });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, errors: [`impl-status: ${message}`] };
  }
  // Prefer an explicit root; otherwise the repo root that holds spec/.
  const identityRoot = (() => {
    if (args.root) return args.root;
    const abs = args.specPath.replace(/\\/g, "/");
    const parent = abs.replace(/\/[^/]+$/, "");
    if (parent === "spec" || /\/spec$/i.test(parent)) {
      const repo = parent.replace(/\/?spec$/i, "");
      return repo === "" ? "." : repo;
    }
    return parent || ".";
  })();
  const expectedIdentity = sourceTreeIdentity(identityRoot);
  if (!marker.sourceIdentity) {
    return {
      ok: false,
      errors: [
        "impl-status: suite run start marker carries no source-tree identity; refuse a legacy or incomplete marker",
      ],
    };
  }
  if (marker.sourceIdentity !== expectedIdentity) {
    return {
      ok: false,
      errors: [
        "impl-status: suite run start marker source-tree identity does not match the sources under audit; refuse a leftover marker after the sources changed",
      ],
    };
  }
  const reportStats = [
    { path: args.reportPath, mtimeMs: existsSync(args.reportPath) ? statSync(args.reportPath).mtimeMs : 0 },
    { path: args.summaryPath, mtimeMs: existsSync(args.summaryPath) ? statSync(args.summaryPath).mtimeMs : 0 },
  ];
  const freshness = reportFreshnessFailures(marker.startedAtMs, reportStats);
  if (freshness.length > 0) {
    return { ok: false, errors: freshness.map((failure) => `impl-status: ${failure}`) };
  }
  const xml = readFileSync(args.reportPath, "utf8");
  const counters = countersFromJUnit(xml);
  const suiteAttrs = suiteAttributeCounters(xml);
  const nodeSummary = existsSync(args.summaryPath)
    ? countersFromNodeSummary(readFileSync(args.summaryPath, "utf8"))
    : undefined;
  const failures = [
    ...countConsistencyFailures(counters, { suiteAttrs, nodeSummary }),
    ...implStatusFailures(readFileSync(args.specPath, "utf8"), counters, {
      noSkips: args.noSkips,
      specPath: args.specPath,
    }),
  ];
  if (failures.length > 0) {
    return { ok: false, errors: failures.map((failure) => `impl-status: ${failure}`) };
  }
  return { ok: true, tests: counters.tests, skipped: counters.skipped };
}

function main(): void {
  const living = livingCoreDraftPath(".");
  const [
    reportPath = ".suite-count.xml",
    specPath = living,
    summaryPath = ".suite-node-summary.txt",
    startedPath = process.env.SUITE_RUN_STARTED ?? SUITE_RUN_STARTED_PATH,
  ] = process.argv.slice(2);
  const result = runImplStatusGate({
    reportPath,
    specPath,
    summaryPath,
    startedPath,
    root: ".",
    noSkips: Boolean(process.env.CI),
  });
  if (!result.ok) {
    for (const failure of result.errors) console.error(failure);
    process.exit(1);
  }
  const skips = result.skipped > 0 ? `, ${result.skipped} skipped locally` : ", none skipped";
  console.log(`impl-status: the sentence and the run agree - ${result.tests} cases${skips}`);
}

if (import.meta.filename === process.argv[1]) main();
