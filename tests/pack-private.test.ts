import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

// These two packages used to point main/exports at ./src/index.ts. That
// resolves inside the workspace and nowhere else, so a packed install
// could not run demo:live's entry. A development export that named the
// TypeScript source has also leaked into a tarball in this repo before;
// publishConfig.exports is not applied by npm.

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const names = ["base-extract", "mcp-guard"] as const;

function readPkg(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(root, "packages", name, "package.json"), "utf8"));
}

function packFiles(name: string): string[] {
  const raw = execFileSync("npm", ["pack", "-w", `@cedulon/${name}`, "--dry-run", "--json"], {
    cwd: root,
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  // npm 10.9 returns an array here where earlier versions returned an object
  // keyed by package name. Reading only one shape made the check depend on the
  // npm that happened to be installed.
  type PackEntry = { name?: string; files?: Array<{ path: string }> };
  const start = raw.search(/[[{]/);
  const parsed = JSON.parse(raw.slice(start)) as PackEntry[] | Record<string, PackEntry>;
  const entry = Array.isArray(parsed)
    ? (parsed.find((p) => p.name === `@cedulon/${name}`) ?? parsed[0])
    : (parsed[`@cedulon/${name}`] ?? Object.values(parsed)[0]);
  return (entry?.files ?? []).map((f) => f.path.replace(/\\/g, "/"));
}

describe("unpublished packages are packable", () => {
  for (const name of names) {
    const pkg = readPkg(name);

    it(`${name} stays private and points at dist`, () => {
      assert.equal(pkg.private, true, `${name} must stay private; publish is a separate decision`);
      assert.equal(pkg.main, "./dist/index.js");
      assert.equal(pkg.types, "./dist/index.d.ts");
      const exportsField = pkg.exports as { ".": { types: string; import: string } };
      assert.equal(exportsField["."].types, "./dist/index.d.ts");
      assert.equal(exportsField["."].import, "./dist/index.js");
      assert.equal("development" in exportsField, false, "a development export has leaked src before");
      assert.deepEqual(pkg.files, ["dist", "README.md", "LICENSE"]);
      assert.equal((pkg.engines as { node: string }).node, ">=20");
      assert.equal((pkg.publishConfig as { access: string }).access, "public");
    });

    it(`${name} tarball lists no raw TypeScript sources`, () => {
      const files = packFiles(name);
      const rawTs = files.filter((p) => p.endsWith(".ts") && !p.endsWith(".d.ts"));
      assert.deepEqual(rawTs, [], `${name} tarball contains source: ${rawTs.join(", ")}`);
      assert.ok(
        files.includes("dist/index.js"),
        `${name} tarball must include the compiled entry (got: ${files.join(", ")})`,
      );
    });
  }
});
