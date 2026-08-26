// Packs the released npm package into an .mcpb bundle: a zip a desktop host
// installs in one click, with the server and its dependencies inside it.
//
//   npm run mcpb
//
// It installs @cedulon/mcp-server from npm at the version this repo is on,
// rather than packing the working tree, so the bundle contains what a user
// would have got from npm. The version must therefore already be released.

import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mcpbManifest } from "./mcpb-manifest.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = mcpbManifest();
const stage = join(root, "build", "mcpb");
const out = join(root, "build", `cedulon-${manifest.version}.mcpb`);

const run = (cmd, args, cwd) =>
  execFileSync(cmd, args, { cwd, stdio: "inherit", shell: process.platform === "win32" });

rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });

writeFileSync(join(stage, "package.json"), JSON.stringify({
  name: "cedulon-bundle",
  version: "0.0.0",
  private: true,
}, null, 2));

console.log(`installing @cedulon/mcp-server@${manifest.version} from npm`);
run("npm", ["install", `@cedulon/mcp-server@${manifest.version}`, "--omit=dev", "--no-package-lock"], stage);

writeFileSync(join(stage, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

run("npx", ["-y", "@anthropic-ai/mcpb", "validate", "manifest.json"], stage);
run("npx", ["-y", "@anthropic-ai/mcpb", "pack", ".", out], stage);

console.log(`\n${out}`);
console.log("verify it before shipping: npx @anthropic-ai/mcpb info <file>");
