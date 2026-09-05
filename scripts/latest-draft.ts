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
 * The newest revision of each companion document beside the core
 * (`draft-dogru-cedulon-<name>-NN.md`). A companion may register media
 * types of its own; a check about what the tree's documents register as a
 * whole reads these beside the core.
 */
export function companionDraftPaths(root: string): string[] {
  const specDir = join(root, "spec");
  const newest = new Map<string, number>();
  for (const f of readdirSync(specDir)) {
    const m = /^draft-dogru-cedulon-([a-z][a-z-]*)-(\d+)\.md$/.exec(f);
    if (m === null) continue;
    const rev = Number(m[2]);
    if ((newest.get(m[1]) ?? -1) < rev) newest.set(m[1], rev);
  }
  return [...newest.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([name, rev]) => join(specDir, `draft-dogru-cedulon-${name}-${String(rev).padStart(2, "0")}.md`));
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

/**
 * The newest posted revision of one companion draft, by the same rule as
 * `latestPostedRevision`: the archive text carried beside the source. A
 * companion opened for its next posting has a `.md` and no `.txt`, and a
 * page that names it would be naming a datatracker revision that is not
 * there yet.
 */
export function latestPostedCompanionRevision(specDir: string, name: string): string {
  const re = new RegExp(`^draft-dogru-cedulon-${name}-(\\d+)\\.txt$`);
  const revisions = readdirSync(specDir)
    .map((f) => re.exec(f))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => m[1]!)
    .sort((a, b) => Number(a) - Number(b));
  if (revisions.length === 0) {
    throw new Error(`no draft-dogru-cedulon-${name}-NN.txt under spec/`);
  }
  return revisions[revisions.length - 1]!;
}
