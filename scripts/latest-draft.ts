import { readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * The draft a living check should read: the newest revision in the tree.
 *
 * Four guards worked this out separately and three of them worked it out once,
 * as a filename. `draft-identity` was pinned to -03 and let seven "this -03"
 * sentences into -04; the appendix-vector check was pinned to the frozen -01;
 * `stale-claims` and `published-as` were still reading -03 while -04 was the
 * living document. Every one of them was measuring a frozen file to make a
 * claim about a moving one. The computation lives here now so a new revision
 * moves all of them at once.
 *
 * A frozen revision is still the right subject for a check about that
 * revision - those name their file directly and do not call this.
 */
export function latestDraftRevision(specDir: string): string {
  const revisions = readdirSync(specDir)
    .map((f) => /^draft-dogru-cedulon-(\d+)\.md$/.exec(f))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => m[1])
    .sort((a, b) => Number(a) - Number(b));
  if (revisions.length === 0) {
    throw new Error("no draft-dogru-cedulon-NN.md under spec/");
  }
  return revisions[revisions.length - 1]!;
}

export function latestDraftPath(root: string): string {
  const specDir = join(root, "spec");
  return join(specDir, `draft-dogru-cedulon-${latestDraftRevision(specDir)}.md`);
}

/**
 * The newest revision that has been posted. Every posted revision's archive
 * text is carried in the tree beside its source, so the newest `.txt` is the
 * newest posted revision, and a revision that has been opened but not posted
 * has a `.md` and no `.txt`. A check about something done for a posted
 * revision - the deposit made for it, the archive bytes it has - reads this,
 * not `latestDraftRevision`, or it fires the moment the next revision is
 * opened and stays red until that revision is posted.
 */
export function latestPostedRevision(specDir: string): string {
  const revisions = readdirSync(specDir)
    .map((f) => /^draft-dogru-cedulon-(\d+)\.txt$/.exec(f))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => m[1])
    .sort((a, b) => Number(a) - Number(b));
  if (revisions.length === 0) {
    throw new Error("no draft-dogru-cedulon-NN.txt under spec/");
  }
  return revisions[revisions.length - 1]!;
}
