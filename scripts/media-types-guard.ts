/**
 * The media type names the packages carry, the names the draft's IANA
 * Considerations registers, and the count that section states in prose
 * are three declarations of one fact. 0.9.0 shipped six names while -07
 * registered five: `application/cedulon-inclusion+cbor` signs and
 * verifies witness receipts in packages/checkpoint and appears in no
 * template. A guard that read both sides from the same file could not
 * have seen it; this one reads the code from packages/*\/src and the
 * names from the draft, and lets them disagree out loud.
 *
 * A name counts as carried when it appears in a source file at all,
 * constant or bare literal, so a literal that bypasses the CTY_*
 * exports is still measured.
 */

export type MediaTypeDiff = {
  /** Carried by the packages, registered by no template. */
  codeOnly: string[];
  /** Registered by a template, carried by no package. */
  draftOnly: string[];
  /** Templates the IANA section holds. */
  templateCount: number;
};

const NAME = /application\/cedulon-[a-z0-9-]+\+cbor/g;

/** Every cedulon media type name the given sources carry. */
export function codeMediaTypes(sources: readonly string[]): string[] {
  const names = new Set<string>();
  for (const src of sources) {
    for (const m of src.matchAll(NAME)) {
      names.add(m[0]);
    }
  }
  return [...names].sort();
}

/** The IANA Considerations section: its heading up to the next top-level heading. */
export function ianaSection(md: string): string {
  const start = md.search(/^# IANA Considerations\b/m);
  if (start < 0) {
    throw new Error("draft has no '# IANA Considerations' heading");
  }
  const rest = md.slice(start);
  const next = rest.slice(1).search(/^# /m);
  return next < 0 ? rest : rest.slice(0, next + 1);
}

/** Names the IANA section registers: one `Subtype name:` per template. */
export function draftMediaTypes(md: string): string[] {
  const names = new Set<string>();
  const subtype = /^Subtype name:[ \t]*\r?\n:[ \t]*(cedulon-[a-z0-9-]+\+cbor)[ \t]*$/gm;
  for (const m of ianaSection(md).matchAll(subtype)) {
    names.add(`application/${m[1]}`);
  }
  return [...names].sort();
}

const WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

/**
 * Every count the IANA prose states about its own templates
 * ("registration of five media types", "The five templates follow").
 */
export function statedCounts(md: string): number[] {
  const out: number[] = [];
  const pattern = /\b(one|two|three|four|five|six|seven|eight|nine|ten|\d+) (?:media types|templates)\b/gi;
  for (const m of ianaSection(md).matchAll(pattern)) {
    const w = m[1].toLowerCase();
    out.push(w in WORDS ? WORDS[w] : Number(w));
  }
  return out;
}

export function mediaTypeDiff(sources: readonly string[], md: string): MediaTypeDiff {
  const code = codeMediaTypes(sources);
  const draft = draftMediaTypes(md);
  return {
    codeOnly: code.filter((n) => !draft.includes(n)),
    draftOnly: draft.filter((n) => !code.includes(n)),
    templateCount: draft.length,
  };
}
