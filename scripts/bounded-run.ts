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
};

export type BoundedRunResult = { stdout: Buffer; stderr: Buffer };

export type BoundedRunFailure = "timeout" | "output" | "status" | "start";

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

function signalGroup(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pid, signal);
  } catch {
    // The group has no members left.
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

    const settle = (failure: BoundedRunError | undefined): void => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      clearTimeout(grace);
      if (failure) reject(failure);
      else resolve({ stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr) });
    };

    const end = (failure: BoundedRunError): void => {
      if (settled || ending) return;
      ending = failure;
      clearTimeout(deadline);
      if (pid !== undefined) {
        if (isWindows) killer = taskkillTree(pid);
        else signalGroup(pid, "SIGTERM");
      }
      grace = setTimeout(() => {
        if (pid !== undefined && !isWindows) signalGroup(pid, "SIGKILL");
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
      if (pid !== undefined && !isWindows) signalGroup(pid, "SIGKILL");
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
