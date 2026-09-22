/**
 * The living draft and STATUS.md both name Verax as a second
 * implementation. Those two copies have to say the same URLs and the
 * same versions; a hand-kept pair is how a DOI or a package version
 * drifts in one file and not the other.
 *
 * The entry is a fact, not a claim of independence. "first", "only"
 * and "independent" (beyond the required same-author sentence) are
 * refused here so they cannot be typed in by habit.
 */

export const REQUIRED_SENTENCE =
  "Same author as this document; not an independent implementation.";

export const REQUIRED_URLS = [
  "https://github.com/verax-ai/verax",
  "https://www.npmjs.com/package/@verax-ai/body",
  "https://www.npmjs.com/package/@verax-ai/proxy",
  "https://www.npmjs.com/package/@verax-ai/inventory",
  "https://doi.org/10.5281/zenodo.22811593",
] as const;

export const VERAX_VERSION = "0.2.2";
export const CEDULON_VERSION = "0.13.1";

const DRAFT_START = "A second implementation is named here.";
const STATUS_START = "## Second implementation (Verax)";
const FORBIDDEN = /\b(first|only|independent)\b/gi;

export function extractDraftVerax(draft: string): string | null {
  const start = draft.indexOf(DRAFT_START);
  if (start < 0) return null;
  const rest = draft.slice(start);
  const end = rest.search(/\n## /);
  return (end < 0 ? rest : rest.slice(0, end)).trim();
}

export function extractStatusVerax(status: string): string | null {
  const start = status.indexOf(STATUS_START);
  if (start < 0) return null;
  const rest = status.slice(start);
  const end = rest.slice(STATUS_START.length).search(/\n## /);
  return (end < 0 ? rest : rest.slice(0, STATUS_START.length + end)).trim();
}

export function urlsOf(text: string): string[] {
  const found = [...text.matchAll(/https:\/\/[^\s>)]+/g)].map((m) =>
    m[0].replace(/[.,;]+$/, ""),
  );
  return [...new Set(found)].sort();
}

export function flatten(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function forbiddenHits(block: string): string[] {
  const stripped = flatten(block).replaceAll(REQUIRED_SENTENCE, "");
  const hits: string[] = [];
  for (const m of stripped.matchAll(FORBIDDEN)) {
    hits.push(m[0]);
  }
  return hits;
}

export function implStatusVeraxFailures(draft: string, status: string): string[] {
  const failures: string[] = [];
  const draftBlock = extractDraftVerax(draft);
  const statusBlock = extractStatusVerax(status);
  if (!draftBlock) {
    failures.push("the living draft has no Verax implementation entry");
  }
  if (!statusBlock) {
    failures.push("docs/STATUS.md has no Verax implementation entry");
  }
  if (!draftBlock || !statusBlock) return failures;

  if (!flatten(draftBlock).includes(REQUIRED_SENTENCE)) {
    failures.push("the living draft is missing the same-author sentence");
  }
  if (!flatten(statusBlock).includes(REQUIRED_SENTENCE)) {
    failures.push("docs/STATUS.md is missing the same-author sentence");
  }

  const draftUrls = urlsOf(draftBlock);
  const statusUrls = urlsOf(statusBlock);
  for (const url of REQUIRED_URLS) {
    if (!draftUrls.includes(url)) failures.push(`the living draft omits ${url}`);
    if (!statusUrls.includes(url)) failures.push(`docs/STATUS.md omits ${url}`);
  }
  const onlyDraft = draftUrls.filter((u) => !statusUrls.includes(u));
  const onlyStatus = statusUrls.filter((u) => !draftUrls.includes(u));
  if (onlyDraft.length > 0) {
    failures.push(`URLs in the draft Verax entry but not STATUS: ${onlyDraft.join(", ")}`);
  }
  if (onlyStatus.length > 0) {
    failures.push(`URLs in STATUS but not the draft Verax entry: ${onlyStatus.join(", ")}`);
  }

  if (!draftBlock.includes(VERAX_VERSION) || !statusBlock.includes(VERAX_VERSION)) {
    failures.push(`both entries must name Verax ${VERAX_VERSION}`);
  }
  if (
    !draftBlock.includes(`@cedulon/*`) ||
    !draftBlock.includes(CEDULON_VERSION) ||
    !statusBlock.includes(`@cedulon/*`) ||
    !statusBlock.includes(CEDULON_VERSION)
  ) {
    failures.push(`both entries must name @cedulon/* ${CEDULON_VERSION}`);
  }

  for (const hit of forbiddenHits(draftBlock)) {
    failures.push(`the draft Verax entry contains "${hit}"`);
  }
  for (const hit of forbiddenHits(statusBlock)) {
    failures.push(`the STATUS Verax entry contains "${hit}"`);
  }
  return failures;
}
