/**
 * Run a command in a temp root of its own, and refuse anything it leaves
 * there.
 *
 * Measured 2026-11-26: one `npm run test:all` added 78 `cedulon-*` entries to
 * os.tmpdir() and removed none. A scan of the test sources cannot see every
 * way a path under the temp directory gets built (an aliased import,
 * process.env.TEMP, require, a child process), and comparing names in the
 * shared temp directory before and after a run counts what a concurrent run
 * in another checkout added.
 *
 * So the suite runs as a child whose TMPDIR, TEMP and TMP all name a
 * directory opened for this run alone. When the child ends, anything still in
 * that directory is named and the run is red, whatever the child's exit code
 * said. The directory is then removed. Other runs have roots of their own and
 * are never seen.
 *
 * Usage: node --experimental-strip-types scripts/with-temp-root.ts -- <arguments for node>
 *
 * The command is this Node binary with the given arguments; no shell is
 * involved. The npm cache, git's object directory and an explicitly set
 * NODE_COMPILE_CACHE are passed through untouched.
 */
import { spawn, type StdioOptions } from "node:child_process";
import { chmodSync, existsSync, lstatSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { constants, tmpdir } from "node:os";
import { join } from "node:path";

/** Every root this script opens starts with this. */
export const ROOT_PREFIX = "cedulon-run-";

/**
 * Entries a tool, not a test, leaves in the root during a full run, each
 * measured, and why it is allowed. Nothing goes in here unmeasured. A
 * directory named here hides everything under it, so a tool that can be told
 * to write elsewhere is told that instead.
 */
export const TOOL_ENTRIES: Readonly<Record<string, string>> = {};

const TEMP_VARIABLES: readonly string[] = ["TMPDIR", "TEMP", "TMP"];

/**
 * npm 11 and 12 call module.enableCompileCache() as they start. Without
 * NODE_COMPILE_CACHE, Node puts that cache in os.tmpdir()/node-compile-cache,
 * which in the child is the root; NODE_DISABLE_COMPILE_CACHE=1 makes the call
 * a no-op. A NODE_COMPILE_CACHE the user set already names a place outside
 * the root, and NODE_DISABLE_COMPILE_CACHE would switch that cache off, so
 * then neither variable is touched. An empty NODE_COMPILE_CACHE is no
 * setting: Node falls back to os.tmpdir() for it.
 */
const COMPILE_CACHE = "NODE_COMPILE_CACHE";
const DISABLE_COMPILE_CACHE = "NODE_DISABLE_COMPILE_CACHE";

/**
 * `env` with TMPDIR, TEMP and TMP all set to `dir`, and Node's compile cache
 * kept out of it. Node reads TMPDIR on POSIX and TEMP, then TMP, on Windows;
 * setting all three is safe on both. Windows names are case-insensitive, so
 * there a differently cased copy of a variable set here is dropped rather
 * than left to shadow it. POSIX names are not, and `Temp` or `tmp` there is a
 * variable of its own that is kept.
 */
export function tempRootEnv(
  env: NodeJS.ProcessEnv,
  dir: string,
  platform: NodeJS.Platform = process.platform,
): NodeJS.ProcessEnv {
  const sameName = platform === "win32" ? (key: string, name: string) => key.toUpperCase() === name : (key: string, name: string) => key === name;
  const set: Record<string, string> = {};
  for (const name of TEMP_VARIABLES) set[name] = dir;
  const ownCache = Object.entries(env).some(([key, value]) => sameName(key, COMPILE_CACHE) && value !== undefined && value !== "");
  if (!ownCache) set[DISABLE_COMPILE_CACHE] = "1";
  const out: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(env)) {
    if (!Object.keys(set).some((name) => sameName(key, name))) out[key] = value;
  }
  return { ...out, ...set };
}

/** The exit code a shell reports for a process ended by `signal`: 128 + its number. */
export function signalExitCode(signal: NodeJS.Signals): number {
  return 128 + (constants.signals[signal] ?? 0);
}

/** What is left directly under `root`, relative to it, directories with a trailing slash. */
export function leftEntries(root: string, allowed: Readonly<Record<string, string>> = TOOL_ENTRIES): string[] {
  return readdirSync(root)
    .filter((name) => !Object.hasOwn(allowed, name))
    .sort()
    .map((name) => (lstatSync(join(root, name)).isDirectory() ? `${name}/` : name));
}

/** Give the owner back modes a test narrowed, so they do not refuse the removal. Links are not followed. */
function reopen(path: string): void {
  const st = lstatSync(path);
  if (st.isSymbolicLink()) return;
  if (!st.isDirectory()) {
    chmodSync(path, 0o600);
    return;
  }
  chmodSync(path, 0o700);
  for (const name of readdirSync(path)) reopen(join(path, name));
}

function removeRoot(root: string): void {
  reopen(root);
  rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  if (existsSync(root)) throw new Error("it is still present after removal");
}

/** How the child ended: its exit code, or the signal that ended it. */
type ChildEnd = { code: number | null; signal: NodeJS.Signals | null };

function runChild(
  command: string,
  args: readonly string[],
  options: { env: NodeJS.ProcessEnv; stdio: StdioOptions },
  log: (line: string) => void,
): Promise<ChildEnd> {
  return new Promise((resolve) => {
    let settled = false;
    const child = spawn(command, args, { ...options, shell: false });
    // On Windows a console Ctrl+C reaches the child already, and kill() would
    // end it without its cleanup; elsewhere the signal is passed on.
    const forward = (signal: NodeJS.Signals) => {
      if (process.platform !== "win32") child.kill(signal);
    };
    process.on("SIGINT", forward);
    process.on("SIGTERM", forward);
    const settle = (end: ChildEnd) => {
      if (settled) return;
      settled = true;
      process.off("SIGINT", forward);
      process.off("SIGTERM", forward);
      resolve(end);
    };
    child.on("error", (err) => {
      log(`with-temp-root: could not run ${command}: ${err.message}`);
      settle({ code: 1, signal: null });
    });
    child.on("close", (code, signal) => {
      if (signal) log(`with-temp-root: the command ended on ${signal}`);
      settle({ code, signal });
    });
  });
}

export type TempRootRun = {
  command: string;
  args: readonly string[];
  /** Where the root is opened; the operating system's temp directory by default. */
  base?: string;
  env?: NodeJS.ProcessEnv;
  stdio?: StdioOptions;
  allowed?: Readonly<Record<string, string>>;
  log?: (line: string) => void;
  remove?: (root: string) => void;
};

/**
 * Open a root, run `command` in it, name what it left, remove the root.
 * A non-zero exit code from the command is kept, and a command ended by a
 * signal gets 128 + its number, with the signal itself returned beside it;
 * otherwise anything left in the root, or a root that could not be removed,
 * makes the code 1.
 */
export async function runInTempRoot(
  run: TempRootRun,
): Promise<{ code: number; signal: NodeJS.Signals | null; root: string }> {
  const log = run.log ?? ((line: string) => console.error(line));
  const root = mkdtempSync(join(run.base ?? tmpdir(), ROOT_PREFIX));
  log(`with-temp-root: running in ${root}`);
  let code = 1;
  let signal: NodeJS.Signals | null = null;
  try {
    const end = await runChild(
      run.command,
      run.args,
      { env: tempRootEnv(run.env ?? process.env, root), stdio: run.stdio ?? "inherit" },
      log,
    );
    signal = end.signal;
    code = signal !== null ? signalExitCode(signal) : (end.code ?? 1);
    const left = leftEntries(root, run.allowed);
    if (left.length > 0) {
      log(`with-temp-root: the run left ${left.length} entries in its temp root ${root}:`);
      for (const rel of left) log(`  ${rel}`);
      if (code === 0) code = 1;
    } else {
      log("with-temp-root: the run left nothing in its temp root");
    }
  } finally {
    try {
      (run.remove ?? removeRoot)(root);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      log(`with-temp-root: the temp root ${root} could not be removed: ${detail}`);
      if (code === 0) code = 1;
    }
  }
  return { code, signal, root };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv[0] !== "--" || argv.length < 2) {
    console.error("usage: node --experimental-strip-types scripts/with-temp-root.ts -- <arguments for node>");
    process.exitCode = 2;
    return;
  }
  const { code, signal } = await runInTempRoot({ command: process.execPath, args: argv.slice(1) });
  process.exitCode = code;
  // On POSIX the wrapper ends on the child's signal once the root is gone, so
  // whatever started it sees the interruption as one; the forwarding
  // listeners are off by now, and 128 + its number stays the exit code should
  // the signal not end this process. The raise waits for stderr to flush,
  // since pipes are asynchronous on macOS. Windows has no signal in an exit
  // status: Node reports one there only for a child its own kill() ended,
  // which the wrapper does not call, so 128 + its number is all that can be
  // carried, and a child ended by Ctrl+C or TerminateProcess keeps the exit
  // code Windows gave it.
  if (signal !== null && process.platform !== "win32") {
    process.stderr.write(`with-temp-root: ending on ${signal}, as the command did\n`, () => {
      process.kill(process.pid, signal);
    });
  }
}

if (import.meta.filename === process.argv[1]) await main();
