import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  claimedCount,
  countersFromJUnit,
  implStatusFailures,
} from "../scripts/impl-status-gate.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const spec = readFileSync(join(root, "spec/draft-dogru-cedulon-core-00.md"), "utf8");


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
    const failures = implStatusFailures(spec, { tests: total - 11, failures: 0, skipped: 0 });
    assert.equal(failures.length, 1, failures.join(" | "));
    assert.match(failures[0]!, /the sentence says \d+ cases, the run measured \d+/);
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

  it("reads a JUnit report by summing its per-file totals", () => {
    const xml =
      '<testsuites><testsuite name="a" tests="6" failures="0" skipped="0"/>' +
      '<testsuite name="b" tests="4" failures="1" skipped="2"/></testsuites>';
    assert.deepEqual(countersFromJUnit(xml), { tests: 10, failures: 1, skipped: 2 });
    assert.throws(() => countersFromJUnit("<testsuites/>"), /no <testsuite> element/);
  });

  // The live comparison is deliberately NOT a test. The report belongs to the
  // run this test is inside, and is still being written while it executes -
  // reading it here failed exactly that way on the first run. The comparison
  // happens in scripts/impl-status-gate.ts, which the pre-release script
  // invokes after the suite has finished and closed the report.
});
