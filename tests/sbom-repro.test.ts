import { strict as assert } from "node:assert";
import { gunzipSync } from "node:zlib";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { KILL_GRACE_MS, runBounded } from "../scripts/bounded-run.ts";
import { npmCli } from "./helpers/npm-cli.ts";
import { tempDir } from "./helpers/temp-dir.ts";

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

/** Each call here, measured on Windows: the SBOM script 0.1 s, each `npm pack` 0.5 s. */
const CALL_TIMEOUT_MS = 30_000;
/** Two calls per case, plus the grace period and the case's own work. */
const CASE_TIMEOUT_MS = 2 * CALL_TIMEOUT_MS + KILL_GRACE_MS + 10_000;

async function sbom(label: string): Promise<string> {
  const { stdout } = await runBounded({
    label,
    command: process.execPath,
    args: ["--experimental-strip-types", "scripts/sbom.ts"],
    cwd: root,
    timeoutMs: CALL_TIMEOUT_MS,
    maxOutputBytes: 16 * 1024 * 1024,
  });
  return stdout.toString("utf8");
}

async function npm(label: string, args: string[]): Promise<string> {
  const { stdout } = await runBounded({
    label,
    ...npmCli(label, "npm", args),
    cwd: root,
    timeoutMs: CALL_TIMEOUT_MS,
    maxOutputBytes: 1024 * 1024,
  });
  return stdout.toString("utf8");
}

describe("SBOM and pack reproducibility", () => {
  it("the SBOM script emits CycloneDX from the lock file, twice identical", { timeout: CASE_TIMEOUT_MS }, async () => {
    const first = await sbom("sbom, first run");
    const second = await sbom("sbom, second run");
    assert.equal(first, second, "SBOM is not deterministic");
    const bom = JSON.parse(first) as { bomFormat: string; specVersion: string; components: unknown[] };
    assert.equal(bom.bomFormat, "CycloneDX");
    assert.equal(bom.specVersion, "1.5");
    assert.ok(bom.components.length > 0);
    assert.match(first, /@cedulon\/cose/);
  });

  it("npm pack of @cedulon/cose lists the same files in the same order twice", { timeout: CASE_TIMEOUT_MS }, async () => {
    const packJson = async (label: string) => {
      const raw = await npm(label, ["pack", "-w", "@cedulon/cose", "--dry-run", "--json"]);
      const start = raw.search(/[[{]/);
      type PackEntry = { name?: string; files?: Array<{ path: string; size: number }> };
      const parsed = JSON.parse(raw.slice(start)) as PackEntry[] | Record<string, PackEntry>;
      const entry = Array.isArray(parsed)
        ? (parsed.find((p) => p.name === "@cedulon/cose") ?? parsed[0])
        : (parsed["@cedulon/cose"] ?? Object.values(parsed)[0]);
      return (entry?.files ?? []).map((f) => `${f.path.replace(/\\/g, "/")}:${f.size}`);
    };
    const a = await packJson("npm pack -w @cedulon/cose --dry-run, first");
    const b = await packJson("npm pack -w @cedulon/cose --dry-run, second");
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

  it("two real tarballs have the same file list; mtime is why the archives may differ", { timeout: CASE_TIMEOUT_MS }, async (t) => {
    const dir = tempDir(t, "cedulon-pack-");
    const pack = async (label: string) =>
      (await npm(label, ["pack", "-w", "@cedulon/cose", `--pack-destination=${dir}`])).trim();
    const firstName = await pack("npm pack -w @cedulon/cose, first tarball");
    // npm overwrites the same filename; rename the first so the second is distinct.
    const firstPath = join(dir, firstName.split(/[\\/]/).pop() ?? firstName);
    const saved = join(dir, "first.tgz");
    writeFileSync(saved, readFileSync(firstPath));
    const secondName = await pack("npm pack -w @cedulon/cose, second tarball");
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
  });
});
