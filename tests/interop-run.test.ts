import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { latestDraftPath } from "../scripts/latest-draft.ts";
import { documentedRuns, runDocumentedCommand } from "./doc-runs.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const doc = readFileSync(join(root, "docs", "INTEROP_RUN.md"), "utf8");

describe("interop-run doc", () => {
  const runs = documentedRuns(doc);
  const required = runs.filter((r) => !r.optional);

  it("does not restate the suite size", () => {
    const claim = doc.match(/\*?\*?\d+\*?\*?\s+tests?\s+passing/i);
    assert.equal(claim, null, `remove the hard-coded count ${JSON.stringify(claim?.[0])}`);
  });

  it("does not hard-code a commit SHA", () => {
    // A commit cannot name itself, so any SHA written here points at an
    // earlier commit and dies when history is rewritten. One such pin was
    // already mailed-ready and unreachable. The SHA belongs in the thread.
    const sha = doc.match(/\b[0-9a-f]{7,40}\b/);
    assert.equal(sha, null, `remove the hard-coded SHA ${JSON.stringify(sha?.[0])}`);
  });

  it("does not restate a digest the living draft already carries", () => {
    // The runner's environment line and the three archive digests are in the
    // draft's Implementation Status. Written here as well they are two
    // hand-kept copies of one fact, and the copy nobody posts is the one that
    // goes stale. This file carries what only it has - who ran what, in whose
    // words, and on what terms - and points at the draft for the numbers.
    const draft = readFileSync(latestDraftPath(root), "utf8");
    const inDraft = new Set(draft.match(/\b[0-9a-f]{64}\b/g) ?? []);
    const restated = (doc.match(/\b[0-9a-f]{64}\b/g) ?? []).filter((d) => inDraft.has(d));
    assert.deepEqual(
      restated,
      [],
      `these digests are already in the draft; reference it instead: ${restated.join(", ")}`,
    );
  });

  it("names the required commands", () => {
    assert.deepEqual(
      required.map((r) => r.command),
      ["npx tsc --noEmit", "npm run audit", "npm run demo:bypass", "npm run demo:bypasses"],
    );
  });

  it("marks the network steps optional so the suite does not fetch", () => {
    assert.deepEqual(
      runs.filter((r) => r.optional).map((r) => r.command),
      ["npx -y @cedulon/mcp-server", "npm run demo:live"],
    );
  });

  it("documents test:all without a replayable expected-output fence", () => {
    assert.match(doc, /npm run test:all/);
    assert.equal(
      runs.some((r) => r.command === "npm run test:all"),
      false,
      "a fenced expected-output for test:all would recurse into this suite",
    );
  });

  for (const { command, expected } of required) {
    it(`${command} prints what the doc says`, () => {
      const stdout = runDocumentedCommand(command, root);
      assert.equal(stdout, expected);
    });
  }
});
