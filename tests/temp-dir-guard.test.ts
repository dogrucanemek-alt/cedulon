import { strict as assert } from "node:assert";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  TEMP_DIR_EXCEPTIONS,
  directTempDirFailures,
  runTempLeakGate,
  scanTestsForDirectTempDirs,
  writeTempSnapshot,
} from "../scripts/temp-dir-guard.ts";
import { removeTempDir, tempDir } from "./helpers/temp-dir.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const probePath = "tests/fixtures/wording-red/temp-dir-leak-probe.ts.txt";
const probe = readFileSync(join(root, ...probePath.split("/")), "utf8");

/** A context whose after-hooks the case runs itself, to look at the directory before and after. */
function heldContext(): { after: (fn: () => void) => void; runAfter: () => void } {
  const hooks: Array<() => void> = [];
  return {
    after: (fn) => {
      hooks.push(fn);
    },
    runAfter: () => {
      for (const fn of hooks) fn();
    },
  };
}

describe("no test opens a temp directory outside the helper", () => {
  it("RED: a test that opens its temp directory by hand is caught", () => {
    const details = directTempDirFailures(probe, probePath).map((f) => f.detail);
    assert.ok(details.some((d) => /calls mkdtemp directly/.test(d)), details.join(" | "));
    assert.ok(details.some((d) => /imports mkdtemp/.test(d)), details.join(" | "));
    assert.ok(details.some((d) => /tmpdir\(\) by hand/.test(d)), details.join(" | "));
  });

  it("GREEN: every source under tests/ opens its temp directories through tempDir(t, prefix)", () => {
    assert.deepEqual(scanTestsForDirectTempDirs(root), []);
  });

  it("RED: an exception that no longer covers a hit is reported, so the list cannot go stale", () => {
    const hits = scanTestsForDirectTempDirs(root, {
      ...TEMP_DIR_EXCEPTIONS,
      "tests/policy.test.ts": "a reason that stopped being true",
    }).filter((h) => h.file === "tests/policy.test.ts");
    assert.equal(hits.length, 1, "an exception for a file that opens nothing was accepted");
    assert.match(hits[0]!.detail, /opens no temp directory; drop the exception/);
  });

  it("every exception says why", () => {
    for (const [file, reason] of Object.entries(TEMP_DIR_EXCEPTIONS)) {
      assert.ok(reason.trim().length > 20, `${file} is excepted without a reason`);
    }
  });
});

describe("tempDir removes what it opened", () => {
  it("RED then GREEN: the directory and everything in it are gone once the context's after-hooks run", () => {
    const ctx = heldContext();
    const dir = tempDir(ctx, "cedulon-helper-");
    mkdirSync(join(dir, "nested"));
    writeFileSync(join(dir, "nested", "state.json"), "{}\n");
    assert.equal(existsSync(dir), true, "the directory is there while the test runs");
    ctx.runAfter();
    assert.equal(existsSync(dir), false, "the directory outlived its test");
  });

  it("RED then GREEN: a directory the test made read-only is still removed", () => {
    const ctx = heldContext();
    const dir = tempDir(ctx, "cedulon-readonly-");
    const file = join(dir, "state.json");
    writeFileSync(file, "{}\n");
    // The same changes the state tests make: the read-only bit on Windows, the
    // file and directory modes on POSIX.
    chmodSync(file, 0o444);
    if (process.platform !== "win32") {
      chmodSync(file, 0o000);
      chmodSync(dir, 0o500);
    }
    ctx.runAfter();
    assert.equal(existsSync(dir), false, "a mode the test set kept its directory alive");
  });

  it("RED: a removal that fails throws with the reason, so the test that opened it goes red", (t) => {
    const dir = tempDir(t, "cedulon-unremovable-");
    const busy = Object.assign(new Error("resource busy or locked"), { code: "EBUSY" });
    assert.throws(
      () =>
        removeTempDir(dir, {
          rm: () => {
            throw busy;
          },
        }),
      new RegExp(`temp directory .+ could not be removed: resource busy or locked`),
    );
    assert.throws(() => removeTempDir(dir, { rm: () => {} }), /is still present after removal/);
    assert.equal(existsSync(dir), true);
  });
});

// Its own top-level suite: the impl-status gate refuses nested suites, whose
// JUnit attributes count a child suite as a case.
describe("a directory opened in a step is removed when that step ends, not when its suite does", () => {
  let stepDir = "";
  it("the step opens a directory on its own context", (t) => {
    stepDir = tempDir(t, "cedulon-step-");
    writeFileSync(join(stepDir, "state.json"), "{}\n");
  });

  it("the next step finds it gone", () => {
    assert.notEqual(stepDir, "", "the previous step did not run");
    assert.equal(existsSync(stepDir), false, "the step's directory was left to its suite");
  });
});

describe("the pre-release run refuses a temp entry it left behind", () => {
  function fakeTemp(t: Parameters<typeof tempDir>[0]) {
    const base = tempDir(t, "cedulon-gate-");
    const temp = join(base, "temp");
    mkdirSync(temp);
    return { temp, snapshotPath: join(base, ".suite-temp-entries") };
  }

  it("RED: an entry added during the run and still there is named; one from before the run is not", (t) => {
    const { temp, snapshotPath } = fakeTemp(t);
    mkdirSync(join(temp, "cedulon-inv-before"));
    writeTempSnapshot(snapshotPath, temp);
    mkdirSync(join(temp, "cedulon-inv-Ab12Cd"));
    writeFileSync(join(temp, "unrelated-tool-file"), "");

    const result = runTempLeakGate({ snapshotPath, tempRoot: temp });
    assert.equal(result.ok, false, "a run that left a directory behind passed");
    const errors = result.ok ? [] : result.errors;
    assert.match(errors[0]!, /1 cedulon-\* entries were added to .+ during this run and are still there/);
    assert.deepEqual(errors.slice(1), ["  cedulon-inv-Ab12Cd"]);
    assert.equal(existsSync(snapshotPath), false, "the snapshot is used once");
  });

  it("GREEN: entries from before the run, and entries the run removed, are not counted", (t) => {
    const { temp, snapshotPath } = fakeTemp(t);
    mkdirSync(join(temp, "cedulon-inv-before"));
    writeTempSnapshot(snapshotPath, temp);
    const transient = join(temp, "cedulon-blobs-Zz99Yy");
    mkdirSync(transient);
    rmSync(transient, { recursive: true });

    const result = runTempLeakGate({ snapshotPath, tempRoot: temp });
    assert.deepEqual(result, { ok: true, before: 1, after: 1 });
  });

  it("RED: no snapshot, a replayed one, or one taken in another temp directory is refused", (t) => {
    const { temp, snapshotPath } = fakeTemp(t);
    const missing = runTempLeakGate({ snapshotPath, tempRoot: temp });
    assert.ok(!missing.ok && /no temp snapshot at/.test(missing.errors[0]!));

    writeTempSnapshot(snapshotPath, temp);
    assert.equal(runTempLeakGate({ snapshotPath, tempRoot: temp }).ok, true);
    const replay = runTempLeakGate({ snapshotPath, tempRoot: temp });
    assert.ok(!replay.ok && /no temp snapshot at/.test(replay.errors[0]!), "a snapshot was used twice");

    writeTempSnapshot(snapshotPath, temp);
    const elsewhere = runTempLeakGate({ snapshotPath, tempRoot: join(temp, "..") });
    assert.ok(!elsewhere.ok && /the snapshot was taken in .+, but the temp directory is now/.test(elsewhere.errors[0]!));
  });

  it("test:pre-release takes the snapshot before the suite and runs the gate after it", () => {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { scripts: Record<string, string> };
    const pre = pkg.scripts["test:pre-release"]!;
    const start = pre.indexOf("scripts/suite-run-start.ts");
    const suite = pre.indexOf("--test ");
    const gate = pre.indexOf("scripts/temp-dir-guard.ts");
    assert.ok(start >= 0 && suite > start, "the snapshot is not taken before the suite");
    assert.ok(gate > suite, "the temp-leak gate does not run after the suite");
  });
});
