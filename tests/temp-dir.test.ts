import { strict as assert } from "node:assert";
import { chmodSync, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { KILL_GRACE_MS, runBounded } from "../scripts/bounded-run.ts";
import { tempRootEnv } from "../scripts/with-temp-root.ts";
import { removeTempDir, tempDir } from "./helpers/temp-dir.ts";

const helper = join(dirname(fileURLToPath(import.meta.url)), "helpers", "temp-dir.ts");
/** One `node --test` run of a one-case file, measured on Windows at 0.2 s. */
const CHILD_RUN_TIMEOUT_MS = 30_000;
const CHILD_CASE_TIMEOUT_MS = CHILD_RUN_TIMEOUT_MS + KILL_GRACE_MS + 10_000;

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

  it("RED: a removal that fails throws with the reason", (t) => {
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

describe("a cleanup failure turns a real node --test run red", () => {
  /**
   * Write a one-case test file that opens a directory with tempDir, run it in
   * its own `node --test` process with `base` as its temp directory, and
   * return the TAP it printed.
   */
  async function runChild(base: string, rm: string | undefined): Promise<{ status: number | null; stdout: string; stderr: string }> {
    const file = join(base, "cleanup.test.mts");
    writeFileSync(
      file,
      [
        `import { test } from "node:test";`,
        `import { tempDir } from ${JSON.stringify(pathToFileURL(helper).href)};`,
        `test("opens a directory with tempDir", (t) => {`,
        `  tempDir(t, "cedulon-child-"${rm === undefined ? "" : `, { rm: ${rm} }`});`,
        `});`,
        ``,
      ].join("\n"),
    );
    const { NODE_TEST_CONTEXT: _, ...env } = process.env;
    const run = await runBounded({
      label: "node --test on a one-case tempDir file",
      command: process.execPath,
      args: ["--experimental-strip-types", "--test", "--test-reporter=tap", file],
      cwd: base,
      env: tempRootEnv(env, base),
      timeoutMs: CHILD_RUN_TIMEOUT_MS,
      maxOutputBytes: 1024 * 1024,
      returnStatus: true,
    });
    return { status: run.status, stdout: run.stdout.toString("utf8"), stderr: run.stderr.toString("utf8") };
  }

  it("RED: a directory that cannot be removed fails the test that opened it", { timeout: CHILD_CASE_TIMEOUT_MS }, async (t) => {
    const base = tempDir(t, "cedulon-after-");
    const run = await runChild(
      base,
      `() => { throw Object.assign(new Error("resource busy or locked"), { code: "EBUSY" }); }`,
    );
    assert.equal(run.status, 1, `the child passed although its directory stayed:\n${run.stdout}${run.stderr}`);
    assert.match(run.stdout, /^not ok 1 - opens a directory with tempDir$/m);
    assert.match(run.stdout, /temp directory .+cedulon-child-\w+ could not be removed: resource busy or locked/);
    assert.match(run.stdout, /^# fail 1$/m);
  });

  it("GREEN: the same test with a removal that works passes and leaves only its own file", { timeout: CHILD_CASE_TIMEOUT_MS }, async (t) => {
    const base = tempDir(t, "cedulon-after-");
    const run = await runChild(base, undefined);
    assert.equal(run.status, 0, `${run.stdout}${run.stderr}`);
    assert.match(run.stdout, /^ok 1 - opens a directory with tempDir$/m);
    assert.match(run.stdout, /^# fail 0$/m);
    assert.deepEqual(readdirSync(base), ["cleanup.test.mts"]);
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
