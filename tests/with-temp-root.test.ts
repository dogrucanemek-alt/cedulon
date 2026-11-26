import { strict as assert } from "node:assert";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { KILL_GRACE_MS, runBounded } from "../scripts/bounded-run.ts";
import { ROOT_PREFIX, TOOL_ENTRIES, runInTempRoot, signalExitCode, tempRootEnv } from "../scripts/with-temp-root.ts";
import { tempDir } from "./helpers/temp-dir.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const wrapper = join(root, "scripts", "with-temp-root.ts");
const guard = join(root, "tests", "temp-root-active.test.ts");

const COMPILE_CACHE_VARIABLES = ["NODE_COMPILE_CACHE", "NODE_DISABLE_COMPILE_CACHE"];

/**
 * The environment a child of this test gets: `base` as its temp directory,
 * no test-runner context, and nothing that decides Node's compile cache
 * unless `extra` sets it. This suite itself runs with the cache turned off;
 * passing that on would hide whether the wrapper turns it off.
 */
function childEnv(base: string, extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key !== "NODE_TEST_CONTEXT" && !COMPILE_CACHE_VARIABLES.includes(key.toUpperCase())) env[key] = value;
  }
  const out = tempRootEnv(env, base);
  delete out.NODE_DISABLE_COMPILE_CACHE;
  return { ...out, ...extra };
}

/**
 * Bound on one Node process a case here starts: the wrapper, or a test
 * runner. Measured on Windows at 0.25 s for the wrapper running the guard.
 */
const CHILD_TIMEOUT_MS = 30_000;

/** The `{ timeout }` of a case that starts `calls` such processes one after another. */
function caseTimeout(calls: number): number {
  return calls * CHILD_TIMEOUT_MS + KILL_GRACE_MS + 10_000;
}

type ChildRun = { status: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string };

/** Run `node <args>`, bounded, and return how it ended and what it printed. */
async function runNode(label: string, args: readonly string[], env: NodeJS.ProcessEnv): Promise<ChildRun> {
  const run = await runBounded({
    label,
    command: process.execPath,
    args: [...args],
    cwd: root,
    env,
    timeoutMs: CHILD_TIMEOUT_MS,
    maxOutputBytes: 1024 * 1024,
    returnStatus: true,
  });
  return { status: run.status, signal: run.signal, stdout: run.stdout.toString("utf8"), stderr: run.stderr.toString("utf8") };
}

/** Run `node -e <code>` through the wrapper CLI; see wrappedNode. */
function wrapped(base: string, code: string, extra: NodeJS.ProcessEnv = {}) {
  return wrappedNode(base, ["-e", code], extra);
}

/**
 * Run `node <args>` through the wrapper CLI, which opens its root under
 * `base`. Returns the wrapper's exit status and signal, its output, and the
 * root it reported opening.
 */
async function wrappedNode(base: string, args: readonly string[], extra: NodeJS.ProcessEnv = {}) {
  const run = await runNode("with-temp-root wrapper", ["--experimental-strip-types", wrapper, "--", ...args], childEnv(base, extra));
  const opened = /^with-temp-root: running in (.+)$/m.exec(run.stderr)?.[1]?.trim();
  assert.ok(opened, `the wrapper did not say which root it opened:\n${run.stderr}`);
  return { ...run, opened };
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
  it("RED: a child that leaves a file and a directory in the root is refused by name, with 1", { timeout: caseTimeout(1) }, async (t) => {
    const base = tempDir(t, "cedulon-wrap-");
    const run = await wrapped(base, leaveTwo);
    assert.equal(run.status, 1, `a run that left two entries passed:\n${run.stderr}`);
    assert.match(run.stderr, /the run left 2 entries in its temp root/);
    const named = run.stderr.split(/\r?\n/).filter((line) => line.startsWith("  "));
    assert.deepEqual(named, ["  left-dir/", "  left.txt"]);
    assertRootGone(base, run.opened);
  });

  it("GREEN: a child that removes what it made exits 0", { timeout: caseTimeout(1) }, async (t) => {
    const base = tempDir(t, "cedulon-wrap-");
    const run = await wrapped(
      base,
      "const p = require('node:path').join(require('node:os').tmpdir(), 'x'); require('node:fs').writeFileSync(p, ''); require('node:fs').rmSync(p);",
    );
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stderr, /the run left nothing in its temp root/);
    assertRootGone(base, run.opened);
  });

  it("a child's own exit code is kept: 3 stays 3", { timeout: caseTimeout(1) }, async (t) => {
    const base = tempDir(t, "cedulon-wrap-");
    const run = await wrapped(base, "process.exit(3)");
    assert.equal(run.status, 3, run.stderr);
    assertRootGone(base, run.opened);
  });

  it("a failing child that also leaves an entry keeps its code, and the entry is still named", { timeout: caseTimeout(1) }, async (t) => {
    const base = tempDir(t, "cedulon-wrap-");
    const run = await wrapped(base, `${leaveTwo} process.exit(3);`);
    assert.equal(run.status, 3, run.stderr);
    assert.match(run.stderr, /the run left 2 entries in its temp root/);
    assertRootGone(base, run.opened);
  });

  it("the child's os.tmpdir() is the root", { timeout: caseTimeout(1) }, async (t) => {
    const base = tempDir(t, "cedulon-wrap-");
    const run = await wrapped(
      base,
      "const e = process.env; process.stdout.write(JSON.stringify({ tmpdir: require('node:os').tmpdir(), TMPDIR: e.TMPDIR, TEMP: e.TEMP, TMP: e.TMP, CEDULON_TEMP_ROOT: e.CEDULON_TEMP_ROOT }));",
    );
    assert.equal(run.status, 0, run.stderr);
    const seen = JSON.parse(run.stdout) as Record<string, string>;
    // Node reads TMPDIR on POSIX and TEMP, then TMP, on Windows.
    assert.equal(seen.tmpdir, run.opened, `${process.platform}: os.tmpdir() in the child is not the root`);
    assert.deepEqual(
      { TMPDIR: seen.TMPDIR, TEMP: seen.TEMP, TMP: seen.TMP, CEDULON_TEMP_ROOT: seen.CEDULON_TEMP_ROOT },
      { TMPDIR: run.opened, TEMP: run.opened, TMP: run.opened, CEDULON_TEMP_ROOT: run.opened },
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

// npm 11 and 12 call module.enableCompileCache() as they start, and with no
// NODE_COMPILE_CACHE Node puts that cache in os.tmpdir()/node-compile-cache:
// inside the root, for any test that runs npm.
const turnCacheOn = [
  "const m = require('node:module');",
  "const r = m.enableCompileCache();",
  "require(process.env.CEDULON_CACHED_MODULE);",
  "process.stdout.write(JSON.stringify({ status: r.status, directory: r.directory ?? null, disable: process.env.NODE_DISABLE_COMPILE_CACHE ?? null, statuses: m.constants.compileCacheStatus }));",
].join(" ");

function cachedModule(dir: string): string {
  const file = join(dir, "cached.cjs");
  writeFileSync(file, "module.exports = 42;\n");
  return file;
}

describe("Node's compile cache stays out of the root", () => {
  it("RED: a child that turns the compile cache on leaves nothing in the root, and exits 0", { timeout: caseTimeout(1) }, async (t) => {
    const base = tempDir(t, "cedulon-wrap-");
    const outside = tempDir(t, "cedulon-module-");
    const run = await wrapped(base, turnCacheOn, { CEDULON_CACHED_MODULE: cachedModule(outside) });
    assert.equal(run.status, 0, `the compile cache was left in the root:\n${run.stderr}`);
    const seen = JSON.parse(run.stdout) as { status: number; disable: string | null; statuses: Record<string, number> };
    assert.equal(seen.status, seen.statuses.DISABLED, "the child could still turn the compile cache on");
    assert.equal(seen.disable, "1");
    assertRootGone(base, run.opened);
  });

  it("a NODE_COMPILE_CACHE set outside is left alone: the cache is written there, and the root stays empty", { timeout: caseTimeout(1) }, async (t) => {
    const base = tempDir(t, "cedulon-wrap-");
    const outside = tempDir(t, "cedulon-cache-");
    const cache = join(outside, "cache");
    const run = await wrapped(base, turnCacheOn, { NODE_COMPILE_CACHE: cache, CEDULON_CACHED_MODULE: cachedModule(outside) });
    assert.equal(run.status, 0, run.stderr);
    const seen = JSON.parse(run.stdout) as {
      status: number;
      directory: string | null;
      disable: string | null;
      statuses: Record<string, number>;
    };
    assert.equal(seen.status, seen.statuses.ALREADY_ENABLED, "the cache the user set was not the one in use");
    assert.equal(seen.disable, null, "the wrapper turned off a cache the user set");
    assert.ok(seen.directory?.startsWith(cache), `the cache went to ${seen.directory}, not under ${cache}`);
    assert.ok(readdirSync(cache, { recursive: true }).length > 0, "nothing was written to the cache the user set");
    assertRootGone(base, run.opened);
  });

  it("tempRootEnv turns the compile cache off only when no NODE_COMPILE_CACHE is set", () => {
    assert.equal(tempRootEnv({ PATH: "p" }, "/r", "linux").NODE_DISABLE_COMPILE_CACHE, "1");
    // Node treats an empty NODE_COMPILE_CACHE as unset and falls back to os.tmpdir().
    assert.equal(tempRootEnv({ NODE_COMPILE_CACHE: "" }, "/r", "linux").NODE_DISABLE_COMPILE_CACHE, "1");
    assert.equal(tempRootEnv({ NODE_DISABLE_COMPILE_CACHE: "0" }, "/r", "linux").NODE_DISABLE_COMPILE_CACHE, "1");

    const own = tempRootEnv({ NODE_COMPILE_CACHE: "/c" }, "/r", "linux");
    assert.equal(own.NODE_COMPILE_CACHE, "/c");
    assert.equal(Object.hasOwn(own, "NODE_DISABLE_COMPILE_CACHE"), false);
    const ownOff = tempRootEnv({ NODE_COMPILE_CACHE: "/c", NODE_DISABLE_COMPILE_CACHE: "1" }, "/r", "linux");
    assert.deepEqual(
      { cache: ownOff.NODE_COMPILE_CACHE, disable: ownOff.NODE_DISABLE_COMPILE_CACHE },
      { cache: "/c", disable: "1" },
    );

    // Windows names are case-insensitive, POSIX names are not.
    const win = tempRootEnv({ node_compile_cache: "C:\\c" }, "C:\\r", "win32");
    assert.equal(win.node_compile_cache, "C:\\c");
    assert.equal(Object.hasOwn(win, "NODE_DISABLE_COMPILE_CACHE"), false);
    const winOff = tempRootEnv({ Node_Disable_Compile_Cache: "0" }, "C:\\r", "win32");
    assert.deepEqual(
      Object.entries(winOff).filter(([key]) => key.toUpperCase() === "NODE_DISABLE_COMPILE_CACHE"),
      [["NODE_DISABLE_COMPILE_CACHE", "1"]],
    );
    assert.equal(tempRootEnv({ node_compile_cache: "/c" }, "/r", "linux").NODE_DISABLE_COMPILE_CACHE, "1");
  });
});

describe("tempRootEnv drops differently cased temp variables on Windows only", () => {
  it("POSIX keeps Temp, tmp and cedulon_temp_root, which are variables of their own there", () => {
    const env = tempRootEnv(
      { Temp: "a", tmp: "b", cedulon_temp_root: "c", TMPDIR: "x", CEDULON_TEMP_ROOT: "y", PATH: "p" },
      "/r",
      "linux",
    );
    assert.deepEqual(
      {
        Temp: env.Temp,
        tmp: env.tmp,
        cedulon_temp_root: env.cedulon_temp_root,
        TMPDIR: env.TMPDIR,
        TEMP: env.TEMP,
        TMP: env.TMP,
        CEDULON_TEMP_ROOT: env.CEDULON_TEMP_ROOT,
        PATH: env.PATH,
      },
      { Temp: "a", tmp: "b", cedulon_temp_root: "c", TMPDIR: "/r", TEMP: "/r", TMP: "/r", CEDULON_TEMP_ROOT: "/r", PATH: "p" },
    );
  });

  it("Windows drops Temp, tmp and Cedulon_Temp_Root, which would name the same variables as TEMP, TMP and CEDULON_TEMP_ROOT", () => {
    const env = tempRootEnv({ Temp: "a", tmp: "b", Cedulon_Temp_Root: "c", Path: "p" }, "C:\\r", "win32");
    assert.deepEqual(
      Object.keys(env)
        .filter((key) => ["TMPDIR", "TEMP", "TMP", "CEDULON_TEMP_ROOT"].includes(key.toUpperCase()))
        .sort(),
      ["CEDULON_TEMP_ROOT", "TEMP", "TMP", "TMPDIR"],
    );
    assert.deepEqual(
      { TEMP: env.TEMP, TMP: env.TMP, TMPDIR: env.TMPDIR, CEDULON_TEMP_ROOT: env.CEDULON_TEMP_ROOT, Path: env.Path },
      { TEMP: "C:\\r", TMP: "C:\\r", TMPDIR: "C:\\r", CEDULON_TEMP_ROOT: "C:\\r", Path: "p" },
    );
  });
});

describe("a child ended by a signal", () => {
  it("128 + the signal's number is the exit code a shell reports for it", () => {
    assert.equal(signalExitCode("SIGINT"), 130);
    assert.equal(signalExitCode("SIGKILL"), 137);
    assert.equal(signalExitCode("SIGTERM"), 143);
  });

  const killSelf = "process.kill(process.pid, 'SIGTERM'); setTimeout(() => {}, 10000);";

  it("POSIX: the wrapper ends on the child's signal after its cleanup; Windows: the exit code Windows gave is kept", { timeout: caseTimeout(1) }, async (t) => {
    const base = tempDir(t, "cedulon-wrap-");
    const run = await wrapped(base, `${leaveTwo} ${killSelf}`);
    assert.match(run.stderr, /the run left 2 entries in its temp root/);
    if (process.platform === "win32") {
      // Windows has no signals in an exit status: a process that kills
      // itself is ended by TerminateProcess with exit code 1, and Node
      // reports a signal only for a child its own kill() ended, which the
      // wrapper never calls on Windows. What this proves there is that such
      // an ending keeps its code and is not reported as a signal.
      assert.deepEqual({ status: run.status, signal: run.signal }, { status: 1, signal: null }, run.stderr);
      assert.doesNotMatch(run.stderr, /ended on/);
    } else {
      assert.deepEqual({ status: run.status, signal: run.signal }, { status: null, signal: "SIGTERM" }, run.stderr);
      // Written before the wrapper raised the signal on itself, so nothing it said was lost.
      assert.match(run.stderr, /the command ended on SIGTERM/);
    }
    assertRootGone(base, run.opened);
  });

  it("runInTempRoot returns the signal, and a code a leftover entry does not overwrite", async (t) => {
    const base = tempDir(t, "cedulon-wrap-");
    const lines: string[] = [];
    const result = await runInTempRoot({
      command: process.execPath,
      args: ["-e", `${leaveTwo} ${killSelf}`],
      base,
      env: childEnv(base),
      stdio: "ignore",
      log: (line) => lines.push(line),
    });
    const expected = process.platform === "win32" ? { code: 1, signal: null } : { code: 143, signal: "SIGTERM" };
    assert.deepEqual({ code: result.code, signal: result.signal }, expected, lines.join("\n"));
    assert.ok(lines.includes("  left.txt"), lines.join("\n"));
    assert.equal(existsSync(result.root), false);
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

  // The guard is a test in the run it guards, so it is red however the
  // runner was started outside the wrapper; no command line is read.
  it("RED then GREEN: tests/temp-root-active.test.ts refuses a runner started outside with-temp-root, and passes one inside", { timeout: caseTimeout(4) }, async (t) => {
    const runner = ["--experimental-strip-types", "--test", "--test-reporter=tap", guard];
    const outside = (env: NodeJS.ProcessEnv) => runNode("test runner outside with-temp-root", runner, env);
    const refusal = (run: { stdout: string; stderr: string }) =>
      /the suite must run through scripts\/with-temp-root\.ts: ([^'"\r\n]+)/.exec(`${run.stdout}${run.stderr}`)?.[1];

    const base = tempDir(t, "cedulon-wrap-");
    const { CEDULON_TEMP_ROOT: _, ...unset } = childEnv(base);
    const notSet = await outside(unset);
    assert.equal(notSet.status, 1, `a runner with no CEDULON_TEMP_ROOT passed:\n${notSet.stdout}${notSet.stderr}`);
    assert.equal(refusal(notSet), "CEDULON_TEMP_ROOT is not set", notSet.stdout);

    const notOpened = await outside(childEnv(base));
    assert.equal(notOpened.status, 1, `a temp directory with-temp-root did not open passed:\n${notOpened.stdout}`);
    assert.match(refusal(notOpened) ?? "", /^.+cedulon-wrap-\w+ is not a root it opened$/, notOpened.stdout);

    const stale = join(tempDir(t, "cedulon-stale-"), `${ROOT_PREFIX}stale`);
    mkdirSync(stale);
    const elsewhere = await outside(childEnv(base, { CEDULON_TEMP_ROOT: stale }));
    assert.equal(elsewhere.status, 1, `a CEDULON_TEMP_ROOT that is not os.tmpdir() passed:\n${elsewhere.stdout}`);
    assert.match(refusal(elsewhere) ?? "", /^os\.tmpdir\(\) is .+, not CEDULON_TEMP_ROOT .+stale$/, elsewhere.stdout);

    const inside = await wrappedNode(base, runner);
    assert.equal(inside.status, 0, `the guard refused a run inside with-temp-root:\n${inside.stdout}${inside.stderr}`);
    assert.match(inside.stdout, /^# pass 1$/m);
    assertRootGone(base, inside.opened);
  });
});
