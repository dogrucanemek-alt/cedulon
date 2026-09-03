import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const yml = readFileSync(join(root, ".github", "workflows", "release.yml"), "utf8");

function jobBodies(text: string): Map<string, string> {
  const jobs: Map<string, string> = new Map();
  const start = text.search(/^jobs:\s*$/m);
  assert.ok(start >= 0, "release.yml has no jobs: map");
  const body = text.slice(start + "jobs:".length);
  const re = /^  ([A-Za-z0-9_-]+):\s*$/gm;
  const hits: { name: string; index: number }[] = [];
  for (const m of body.matchAll(re)) {
    hits.push({ name: m[1]!, index: m.index! });
  }
  for (let i = 0; i < hits.length; i += 1) {
    const end = i + 1 < hits.length ? hits[i + 1]!.index : body.length;
    jobs.set(hits[i]!.name, body.slice(hits[i]!.index, end));
  }
  return jobs;
}

describe("release.yml static shape", () => {
  it("the MCP Registry step comes after the npm readback and the post-release suite", () => {
    const npmReadback = yml.indexOf("the registry answers with this version");
    const post = yml.indexOf("npm run test:post-release");
    const oidc = yml.indexOf("./mcp-publisher login github-oidc");
    assert.ok(npmReadback >= 0, "npm readback step title is gone");
    assert.ok(post >= 0, "test:post-release is gone");
    assert.ok(oidc >= 0, "mcp-publisher login github-oidc is absent");
    assert.ok(oidc > npmReadback, "registry login is not after the npm readback");
    assert.ok(oidc > post, "registry login is not after test:post-release");
  });

  it("mcp-publisher version and sha256 are pinned and bound to each other", () => {
    const version = yml.match(/MCP_PUBLISHER_VERSION:\s*"(\d+\.\d+\.\d+)"/);
    const sha = yml.match(/MCP_PUBLISHER_SHA256:\s*"([a-f0-9]{64})"/);
    assert.ok(version, "MCP_PUBLISHER_VERSION is not a pinned x.y.z string");
    assert.ok(sha, "MCP_PUBLISHER_SHA256 is not a pinned 64-char hex");
    assert.match(
      yml,
      /releases\/download\/v\$\{MCP_PUBLISHER_VERSION\}\/mcp-publisher_linux_amd64\.tar\.gz/,
      "download URL does not use the pinned version",
    );
    assert.match(
      yml,
      /echo "\$MCP_PUBLISHER_SHA256  mcp-publisher_linux_amd64\.tar\.gz"/,
      "sha256 check is not bound to the pinned digest",
    );
    assert.match(
      yml,
      new RegExp(`MCP_PUBLISHER_VERSION:\\s*"${version[1]}"[\\s\\S]*MCP_PUBLISHER_SHA256:\\s*"${sha[1]}"`),
      "version and sha256 are not declared together",
    );
  });

  it("contents: write lives only on the release job", () => {
    const jobs = jobBodies(yml);
    const writers = [...jobs.entries()].filter(([, body]) => /contents:\s*write/.test(body));
    assert.deepEqual(
      writers.map(([name]) => name),
      ["release"],
      `contents: write must be only on the release job; found on ${writers.map(([n]) => n).join(",") || "none"}`,
    );
    assert.ok(jobs.has("publish"), "publish job is missing");
    assert.match(jobs.get("publish")!, /contents:\s*read/, "publish job lost contents: read");
    assert.doesNotMatch(jobs.get("publish")!, /contents:\s*write/);
  });

  it("the bundle step refuses a manifest that is not the tag", () => {
    assert.match(yml, /manifest\.json/, "bundle step does not open manifest.json");
    assert.match(
      yml,
      /manifest version .* tag|tag .* manifest version/i,
      "bundle step does not compare manifest version to the tag",
    );
  });
});
