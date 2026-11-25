/**
 * The living draft and STATUS.md can agree with each other and still
 * be wrong. Both copies are handwritten. This script is the third
 * party: it reads the npm latest of each Verax package the entry
 * names, and the @cedulon/* dependencies that the named release of
 * @verax-ai/body and @verax-ai/proxy declares, package by package; the
 * concept DOI off DataCite; asks the registry whether the named
 * packages exist, and HEAD-checks the GitHub URLs. The entry says which
 * @cedulon/* release Verax depends on, so the newest @cedulon/* on npm
 * is not the source for it. Every draft source in spec/ with no archive
 * text beside it is asked for at the IETF archive, and one the archive
 * has posted is refused until spec/ carries its text.
 *
 * It needs the network, so it is not part of `npm test`. The
 * comparison itself is a pure function; the suite calls that with
 * fixtures and never opens a socket. npm package pages are asked at
 * the registry, not the website: the site answers robots with 403.
 */

import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CEDULON_VERSION,
  REQUIRED_URLS,
  VERAX_ARCHIVED_VERSION,
  VERAX_CEDULON_DEPS,
  VERAX_PACKAGES,
  VERAX_VERSION,
} from "./impl-status-verax.ts";

export type DeclaredFacts = {
  veraxVersion: string;
  veraxArchivedVersion: string;
  cedulonVersion: string;
  veraxPackages: readonly string[];
  veraxCedulonDeps: Readonly<Record<string, readonly string[]>>;
  conceptDoi: string;
  urls: readonly string[];
};

/**
 * A package missing from npmVerax or veraxCedulonDeps was not read; the
 * fetch problem is reported where the read failed, not again here.
 */
export type FactSources = {
  /** Verax package → npm latest. */
  npmVerax?: Record<string, string>;
  /** Verax package → the @cedulon/* dependencies its VERAX_VERSION manifest declares. */
  veraxCedulonDeps?: Record<string, Record<string, string>>;
  dataciteVersion?: string;
  urlStatuses?: Record<string, number>;
};

export function declaredFacts(): DeclaredFacts {
  const doiUrl = REQUIRED_URLS.find((u) => u.includes("doi.org/10.5281/zenodo"));
  if (!doiUrl) throw new Error("REQUIRED_URLS has no Zenodo DOI");
  return {
    veraxVersion: VERAX_VERSION,
    veraxArchivedVersion: VERAX_ARCHIVED_VERSION,
    cedulonVersion: CEDULON_VERSION,
    veraxPackages: VERAX_PACKAGES,
    veraxCedulonDeps: VERAX_CEDULON_DEPS,
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
  for (const [name, latest] of Object.entries(sources.npmVerax ?? {})) {
    if (latest !== declared.veraxVersion) {
      problems.push(`${name} ${declared.veraxVersion} → ${latest}`);
    }
  }
  for (const [name, found] of Object.entries(sources.veraxCedulonDeps ?? {})) {
    const at = `${name}@${declared.veraxVersion}`;
    const expected = declared.veraxCedulonDeps[name] ?? [];
    for (const dep of expected) {
      const version = found[dep];
      if (version === undefined) {
        problems.push(`${at} ${dep} ${declared.cedulonVersion} → not declared`);
      } else if (version !== declared.cedulonVersion) {
        problems.push(`${at} ${dep} ${declared.cedulonVersion} → ${version}`);
      }
    }
    for (const dep of Object.keys(found)) {
      if (!expected.includes(dep)) problems.push(`${at} ${dep} → declared, not in the entry`);
    }
  }
  if (
    sources.dataciteVersion !== undefined &&
    sources.dataciteVersion !== declared.veraxArchivedVersion
  ) {
    problems.push(
      `${declared.conceptDoi} ${declared.veraxArchivedVersion} → ${sources.dataciteVersion}`,
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
  return (
    declared.veraxPackages.length +
    Object.keys(declared.veraxCedulonDeps).length +
    1 +
    declared.urls.filter(isNpmOrGithubUrl).length
  );
}

type NpmAbbreviated = { "dist-tags"?: { latest?: unknown } };
type NpmManifest = { dependencies?: Record<string, unknown> };
type DataCiteDoc = { data?: { attributes?: { version?: unknown } } };

export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type NetworkRetryOptions = {
  fetch?: FetchLike;
  /** Total attempts including the first. Default 3. */
  attempts?: number;
  /** Pause between attempts. Default 200ms; tests set 0. */
  delayMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

/** Fetch rejection / timeout class failures that may clear on retry. */
export function isNetworkFailure(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  if (!(error instanceof Error)) return false;
  if (error.name === "AbortError") return true;
  return /fetch failed|network|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket/i.test(
    error.message,
  );
}

export function isRetryableHttpStatus(status: number): boolean {
  return status >= 500 && status < 600;
}

/**
 * Retry only on network failure or 5xx. 4xx, value-shape problems, and other
 * HTTP answers are returned or thrown on the first attempt.
 */
export async function fetchWithNetworkRetry(
  input: string | URL,
  init?: RequestInit,
  opts: NetworkRetryOptions = {},
): Promise<Response> {
  const fetchImpl = opts.fetch ?? globalThis.fetch;
  const attempts = opts.attempts ?? 3;
  const delayMs = opts.delayMs ?? 200;
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  let lastError: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetchImpl(input, init);
      if (isRetryableHttpStatus(res.status) && i < attempts) {
        await sleep(delayMs);
        continue;
      }
      return res;
    } catch (error) {
      lastError = error;
      if (!isNetworkFailure(error) || i >= attempts) throw error;
      await sleep(delayMs);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function npmLatest(name: string, opts: NetworkRetryOptions): Promise<string> {
  const res = await fetchWithNetworkRetry(
    `https://registry.npmjs.org/${name.replace("/", "%2f")}`,
    { headers: { accept: "application/vnd.npm.install-v1+json" } },
    opts,
  );
  if (!res.ok) throw new Error(`npm ${res.status}`);
  const doc = (await res.json()) as NpmAbbreviated;
  const version = doc["dist-tags"]?.latest;
  if (typeof version !== "string") throw new Error("npm has no latest tag");
  return version;
}

async function cedulonDependencies(
  name: string,
  version: string,
  opts: NetworkRetryOptions,
): Promise<Record<string, string>> {
  const res = await fetchWithNetworkRetry(
    `https://registry.npmjs.org/${name.replace("/", "%2f")}/${version}`,
    undefined,
    opts,
  );
  if (!res.ok) throw new Error(`npm ${res.status}`);
  const doc = (await res.json()) as NpmManifest;
  const found: Record<string, string> = {};
  for (const [dep, range] of Object.entries(doc.dependencies ?? {})) {
    if (dep.startsWith("@cedulon/")) found[dep] = String(range);
  }
  return found;
}

async function dataciteVersion(doi: string, opts: NetworkRetryOptions): Promise<string> {
  const res = await fetchWithNetworkRetry(
    `https://api.datacite.org/dois/${doi}`,
    undefined,
    opts,
  );
  if (!res.ok) throw new Error(`DataCite ${res.status}`);
  const doc = (await res.json()) as DataCiteDoc;
  const version = doc.data?.attributes?.version;
  if (typeof version !== "string") throw new Error("DataCite has no version");
  return version;
}

async function probeUrl(url: string, opts: NetworkRetryOptions): Promise<number> {
  const target = probeTarget(url);
  if (target !== url) {
    const res = await fetchWithNetworkRetry(
      target,
      { headers: { accept: "application/vnd.npm.install-v1+json" } },
      opts,
    );
    return res.status;
  }
  const head = await fetchWithNetworkRetry(url, { method: "HEAD" }, opts);
  if (isLiveStatus(head.status)) return head.status;
  const get = await fetchWithNetworkRetry(url, { method: "GET" }, opts);
  return get.status;
}

/**
 * `posted`: the archive has the text and spec/ does not carry it, so the
 * tree still treats a posted revision as living. `unread`: the archive
 * gave no answer this check can read; that is not a pass.
 */
export type ArchiveComparison = { posted: string[]; unread: string[] };

export function archiveUrl(draft: string): string {
  return `https://www.ietf.org/archive/id/${draft}.txt`;
}

/** Every draft source in `specDir` with no archive `.txt` beside it. */
export function unpostedDraftNames(specDir: string): string[] {
  return readdirSync(specDir)
    .map((f) => /^(draft-dogru-cedulon-[a-z0-9-]+)\.md$/.exec(f))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => m[1]!)
    .filter((name) => !existsSync(join(specDir, `${name}.txt`)))
    .sort();
}

/**
 * Archive answer per draft: an HTTP status, or the label of a read that
 * failed. 404 is the only answer that passes.
 */
export function compareArchive(
  drafts: readonly string[],
  statuses: Readonly<Record<string, number | string>>,
): ArchiveComparison {
  const posted: string[] = [];
  const unread: string[] = [];
  for (const draft of drafts) {
    const status = statuses[draft];
    if (status === 200) {
      posted.push(`posted at the IETF archive but not carried in spec/: ${draft}.txt`);
    } else if (status !== 404) {
      unread.push(`${archiveUrl(draft)} → ${status ?? "missing"}`);
    }
  }
  return { posted, unread };
}

export async function collectArchiveStatuses(
  drafts: readonly string[],
  opts: NetworkRetryOptions = {},
): Promise<Record<string, number | string>> {
  const statuses: Record<string, number | string> = {};
  for (const draft of drafts) {
    const url = archiveUrl(draft);
    try {
      const head = await fetchWithNetworkRetry(url, { method: "HEAD" }, opts);
      statuses[draft] =
        head.status === 200 || head.status === 404
          ? head.status
          : (await fetchWithNetworkRetry(url, { method: "GET" }, opts)).status;
    } catch (error) {
      statuses[draft] = sourceLabel(error);
    }
  }
  return statuses;
}

function sourceLabel(error: unknown): string {
  return error instanceof Error ? error.message : "unreachable";
}

/** Collect third-party facts; `opts.fetch` keeps the suite off the network. */
export async function collectSources(
  declared: DeclaredFacts,
  opts: NetworkRetryOptions = {},
): Promise<{
  sources: FactSources;
  fetchProblems: string[];
}> {
  const fetchProblems: string[] = [];
  const sources: FactSources = { urlStatuses: {} };

  sources.npmVerax = {};
  for (const name of declared.veraxPackages) {
    try {
      sources.npmVerax[name] = await npmLatest(name, opts);
    } catch (error) {
      fetchProblems.push(`${name} ${declared.veraxVersion} → ${sourceLabel(error)}`);
    }
  }

  sources.veraxCedulonDeps = {};
  for (const name of Object.keys(declared.veraxCedulonDeps)) {
    try {
      sources.veraxCedulonDeps[name] = await cedulonDependencies(
        name,
        declared.veraxVersion,
        opts,
      );
    } catch (error) {
      fetchProblems.push(
        `${name}@${declared.veraxVersion} @cedulon/* ${declared.cedulonVersion} → ${sourceLabel(error)}`,
      );
    }
  }

  try {
    sources.dataciteVersion = await dataciteVersion(declared.conceptDoi, opts);
  } catch (error) {
    fetchProblems.push(
      `${declared.conceptDoi} ${declared.veraxArchivedVersion} → ${sourceLabel(error)}`,
    );
  }

  for (const url of declared.urls) {
    if (!isNpmOrGithubUrl(url)) continue;
    try {
      sources.urlStatuses![url] = await probeUrl(url, opts);
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
  const drafts = unpostedDraftNames(join(dirname(fileURLToPath(import.meta.url)), "..", "spec"));
  const archive = compareArchive(drafts, await collectArchiveStatuses(drafts));
  const problems = [
    ...fetchProblems,
    ...compareFacts(declared, sources),
    ...archive.unread,
    ...archive.posted,
  ];
  if (problems.length > 0) {
    for (const line of problems) console.error(line);
    process.exitCode = 1;
    return;
  }
  console.log(
    `checked ${factCount(declared)} facts against npm and DataCite, ` +
      `and ${drafts.length} unposted drafts against the IETF archive`,
  );
}

if (import.meta.filename === process.argv[1]) {
  await main();
}
