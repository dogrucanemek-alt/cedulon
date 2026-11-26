import { strict as assert } from "node:assert";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { describe, it } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { tempDir } from "./helpers/temp-dir.ts";

import { BoundedRunError, KILL_GRACE_MS, runBounded, signalGroup } from "../scripts/bounded-run.ts";
import {
  BINARY_EXCEPTIONS,
  blobsOf,
  countCarriageReturns,
  findCarriageReturns,
  isBinaryPath,
  trackedFiles,
} from "../scripts/crlf-guard.ts";
import {
  livingDraftCarriageReturns,
  livingUnpublishedDraftPaths,
  storedDraftBytes,
} from "../scripts/latest-draft.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Outer watchdog for every case that waits on a child process. */
const WATCHDOG_MS = 180_000;
/** Outer watchdog for the helper's own cases; each bound inside is far shorter. */
const HELPER_WATCHDOG_MS = 20_000;
const GIT_TIMEOUT_MS = 60_000;
/** Bound for the timing cases; a fresh Node process on a busy runner is ready well inside it. */
const BOUND_MS = 3000;
/** Every descendant a case starts ends itself after this, even if a case fails. */
const SELF_EXIT = "setTimeout(() => process.exit(0), 60000);";
const isWindows = process.platform === "win32";

type KillCall = [pid: number, signal: NodeJS.Signals];

/** A stand-in for process.kill that records each call and fails it with `code`. */
function failingKill(code: string, calls: KillCall[]): (pid: number, signal: NodeJS.Signals) => void {
  return (pid, signal) => {
    calls.push([pid, signal]);
    throw Object.assign(new Error(`kill ${code}`), { code });
  };
}

/** Like failingKill, but SIGTERM is sent for real, so a child that does not ignore it dies and is reaped. */
function failingAfterTerm(code: string, calls: KillCall[]): (pid: number, signal: NodeJS.Signals) => void {
  const fail = failingKill(code, []);
  return (pid, signal) => {
    calls.push([pid, signal]);
    if (signal === "SIGTERM") process.kill(pid, signal);
    else fail(pid, signal);
  };
}

async function refusal(run: Promise<unknown>): Promise<BoundedRunError> {
  try {
    await run;
  } catch (err) {
    assert.ok(err instanceof BoundedRunError, `expected a named refusal, got ${String(err)}`);
    return err;
  }
  assert.fail("the call resolved; it was expected to be refused");
}

/** A process that has been ended reads as ESRCH once it has been reaped. */
async function assertEnded(pid: number, who: string): Promise<void> {
  const until = Date.now() + 2000;
  for (;;) {
    try {
      process.kill(pid, 0);
    } catch (err) {
      assert.equal((err as NodeJS.ErrnoException).code, "ESRCH", `${who} ${pid}: ${String(err)}`);
      return;
    }
    if (Date.now() > until) assert.fail(`${who} ${pid} is still running after the call returned`);
    await sleep(25);
  }
}

function endQuietly(pid: number | undefined): void {
  if (pid === undefined) return;
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // already gone
  }
}

function readPid(path: string, who: string): number {
  assert.ok(existsSync(path), `${who} never recorded its pid`);
  const pid = Number(readFileSync(path, "utf8"));
  assert.ok(Number.isInteger(pid) && pid > 0, `${who} recorded ${JSON.stringify(readFileSync(path, "utf8"))}`);
  return pid;
}

/** Node source that marks a process ready; it goes after the handlers the case relies on. */
function markReady(path: string): string {
  return `require("node:fs").writeFileSync(${JSON.stringify(path)}, "ready");`;
}

/** A case whose process was ended before it was ready proved nothing about the bound. */
function assertReady(path: string, who: string): void {
  assert.ok(existsSync(path), `${who} was ended before it was ready; the case proved nothing`);
}

/** Refused at the bound: not early, and no later than the grace period plus slack. */
function assertAtBound(elapsed: number, timeoutMs: number): void {
  assert.ok(elapsed >= timeoutMs - 50, `the call was refused after ${elapsed} ms, before its ${timeoutMs} ms bound`);
  assert.ok(elapsed < timeoutMs + KILL_GRACE_MS + 3000, `the call took ${elapsed} ms`);
}

type Grandchild = {
  source: string;
  /** Inherit the child's stdout and stderr, or hold no stream of the call at all. */
  stdio: "inherit" | "ignore";
  detached: boolean;
};

/** Node source for a child that starts `grandchild`, records its pid, then runs `then`. */
function parentOf(grandchild: Grandchild, pidFile: string, then: string): string {
  const stdio = grandchild.stdio === "inherit" ? `["ignore", "inherit", "inherit"]` : `"ignore"`;
  return [
    `const { spawn } = require("node:child_process");`,
    `const g = spawn(process.execPath, ["-e", ${JSON.stringify(grandchild.source)}], { stdio: ${stdio}, detached: ${grandchild.detached} });`,
    `require("node:fs").writeFileSync(${JSON.stringify(pidFile)}, String(g.pid));`,
    then,
  ].join("\n");
}

describe("crlf-guard", () => {
  it("exceptions name a file and a reason", () => {
    assert.ok(BINARY_EXCEPTIONS.length > 0);
    for (const ex of BINARY_EXCEPTIONS) {
      assert.ok(ex.file.length > 0);
      assert.ok(ex.reason.length > 20, `${ex.file}: reason is too short`);
      assert.equal(isBinaryPath(ex.file), true);
    }
  });

  it("RED then GREEN: a CRLF text blob is rejected, then the tree is clean", { timeout: WATCHDOG_MS }, async () => {
    const probe = Buffer.from("hello\r\nworld\n", "utf8");
    assert.ok(countCarriageReturns(probe) > 0);
    const red = await findCarriageReturns(root, [{ file: "tests/.crlf-guard-probe.txt", bytes: probe }]);
    assert.ok(
      red.some((h) => h.file === "tests/.crlf-guard-probe.txt" && h.count > 0),
      `expected a hit on the CRLF probe, got ${JSON.stringify(red)}`,
    );
    const green = await findCarriageReturns(root);
    assert.deepEqual(green, [], green.map((h) => `${h.file}:${h.count}`).join("\n"));
  });

  it("reads spec/ and does not rewrite it", { timeout: WATCHDOG_MS }, async () => {
    const spec = (await trackedFiles(root)).filter((f) => f.startsWith("spec/"));
    assert.ok(spec.length > 0, "expected frozen drafts to be tracked");
    // An empty working tree is not the criterion. This scan must not
    // write; an uncommitted spec edit that was already there is not a
    // rewrite. Compare the spec diff to itself across the scan.
    const specDiff = async (): Promise<string> =>
      (
        await runBounded({
          label: "git diff -- spec",
          command: "git",
          args: ["diff", "--", "spec"],
          cwd: root,
          timeoutMs: GIT_TIMEOUT_MS,
          maxOutputBytes: 64 * 1024 * 1024,
        })
      ).stdout.toString("utf8");
    const before = await specDiff();
    const hits = (await findCarriageReturns(root)).filter((h) => h.file.startsWith("spec/"));
    assert.deepEqual(hits, []);
    const after = await specDiff();
    assert.equal(after, before);
  });

  it("the gate script is the same scan (exit 0)", { timeout: WATCHDOG_MS }, async () => {
    const { stdout } = await runBounded({
      label: "crlf-guard gate",
      command: process.execPath,
      args: ["--experimental-strip-types", "scripts/crlf-guard.ts"],
      cwd: root,
      timeoutMs: 120_000,
      maxOutputBytes: 1024 * 1024,
    });
    assert.match(stdout.toString("utf8"), /crlf-guard: no CR in tracked text blobs/);
  });

  it("RED then GREEN: a child that ignores SIGTERM is ended at its bound, by name", { timeout: HELPER_WATCHDOG_MS }, async (t) => {
    const dir = tempDir(t, "cedulon-bounded-");
    let pid: number | undefined;
    try {
      const ready = join(dir, "ready");
      const timeoutMs = BOUND_MS;
      const started = Date.now();
      const err = await refusal(
        runBounded({
          label: "SIGTERM-proof child",
          command: process.execPath,
          args: ["-e", `process.on("SIGTERM", () => {}); ${markReady(ready)} setInterval(() => {}, 1000); ${SELF_EXIT}`],
          cwd: root,
          timeoutMs,
          maxOutputBytes: 1024,
        }),
      );
      const elapsed = Date.now() - started;
      pid = err.pid;
      assert.equal(err.message, `SIGTERM-proof child timed out after ${timeoutMs} ms`);
      assert.equal(err.kind, "timeout");
      assertReady(ready, "the child");
      assertAtBound(elapsed, timeoutMs);
      assert.ok(pid !== undefined, "the refusal does not name the child it ended");
      await assertEnded(pid, "child");
    } finally {
      endQuietly(pid);
    }
  });

  it("RED then GREEN: a grandchild holding stdout is ended with its parent, at the bound", { timeout: HELPER_WATCHDOG_MS }, async (t) => {
    const dir = tempDir(t, "cedulon-bounded-");
    let pid: number | undefined;
    let grandPid: number | undefined;
    try {
      const pidFile = join(dir, "grandchild.pid");
      const parentReady = join(dir, "parent.ready");
      const grandReady = join(dir, "grandchild.ready");
      const grandchild: Grandchild = {
        source: `process.on("SIGTERM", () => {}); ${markReady(grandReady)} setInterval(() => process.stdout.write("."), 100); ${SELF_EXIT}`,
        stdio: "inherit",
        detached: false,
      };
      const timeoutMs = BOUND_MS;
      const started = Date.now();
      const err = await refusal(
        runBounded({
          label: "parent of a stdout-holding grandchild",
          command: process.execPath,
          args: [
            "-e",
            parentOf(grandchild, pidFile, `process.on("SIGTERM", () => {}); ${markReady(parentReady)} setInterval(() => {}, 1000); ${SELF_EXIT}`),
          ],
          cwd: root,
          timeoutMs,
          maxOutputBytes: 1024 * 1024,
        }),
      );
      const elapsed = Date.now() - started;
      pid = err.pid;
      grandPid = readPid(pidFile, "the grandchild");
      assert.equal(err.message, `parent of a stdout-holding grandchild timed out after ${timeoutMs} ms`);
      assertReady(parentReady, "the parent");
      assertReady(grandReady, "the grandchild");
      assertAtBound(elapsed, timeoutMs);
      assert.ok(pid !== undefined, "the refusal does not name the child it ended");
      await assertEnded(pid, "child");
      await assertEnded(grandPid, "grandchild");
    } finally {
      endQuietly(pid);
      endQuietly(grandPid);
    }
  });

  it("RED then GREEN: a descendant that left the tree cannot hold the call open through stdout", { timeout: HELPER_WATCHDOG_MS }, async (t) => {
    // The child exits at once; a detached grandchild keeps the child's
    // stdout. Neither a process-group signal nor a tree kill reaches a
    // process that has left the tree, so the call must end on its own
    // bound by giving up the streams. The case ends the grandchild itself.
    const dir = tempDir(t, "cedulon-bounded-");
    let grandPid: number | undefined;
    try {
      const pidFile = join(dir, "grandchild.pid");
      const grandReady = join(dir, "grandchild.ready");
      const grandchild: Grandchild = {
        source: `${markReady(grandReady)} setInterval(() => {}, 1000); ${SELF_EXIT}`,
        stdio: "inherit",
        detached: true,
      };
      const timeoutMs = BOUND_MS;
      const started = Date.now();
      const err = await refusal(
        runBounded({
          label: "child with an escaped grandchild",
          command: process.execPath,
          args: ["-e", parentOf(grandchild, pidFile, "g.unref(); process.exit(0);")],
          cwd: root,
          timeoutMs,
          maxOutputBytes: 1024,
        }),
      );
      const elapsed = Date.now() - started;
      grandPid = readPid(pidFile, "the grandchild");
      assert.equal(err.message, `child with an escaped grandchild timed out after ${timeoutMs} ms`);
      assertReady(grandReady, "the grandchild");
      assertAtBound(elapsed, timeoutMs);
    } finally {
      endQuietly(grandPid);
    }
    if (grandPid !== undefined) await assertEnded(grandPid, "grandchild");
  });

  it("RED then GREEN: a quiet grandchild that ignores SIGTERM is ended at the bound when its parent goes first", { timeout: HELPER_WATCHDOG_MS }, async (t) => {
    // The parent dies of the SIGTERM; the grandchild ignores it and holds no
    // stream of the call, so nothing but the group's SIGKILL can end it. On
    // Windows the parent is still alive at the bound and `taskkill /T` reaches
    // the grandchild through it.
    const dir = tempDir(t, "cedulon-bounded-");
    let pid: number | undefined;
    let grandPid: number | undefined;
    try {
      const pidFile = join(dir, "grandchild.pid");
      const grandReady = join(dir, "grandchild.ready");
      const grandchild: Grandchild = {
        source: `process.on("SIGTERM", () => {}); ${markReady(grandReady)} setInterval(() => {}, 1000); ${SELF_EXIT}`,
        stdio: "ignore",
        detached: false,
      };
      const timeoutMs = BOUND_MS;
      const started = Date.now();
      const err = await refusal(
        runBounded({
          label: "parent of a quiet grandchild",
          command: process.execPath,
          args: ["-e", parentOf(grandchild, pidFile, `setInterval(() => {}, 1000); ${SELF_EXIT}`)],
          cwd: root,
          timeoutMs,
          maxOutputBytes: 1024,
        }),
      );
      const elapsed = Date.now() - started;
      pid = err.pid;
      grandPid = readPid(pidFile, "the grandchild");
      assert.equal(err.message, `parent of a quiet grandchild timed out after ${timeoutMs} ms`);
      assert.equal(err.kind, "timeout");
      assertReady(grandReady, "the grandchild");
      assertAtBound(elapsed, timeoutMs);
      assert.ok(pid !== undefined, "the refusal does not name the child it ended");
      await assertEnded(pid, "child");
      await assertEnded(grandPid, "grandchild");
    } finally {
      endQuietly(pid);
      endQuietly(grandPid);
    }
  });

  it("RED then GREEN: when a child that leaves a quiet grandchild succeeds, the group is sent SIGKILL when the call returns and the grandchild ends shortly after", { timeout: HELPER_WATCHDOG_MS }, async (t) => {
    // The parent exits 0 once the grandchild is running, and the call
    // succeeds. On Windows the grandchild ends with its parent because Node
    // puts the children it starts in a kill-on-close job object; a grandchild
    // whose root has exited is out of `taskkill /T` reach.
    const dir = tempDir(t, "cedulon-bounded-");
    let grandPid: number | undefined;
    try {
      const pidFile = join(dir, "grandchild.pid");
      const grandReady = join(dir, "grandchild.ready");
      const grandchild: Grandchild = {
        source: `process.on("SIGTERM", () => {}); ${markReady(grandReady)} setInterval(() => {}, 1000); ${SELF_EXIT}`,
        stdio: "ignore",
        detached: false,
      };
      const exitOnceReady = `setInterval(() => { if (require("node:fs").existsSync(${JSON.stringify(grandReady)})) process.exit(0); }, 10); ${SELF_EXIT}`;
      const done = await runBounded({
        label: "child that leaves a quiet grandchild",
        command: process.execPath,
        args: ["-e", parentOf(grandchild, pidFile, exitOnceReady)],
        cwd: root,
        timeoutMs: 10_000,
        maxOutputBytes: 1024,
      });
      assert.equal(done.stdout.length, 0);
      grandPid = readPid(pidFile, "the grandchild");
      assertReady(grandReady, "the grandchild");
      await assertEnded(grandPid, "grandchild");
    } finally {
      endQuietly(grandPid);
    }
  });

  it("RED then GREEN: a group signal passes over ESRCH and returns the code of any other failure", () => {
    // No process is started and nothing here depends on the platform, so
    // this is the part of the rule that is measured on Windows as well.
    const calls: KillCall[] = [];
    const state = { leaderReaped: true, platform: "linux" } as const;
    assert.equal(signalGroup(41, "SIGKILL", failingKill("ESRCH", calls), state), undefined);
    assert.equal(signalGroup(41, "SIGKILL", failingKill("EPERM", calls), state), "EPERM");
    assert.equal(signalGroup(41, "SIGTERM", (pid, signal) => void calls.push([pid, signal]), state), undefined);
    assert.deepEqual(calls, [
      [-41, "SIGKILL"],
      [-41, "SIGKILL"],
      [-41, "SIGTERM"],
    ]);
  });

  it("RED then GREEN: on Darwin, EPERM after the leader was reaped passes like ESRCH; before that, and on any other platform, it is returned", () => {
    // XNU returns EPERM for a group whose remaining members are all zombies.
    // No process is started, so this case measures the whole rule on every
    // platform, Windows included, where the tree kill sends no group signal.
    const platforms: NodeJS.Platform[] = ["darwin", "linux", "freebsd", "win32"];
    for (const platform of platforms) {
      for (const leaderReaped of [false, true]) {
        const state = { leaderReaped, platform };
        const where = `${platform}, leader ${leaderReaped ? "reaped" : "not reaped"}`;
        const calls: KillCall[] = [];
        const eperm = platform === "darwin" && leaderReaped ? undefined : "EPERM";
        assert.equal(signalGroup(41, "SIGKILL", failingKill("ESRCH", calls), state), undefined, `ESRCH, ${where}`);
        assert.equal(signalGroup(41, "SIGKILL", failingKill("EPERM", calls), state), eperm, `EPERM, ${where}`);
        assert.equal(signalGroup(41, "SIGKILL", failingKill("EINVAL", calls), state), "EINVAL", `EINVAL, ${where}`);
        assert.equal(signalGroup(41, "SIGTERM", (pid, signal) => void calls.push([pid, signal]), state), undefined, `success, ${where}`);
        assert.deepEqual(calls, [
          [-41, "SIGKILL"],
          [-41, "SIGKILL"],
          [-41, "SIGKILL"],
          [-41, "SIGTERM"],
        ]);
      }
    }
  });

  it("RED then GREEN: a call that succeeds is refused by name when its process group cannot be signalled", { timeout: HELPER_WATCHDOG_MS }, async () => {
    // On POSIX the group is sent SIGKILL when the child closes, and the fake
    // fails that signal. On Windows the tree is ended with taskkill and no
    // group signal is sent, so there this case shows only that the fake is
    // never called and the result stands; the refusal is measured on POSIX.
    // Linux's rule is named so a macOS runner measures the same thing; the
    // Darwin rule for this call is the next case.
    const label = "child whose group cannot be signalled";
    const run = (signal: (pid: number, signal: NodeJS.Signals) => void) =>
      runBounded({
        label,
        command: process.execPath,
        args: ["-e", `process.stdout.write("done")`],
        cwd: root,
        timeoutMs: 10_000,
        maxOutputBytes: 1024,
        signal,
        platform: "linux",
      });
    const eperm: KillCall[] = [];
    if (isWindows) {
      assert.equal((await run(failingKill("EPERM", eperm))).stdout.toString("utf8"), "done");
      assert.deepEqual(eperm, []);
    } else {
      const err = await refusal(run(failingKill("EPERM", eperm)));
      assert.ok(err.pid !== undefined, "the refusal does not name the child");
      assert.equal(err.kind, "kill");
      assert.equal(err.message, `${label} could not signal its process group ${err.pid}: EPERM`);
      assert.deepEqual(eperm, [[-err.pid, "SIGKILL"]]);
    }
    const esrch: KillCall[] = [];
    assert.equal((await run(failingKill("ESRCH", esrch))).stdout.toString("utf8"), "done");
    assert.equal(esrch.length, isWindows ? 0 : 1);
  });

  it("RED then GREEN: on Darwin a call that succeeds is not refused for an injected post-reap EPERM from its group", { timeout: HELPER_WATCHDOG_MS }, async () => {
    // The group is signalled once the child has closed, so its leader has
    // been reaped; on Darwin an EPERM there is read as only zombies being
    // left. The EPERM is injected; no real all-zombie group is built. On
    // POSIX this case runs the real close path under Darwin's rule. On
    // Windows no group signal is sent, so it shows only that the fake is
    // never called; the rule itself is measured there by the signalGroup
    // case above.
    for (const code of ["EPERM", "ESRCH"]) {
      const calls: KillCall[] = [];
      const done = await runBounded({
        label: "child whose group holds only zombies",
        command: process.execPath,
        args: ["-e", `process.stdout.write("done")`],
        cwd: root,
        timeoutMs: 10_000,
        maxOutputBytes: 1024,
        signal: failingKill(code, calls),
        platform: "darwin",
      });
      assert.equal(done.stdout.toString("utf8"), "done", code);
      if (isWindows) {
        assert.deepEqual(calls, [], code);
      } else {
        assert.equal(calls.length, 1, code);
        assert.ok(calls[0]![0] < 0, `${code}: the signal went to pid ${calls[0]![0]}, not a group`);
        assert.equal(calls[0]![1], "SIGKILL", code);
      }
    }
  });

  it("RED then GREEN: a call refused at its bound keeps that refusal and adds the code of a group signal that failed", { timeout: HELPER_WATCHDOG_MS }, async () => {
    // With the fake in place nothing signals the child on POSIX; the call
    // still settles at the end of the grace period and the case ends the
    // child itself. On Windows taskkill ends the child and the fake is never
    // called, so the refusal there is the plain timeout. Darwin is measured
    // as well: the child is alive at both signals, so its leader has not
    // been reaped and an EPERM still refuses the call.
    const label = "child at its bound";
    const timeoutMs = 1000;
    const pids: number[] = [];
    const run = async (
      signal: (pid: number, signal: NodeJS.Signals) => void,
      platform: NodeJS.Platform,
    ): Promise<BoundedRunError> => {
      const err = await refusal(
        runBounded({
          label,
          command: process.execPath,
          args: ["-e", `setInterval(() => {}, 1000); ${SELF_EXIT}`],
          cwd: root,
          timeoutMs,
          maxOutputBytes: 1024,
          signal,
          platform,
        }),
      );
      assert.ok(err.pid !== undefined, "the refusal does not name the child");
      pids.push(err.pid);
      assert.equal(err.kind, "timeout");
      return err;
    };
    try {
      const timedOut = `${label} timed out after ${timeoutMs} ms`;
      for (const platform of ["linux", "darwin"] as const) {
        const eperm: KillCall[] = [];
        const refused = await run(failingKill("EPERM", eperm), platform);
        if (isWindows) {
          assert.equal(refused.message, timedOut, platform);
          assert.deepEqual(eperm, [], platform);
        } else {
          assert.equal(refused.message, `${timedOut}; ${label} could not signal its process group ${refused.pid}: EPERM`, platform);
          assert.deepEqual(
            eperm,
            [
              [-refused.pid!, "SIGTERM"],
              [-refused.pid!, "SIGKILL"],
            ],
            platform,
          );
        }
        const esrch: KillCall[] = [];
        assert.equal((await run(failingKill("ESRCH", esrch), platform)).message, timedOut, platform);
        assert.equal(esrch.length, isWindows ? 0 : 2, platform);
      }
    } finally {
      for (const pid of pids) endQuietly(pid);
    }
    for (const pid of pids) await assertEnded(pid, "child");
  });

  it("RED then GREEN: on Darwin an injected post-reap EPERM from the group leaves a refusal's message as it was; on Linux it is still named", { timeout: HELPER_WATCHDOG_MS }, async () => {
    // The fake sends the SIGTERM for real, so the child dies of it and is
    // reaped, and fails the SIGKILL that follows the close. That injected
    // EPERM stands in for the all-zombie group a timing or output case
    // comparing the whole message could meet on macOS, and on Darwin it
    // must add nothing. On Windows
    // taskkill ends the child, the fake is never called and every message
    // is the plain one; the rule is measured there by the signalGroup case.
    const chatty = `const b = Buffer.alloc(64 * 1024, 120); setInterval(() => process.stdout.write(b), 10); ${SELF_EXIT}`;
    const refusals = [
      {
        kind: "timeout",
        label: "child reaped at its bound",
        args: ["-e", `setInterval(() => {}, 1000); ${SELF_EXIT}`],
        timeoutMs: 1000,
        maxOutputBytes: 1024,
        message: "child reaped at its bound timed out after 1000 ms",
      },
      {
        kind: "output",
        label: "chatty child reaped",
        args: ["-e", chatty],
        timeoutMs: 10_000,
        maxOutputBytes: 100_000,
        message: "chatty child reaped exceeded 100000 bytes of output",
      },
    ] as const;
    const pids: number[] = [];
    try {
      for (const r of refusals) {
        for (const platform of ["darwin", "linux"] as const) {
          for (const code of ["EPERM", "ESRCH"]) {
            const where = `${r.kind}, ${platform}, ${code}`;
            const calls: KillCall[] = [];
            const err = await refusal(
              runBounded({
                label: r.label,
                command: process.execPath,
                args: [...r.args],
                cwd: root,
                timeoutMs: r.timeoutMs,
                maxOutputBytes: r.maxOutputBytes,
                signal: failingAfterTerm(code, calls),
                platform,
              }),
            );
            assert.ok(err.pid !== undefined, `${where}: the refusal does not name the child`);
            pids.push(err.pid);
            assert.equal(err.kind, r.kind, where);
            const named = !isWindows && platform === "linux" && code === "EPERM";
            assert.equal(
              err.message,
              named ? `${r.message}; ${r.label} could not signal its process group ${err.pid}: EPERM` : r.message,
              where,
            );
            assert.deepEqual(
              calls,
              isWindows
                ? []
                : [
                    [-err.pid, "SIGTERM"],
                    [-err.pid, "SIGKILL"],
                  ],
              where,
            );
          }
        }
      }
    } finally {
      for (const pid of pids) endQuietly(pid);
    }
    for (const pid of pids) await assertEnded(pid, "child");
  });

  it("RED then GREEN: output past the limit is refused by name and the tree is ended", { timeout: HELPER_WATCHDOG_MS }, async () => {
    let pid: number | undefined;
    try {
      const timeoutMs = 10_000;
      const started = Date.now();
      const err = await refusal(
        runBounded({
          label: "chatty child",
          command: process.execPath,
          args: [
            "-e",
            `process.on("SIGTERM", () => {}); const b = Buffer.alloc(64 * 1024, 120); setInterval(() => process.stdout.write(b), 10); ${SELF_EXIT}`,
          ],
          cwd: root,
          timeoutMs,
          maxOutputBytes: 100_000,
        }),
      );
      const elapsed = Date.now() - started;
      pid = err.pid;
      assert.equal(err.message, "chatty child exceeded 100000 bytes of output");
      assert.equal(err.kind, "output");
      assert.ok(elapsed < timeoutMs, `the output limit did not end the call; it took ${elapsed} ms`);
      assert.ok(pid !== undefined, "the refusal does not name the child it ended");
      await assertEnded(pid, "child");
    } finally {
      endQuietly(pid);
    }
  });

  it("RED then GREEN: a non-zero exit is refused by name with its status and stderr", { timeout: HELPER_WATCHDOG_MS }, async () => {
    const err = await refusal(
      runBounded({
        label: "failing child",
        command: process.execPath,
        args: ["-e", `process.stderr.write("refused: probe input\\n"); process.exit(3);`],
        cwd: root,
        timeoutMs: 10_000,
        maxOutputBytes: 1024,
      }),
    );
    assert.equal(err.message, "failing child exited with status 3: refused: probe input");
    assert.equal(err.kind, "status");
  });

  it("RED then GREEN: a call that asks for its exit status gets a non-zero one back with its output; one that does not is still refused", { timeout: HELPER_WATCHDOG_MS }, async () => {
    const exitThree = {
      command: process.execPath,
      args: ["-e", `process.stdout.write("partial"); process.stderr.write("refused: probe input\\n"); process.exit(3);`],
      cwd: root,
      timeoutMs: 10_000,
      maxOutputBytes: 1024,
    };
    const err = await refusal(runBounded({ label: "failing child", ...exitThree }));
    assert.equal(err.message, "failing child exited with status 3: refused: probe input");
    assert.equal(err.kind, "status");

    const read = await runBounded({ label: "failing child read for its status", ...exitThree, returnStatus: true });
    assert.deepEqual(
      { status: read.status, signal: read.signal, stdout: read.stdout.toString("utf8"), stderr: read.stderr.toString("utf8") },
      { status: 3, signal: null, stdout: "partial", stderr: "refused: probe input\n" },
    );

    const ok = await runBounded({ label: "passing child read for its status", ...exitThree, args: ["-e", `process.stdout.write("done")`], returnStatus: true });
    assert.deepEqual({ status: ok.status, signal: ok.signal, stdout: ok.stdout.toString("utf8") }, { status: 0, signal: null, stdout: "done" });
  });

  it("RED then GREEN: asking for the exit status lifts neither the bound, nor the output limit, nor the group signal", { timeout: HELPER_WATCHDOG_MS }, async () => {
    const pids: number[] = [];
    try {
      const timeoutMs = 1000;
      const started = Date.now();
      const timedOut = await refusal(
        runBounded({
          label: "child read for its status at its bound",
          command: process.execPath,
          args: ["-e", `setInterval(() => {}, 1000); ${SELF_EXIT}`],
          cwd: root,
          timeoutMs,
          maxOutputBytes: 1024,
          returnStatus: true,
        }),
      );
      assert.ok(timedOut.pid !== undefined, "the refusal does not name the child it ended");
      pids.push(timedOut.pid);
      assert.equal(timedOut.kind, "timeout");
      assert.equal(timedOut.message, `child read for its status at its bound timed out after ${timeoutMs} ms`);
      assertAtBound(Date.now() - started, timeoutMs);

      const chatty = await refusal(
        runBounded({
          label: "chatty child read for its status",
          command: process.execPath,
          args: ["-e", `const b = Buffer.alloc(64 * 1024, 120); setInterval(() => process.stdout.write(b), 10); ${SELF_EXIT}`],
          cwd: root,
          timeoutMs: 10_000,
          maxOutputBytes: 100_000,
          returnStatus: true,
        }),
      );
      assert.ok(chatty.pid !== undefined, "the refusal does not name the child it ended");
      pids.push(chatty.pid);
      assert.equal(chatty.kind, "output");
      assert.equal(chatty.message, "chatty child read for its status exceeded 100000 bytes of output");

      // On Windows the tree is ended with taskkill and no group signal is
      // sent, so there the status comes back and the fake is never called.
      const label = "child read for its status whose group cannot be signalled";
      const calls: KillCall[] = [];
      const run = runBounded({
        label,
        command: process.execPath,
        args: ["-e", "process.exit(3)"],
        cwd: root,
        timeoutMs: 10_000,
        maxOutputBytes: 1024,
        returnStatus: true,
        signal: failingKill("EPERM", calls),
        platform: "linux",
      });
      if (isWindows) {
        assert.equal((await run).status, 3);
        assert.deepEqual(calls, []);
      } else {
        const err = await refusal(run);
        assert.ok(err.pid !== undefined, "the refusal does not name the child");
        assert.equal(err.kind, "kill");
        assert.equal(err.message, `${label} could not signal its process group ${err.pid}: EPERM`);
        assert.deepEqual(calls, [[-err.pid, "SIGKILL"]]);
      }
    } finally {
      for (const pid of pids) endQuietly(pid);
    }
    for (const pid of pids) await assertEnded(pid, "child");
  });

  it("RED then GREEN: a command or stdin file that cannot be opened is refused by name", { timeout: HELPER_WATCHDOG_MS }, async () => {
    const missing = await refusal(
      runBounded({
        label: "absent command",
        command: join(root, "no-such-command-for-this-case"),
        args: [],
        cwd: root,
        timeoutMs: 10_000,
        maxOutputBytes: 1024,
      }),
    );
    assert.match(missing.message, /^absent command could not start: /);
    assert.equal(missing.kind, "start");
    const noInput = await refusal(
      runBounded({
        label: "child with absent input",
        command: process.execPath,
        args: ["-e", ""],
        cwd: root,
        timeoutMs: 10_000,
        stdinPath: join(root, "no-such-input-for-this-case"),
        maxOutputBytes: 1024,
      }),
    );
    assert.match(noInput.message, /^child with absent input could not start: /);
    assert.equal(noInput.kind, "start");
  });

  it("RED then GREEN: standard input is the named file or an immediate end, never an open pipe", { timeout: HELPER_WATCHDOG_MS }, async (t) => {
    const dir = tempDir(t, "cedulon-bounded-");
    const input = join(dir, "input");
    const bytes = Buffer.from([0x61, 0x0d, 0x0a, 0x00, 0xff, 0x0a]);
    writeFileSync(input, bytes);
    const echoed = await runBounded({
      label: "echo child",
      command: process.execPath,
      args: ["-e", "process.stdin.pipe(process.stdout)"],
      cwd: root,
      timeoutMs: 10_000,
      stdinPath: input,
      maxOutputBytes: 1024,
    });
    assert.deepEqual(echoed.stdout, bytes);
    const closed = await runBounded({
      label: "stdin reader",
      command: process.execPath,
      args: ["-e", `process.stdin.on("data", () => {}).on("end", () => process.stdout.write("eof"))`],
      cwd: root,
      timeoutMs: 10_000,
      maxOutputBytes: 1024,
    });
    assert.equal(closed.stdout.toString("utf8"), "eof");
  });

  it("RED then GREEN: cat-file --batch fed from a request file returns the blobs the index holds, byte for byte", { timeout: WATCHDOG_MS }, async (t) => {
    const files = await trackedFiles(root);
    const blobs = await blobsOf(files, root);
    assert.equal(blobs.size, files.length);
    const listed = await runBounded({
      label: "git ls-files -s",
      command: "git",
      args: ["ls-files", "-s", "-z"],
      cwd: root,
      timeoutMs: GIT_TIMEOUT_MS,
      maxOutputBytes: 16 * 1024 * 1024,
    });
    const indexIds = new Map<string, string>();
    for (const entry of listed.stdout.toString("utf8").split("\0").filter(Boolean)) {
      const tab = entry.indexOf("\t");
      indexIds.set(entry.slice(tab + 1).replace(/\\/g, "/"), entry.slice(0, tab).split(" ")[1]!);
    }
    const dir = tempDir(t, "cedulon-blob-ids-");
    const paths = files.map((file, i) => {
      const path = join(dir, `b${i}`);
      writeFileSync(path, blobs.get(file)!);
      return path;
    });
    const list = join(dir, "paths");
    writeFileSync(list, paths.join("\n") + "\n");
    const hashed = await runBounded({
      label: "git hash-object --stdin-paths",
      command: "git",
      args: ["hash-object", "--no-filters", "--stdin-paths"],
      cwd: root,
      timeoutMs: GIT_TIMEOUT_MS,
      stdinPath: list,
      maxOutputBytes: 1024 * 1024,
    });
    const ids = hashed.stdout.toString("utf8").trim().split("\n");
    assert.equal(ids.length, files.length);
    const differ = files.filter((file, i) => ids[i] !== indexIds.get(file));
    assert.deepEqual(differ, [], `blob bytes differ from the index for ${differ.slice(0, 5).join(", ")}`);
  });

  // The .xml is left out on purpose: author-tools writes a non-breaking space
  // into the BCP 14 boilerplate itself, and -02's published XML carries the
  // same bytes. The source and the text that goes to the datatracker are ours.
  //
  // -01 acquired two em-dashes and -03 acquired a section sign, each from an
  // editing pass that had no reason to think about encoding. idnits reports
  // non-ASCII as a nit and the drafts before them were plain ASCII, so the
  // cheapest place to notice is here, before a rebuild rather than after a
  // submission.
  it("draft sources stay ASCII", () => {
    const specDir = join(root, "spec");
    const drafts = readdirSync(specDir).filter((n) => /^draft-.*\.(md|txt)$/.test(n));
    assert.ok(drafts.length > 0, "no draft sources found to check");
    for (const name of drafts) {
      const bytes = readFileSync(join(specDir, name));
      const offenders: string[] = [];
      for (let i = 0; i < bytes.length; i += 1) {
        if (bytes[i] > 126) {
          offenders.push(`${name}:byte ${i} (0x${bytes[i].toString(16)})`);
          if (offenders.length > 3) break;
        }
      }
      assert.deepEqual(offenders, [], `non-ASCII in ${name}: ${offenders.join(", ")}`);
    }
  });

  it(".gitattributes does not attach a rule to spec/", () => {
    const attrs = readFileSync(join(root, ".gitattributes"), "utf8");
    for (const line of attrs.split(/\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      assert.equal(trimmed.startsWith("spec/") || trimmed.startsWith("/spec/"), false, trimmed);
    }
  });

  it("living unpublished drafts have no CR; a CR-injected copy is refused", { timeout: WATCHDOG_MS }, async () => {
    const living = livingUnpublishedDraftPaths(root);
    assert.ok(living.length > 0, "expected at least one living unpublished draft");
    const names = living.map((p) => p.replace(/\\/g, "/").split("/").pop()!);
    const short = (name: string) => name.replace(/^draft-dogru-cedulon-/, "").replace(/\.md$/, "");
    for (const path of living) {
      assert.ok(
        !existsSync(path.replace(/\.md$/, ".txt")),
        `${short(basename(path))} carries an archive text, so it is posted and must not be in the living-unpublished set`,
      );
    }
    for (const expected of [
      "draft-dogru-cedulon-core-06.md",
      "draft-dogru-cedulon-resolution-00.md",
      "draft-dogru-cedulon-10.md",
    ]) {
      assert.ok(
        names.includes(expected),
        `${short(expected)} has no archive text beside it and must be in the living-unpublished set, got ${names.join(", ")}`,
      );
    }
    for (const posted of [
      "draft-dogru-cedulon-checkpoint-01.md",
      "draft-dogru-cedulon-threats-00.md",
      "draft-dogru-cedulon-core-05.md",
      "draft-dogru-cedulon-decision-profile-04.md",
    ]) {
      assert.ok(
        existsSync(join(root, "spec", posted.replace(/\.md$/, ".txt"))),
        `posted ${short(posted)} must carry its archive text in spec/`,
      );
      assert.ok(
        !names.includes(posted),
        `posted ${short(posted)} carries its archive text and must stay out of the living-unpublished set`,
      );
    }
    assert.deepEqual(await livingDraftCarriageReturns(root), []);
    const sample = living.find((p) =>
      p.replace(/\\/g, "/").endsWith("draft-dogru-cedulon-resolution-00.md"),
    )!;
    const clean = await storedDraftBytes(root, sample);
    assert.equal(countCarriageReturns(clean), 0);
    const withCr = Buffer.from(clean.toString("utf8").replace(/\n/g, "\r\n"), "utf8");
    assert.ok(countCarriageReturns(withCr) > 0);
    const red = await livingDraftCarriageReturns(root, [
      { file: "spec/draft-dogru-cedulon-resolution-00.md.cr-probe", bytes: withCr },
    ]);
    assert.ok(
      red.some((h) => h.file.endsWith("resolution-00.md.cr-probe") && h.count > 0),
      `expected a CR hit on the probe, got ${JSON.stringify(red)}`,
    );
  });

  it("RED then GREEN: the living-draft check reads what git stores, not the checkout's line endings", { timeout: WATCHDOG_MS }, async () => {
    const sample = livingUnpublishedDraftPaths(root).find((p) =>
      p.replace(/\\/g, "/").endsWith("draft-dogru-cedulon-resolution-00.md"),
    )!;
    const lf = await storedDraftBytes(root, sample);
    assert.equal(countCarriageReturns(lf), 0);
    const crlf = Buffer.from(lf.toString("utf8").replace(/\n/g, "\r\n"), "utf8");
    // A Windows checkout with core.autocrlf=true writes these CRLF bytes to
    // disk for an LF blob. Read raw, they look like a CR edit; that read is
    // what failed on the hosted Windows runner.
    assert.ok(countCarriageReturns(crlf) > 0);
    const viaAutocrlf = await storedDraftBytes(root, sample, {
      bytes: crlf,
      gitConfig: ["-c", "core.autocrlf=true"],
    });
    assert.equal(countCarriageReturns(viaAutocrlf), 0, "autocrlf checkout must read as the LF git stores");
    assert.deepEqual(viaAutocrlf, lf);
    // Without that conversion the same bytes would be committed with CR:
    // the edit this check exists to refuse.
    const asWritten = await storedDraftBytes(root, sample, {
      bytes: crlf,
      gitConfig: ["-c", "core.autocrlf=false"],
    });
    assert.ok(countCarriageReturns(asWritten) > 0, "a CR that would be committed must still be seen");
  });
});
