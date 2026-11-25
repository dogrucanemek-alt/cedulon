import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  collectSources,
  compareFacts,
  declaredFacts,
  fetchWithNetworkRetry,
  isNpmOrGithubUrl,
  probeTarget,
  type FactSources,
  type FetchLike,
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

describe("facts-check retries only network failures", () => {
  it("network failure then success is green with more than one attempt", async () => {
    let calls = 0;
    const fetchImpl: FetchLike = async () => {
      calls += 1;
      if (calls === 1) throw new TypeError("fetch failed");
      return new Response("{}", { status: 200 });
    };
    const res = await fetchWithNetworkRetry("https://example.test/pkg", undefined, {
      fetch: fetchImpl,
      attempts: 3,
      delayMs: 0,
    });
    assert.equal(res.status, 200);
    assert.equal(calls, 2);
  });

  it("network failure on every attempt stays red", async () => {
    let calls = 0;
    const fetchImpl: FetchLike = async () => {
      calls += 1;
      throw new TypeError("fetch failed");
    };
    await assert.rejects(
      () =>
        fetchWithNetworkRetry("https://example.test/pkg", undefined, {
          fetch: fetchImpl,
          attempts: 3,
          delayMs: 0,
        }),
      /fetch failed/,
    );
    assert.equal(calls, 3);
  });

  it("5xx then success retries; 404 does not", async () => {
    let fiveCalls = 0;
    const fiveThenOk: FetchLike = async () => {
      fiveCalls += 1;
      if (fiveCalls === 1) return new Response("no", { status: 503 });
      return new Response("ok", { status: 200 });
    };
    const ok = await fetchWithNetworkRetry("https://example.test/pkg", undefined, {
      fetch: fiveThenOk,
      attempts: 3,
      delayMs: 0,
    });
    assert.equal(ok.status, 200);
    assert.equal(fiveCalls, 2);

    let fourCalls = 0;
    const four: FetchLike = async () => {
      fourCalls += 1;
      return new Response("missing", { status: 404 });
    };
    const missing = await fetchWithNetworkRetry("https://example.test/pkg", undefined, {
      fetch: four,
      attempts: 3,
      delayMs: 0,
    });
    assert.equal(missing.status, 404);
    assert.equal(fourCalls, 1);
  });

  it("collectSources: persistent network failure names the unreachable source", async () => {
    const declared = declaredFacts();
    const fetchImpl: FetchLike = async () => {
      throw new TypeError("fetch failed");
    };
    const { fetchProblems } = await collectSources(declared, {
      fetch: fetchImpl,
      attempts: 3,
      delayMs: 0,
    });
    assert.ok(fetchProblems.length > 0, "expected fetch problems");
    assert.ok(
      fetchProblems.some((p) => p.includes(declared.conceptDoi) && /fetch failed/.test(p)),
      fetchProblems.join(" | "),
    );
  });
});

