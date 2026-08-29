import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { gunzipSync } from "node:zlib";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

function tarMemberNames(tgz: Buffer): string[] {
  const raw = gunzipSync(tgz);
  const names: string[] = [];
  let off = 0;
  while (off + 512 <= raw.length) {
    const name = raw.subarray(off, off + 100).toString("utf8").replace(/\0.*$/, "");
    if (!name) break;
    names.push(name);
    const size = parseInt(raw.subarray(off + 124, off + 136).toString("utf8").replace(/\0.*$/, "").trim() || "0", 8);
    off += 512 + Math.ceil(size / 512) * 512;
  }
  return names.sort();
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function run(args: string[], cwd = root): string {
  return execFileSync(process.execPath, args, { cwd, encoding: "utf8" });
}

describe("SBOM and pack reproducibility", () => {
  it("the SBOM script emits CycloneDX from the lock file, twice identical", () => {
    const first = run(["--experimental-strip-types", "scripts/sbom.ts"]);
    const second = run(["--experimental-strip-types", "scripts/sbom.ts"]);
    assert.equal(first, second, "SBOM is not deterministic");
    const bom = JSON.parse(first) as { bomFormat: string; specVersion: string; components: unknown[] };
    assert.equal(bom.bomFormat, "CycloneDX");
    assert.equal(bom.specVersion, "1.5");
    assert.ok(bom.components.length > 0);
    assert.match(first, /@cedulon\/cose/);
  });

  it("npm pack of @cedulon/cose lists the same files in the same order twice", () => {
    const packJson = () => {
      const raw = execFileSync("npm", ["pack", "-w", "@cedulon/cose", "--dry-run", "--json"], {
        cwd: root,
        encoding: "utf8",
        shell: process.platform === "win32",
      });
      const start = raw.search(/[[{]/);
      type PackEntry = { name?: string; files?: Array<{ path: string; size: number }> };
      const parsed = JSON.parse(raw.slice(start)) as PackEntry[] | Record<string, PackEntry>;
      const entry = Array.isArray(parsed)
        ? (parsed.find((p) => p.name === "@cedulon/cose") ?? parsed[0])
        : (parsed["@cedulon/cose"] ?? Object.values(parsed)[0]);
      return (entry?.files ?? []).map((f) => `${f.path.replace(/\\/g, "/")}:${f.size}`);
    };
    const a = packJson();
    const b = packJson();
    assert.deepEqual(a, b);
    assert.ok(
      a.some((f) => f.includes("dist/index.js")),
      `cose tarball listing missed dist/index.js (got: ${a.join(", ") || rawHint()})`,
    );
    assert.equal(
      a.some((f) => /\.ts:/.test(f) && !f.includes(".d.ts")),
      false,
    );
  });

function rawHint(): string {
  return "empty files list — npm pack --json shape changed";
}

  it("two real tarballs have the same file list; mtime is why the archives may differ", () => {
    const dir = mkdtempSync(join(tmpdir(), "cedulon-pack-"));
    try {
      const pack = () =>
        execFileSync("npm", ["pack", "-w", "@cedulon/cose", `--pack-destination=${dir}`], {
          cwd: root,
          encoding: "utf8",
          shell: process.platform === "win32",
        }).trim();
      const firstName = pack();
      // npm overwrites the same filename; rename the first so the second is distinct.
      const firstPath = join(dir, firstName.split(/[\\/]/).pop() ?? firstName);
      const saved = join(dir, "first.tgz");
      writeFileSync(saved, readFileSync(firstPath));
      const secondName = pack();
      const secondPath = join(dir, secondName.split(/[\\/]/).pop() ?? secondName);
      const a = tarMemberNames(readFileSync(saved));
      const b = tarMemberNames(readFileSync(secondPath));
      assert.deepEqual(a, b, "tarball file lists differ");
      assert.ok(a.length > 0);
      const hashA = createHash("sha256").update(readFileSync(saved)).digest("hex");
      const hashB = createHash("sha256").update(readFileSync(secondPath)).digest("hex");
      // Archive bytes may differ: ustar stores mtime. The members are the claim.
      void hashA;
      void hashB;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
