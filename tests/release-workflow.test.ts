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

  // A workflow_dispatch run had github.ref on a branch: the tag guard was
  // skipped, npm publish ran, and the run went green with nothing checked
  // (gate review of 25c24c3, FIX-3). The workflow answers to tags only.
  it("the workflow is triggered by tags only, and the publish job is locked to them", () => {
    const on = yml.match(/^on:\s*\n([\s\S]*?)(?=^\S)/m);
    assert.ok(on, "release.yml has no on: block");
    assert.doesNotMatch(on[1]!, /workflow_dispatch/, "workflow_dispatch would run publish steps off a branch");
    assert.match(on[1]!, /push:\s*\n\s*tags:/, "the push trigger is not on tags");
    const publish = jobBodies(yml).get("publish")!;
    assert.match(publish, /^\s{4}if:\s*startsWith\(github\.ref, 'refs\/tags\/'\)/m, "publish job is not locked to tags at job level");
  });

  // The first awk took the first paragraph only and never touched the notes
  // of an existing release (gate review of 25c24c3, FIX-4). The section is
  // produced by a tested script and written on both the create and the
  // upload path.
  it("release notes come from scripts/release-notes.ts and are written on both paths", () => {
    assert.match(yml, /scripts\/release-notes\.ts/, "notes are not produced by the tested script");
    assert.doesNotMatch(yml, /awk -v t=/, "the paragraph-cutting awk is still there");
    assert.match(yml, /gh release edit "\$GITHUB_REF_NAME" --notes-file/, "the upload path does not update the notes");
  });

  it("the bundle check does not reach for python", () => {
    assert.doesNotMatch(yml, /python3/, "manifest check still depends on python3");
    assert.match(yml, /unzip -p "\$bundle" manifest\.json/, "manifest is not read with unzip");
  });
});
