/**
 * How a test runs npm or npx: as a Node script, with no shell. On Windows
 * `npm` and `npx` are `.cmd` files, which cannot start without one, and a
 * shell given an argument array is deprecated in Node 24 (DEP0190).
 *
 * The CLI is the one npm_execpath names, which npm sets for every script it
 * runs; npx is the script beside it. With no npm_execpath, as when the suite
 * is started with `node` directly, it is the npm installed beside this Node:
 * `node_modules/npm/bin` next to the executable on Windows,
 * `../lib/node_modules/npm/bin` on POSIX. A call that finds neither, or whose
 * npm_execpath names something else, is refused by its name rather than
 * passed to another npm.
 */
import { existsSync } from "node:fs";
import { posix, win32 } from "node:path";

export type NpmTool = "npm" | "npx";

/** What the lookup reads; the running process unless a test says otherwise. */
export type NpmCliHost = {
  env?: NodeJS.ProcessEnv;
  execPath?: string;
  platform?: NodeJS.Platform;
  exists?: (path: string) => boolean;
};

/** The command and arguments that run `tool args` for the call named `label`. */
export function npmCli(
  label: string,
  tool: NpmTool,
  args: readonly string[],
  host: NpmCliHost = {},
): { command: string; args: string[] } {
  const env = host.env ?? process.env;
  const execPath = host.execPath ?? process.execPath;
  const platform = host.platform ?? process.platform;
  const exists = host.exists ?? existsSync;
  const path = platform === "win32" ? win32 : posix;
  const script = `${tool}-cli.js`;

  const declared = env.npm_execpath;
  if (declared) {
    if (path.basename(declared) !== "npm-cli.js") {
      throw new Error(`${label}: npm_execpath names ${declared}, which is not npm's npm-cli.js`);
    }
    const entry = path.join(path.dirname(declared), script);
    if (!exists(entry)) throw new Error(`${label}: npm_execpath names ${declared}, and ${entry} does not exist`);
    return { command: execPath, args: [entry, ...args] };
  }

  const nodeDir = path.dirname(execPath);
  const entry =
    platform === "win32"
      ? path.join(nodeDir, "node_modules", "npm", "bin", script)
      : path.join(nodeDir, "..", "lib", "node_modules", "npm", "bin", script);
  if (!exists(entry)) {
    throw new Error(`${label}: npm_execpath is not set and there is no ${script} beside ${execPath} (looked for ${entry})`);
  }
  return { command: execPath, args: [entry, ...args] };
}
