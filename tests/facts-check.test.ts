import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  compareFacts,
  declaredFacts,
  isNpmOrGithubUrl,
  probeTarget,
  type FactSources,
} from "../scripts/facts-check.ts";

/** Every source agreeing with the declaration. */
function agreeing(): Required<FactSources> {
  const declared = declaredFacts();
  const urlStatuses: Record<string, number> = {};
  for (const url of declared.urls) {
    if (isNpmOrGithubUrl(url)) urlStatuses[url] = 200;
  }
  return {
    npmVerax: Object.fromEntries(declared.veraxPackages.map((name) => [name, declared.veraxVersion])),
    veraxCedulonDeps: Object.fromEntries(
      Object.entries(declared.veraxCedulonDeps).map(([name, deps]) => [
        name,
        Object.fromEntries(deps.map((dep) => [dep, declared.cedulonVersion])),
      ]),
    ),
    dataciteVersion: declared.veraxArchivedVersion,
    urlStatuses,
  };
}

describe("facts-check compares the declaration to a third party", () => {
  it("RED: a stale npm latest is caught", () => {
    const problems = compareFacts(declaredFacts(), { npmVerax: { "@verax-ai/body": "9.9.9" } });
    assert.ok(problems.length > 0, "a fake latest must not pass");
    assert.ok(
      problems.some((line) => line.includes("9.9.9")),
      problems.join(" | "),
    );
  });

  it("RED: a stale latest on another Verax package the entry names is caught", () => {
    const problems = compareFacts(declaredFacts(), {
      npmVerax: { "@verax-ai/inventory": "9.9.9" },
    });
    assert.ok(
      problems.some((line) => line.includes("@verax-ai/inventory") && line.includes("9.9.9")),
      problems.join(" | "),
    );
  });

  it("GREEN: matching sources produce no deviations", () => {
    assert.deepEqual(compareFacts(declaredFacts(), agreeing()), []);
  });

  it("RED: a @cedulon/* dependency of the named Verax release that differs from the entry is caught", () => {
    const sources = agreeing();
    sources.veraxCedulonDeps["@verax-ai/proxy"]!["@cedulon/audit"] = "9.9.9";
    const problems = compareFacts(declaredFacts(), sources);
    assert.ok(
      problems.some((line) => line.includes("@cedulon/audit") && line.includes("9.9.9")),
      problems.join(" | "),
    );
  });

  it("RED: a Verax package that declares none of the expected @cedulon/* packages is caught", () => {
    const sources = agreeing();
    sources.veraxCedulonDeps["@verax-ai/body"] = {};
    const problems = compareFacts(declaredFacts(), sources);
    assert.ok(problems.length > 0, "an empty dependency set must not pass");
  });

  it("RED: a package dropped from one Verax package is caught while the other still declares it", () => {
    const sources = agreeing();
    delete sources.veraxCedulonDeps["@verax-ai/body"]!["@cedulon/checkpoint"];
    const problems = compareFacts(declaredFacts(), sources);
    assert.ok(
      problems.some((line) => line.includes("@verax-ai/body") && line.includes("@cedulon/checkpoint")),
      problems.join(" | "),
    );
  });

  it("RED: a @cedulon/* package the entry does not name for that Verax package is caught", () => {
    const sources = agreeing();
    sources.veraxCedulonDeps["@verax-ai/body"]!["@cedulon/audit"] = declaredFacts().cedulonVersion;
    const problems = compareFacts(declaredFacts(), sources);
    assert.ok(
      problems.some((line) => line.includes("@verax-ai/body") && line.includes("@cedulon/audit")),
      problems.join(" | "),
    );
  });

  it("a newer @cedulon/* on npm is not a deviation: the entry names what Verax depends on", () => {
    const sources = agreeing();
    assert.deepEqual(compareFacts(declaredFacts(), { veraxCedulonDeps: sources.veraxCedulonDeps }), []);
  });

  it("RED: a Zenodo archive that moved past the declared archived version is caught", () => {
    const problems = compareFacts(declaredFacts(), { dataciteVersion: "9.9.9" });
    assert.ok(
      problems.some((line) => line.includes("9.9.9")),
      problems.join(" | "),
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
