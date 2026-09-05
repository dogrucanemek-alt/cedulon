import { strict as assert } from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
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
  it("the MCP Registry step comes after the npm readback", () => {
    const npmReadback = yml.indexOf("the registry answers with this version");
    const oidc = yml.indexOf("./mcp-publisher login github-oidc");
    assert.ok(npmReadback >= 0, "npm readback step title is gone");
    assert.ok(oidc >= 0, "mcp-publisher login github-oidc is absent");
    assert.ok(oidc > npmReadback, "registry login is not after the npm readback");
  });

  // test:post-release is red on every tagged run by design (STATUS moves
  // after the publish). Sitting in the publish job, it stopped the registry
  // and bundle steps from ever running on v0.12.0. It lives in its own job.
  it("test:post-release is in its own job, and neither publish nor release depends on it", () => {
    const jobs = jobBodies(yml);
    assert.ok(jobs.has("post-release"), "post-release job is missing");
    assert.match(jobs.get("post-release")!, /npm run test:post-release/, "post-release job does not run the check");
    assert.doesNotMatch(jobs.get("publish")!, /npm run test:post-release/, "publish job still runs test:post-release");
    assert.doesNotMatch(jobs.get("release")!, /npm run test:post-release/, "release job runs test:post-release");
    assert.match(jobs.get("release")!, /^\s{4}needs:\s*publish\s*$/m, "release job must need publish only");
    assert.match(jobs.get("post-release")!, /^\s{4}needs:\s*publish\s*$/m, "post-release job must need publish only");
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

  // v0.13.0 (5 September): the npm readback saw the version in the
  // metadata and let the release job start, but the tarballs of two
  // packages answered 404 for about eight minutes behind the CDN, so the
  // bundle's npm install failed and the release needed a manual rerun.
  // The readback asks for the bytes, not only the number, and the bundle
  // job asks again before it builds.
  it("the npm readback probes each tarball, and the release job waits for the tarballs before building", () => {
    const jobs = jobBodies(yml);
    const publish = jobs.get("publish");
    const release = jobs.get("release");
    assert.ok(publish && release, "release.yml has no publish and release jobs");
    assert.match(publish, /dist\.tarball/, "the readback does not read dist.tarball");
    assert.match(publish, /curl .*-I .*tarball/, "the readback does not HEAD the tarball URL");
    const build = release.indexOf("npm run mcpb");
    const probe = release.indexOf("dist.tarball");
    assert.ok(build > 0, "the release job does not build the bundle");
    assert.ok(probe > 0 && probe < build, "the release job builds the bundle before it has probed the tarballs");
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
    // Any other trigger (workflow_call, repository_dispatch, pull_request, schedule)
    // would be a second way in that the dispatch check above does not see.
    const triggers = [...on[1]!.matchAll(/^  ([a-z_]+):/gm)].map((m) => m[1]);
    assert.deepEqual(triggers, ["push"], `on: has triggers other than push: ${triggers.join(",")}`);
    const pushKeys = [...on[1]!.matchAll(/^    ([a-z_]+):/gm)].map((m) => m[1]);
    assert.deepEqual(pushKeys, ["tags"], `push: filters other than tags: ${pushKeys.join(",")}`);
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

describe("release.yml names the public packages", () => {
  // The two loops were typed by hand when there were eight public packages.
  // A ninth (effect-extract) landed with the decision profile, audit began
  // importing it at runtime, and the loops still said eight: a tag would
  // have published an audit that cannot install. Compare the loops to the
  // workspace instead of trusting the hand that edits both.
  const publicPackages = new Map<string, string[]>();
  for (const dir of readdirSync(join(root, "packages"))) {
    let raw: string;
    try {
      raw = readFileSync(join(root, "packages", dir, "package.json"), "utf8");
    } catch {
      continue;
    }
    const pkg = JSON.parse(raw) as { name?: string; private?: boolean; dependencies?: Record<string, string> };
    if (!pkg.name || pkg.private) continue;
    const deps = Object.keys(pkg.dependencies ?? {})
      .filter((d) => d.startsWith("@cedulon/"))
      .map((d) => d.slice("@cedulon/".length));
    publicPackages.set(pkg.name.slice("@cedulon/".length), deps);
  }
  // Comment lines are dropped before matching, so a correct loop written in
  // a comment cannot stand in for a wrong one in the run block; and a loop
  // whose list is a variable is a loop this guard cannot read, so it fails
  // rather than passing on whatever the literal ones say.
  const runLines = yml.split("\n").filter((l) => !/^\s*#/.test(l));
  const loopLines = runLines.filter((l) => /\bfor p in /.test(l));
  const loops = loopLines.map((l) => {
    const m = /for p in ((?:[a-z0-9-]+ )+[a-z0-9-]+); do/.exec(l);
    assert.ok(m, `a package loop this guard cannot read: ${l.trim()}`);
    return m![1]!.split(" ");
  });

  it("every public workspace package is in every publish loop, and nothing else is", () => {
    assert.ok(loops.length >= 2, "expected the publish loop and the readback loop");
    const expected = [...publicPackages.keys()].sort();
    for (const loop of loops) {
      assert.deepEqual([...loop].sort(), expected, `loop "${loop.join(" ")}" is not the public workspace`);
    }
  });

  it("a package that has never been published stops the run before the first publish", () => {
    const publish = yml.indexOf("- name: send them in dependency order");
    const exists = yml.indexOf("- name: every package already exists on npm");
    assert.ok(exists >= 0, "no pre-flight step asking npm whether each package exists");
    assert.ok(exists < publish, "the existence check runs after the publish loop, too late to stop it");
    assert.match(yml.slice(exists, publish), /npm view "@cedulon\/\$p" version/, "the check does not ask npm");
    assert.match(yml.slice(exists, publish), /\[ "\$fail" = 0 \]/, "the check does not fail the job");
  });

  it("each loop publishes a package after every @cedulon dependency it has", () => {
    for (const loop of loops) {
      for (const [name, deps] of publicPackages) {
        for (const dep of deps) {
          assert.ok(loop.includes(dep), `@cedulon/${name} depends on @cedulon/${dep}, which no loop publishes`);
          assert.ok(
            loop.indexOf(dep) < loop.indexOf(name),
            `@cedulon/${name} depends on @cedulon/${dep} but the loop sends ${name} first`,
          );
        }
      }
    }
  });
});
