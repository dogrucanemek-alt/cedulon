/**
 * The living draft and STATUS.md can agree with each other and still
 * be wrong. Both copies are handwritten. This script is the third
 * party: it reads @verax-ai/body and @cedulon/core off the npm
 * registry, the concept DOI off DataCite, asks the registry whether
 * the named packages exist, and HEAD-checks the GitHub URLs.
 *
 * It needs the network, so it is not part of `npm test`. The
 * comparison itself is a pure function; the suite calls that with
 * fixtures and never opens a socket. npm package pages are asked at
 * the registry, not the website: the site answers robots with 403.
 */

import {
  CEDULON_VERSION,
  REQUIRED_URLS,
  VERAX_VERSION,
} from "./impl-status-verax.ts";

export const VERAX_PACKAGE = "@verax-ai/body";
export const CEDULON_PACKAGE = "@cedulon/core";

export type DeclaredFacts = {
  veraxVersion: string;
  cedulonVersion: string;
  conceptDoi: string;
  urls: readonly string[];
};

export type FactSources = {
  npmVerax?: string;
  npmCedulon?: string;
  dataciteVersion?: string;
  urlStatuses?: Record<string, number>;
};

export function declaredFacts(): DeclaredFacts {
  const doiUrl = REQUIRED_URLS.find((u) => u.includes("doi.org/10.5281/zenodo"));
  if (!doiUrl) throw new Error("REQUIRED_URLS has no Zenodo DOI");
  return {
    veraxVersion: VERAX_VERSION,
    cedulonVersion: CEDULON_VERSION,
    conceptDoi: doiUrl.replace("https://doi.org/", ""),
    urls: REQUIRED_URLS,
  };
}

export function isNpmOrGithubUrl(url: string): boolean {
  return (
    url.startsWith("https://www.npmjs.com/") ||
    url.startsWith("https://github.com/")
  );
}

const NPM_PACKAGE_PAGE = "https://www.npmjs.com/package/";

/** Where presence is actually asked. The website is not that place. */
export function probeTarget(url: string): string {
  if (!url.startsWith(NPM_PACKAGE_PAGE)) return url;
  const name = url.slice(NPM_PACKAGE_PAGE.length);
  if (!name) return url;
  return `https://registry.npmjs.org/${name.replace("/", "%2f")}`;
}

function isLiveStatus(status: number): boolean {
  return status >= 200 && status < 400;
}

/** Declared value on the left, source value on the right. */
export function compareFacts(declared: DeclaredFacts, sources: FactSources): string[] {
  const problems: string[] = [];
  if (sources.npmVerax !== undefined && sources.npmVerax !== declared.veraxVersion) {
    problems.push(`${VERAX_PACKAGE} ${declared.veraxVersion} → ${sources.npmVerax}`);
  }
  if (
    sources.npmCedulon !== undefined &&
    sources.npmCedulon !== declared.cedulonVersion
  ) {
    problems.push(`${CEDULON_PACKAGE} ${declared.cedulonVersion} → ${sources.npmCedulon}`);
  }
  if (
    sources.dataciteVersion !== undefined &&
    sources.dataciteVersion !== declared.veraxVersion
  ) {
    problems.push(
      `${declared.conceptDoi} ${declared.veraxVersion} → ${sources.dataciteVersion}`,
    );
  }
  if (sources.urlStatuses !== undefined) {
    for (const url of declared.urls) {
      if (!isNpmOrGithubUrl(url)) continue;
      const status = sources.urlStatuses[url];
      if (status === undefined) {
        problems.push(`${url} → missing`);
        continue;
      }
      if (!isLiveStatus(status)) {
        problems.push(`${url} → ${status}`);
      }
    }
  }
  return problems;
}

export function factCount(declared: DeclaredFacts): number {
  return 3 + declared.urls.filter(isNpmOrGithubUrl).length;
}

type NpmAbbreviated = { "dist-tags"?: { latest?: unknown } };
type DataCiteDoc = { data?: { attributes?: { version?: unknown } } };

async function npmLatest(name: string): Promise<string> {
  const res = await fetch(`https://registry.npmjs.org/${name.replace("/", "%2f")}`, {
    headers: { accept: "application/vnd.npm.install-v1+json" },
  });
  if (!res.ok) throw new Error(`npm ${res.status}`);
  const doc = (await res.json()) as NpmAbbreviated;
  const version = doc["dist-tags"]?.latest;
  if (typeof version !== "string") throw new Error("npm has no latest tag");
  return version;
}

async function dataciteVersion(doi: string): Promise<string> {
  const res = await fetch(`https://api.datacite.org/dois/${doi}`);
  if (!res.ok) throw new Error(`DataCite ${res.status}`);
  const doc = (await res.json()) as DataCiteDoc;
  const version = doc.data?.attributes?.version;
  if (typeof version !== "string") throw new Error("DataCite has no version");
  return version;
}

async function probeUrl(url: string): Promise<number> {
  const target = probeTarget(url);
  if (target !== url) {
    const res = await fetch(target, {
      headers: { accept: "application/vnd.npm.install-v1+json" },
    });
    return res.status;
  }
  const head = await fetch(url, { method: "HEAD" });
  if (isLiveStatus(head.status)) return head.status;
  const get = await fetch(url, { method: "GET" });
  return get.status;
}

function sourceLabel(error: unknown): string {
  return error instanceof Error ? error.message : "unreachable";
}

async function collectSources(declared: DeclaredFacts): Promise<{
  sources: FactSources;
  fetchProblems: string[];
}> {
  const fetchProblems: string[] = [];
  const sources: FactSources = { urlStatuses: {} };

  try {
    sources.npmVerax = await npmLatest(VERAX_PACKAGE);
  } catch (error) {
    fetchProblems.push(`${VERAX_PACKAGE} ${declared.veraxVersion} → ${sourceLabel(error)}`);
  }

  try {
    sources.npmCedulon = await npmLatest(CEDULON_PACKAGE);
  } catch (error) {
    fetchProblems.push(
      `${CEDULON_PACKAGE} ${declared.cedulonVersion} → ${sourceLabel(error)}`,
    );
  }

  try {
    sources.dataciteVersion = await dataciteVersion(declared.conceptDoi);
  } catch (error) {
    fetchProblems.push(
      `${declared.conceptDoi} ${declared.veraxVersion} → ${sourceLabel(error)}`,
    );
  }

  for (const url of declared.urls) {
    if (!isNpmOrGithubUrl(url)) continue;
    try {
      sources.urlStatuses![url] = await probeUrl(url);
    } catch (error) {
      const target = probeTarget(url);
      fetchProblems.push(
        target === url
          ? `${url} → ${sourceLabel(error)}`
          : `${url} → ${target} ${sourceLabel(error)}`,
      );
    }
  }

  return { sources, fetchProblems };
}

async function main(): Promise<void> {
  const declared = declaredFacts();
  const { sources, fetchProblems } = await collectSources(declared);
  const problems = [...fetchProblems, ...compareFacts(declared, sources)];
  if (problems.length > 0) {
    for (const line of problems) console.error(line);
    process.exitCode = 1;
    return;
  }
  console.log(`checked ${factCount(declared)} facts against npm and DataCite`);
}

if (import.meta.filename === process.argv[1]) {
  await main();
}
