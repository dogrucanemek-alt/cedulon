import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  compareFacts,
  declaredFacts,
  isNpmOrGithubUrl,
  probeTarget,
} from "../scripts/facts-check.ts";

describe("facts-check compares the declaration to a third party", () => {
  it("RED: a stale npm latest is caught", () => {
    const problems = compareFacts(declaredFacts(), { npmVerax: "9.9.9" });
    assert.ok(problems.length > 0, "a fake latest must not pass");
    assert.ok(
      problems.some((line) => line.includes("9.9.9")),
      problems.join(" | "),
    );
  });

  it("GREEN: matching sources produce no deviations", () => {
    const declared = declaredFacts();
    const urlStatuses: Record<string, number> = {};
    for (const url of declared.urls) {
      if (isNpmOrGithubUrl(url)) urlStatuses[url] = 200;
    }
    assert.deepEqual(
      compareFacts(declared, {
        npmVerax: declared.veraxVersion,
        npmCedulon: declared.cedulonVersion,
        dataciteVersion: declared.veraxVersion,
        urlStatuses,
      }),
      [],
    );
  });
});

describe("probeTarget asks the registry, not the website", () => {
  it("maps an npm package page to the registry endpoint", () => {
    assert.equal(
      probeTarget("https://www.npmjs.com/package/@verax-ai/body"),
      "https://registry.npmjs.org/@verax-ai%2fbody",
    );
  });

  it("leaves a GitHub URL unchanged", () => {
    assert.equal(
      probeTarget("https://github.com/verax-ai/verax"),
      "https://github.com/verax-ai/verax",
    );
  });
});
