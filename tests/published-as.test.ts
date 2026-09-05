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
  classifyLiveClaim,
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

  it("RED then GREEN: a live claim at a pinned commit is stale, agrees, or reports that the world moved", () => {
    // Nicholas Templeman, 5 September: a test that asserts what the
    // registry serves right now, from inside a pinned commit, goes red
    // for anyone who arrives after the next release, and the output
    // alone cannot say whether they found a defect or arrived late.
    // The claim splits in two. "The version STATUS names was
    // published" holds forever at that commit. "And it is the latest"
    // is true today. When the world has moved past this checkout, the
    // second kind reports a third state instead of failing.
    const published = ["0.5.0", "0.6.0", "0.12.0", "0.13.0"];
    // The 0.6.0 shape: this checkout shipped 0.6.0 and STATUS still says
    // 0.5.0. The world did not move past the checkout; the checkout is
    // wrong. Red.
    const stale = classifyLiveClaim({ named: "0.5.0", live: "0.6.0", workspace: "0.6.0", published });
    assert.equal(stale.state, "stale");
    assert.match(stale.message, /0\.5\.0/);
    assert.match(stale.message, /0\.6\.0/);
    // A claim of a publish that has not happened. Red.
    const early = classifyLiveClaim({ named: "0.13.0", live: "0.12.0", workspace: "0.13.0", published: ["0.12.0"] });
    assert.equal(early.state, "stale");
    assert.match(early.message, /never published|not published/);
    // A version STATUS names that no registry ever served. Red, even
    // though the world is ahead of the checkout.
    const phantom = classifyLiveClaim({ named: "0.0.0", live: "0.13.0", workspace: "0.12.0", published });
    assert.equal(phantom.state, "stale");
    // da7bf9b, run after 0.13.0 shipped: STATUS at that commit names
    // 0.12.0, the workspace is 0.12.0, 0.12.0 was published, and the
    // registry now serves 0.13.0. The pin is fine; the world moved.
    const moved = classifyLiveClaim({ named: "0.12.0", live: "0.13.0", workspace: "0.12.0", published });
    assert.equal(moved.state, "world-moved");
    assert.match(moved.message, /world moved/);
    assert.match(moved.message, /0\.12\.0/);
    assert.match(moved.message, /0\.13\.0/);
    // Today, at the release commit. Green.
    const agrees = classifyLiveClaim({ named: "0.13.0", live: "0.13.0", workspace: "0.13.0", published });
    assert.equal(agrees.state, "agrees");
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
    let publishedEverywhere: Set<string> | undefined;
    for (const name of names) {
      const viewed = npmViewPublished(name);
      if ("skipped" in viewed) {
        t.skip(`STATUS↔npm latest skipped: npm view failed (${viewed.skipped})`);
        return;
      }
      latestByPackage.set(name, viewed.latest);
      // A version counts as published only if every public package has it.
      publishedEverywhere = publishedEverywhere
        ? new Set(viewed.versions.filter((v) => publishedEverywhere!.has(v)))
        : new Set(viewed.versions);
    }
    const unique = [...new Set(latestByPackage.values())];
    assert.equal(
      unique.length,
      1,
      `npm latest disagrees across public packages: ${[...latestByPackage.entries()].map(([n, v]) => `${n}@${v}`).join(", ")}`,
    );
    const npmLatest = unique[0]!;
    const workspace = workspaceVersion();
    const published = [...(publishedEverywhere ?? [])];

    const living = readFileSync(join(root, "docs", "STATUS.md"), "utf8");
    const drifted = living.replace(
      /published on npm at `\d+\.\d+\.\d+`/,
      "published on npm at `0.0.0`",
    );
    assert.notEqual(drifted, living, "fixture did not change the published-on-npm version");
    assert.throws(
      () => judgeStatusPublishedOnNpm(drifted, npmLatest, workspace, published),
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
    // The 0.6.0 shape stays red at this checkout: a tree whose own
    // version is the one npm serves cannot say the world moved.
    const shipped = living.replace(
      /published on npm at `\d+\.\d+\.\d+`/,
      "published on npm at `0.0.0`",
    );
    assert.throws(() => judgeStatusPublishedOnNpm(shipped, workspace, workspace, [...published, workspace]));
    const verdict = judgeStatusPublishedOnNpm(living, npmLatest, workspace, published);
    if (verdict.state === "world-moved") {
      t.skip(verdict.message);
      return;
    }
  });

  it("the MCP Registry version STATUS names is the one the registry serves", async (t) => {
    // The npm floor above has a sibling that was missing. Offline
    // stale-claims.ts reads the registry number out of STATUS with
    // `where \`X\` is the current version (\`isLatest\`)` and then
    // measures the npm/registry gap from it. Both sides of that
    // comparison come from the same file, so STATUS could say the
    // listing is two releases behind while the listing had caught
    // up, and the suite stayed green. It did: the listing moved to
    // 0.9.0 on 1 September and every sentence here about the gap
    // became false with nothing red. This test is the third thing
    // that has to agree, and it asks the registry.
    const listing = await registryVersions();
    if ("skipped" in listing) {
      // The registry host has failed to answer before, and a check
      // that goes red when someone else's service is down measures
      // their uptime rather than our claim.
      t.skip(`MCP Registry did not answer: ${listing.skipped}`);
      return;
    }
    const status = readFileSync(join(root, "docs", "STATUS.md"), "utf8");
    const named = status.match(/where `(\d+\.\d+\.\d+)` is the current version \(`isLatest`\)/);
    assert.ok(named, "docs/STATUS.md no longer names the registry isLatest version");
    // Two claims. "The registry has served the version STATUS names" holds
    // at this commit forever. "And it is the isLatest one" is true today;
    // once the listing has moved past this checkout, that is reported as
    // the world moving, not as a defect in the pin.
    const verdict = classifyLiveClaim({
      named: named[1]!,
      live: listing.latest,
      workspace: workspaceVersion(),
      published: listing.versions,
    });
    if (verdict.state === "world-moved") {
      t.skip(verdict.message);
      return;
    }
    assert.equal(
      verdict.state,
      "agrees",
      `docs/STATUS.md says the MCP Registry serves ${named[1]}; ${verdict.message}`,
    );
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

function npmViewPublished(pkg: string): { latest: string; versions: string[] } | { skipped: string } {
  // Same npm CLI path as tarballText (execFileSync, timeout, win32
  // shell, offline skip). Two questions in one call: the latest
  // dist-tag (today's claim) and the version list (what was ever
  // published, which a pinned commit may name without being latest).
  try {
    const out = execFileSync("npm", ["view", pkg, "dist-tags.latest", "versions", "--json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 60_000,
      shell: process.platform === "win32",
    });
    const parsed = JSON.parse(out) as unknown;
    const row = (Array.isArray(parsed) ? parsed[0] : parsed) as
      | { "dist-tags.latest"?: string; versions?: string[] | string }
      | undefined;
    const latest = row?.["dist-tags.latest"];
    const versions = Array.isArray(row?.versions) ? row.versions : row?.versions ? [row.versions] : [];
    if (!latest) throw new Error(`npm view ${pkg} answered without a latest dist-tag: ${out.slice(0, 200)}`);
    return { latest, versions };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // A registry that answers 404 is not offline: it answered, and the
    // answer is that the package does not exist. The offline pattern used
    // to swallow it because npm prints the registry URL in the 404 text,
    // and a public workspace package that had never been published passed
    // this guard as "skipped" on every run. That is the case the guard is
    // for.
    if (/E404|404 Not Found/.test(msg)) {
      throw new Error(`${pkg} is a public workspace package and npm has never published it (404)`);
    }
    const offline = /ENOTFOUND|EAI_AGAIN|ETIMEDOUT|network|ECONNREFUSED|registry\.npmjs/i.test(msg);
    if (offline) return { skipped: msg };
    throw err;
  }
}

function workspaceVersion(): string {
  // The version this checkout is, read from the public packages. They
  // are bumped together; disagreement is its own defect.
  const versions = new Set<string>();
  for (const dir of readdirSync(join(root, "packages"))) {
    let raw: string;
    try {
      raw = readFileSync(join(root, "packages", dir, "package.json"), "utf8");
    } catch {
      continue;
    }
    const pkg = JSON.parse(raw) as { name?: string; private?: boolean; version?: string };
    if (!pkg.name || pkg.private || !pkg.version) continue;
    versions.add(pkg.version);
  }
  assert.equal(versions.size, 1, `public packages disagree on their version: ${[...versions].join(", ")}`);
  return [...versions][0]!;
}

async function registryVersions(): Promise<{ latest: string; versions: string[] } | { skipped: string }> {
  // The listing is a second distribution channel with its own host.
  // Same shape as npmViewPublished: answer, or a skip reason, never a
  // silent pass. One search answers both questions: every version the
  // listing carries for this server, and which of them is isLatest.
  try {
    const url =
      "https://registry.modelcontextprotocol.io/v0/servers?search=io.github.dogrucanemek-alt/cedulon";
    const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) return { skipped: `HTTP ${res.status}` };
    const body = (await res.json()) as {
      servers?: { server?: { name?: string; version?: string }; _meta?: Record<string, unknown> }[];
    };
    const ours = (body.servers ?? []).filter(
      (s) => s.server?.name === "io.github.dogrucanemek-alt/cedulon",
    );
    const latest = ours.find((s) => {
      const official = s._meta?.["io.modelcontextprotocol.registry/official"] as
        | { isLatest?: boolean }
        | undefined;
      return official?.isLatest === true;
    });
    const version = latest?.server?.version;
    if (!version) return { skipped: "no isLatest entry for this server in the registry response" };
    const versions = [...new Set(ours.map((s) => s.server?.version).filter((v): v is string => !!v))];
    return { latest: version, versions };
  } catch (err) {
    return { skipped: err instanceof Error ? err.message : String(err) };
  }
}

function judgeStatusPublishedOnNpm(
  status: string,
  npmLatest: string,
  workspace: string,
  published: readonly string[],
): { state: "agrees" | "world-moved"; message: string } {
  const named = status.match(/published on npm at `(\d+\.\d+\.\d+)`/);
  assert.ok(named, "docs/STATUS.md no longer names the published version as published on npm at `X`");
  const verdict = classifyLiveClaim({ named: named[1]!, live: npmLatest, workspace, published });
  if (verdict.state === "stale") {
    throw new Error(
      `docs/STATUS.md says published on npm at ${named[1]}; npm latest is ${npmLatest} (${verdict.message})`,
    );
  }
  return { state: verdict.state, message: verdict.message };
}
