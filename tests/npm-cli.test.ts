import { strict as assert } from "node:assert";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { KILL_GRACE_MS, runBounded } from "../scripts/bounded-run.ts";
import { npmCli } from "./helpers/npm-cli.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Measured at about 0.5 s on Windows; the bound is far above that. */
const NPM_VERSION_TIMEOUT_MS = 30_000;

/** A file system holding only `paths`. */
function only(...paths: string[]): (path: string) => boolean {
  return (path) => paths.includes(path);
}

describe("npm and npx run as Node scripts, without a shell", () => {
  it("npm_execpath, which npm sets for every script it runs, names the CLI; npx is the script beside it", () => {
    const declared = "C:\\npm\\node_modules\\npm\\bin\\npm-cli.js";
    const npx = "C:\\npm\\node_modules\\npm\\bin\\npx-cli.js";
    const host = {
      env: { npm_execpath: declared },
      execPath: "C:\\node\\node.exe",
      platform: "win32" as const,
      exists: only(declared, npx),
    };
    assert.deepEqual(npmCli("npm pack probe", "npm", ["pack", "--dry-run"], host), {
      command: "C:\\node\\node.exe",
      args: [declared, "pack", "--dry-run"],
    });
    assert.deepEqual(npmCli("npx tsc probe", "npx", ["tsc", "--noEmit"], host), {
      command: "C:\\node\\node.exe",
      args: [npx, "tsc", "--noEmit"],
    });

    const posix = "/usr/lib/node_modules/npm/bin/npm-cli.js";
    assert.deepEqual(
      npmCli("npm view probe", "npm", ["view", "x"], {
        env: { npm_execpath: posix },
        execPath: "/usr/bin/node",
        platform: "linux",
        exists: only(posix),
      }),
      { command: "/usr/bin/node", args: [posix, "view", "x"] },
    );
  });

  it("with no npm_execpath, the npm installed beside Node is used: node_modules on Windows, ../lib/node_modules on POSIX", () => {
    const windows = "C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js";
    assert.deepEqual(
      npmCli("npm pack probe", "npm", ["pack"], {
        env: {},
        execPath: "C:\\Program Files\\nodejs\\node.exe",
        platform: "win32",
        exists: only(windows),
      }),
      { command: "C:\\Program Files\\nodejs\\node.exe", args: [windows, "pack"] },
    );
    const posixNpx = "/opt/node/lib/node_modules/npm/bin/npx-cli.js";
    assert.deepEqual(
      npmCli("npx tsc probe", "npx", ["tsc"], {
        env: {},
        execPath: "/opt/node/bin/node",
        platform: "linux",
        exists: only(posixNpx),
      }),
      { command: "/opt/node/bin/node", args: [posixNpx, "tsc"] },
    );
  });

  it("RED: with neither, the call is refused by its name", () => {
    assert.throws(
      () =>
        npmCli("npm pack of @cedulon/cose", "npm", ["pack"], {
          env: {},
          execPath: "C:\\agent\\node.exe",
          platform: "win32",
          exists: only(),
        }),
      {
        message:
          "npm pack of @cedulon/cose: npm_execpath is not set and there is no npm-cli.js beside C:\\agent\\node.exe " +
          "(looked for C:\\agent\\node_modules\\npm\\bin\\npm-cli.js)",
      },
    );
    assert.throws(
      () => npmCli("npx tsc --noEmit", "npx", ["tsc"], { env: {}, execPath: "/bin/node", platform: "linux", exists: only() }),
      /^Error: npx tsc --noEmit: npm_execpath is not set and there is no npx-cli\.js beside \/bin\/node \(looked for \/lib\/node_modules\/npm\/bin\/npx-cli\.js\)$/,
    );
  });

  it("RED: an npm_execpath that is not npm's CLI, or whose script is missing, is refused, not passed over for the npm beside Node", () => {
    const besideNode = "C:\\node\\node_modules\\npm\\bin\\npm-cli.js";
    const host = (npmExecpath: string, ...present: string[]) => ({
      env: { npm_execpath: npmExecpath },
      execPath: "C:\\node\\node.exe",
      platform: "win32" as const,
      exists: only(besideNode, ...present),
    });
    const pnpm = "C:\\pnpm\\bin\\pnpm.cjs";
    assert.throws(() => npmCli("npm pack probe", "npm", ["pack"], host(pnpm, pnpm)), {
      message: `npm pack probe: npm_execpath names ${pnpm}, which is not npm's npm-cli.js`,
    });
    const declared = "C:\\gone\\npm\\bin\\npm-cli.js";
    assert.throws(() => npmCli("npx tsc probe", "npx", ["tsc"], host(declared, declared)), {
      message: `npx tsc probe: npm_execpath names ${declared}, and C:\\gone\\npm\\bin\\npx-cli.js does not exist`,
    });
  });

  it(
    "the npm this run resolves answers --version through a bounded call",
    { timeout: NPM_VERSION_TIMEOUT_MS + KILL_GRACE_MS + 10_000 },
    async () => {
      const label = "npm --version";
      const { stdout } = await runBounded({
        label,
        ...npmCli(label, "npm", ["--version"]),
        cwd: root,
        timeoutMs: NPM_VERSION_TIMEOUT_MS,
        maxOutputBytes: 64 * 1024,
      });
      assert.match(stdout.toString("utf8").trim(), /^\d+\.\d+\.\d+/);
    },
  );
});
