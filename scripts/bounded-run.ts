// A child process the suite waits on must not be able to hold it past a
// bound of its own. The bound is this module's timer, not an inference
// from an exit code or a signal. Two things are promised: the call settles
// within the bound, refused by the end of KILL_GRACE_MS after it at the
// latest, and the process group or tree this module can reach is ended.
//
// On POSIX the child leads its own process group. At the bound, or past
// the output limit, the group gets SIGTERM and, after KILL_GRACE_MS,
// SIGKILL; if the child closes first, the SIGKILL goes at once. When the
// child closes on its own, success included, whatever is left of its
// group gets SIGKILL: nothing would end it once the call has returned.
// That SIGKILL goes after the child has been reaped, by number. POSIX does
// not reuse a process group ID while the group has a member, so the
// signal reaches the members of this group that are left, or no one. The
// remaining risk is that the group empties and the whole PID space wraps
// around before the signal is sent. Only ESRCH, an empty group, is
// expected; any other failure to signal the group refuses the call by
// name, and a refusal the call already had keeps its kind. One exception:
// XNU returns EPERM for a group whose remaining members are all zombies
// (Apple Developer Forums thread 815194; an Apple bug, unresolved). So on
// Darwin, once the child that leads the group has been reaped, EPERM is
// read as ESRCH, taken to mean that only zombies are left. A live member
// this process may not signal, such as a setuid descendant, would answer
// the same way; that case is accepted as out of reach, since this helper
// runs the repository's git calls and test processes. Before the child is
// reaped, and on every other platform, EPERM refuses the call.
// On Windows `taskkill /T /F` ends the tree while its root is alive.
//
// Out of reach: on POSIX a descendant that has left the group, on Windows
// one that is no longer linked to a live root; a Job Object would need
// native code. Such a descendant may still hold a pipe, so the output
// streams are destroyed at the end of the grace period and the call does
// not wait on it.
//
// Leading its own group has a cost on POSIX: if this process dies
// abruptly, no signal sent to its group reaches the child, which runs on.
//
// Standard input is a file or nothing, never a pipe to feed.

import { type ChildProcess, spawn } from "node:child_process";
import { closeSync, openSync } from "node:fs";
import { join } from "node:path";

export const KILL_GRACE_MS = 1000;

const STDERR_HEAD_BYTES = 500;

export type BoundedRunOptions = {
  /** Names the call in every refusal. */
  label: string;
  command: string;
  args: string[];
  cwd: string;
  timeoutMs: number;
  /** File whose bytes become the child's standard input; none if absent. */
  stdinPath?: string;
  /** Limit on stdout and stderr together. */
  maxOutputBytes: number;
  env?: NodeJS.ProcessEnv;
  /** For tests only: stands in for process.kill on the POSIX group path. */
  signal?: GroupKill;
  /**
   * For tests only: the platform whose rule judges a failed group signal.
   * How the child is started and ended still follows the host.
   */
  platform?: NodeJS.Platform;
};

export type GroupKill = (pid: number, signal: NodeJS.Signals) => void;

/** What a failed group signal is judged against. */
export type GroupSignalState = {
  /** The child, which leads the group, has been reaped. */
  leaderReaped: boolean;
  platform: NodeJS.Platform;
};

export type BoundedRunResult = { stdout: Buffer; stderr: Buffer };

export type BoundedRunFailure = "timeout" | "output" | "status" | "start" | "kill";

export class BoundedRunError extends Error {
  readonly kind: BoundedRunFailure;
  /** The child the refusal is about, when one was started. */
  readonly pid: number | undefined;

  constructor(kind: BoundedRunFailure, message: string, pid: number | undefined) {
    super(message);
    this.name = "BoundedRunError";
    this.kind = kind;
    this.pid = pid;
  }
}

const isWindows = process.platform === "win32";

function reason(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Signals the group `pid` leads. ESRCH, an empty group, passes; so does
 * EPERM on Darwin once the leader has been reaped, read as a group of
 * zombies (a live member this process may not signal is not told apart). Any
 * other failure's code is returned.
 */
export function signalGroup(
  pid: number,
  signal: NodeJS.Signals,
  kill: GroupKill,
  state: GroupSignalState,
): string | undefined {
  try {
    kill(-pid, signal);
    return undefined;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException | undefined)?.code;
    if (code === "ESRCH") return undefined;
    // XNU returns EPERM for a group whose remaining members are all zombies
    // (Apple Developer Forums thread 815194, an Apple bug with no fix yet).
    // With the leader reaped, the EPERM is read as that case; a live member
    // this process may not signal would answer the same and is accepted as
    // out of reach. While the leader is unreaped the EPERM is not that case
    // and refuses the call.
    if (code === "EPERM" && state.platform === "darwin" && state.leaderReaped) return undefined;
    return typeof code === "string" ? code : reason(err);
  }
}

function taskkillTree(pid: number): ChildProcess {
  const command = process.env.SystemRoot ? join(process.env.SystemRoot, "System32", "taskkill.exe") : "taskkill";
  const killer = spawn(command, ["/PID", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
  killer.on("error", () => {
    // The grace timer still ends the direct child and the call.
  });
  return killer;
}

export function runBounded(options: BoundedRunOptions): Promise<BoundedRunResult> {
  const { label, timeoutMs, maxOutputBytes } = options;
  const kill: GroupKill = options.signal ?? ((pid, signal) => void process.kill(pid, signal));
  const platform = options.platform ?? process.platform;
  return new Promise((resolve, reject) => {
    let stdin: number | "ignore" = "ignore";
    let child: ChildProcess;
    try {
      if (options.stdinPath !== undefined) stdin = openSync(options.stdinPath, "r");
      child = spawn(options.command, options.args, {
        cwd: options.cwd,
        env: options.env ?? process.env,
        stdio: [stdin, "pipe", "pipe"],
        detached: !isWindows,
        windowsHide: true,
      });
    } catch (err) {
      reject(new BoundedRunError("start", `${label} could not start: ${reason(err)}`, undefined));
      return;
    } finally {
      // The child holds its own copy once spawn() has returned.
      if (typeof stdin === "number") closeSync(stdin);
    }

    const pid = child.pid;
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let total = 0;
    let settled = false;
    let ending: BoundedRunError | undefined;
    let killer: ChildProcess | undefined;
    let grace: NodeJS.Timeout | undefined;
    let unsignalled: string | undefined;

    // POSIX only. The first failure signalGroup does not pass is kept for
    // settle(). Whether the child has been reaped is read at each signal.
    const signalOwnGroup = (signal: NodeJS.Signals): void => {
      if (pid === undefined) return;
      const leaderReaped = child.exitCode !== null || child.signalCode !== null;
      const code = signalGroup(pid, signal, kill, { leaderReaped, platform });
      if (unsignalled === undefined) unsignalled = code;
    };

    const settle = (failure: BoundedRunError | undefined): void => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      clearTimeout(grace);
      let refused = failure;
      if (unsignalled !== undefined) {
        const message = `${label} could not signal its process group ${pid}: ${unsignalled}`;
        refused = failure
          ? new BoundedRunError(failure.kind, `${failure.message}; ${message}`, failure.pid)
          : new BoundedRunError("kill", message, pid);
      }
      if (refused) reject(refused);
      else resolve({ stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr) });
    };

    const end = (failure: BoundedRunError): void => {
      if (settled || ending) return;
      ending = failure;
      clearTimeout(deadline);
      if (pid !== undefined) {
        if (isWindows) killer = taskkillTree(pid);
        else signalOwnGroup("SIGTERM");
      }
      grace = setTimeout(() => {
        if (pid !== undefined && !isWindows) signalOwnGroup("SIGKILL");
        else child.kill("SIGKILL");
        killer?.kill();
        child.stdout?.destroy();
        child.stderr?.destroy();
        settle(failure);
      }, KILL_GRACE_MS);
    };

    const deadline = setTimeout(
      () => end(new BoundedRunError("timeout", `${label} timed out after ${timeoutMs} ms`, pid)),
      timeoutMs,
    );

    const collect =
      (sink: Buffer[]) =>
      (chunk: Buffer): void => {
        if (ending) return;
        total += chunk.length;
        if (total > maxOutputBytes) {
          end(new BoundedRunError("output", `${label} exceeded ${maxOutputBytes} bytes of output`, pid));
          return;
        }
        sink.push(chunk);
      };
    child.stdout!.on("data", collect(stdout));
    child.stderr!.on("data", collect(stderr));
    child.stdout!.on("error", () => {});
    child.stderr!.on("error", () => {});

    child.on("error", (err) => {
      // After a successful start, an error here is a failed kill; the
      // grace timer still settles the call.
      if (pid === undefined) settle(new BoundedRunError("start", `${label} could not start: ${reason(err)}`, undefined));
    });

    child.on("close", (code, signal) => {
      if (settled) return;
      // The child has been reaped, so this signal goes by number. A group ID
      // is not reused while the group has a member: it reaches what is left
      // of this group, or no one (ESRCH). It could reach another group only
      // if this one emptied and the whole PID space wrapped in between. On
      // Darwin a group left with only zombies answers EPERM instead.
      if (pid !== undefined && !isWindows) signalOwnGroup("SIGKILL");
      if (ending) {
        const failure = ending;
        // The tree is ended only once taskkill has walked it.
        if (killer && killer.exitCode === null && killer.signalCode === null) killer.once("exit", () => settle(failure));
        else settle(failure);
        return;
      }
      if (code === 0) {
        settle(undefined);
        return;
      }
      const head = Buffer.concat(stderr).subarray(0, STDERR_HEAD_BYTES).toString("utf8").trim();
      settle(
        new BoundedRunError(
          "status",
          `${label} exited with status ${code ?? signal}: ${head || "(no stderr)"}`,
          pid,
        ),
      );
    });
  });
}
