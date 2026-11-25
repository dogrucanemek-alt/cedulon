import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  gitHistoryDependencyFailures,
  scanTestsForGitHistory,
} from "../scripts/git-history-guard.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const probe = readFileSync(
  join(root, "tests", "fixtures", "wording-red", "git-history-read-probe.ts.txt"),
  "utf8",
);

describe("tests do not read git history", () => {
  it("RED: a prior test that read an old revision through a git object is caught", () => {
    const failures = gitHistoryDependencyFailures(probe, "tests/fixtures/wording-red/git-history-read-probe.ts.txt");
    assert.ok(
      failures.some((f) => /invokes git/.test(f.detail)),
      failures.map((f) => f.detail).join(" | "),
    );
    assert.ok(
      failures.some((f) => /<rev>:<path>/.test(f.detail)),
      failures.map((f) => f.detail).join(" | "),
    );
  });

  it("GREEN: every tests/*.test.ts source is free of git-object reads", () => {
    assert.deepEqual(scanTestsForGitHistory(root), []);
  });
});
