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
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Every root this script opens starts with this. */
export const ROOT_PREFIX = "cedulon-run-";

/**
 * Entries a tool, not a test, leaves in the root during a full run, each
 * measured, and why it is allowed. Nothing goes in here unmeasured.
 */
export const TOOL_ENTRIES: Readonly<Record<string, string>> = {};

const TEMP_VARIABLES: readonly string[] = ["TMPDIR", "TEMP", "TMP"];

/**
 * `env` with TMPDIR, TEMP and TMP all set to `dir`. Node reads TMPDIR on
 * POSIX and TEMP, then TMP, on Windows; setting all three is safe on both.
 * Windows names are case-insensitive, so a differently cased copy is dropped
 * rather than left to shadow the one set here.
 */
export function tempRootEnv(env: NodeJS.ProcessEnv, dir: string): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(env)) {
    if (!TEMP_VARIABLES.includes(key.toUpperCase())) out[key] = value;
  }
  for (const key of TEMP_VARIABLES) out[key] = dir;
  return out;
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

function runChild(
  command: string,
  args: readonly string[],
  options: { env: NodeJS.ProcessEnv; stdio: StdioOptions },
  log: (line: string) => void,
): Promise<number> {
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
    const settle = (code: number) => {
      if (settled) return;
      settled = true;
      process.off("SIGINT", forward);
      process.off("SIGTERM", forward);
      resolve(code);
    };
    child.on("error", (err) => {
      log(`with-temp-root: could not run ${command}: ${err.message}`);
      settle(1);
    });
    child.on("close", (code, signal) => {
      if (signal) log(`with-temp-root: the command ended on ${signal}`);
      settle(code ?? 1);
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
 * A non-zero exit code from the command is kept; otherwise anything left in
 * the root, or a root that could not be removed, makes the code 1.
 */
export async function runInTempRoot(run: TempRootRun): Promise<{ code: number; root: string }> {
  const log = run.log ?? ((line: string) => console.error(line));
  const root = mkdtempSync(join(run.base ?? tmpdir(), ROOT_PREFIX));
  log(`with-temp-root: running in ${root}`);
  let code = 1;
  try {
    code = await runChild(
      run.command,
      run.args,
      { env: tempRootEnv(run.env ?? process.env, root), stdio: run.stdio ?? "inherit" },
      log,
    );
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
  return { code, root };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv[0] !== "--" || argv.length < 2) {
    console.error("usage: node --experimental-strip-types scripts/with-temp-root.ts -- <arguments for node>");
    process.exitCode = 2;
    return;
  }
  const { code } = await runInTempRoot({ command: process.execPath, args: argv.slice(1) });
  process.exitCode = code;
}

if (import.meta.filename === process.argv[1]) await main();
