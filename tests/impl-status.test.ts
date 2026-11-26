import { strict as assert } from "node:assert";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { tempDir } from "./helpers/temp-dir.ts";

import {
  claimedCount,
  consumeSuiteRunMarker,
  countConsistencyFailures,
  countersFromJUnit,
  countersFromNodeSummary,
  formatSuiteRunMarker,
  implStatusFailures,
  reportFreshnessFailures,
  runImplStatusGate,
  sourceTreeIdentity,
  suiteAttributeCounters,
} from "../scripts/impl-status-gate.ts";
import { livingCoreDraftPath } from "../scripts/latest-draft.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const specPath = livingCoreDraftPath(root);
const spec = readFileSync(specPath, "utf8");
const sourceIdentity = sourceTreeIdentity(root);

/** Nested describes as Node's JUnit reporter emits them: parent tests= child count. */
const nestedJUnit =
  '<testsuites>' +
  '<testsuite name="pin matrix" tests="4" failures="0" skipped="0">' +
  '<testsuite name="usable pin" tests="3" failures="0" skipped="0">' +
  '<testcase name="a1"/><testcase name="a2"/><testcase name="a3"/>' +
  "</testsuite>" +
  '<testsuite name="no pin" tests="3" failures="1" skipped="0">' +
  '<testcase name="b1"><failure message="x">boom</failure></testcase>' +
  '<testcase name="b2"/><testcase name="b3"/>' +
  "</testsuite>" +
  '<testsuite name="fully unreadable pin" tests="3" failures="0" skipped="1">' +
  '<testcase name="c1"><skipped/></testcase>' +
  '<testcase name="c2"/><testcase name="c3"/>' +
  "</testsuite>" +
  '<testsuite name="partially readable pin" tests="3" failures="0" skipped="0">' +
  '<testcase name="d1"/><testcase name="d2"/>' +
  '<testcase name="d3"><error message="e">err</error></testcase>' +
  "</testsuite>" +
  "</testsuite>" +
  "</testsuites>";

describe("the Implementation Status count answers to a run", () => {
  it("the sentence is still shaped the way the gate reads it", () => {
    const claim = claimedCount(spec);
    assert.equal(claim.passed, claim.total);
    assert.ok(claim.total > 0);
  });

  it("GREEN: a run that matches the sentence passes", () => {
    const { total } = claimedCount(spec);
    assert.deepEqual(implStatusFailures(spec, { tests: total, failures: 0, skipped: 0 }), []);
  });

  it("RED: a stale number is caught - the defect as it happened", () => {
    // -09 said 457 when the truth was 548; core-00 said 548 when the truth
    // was 559. Both survived because nothing compared the two.
    const { total } = claimedCount(spec);
    const failures = implStatusFailures(
      spec,
      { tests: total - 11, failures: 0, skipped: 0 },
      { specPath },
    );
    assert.equal(failures.length, 1, failures.join(" | "));
    assert.match(failures[0]!, /the sentence says \d+ cases, the run measured \d+/);
    assert.match(
      failures[0]!,
      new RegExp(`fix the sentence in spec/${basename(specPath).replace(/\./g, "\\.")}`),
    );
  });

  it("RED: on CI, 'with none skipped' has to be earned", () => {
    const { total } = claimedCount(spec);
    const counters = { tests: total, failures: 0, skipped: 4 };
    const failures = implStatusFailures(spec, counters, { noSkips: true });
    assert.ok(failures.some((f) => /skipped 4 cases/.test(f)), failures.join(" | "));
    // The same four skips on a local Windows box are what the next sentence
    // of the document describes, so they are not a defect there.
    assert.deepEqual(implStatusFailures(spec, counters), []);
  });

  it("RED: a failing run cannot be described as a passing one", () => {
    const { total } = claimedCount(spec);
    const failures = implStatusFailures(spec, { tests: total, failures: 1, skipped: 0 });
    assert.ok(failures.some((f) => /1 failing cases/.test(f)), failures.join(" | "));
  });

  it("counts <testcase> elements; nested suite attributes must not be summed", () => {
    // Summing every tests= attribute here yields 4+3+3+3+3 = 16; there are
    // only 12 <testcase> elements. That is the core-05 double-count.
    assert.deepEqual(suiteAttributeCounters(nestedJUnit), {
      tests: 16,
      failures: 1,
      skipped: 1,
    });
    assert.deepEqual(countersFromJUnit(nestedJUnit), {
      tests: 12,
      failures: 2,
      skipped: 1,
    });
    assert.throws(() => countersFromJUnit("<testsuites/>"), /no <testsuite> element/);
  });

  it("reads a flat JUnit report by its <testcase> elements", () => {
    const xml =
      '<testsuites><testsuite name="a" tests="6" failures="0" skipped="0">' +
      '<testcase name="a1"/><testcase name="a2"/><testcase name="a3"/>' +
      '<testcase name="a4"/><testcase name="a5"/><testcase name="a6"/>' +
      "</testsuite>" +
      '<testsuite name="b" tests="4" failures="1" skipped="2">' +
      '<testcase name="b1"><failure message="x">boom</failure></testcase>' +
      '<testcase name="b2"><skipped/></testcase>' +
      '<testcase name="b3"><skipped/></testcase>' +
      '<testcase name="b4"/>' +
      "</testsuite></testsuites>";
    assert.deepEqual(countersFromJUnit(xml), { tests: 10, failures: 1, skipped: 2 });
    assert.deepEqual(suiteAttributeCounters(xml), { tests: 10, failures: 1, skipped: 2 });
  });

  it("RED: nested suite attribute totals disagree with the <testcase> count", () => {
    const fromCases = countersFromJUnit(nestedJUnit);
    const suiteAttrs = suiteAttributeCounters(nestedJUnit);
    const failures = countConsistencyFailures(fromCases, { suiteAttrs });
    assert.equal(failures.length, 1, failures.join(" | "));
    assert.match(failures[0]!, /<testcase> count is 12/);
    assert.match(failures[0]!, /summing <testsuite tests> attributes yields 16/);
    assert.match(failures[0]!, /nested <testsuite>/);
  });

  it("RED: a Node summary that disagrees with the JUnit <testcase> count is refused", () => {
    const fromCases = countersFromJUnit(nestedJUnit);
    // fail and skipped match the <testcase> walk; only the tests total drifts.
    const nodeSummary = countersFromNodeSummary(
      "ℹ tests 11\nℹ suites 5\nℹ pass 9\nℹ fail 2\nℹ skipped 1\n",
    );
    assert.deepEqual(nodeSummary, { tests: 11, failures: 2, skipped: 1 });
    const failures = countConsistencyFailures(fromCases, { nodeSummary });
    assert.equal(failures.length, 1, failures.join(" | "));
    assert.match(
      failures[0]!,
      /JUnit <testcase> count is 12 but the Node summary reports tests 11/,
    );
  });

  it("RED: tests match but fail counts disagree", () => {
    const failures = countConsistencyFailures(
      { tests: 12, failures: 2, skipped: 1 },
      { nodeSummary: { tests: 12, failures: 0, skipped: 1 } },
    );
    assert.equal(failures.length, 1, failures.join(" | "));
    assert.match(
      failures[0]!,
      /JUnit <testcase> failures are 2 but the Node summary reports fail 0/,
    );
  });

  it("RED: tests match but skipped counts disagree", () => {
    const failures = countConsistencyFailures(
      { tests: 12, failures: 2, skipped: 1 },
      { nodeSummary: { tests: 12, failures: 2, skipped: 0 } },
    );
    assert.equal(failures.length, 1, failures.join(" | "));
    assert.match(
      failures[0]!,
      /JUnit <testcase> skipped are 1 but the Node summary reports skipped 0/,
    );
  });

  it("GREEN: Node summary and suite attributes that match the <testcase> count pass", () => {
    const fromCases = { tests: 10, failures: 1, skipped: 2 };
    assert.deepEqual(
      countConsistencyFailures(fromCases, {
        suiteAttrs: { tests: 10, failures: 1, skipped: 2 },
        nodeSummary: { tests: 10, failures: 1, skipped: 2 },
      }),
      [],
    );
  });

  it("RED: a suite report older than the run start marker is refused", () => {
    const startedAtMs = 1_700_000_100_000;
    const failures = reportFreshnessFailures(startedAtMs, [
      { path: ".suite-count.xml", mtimeMs: 1_700_000_000_000 },
      { path: ".suite-node-summary.txt", mtimeMs: 1_700_000_200_000 },
    ]);
    assert.equal(failures.length, 1, failures.join(" | "));
    assert.match(failures[0]!, /\.suite-count\.xml/);
    assert.match(failures[0]!, /stale suite report/);
  });

  it("GREEN: reports at or after the run start marker pass freshness", () => {
    const startedAtMs = 1_700_000_100_000;
    assert.deepEqual(
      reportFreshnessFailures(startedAtMs, [
        { path: ".suite-count.xml", mtimeMs: startedAtMs },
        { path: ".suite-node-summary.txt", mtimeMs: startedAtMs + 1 },
      ]),
      [],
    );
  });

  it("RED: a second standalone gate against the same marker+reports fails", (t) => {
    // A successful old marker and matching reports used to stay green on a
    // second standalone call after the sources changed; the marker is now
    // single-use so the second call has no freshness proof.
    const { total } = claimedCount(spec);
    const dir = tempDir(t, "cedulon-impl-status-");
    const startedPath = join(dir, ".suite-run-started");
    const reportPath = join(dir, ".suite-count.xml");
    const summaryPath = join(dir, ".suite-node-summary.txt");
    const startedAtMs = Date.now() - 1_000;
    writeFileSync(
      startedPath,
      formatSuiteRunMarker({ startedAtMs, sourceIdentity }),
      "utf8",
    );
    const cases = Array.from({ length: total }, (_, i) => `<testcase name="t${i}"/>`).join("");
    writeFileSync(
      reportPath,
      `<testsuites><testsuite name="all" tests="${total}" failures="0" skipped="0">${cases}</testsuite></testsuites>\n`,
      "utf8",
    );
    writeFileSync(
      summaryPath,
      `ℹ tests ${total}\nℹ suites 1\nℹ pass ${total}\nℹ fail 0\nℹ skipped 0\n`,
      "utf8",
    );
    const first = runImplStatusGate({
      reportPath,
      summaryPath,
      startedPath,
      specPath,
      root,
      noSkips: false,
    });
    assert.equal(first.ok, true, first.ok ? "" : first.errors.join(" | "));
    assert.equal(existsSync(startedPath), false, "the marker must be consumed on first use");
    const second = runImplStatusGate({
      reportPath,
      summaryPath,
      startedPath,
      specPath,
      root,
      noSkips: false,
    });
    assert.equal(second.ok, false, "a replay of the same marker+reports must fail");
    assert.ok(
      second.ok === false && second.errors.some((e) => /no suite run start marker/.test(e)),
      second.ok ? "unexpected ok" : second.errors.join(" | "),
    );
    assert.throws(() => consumeSuiteRunMarker(startedPath), /no suite run start marker/);
  });

  it("RED: a non-ENOENT unlink failure fails the gate", (t) => {
    const { total } = claimedCount(spec);
    const dir = tempDir(t, "cedulon-impl-status-unlink-");
    const startedPath = join(dir, ".suite-run-started");
    const reportPath = join(dir, ".suite-count.xml");
    const summaryPath = join(dir, ".suite-node-summary.txt");
    const startedAtMs = Date.now() - 1_000;
    writeFileSync(
      startedPath,
      formatSuiteRunMarker({ startedAtMs, sourceIdentity }),
      "utf8",
    );
    const cases = Array.from({ length: total }, (_, i) => `<testcase name="t${i}"/>`).join("");
    writeFileSync(
      reportPath,
      `<testsuites><testsuite name="all" tests="${total}" failures="0" skipped="0">${cases}</testsuite></testsuites>\n`,
      "utf8",
    );
    writeFileSync(
      summaryPath,
      `ℹ tests ${total}\nℹ suites 1\nℹ pass ${total}\nℹ fail 0\nℹ skipped 0\n`,
      "utf8",
    );
    const busy = Object.assign(new Error("resource busy"), { code: "EBUSY" });
    const result = runImplStatusGate({
      reportPath,
      summaryPath,
      startedPath,
      specPath,
      root,
      noSkips: false,
      unlink: () => {
        throw busy;
      },
    });
    assert.equal(result.ok, false, "unlink EBUSY must fail the gate");
    assert.ok(
      result.ok === false && result.errors.some((e) => /could not be consumed/.test(e)),
      result.ok ? "unexpected ok" : result.errors.join(" | "),
    );
    assert.equal(existsSync(startedPath), true, "marker must remain when unlink fails");
    assert.throws(
      () =>
        consumeSuiteRunMarker(startedPath, {
          unlink: () => {
            throw busy;
          },
        }),
      /could not be consumed/,
    );
  });

  it("RED: an unconsumed marker whose source identity no longer matches is refused", (t) => {
    const { total } = claimedCount(spec);
    const dir = tempDir(t, "cedulon-impl-status-identity-");
    const startedPath = join(dir, ".suite-run-started");
    const reportPath = join(dir, ".suite-count.xml");
    const summaryPath = join(dir, ".suite-node-summary.txt");
    const startedAtMs = Date.now() - 1_000;
    // Marker stamped against a different source tree; reports are otherwise fresh.
    writeFileSync(
      startedPath,
      formatSuiteRunMarker({ startedAtMs, sourceIdentity: "0".repeat(64) }),
      "utf8",
    );
    const cases = Array.from({ length: total }, (_, i) => `<testcase name="t${i}"/>`).join("");
    writeFileSync(
      reportPath,
      `<testsuites><testsuite name="all" tests="${total}" failures="0" skipped="0">${cases}</testsuite></testsuites>\n`,
      "utf8",
    );
    writeFileSync(
      summaryPath,
      `ℹ tests ${total}\nℹ suites 1\nℹ pass ${total}\nℹ fail 0\nℹ skipped 0\n`,
      "utf8",
    );
    const result = runImplStatusGate({
      reportPath,
      summaryPath,
      startedPath,
      specPath,
      root,
      noSkips: false,
    });
    assert.equal(result.ok, false, "stale source identity must fail");
    assert.ok(
      result.ok === false && result.errors.some((e) => /source-tree identity/.test(e)),
      result.ok ? "unexpected ok" : result.errors.join(" | "),
    );
  });

  // The live comparison is deliberately NOT a test. The report belongs to the
  // run this test is inside, and is still being written while it executes -
  // reading it here failed exactly that way on the first run. The comparison
  // happens in scripts/impl-status-gate.ts, which the pre-release script
  // invokes after the suite has finished and closed the report.
});
