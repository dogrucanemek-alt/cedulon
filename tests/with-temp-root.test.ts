import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { TOOL_ENTRIES, runInTempRoot, tempRootEnv } from "../scripts/with-temp-root.ts";
import { tempDir } from "./helpers/temp-dir.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const wrapper = join(root, "scripts", "with-temp-root.ts");

/** The environment a child of this test gets: `base` as its temp directory, and no test-runner context. */
function childEnv(base: string): NodeJS.ProcessEnv {
  const { NODE_TEST_CONTEXT: _, ...env } = process.env;
  return tempRootEnv(env, base);
}

/**
 * Run `node -e <code>` through the wrapper CLI, which opens its root under
 * `base`. Returns the wrapper's exit status, its output, and the root it
 * reported opening.
 */
function wrapped(base: string, code: string) {
  const run = spawnSync(process.execPath, ["--experimental-strip-types", wrapper, "--", "-e", code], {
    cwd: root,
    env: childEnv(base),
    encoding: "utf8",
  });
  const opened = /^with-temp-root: running in (.+)$/m.exec(run.stderr)?.[1]?.trim();
  assert.ok(opened, `the wrapper did not say which root it opened:\n${run.stderr}`);
  return { status: run.status, stdout: run.stdout, stderr: run.stderr, opened };
}

function assertRootGone(base: string, opened: string): void {
  assert.equal(dirname(opened), base, "the root was not opened in the temp directory the wrapper was given");
  assert.match(basename(opened), /^cedulon-run-/);
  assert.equal(existsSync(opened), false, "the wrapper left its root behind");
  assert.deepEqual(readdirSync(base), [], "something outside the root was left in the temp directory");
}

const leaveTwo = [
  "const { mkdirSync, writeFileSync } = require('node:fs');",
  "const { join } = require('node:path');",
  "const t = require('node:os').tmpdir();",
  "writeFileSync(join(t, 'left.txt'), 'x');",
  "mkdirSync(join(t, 'left-dir'));",
  "writeFileSync(join(t, 'left-dir', 'inner.txt'), 'x');",
].join(" ");

describe("with-temp-root runs a command in a temp root of its own", () => {
  it("RED: a child that leaves a file and a directory in the root is refused by name, with 1", (t) => {
    const base = tempDir(t, "cedulon-wrap-");
    const run = wrapped(base, leaveTwo);
    assert.equal(run.status, 1, `a run that left two entries passed:\n${run.stderr}`);
    assert.match(run.stderr, /the run left 2 entries in its temp root/);
    const named = run.stderr.split(/\r?\n/).filter((line) => line.startsWith("  "));
    assert.deepEqual(named, ["  left-dir/", "  left.txt"]);
    assertRootGone(base, run.opened);
  });

  it("GREEN: a child that removes what it made exits 0", (t) => {
    const base = tempDir(t, "cedulon-wrap-");
    const run = wrapped(
      base,
      "const p = require('node:path').join(require('node:os').tmpdir(), 'x'); require('node:fs').writeFileSync(p, ''); require('node:fs').rmSync(p);",
    );
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stderr, /the run left nothing in its temp root/);
    assertRootGone(base, run.opened);
  });

  it("a child's own exit code is kept: 3 stays 3", (t) => {
    const base = tempDir(t, "cedulon-wrap-");
    const run = wrapped(base, "process.exit(3)");
    assert.equal(run.status, 3, run.stderr);
    assertRootGone(base, run.opened);
  });

  it("a failing child that also leaves an entry keeps its code, and the entry is still named", (t) => {
    const base = tempDir(t, "cedulon-wrap-");
    const run = wrapped(base, `${leaveTwo} process.exit(3);`);
    assert.equal(run.status, 3, run.stderr);
    assert.match(run.stderr, /the run left 2 entries in its temp root/);
    assertRootGone(base, run.opened);
  });

  it("the child's os.tmpdir() is the root", (t) => {
    const base = tempDir(t, "cedulon-wrap-");
    const run = wrapped(
      base,
      "const e = process.env; process.stdout.write(JSON.stringify({ tmpdir: require('node:os').tmpdir(), TMPDIR: e.TMPDIR, TEMP: e.TEMP, TMP: e.TMP }));",
    );
    assert.equal(run.status, 0, run.stderr);
    const seen = JSON.parse(run.stdout) as Record<string, string>;
    // Node reads TMPDIR on POSIX and TEMP, then TMP, on Windows.
    assert.equal(seen.tmpdir, run.opened, `${process.platform}: os.tmpdir() in the child is not the root`);
    assert.deepEqual(
      { TMPDIR: seen.TMPDIR, TEMP: seen.TEMP, TMP: seen.TMP },
      { TMPDIR: run.opened, TEMP: run.opened, TMP: run.opened },
    );
    assertRootGone(base, run.opened);
  });

  it("RED: a root that cannot be removed is named, and the run is red", async (t) => {
    const base = tempDir(t, "cedulon-wrap-");
    const lines: string[] = [];
    const result = await runInTempRoot({
      command: process.execPath,
      args: ["-e", ""],
      base,
      env: childEnv(base),
      stdio: "ignore",
      log: (line) => lines.push(line),
      remove: () => {
        throw new Error("resource busy or locked");
      },
    });
    assert.equal(result.code, 1, lines.join("\n"));
    assert.ok(
      lines.some((line) => line === `with-temp-root: the temp root ${result.root} could not be removed: resource busy or locked`),
      lines.join("\n"),
    );
  });

  it("every tool entry the root allows says why", () => {
    for (const [name, reason] of Object.entries(TOOL_ENTRIES)) {
      assert.ok(reason.trim().length > 20, `${name} is allowed without a reason`);
    }
  });
});

describe("the suite runs inside a temp root of its own", () => {
  it("test:all and test:pre-release run node --test through with-temp-root, and nothing else", () => {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { scripts: Record<string, string> };
    for (const name of ["test:all", "test:pre-release"]) {
      const steps = pkg.scripts[name]!.split("&&").map((step) => step.trim());
      const suite = steps.filter((step) => /\s--test\s/.test(step));
      assert.equal(suite.length, 1, `${name} has ${suite.length} node --test steps`);
      assert.match(
        suite[0]!,
        /^node --experimental-strip-types scripts\/with-temp-root\.ts -- --experimental-strip-types --test /,
        `${name} runs the suite outside its own temp root`,
      );
      const wrappedSteps = steps.filter((step) => step.includes("with-temp-root"));
      assert.deepEqual(wrappedSteps, suite, `${name} wraps a step that is not the suite`);
    }
  });
});
