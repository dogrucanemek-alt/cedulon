/**
 * A draft whose filename and docname say -03 must not call itself -02
 * in the voice of the document. Copy-forward from the previous revision
 * left four of those sentences in place; a reader of the submitted .txt
 * meets them first. This scan is the check that would have caught them
 * before they reached the datatracker.
 *
 * Historical mentions of an earlier revision ("-02 stated", "Changes
 * from -02") are not this document speaking as itself and are left
 * alone. "This -NN" / "this -NN" and an Evolution clause that treats
 * the current number as future work are not.
 */

export type IdentityHit = {
  line: number;
  text: string;
  why: string;
};

export function draftRevision(md: string): string | null {
  const m = md.match(/^docname:\s*draft-dogru-cedulon-(\d+)\s*$/m);
  return m ? m[1] : null;
}

export function identityHits(md: string): IdentityHit[] {
  const rev = draftRevision(md);
  if (!rev) {
    return [{ line: 0, text: "", why: "docname: draft-dogru-cedulon-N is missing" }];
  }
  const hits: IdentityHit[] = [];
  const lines = md.split(/\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const text = lines[i];
    for (const m of text.matchAll(/\b[Tt]his -(\d+)\b/g)) {
      if (m[1] !== rev) {
        hits.push({
          line: i + 1,
          text,
          why: `the document calls itself -${m[1]}, docname is -${rev}`,
        });
      }
    }
  }
  // xml2rfc wraps "(-03 or later)" across a line break; scan the joined text.
  const folded = md.replace(/\s+/g, " ");
  const later = /later revisions \(-(\d+) or later\)/.exec(folded);
  if (later && later[1] === rev) {
    hits.push({
      line: 0,
      text: later[0],
      why: `Evolution treats -${rev} as a later revision of itself`,
    });
  }
  return hits;
}
