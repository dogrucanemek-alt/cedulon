import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { latestDraftPath } from "../scripts/latest-draft.ts";

import {
  PUBLISHED_MARKERS,
  checkClaimAgainstText,
  publishedClaims,
  type PublishedClaim,
} from "../scripts/published-as-guard.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
// The living draft: the published-as list this checks is the one the current
// revision makes, not the one a frozen revision made.
const DRAFT = latestDraftPath(root);

function tarEntries(buf: Buffer): { name: string; body: Buffer }[] {
  // POSIX ustar: a 512-byte header (name at 0, octal size at 124, type at 156)
  // then the body padded to the next 512-byte boundary. Enough for an npm pack.
  const out: { name: string; body: Buffer }[] = [];
  for (let off = 0; off + 512 <= buf.length; ) {
    const header = buf.subarray(off, off + 512);
    const name = header.subarray(0, 100).toString("utf8").replace(/\x00.*$/, "");
    if (name === "") break;
    const raw = header.subarray(124, 136).toString("ascii").replace(/\x00.*$/, "").trim();
    const size = parseInt(raw || "0", 8);
    const type = String.fromCharCode(header[156] ?? 0);
    const start = off + 512;
    if (type === "0" || type === "\x00") out.push({ name, body: buf.subarray(start, start + size) });
    off = start + Math.ceil(size / 512) * 512;
  }
  return out;
}


function tarballText(pkg: string, version: string): string | { skipped: string } {
  const dir = mkdtempSync(join(tmpdir(), "cedulon-published-as-"));
  try {
    execFileSync("npm", ["pack", `${pkg}@${version}`, "--prefer-online", "--pack-destination", dir], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 60_000,
      shell: process.platform === "win32",
    });
    const tgz = join(dir, `${pkg.replace(/^@/, "").replace("/", "-")}-${version}.tgz`);
        // Read the archive here rather than shelling out to tar. GNU tar reads
        // the "C:" of a Windows path as a remote host name and fails; the tar
        // that ships with Windows does not. Which one answers depends on PATH
        // order, so this check was green on one machine and red on the next --
        // the platform sentence this repository keeps finding, inside the guard
        // written to catch it.
        let text = "";
        for (const entry of tarEntries(gunzipSync(readFileSync(tgz)))) {
          if (entry.name.endsWith(".js")) text += entry.body.toString("utf8");
        }
        return text;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const offline = /ENOTFOUND|EAI_AGAIN|ETIMEDOUT|network|ECONNREFUSED|registry\.npmjs/i.test(msg);
    if (offline) return { skipped: msg };
    throw err;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("published-as claims", () => {
  it("RED then GREEN: a MUST claimed published but missing from the tarball is refused", () => {
    const claim: PublishedClaim = {
      id: "MUST-T12-4",
      version: "0.4.0",
      paragraph: "(MUST-T12-4) were published as 0.4.0 rather than as a patch",
    };
    const red = checkClaimAgainstText(claim, "function spend() { return { ok: true }; }\n");
    assert.equal(red.ok, false, "a session.js with no indeterminate token must fail");
    assert.match(red.detail, /indeterminate/);

    const green = checkClaimAgainstText(claim, "if (state === 'indeterminate') return;\n");
    assert.equal(green.ok, true, green.detail);

    const unknown = checkClaimAgainstText(
      { id: "MUST-T99-1", version: "0.4.0", paragraph: "MUST-T99-1 were published as 0.4.0" },
      "anything",
    );
    assert.equal(unknown.ok, false);
    assert.match(unknown.detail, /no catalogued marker/);
  });

  it("the draft's 'published as' list is in the tarball at that version", async (t) => {
    const md = readFileSync(DRAFT, "utf8");
    const claims = publishedClaims(md);
    assert.ok(claims.length > 0, "Implementation Status no longer names a published-as version");

    const cache = new Map<string, string>();
    for (const claim of claims) {
      const marker = PUBLISHED_MARKERS[claim.id];
      if (!marker) {
        assert.fail(`${claim.id} is claimed published as ${claim.version} but has no catalogued marker`);
      }
      const key = `${marker.package}@${claim.version}`;
      let text = cache.get(key);
      if (!text) {
        const packed = tarballText(marker.package, claim.version);
        if (typeof packed !== "string") {
          t.skip(`published-as guard skipped: npm pack failed (${packed.skipped})`);
          return;
        }
        cache.set(key, packed);
        text = packed;
      }
      const checked = checkClaimAgainstText(claim, text, marker);
      assert.equal(checked.ok, true, checked.detail);
    }
  });

  it("the workspace version is on npm only after it is published", () => {
    // The draft's published-as list is pinned to 0.4.0 and stays green against
    // that tarball. This tree is ahead of npm. Packing the workspace version
    // must fail until that version exists; greening this by packing 0.4.0 or
    // skipping a 404 is how a prepared bump reads as already shipped.
    const version = (
      JSON.parse(readFileSync(join(root, "packages", "mcp-server", "package.json"), "utf8")) as {
        version: string;
      }
    ).version;
    const packed = tarballText("@cedulon/audit", version);
    assert.equal(
      typeof packed,
      "string",
      `@cedulon/audit@${version} is not on npm; this goes green after publish`,
    );
    const text = packed as string;
    for (const needle of ["manifest-covers-no-receipt", "manifest-terms-mismatch"]) {
      assert.ok(text.includes(needle), `@cedulon/audit@${version} is missing ${needle}`);
    }
  });

  it("RED then GREEN: STATUS published-on-npm is the workspace version is on npm latest for every public package", (t) => {
    // Offline stale-claims.ts reads this number from STATUS itself.
    // This test is the floor: the number STATUS names must be the
    // one npm actually serves as latest, and every public package
    // must agree. A suite that is only self-consistent can still
    // be wrong about the world — that is how 0.6.0 shipped while
    // STATUS still said 0.5.0.
    const names = publicPackageNames();
    assert.ok(names.length > 0, "no public package under packages/");
    const latestByPackage = new Map<string, string>();
    for (const name of names) {
      const viewed = npmViewVersion(name);
      if (typeof viewed !== "string") {
        t.skip(`STATUS↔npm latest skipped: npm view failed (${viewed.skipped})`);
        return;
      }
      latestByPackage.set(name, viewed);
    }
    const unique = [...new Set(latestByPackage.values())];
    assert.equal(
      unique.length,
      1,
      `npm latest disagrees across public packages: ${[...latestByPackage.entries()].map(([n, v]) => `${n}@${v}`).join(", ")}`,
    );
    const npmLatest = unique[0]!;

    const living = readFileSync(join(root, "docs", "STATUS.md"), "utf8");
    const drifted = living.replace(
      /published on npm at `\d+\.\d+\.\d+`/,
      "published on npm at `0.0.0`",
    );
    assert.notEqual(drifted, living, "fixture did not change the published-on-npm version");
    assert.throws(
      () => assertStatusPublishedMatchesNpm(drifted, npmLatest),
      (err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        assert.match(message, /0\.0\.0/, `red message omitted STATUS's number: ${message}`);
        assert.match(
          message,
          new RegExp(npmLatest.replaceAll(".", "\\.")),
          `red message omitted npm's number: ${message}`,
        );
        return true;
      },
    );
    assertStatusPublishedMatchesNpm(living, npmLatest);
  });
});

function publicPackageNames(): string[] {
  const names: string[] = [];
  for (const dir of readdirSync(join(root, "packages"))) {
    let raw: string;
    try {
      raw = readFileSync(join(root, "packages", dir, "package.json"), "utf8");
    } catch {
      continue;
    }
    const pkg = JSON.parse(raw) as { name?: string; private?: boolean };
    if (!pkg.name || pkg.private) continue;
    names.push(pkg.name);
  }
  return names.sort();
}

function npmViewVersion(pkg: string): string | { skipped: string } {
  // Same npm CLI path as tarballText (execFileSync, timeout, win32
  // shell, offline skip). This question is the latest dist-tag, not
  // the tarball bytes of a pinned version.
  try {
    return execFileSync("npm", ["view", pkg, "version"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 60_000,
      shell: process.platform === "win32",
    }).trim();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const offline = /ENOTFOUND|EAI_AGAIN|ETIMEDOUT|network|ECONNREFUSED|registry\.npmjs/i.test(msg);
    if (offline) return { skipped: msg };
    throw err;
  }
}

function assertStatusPublishedMatchesNpm(status: string, npmLatest: string): void {
  const named = status.match(/published on npm at `(\d+\.\d+\.\d+)`/);
  assert.ok(named, "docs/STATUS.md no longer names the published version as published on npm at `X`");
  assert.equal(
    named[1],
    npmLatest,
    `docs/STATUS.md says published on npm at ${named[1]}; npm latest is ${npmLatest}`,
  );
}
