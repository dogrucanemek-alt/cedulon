import { readdirSync } from "node:fs";
import { basename, join } from "node:path";

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
 * The fresh `-00` family that splits the numbered series: core, checkpoint
 * and threats. These match the companion filename shape, but they are not
 * companions of `draft-dogru-cedulon-NN`. A check about the numbered
 * series' media types or posted companions must not pick them up, or the
 * same six templates would be counted twice the day the files land.
 */
export const CORE00_FAMILY_NAMES = ["checkpoint", "core", "threats"] as const;

/**
 * Names that match the companion filename shape
 * (`draft-dogru-cedulon-<name>-NN.md`) but are neither companions of
 * the numbered series nor members of the `-00` family. A companion
 * may register media types and is named at its newest posted
 * revision; the `-00` family is the MUST-T identity inventory.
 * `resolution` is neither. It closes a Decision Profile deferral,
 * records no media type, and defines `MUST-RS-<n>` identities in the
 * same family as `MUST-DP-<n>`. `companionDraftPaths` would otherwise
 * treat the file as a companion the day it landed, and the
 * README/posted-revision gate would demand a `.txt` that means
 * posted. The filename stays; this list is the classification.
 */
export const SIDE_DRAFT_NAMES = ["resolution"] as const;

/**
 * The newest revision of each companion document beside the numbered core
 * (`draft-dogru-cedulon-<name>-NN.md`). A companion may register media
 * types of its own; a check about what the tree's documents register as a
 * whole reads these beside the numbered core. Side drafts are excluded
 * here: they share the filename shape and nothing else.
 */
export function companionDraftPaths(root: string): string[] {
  const specDir = join(root, "spec");
  const newest = new Map<string, number>();
  for (const f of readdirSync(specDir)) {
    const m = /^draft-dogru-cedulon-([a-z][a-z-]*)-(\d+)\.md$/.exec(f);
    if (m === null) continue;
    if ((CORE00_FAMILY_NAMES as readonly string[]).includes(m[1]!)) continue;
    if ((SIDE_DRAFT_NAMES as readonly string[]).includes(m[1]!)) continue;
    const rev = Number(m[2]);
    if ((newest.get(m[1]) ?? -1) < rev) newest.set(m[1], rev);
  }
  return [...newest.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([name, rev]) => join(specDir, `draft-dogru-cedulon-${name}-${String(rev).padStart(2, "0")}.md`));
}

/**
 * Newest revision of each side draft. Same filename walk as the
 * companion and `-00` family lists; a different class, so a different
 * function, so a check about media types or MUST-T inventory cannot
 * pick one up by accident.
 */
export function sideDraftPaths(root: string): string[] {
  const specDir = join(root, "spec");
  const newest = new Map<string, number>();
  for (const f of readdirSync(specDir)) {
    const m = /^draft-dogru-cedulon-([a-z][a-z-]*)-(\d+)\.md$/.exec(f);
    if (m === null) continue;
    if (!(SIDE_DRAFT_NAMES as readonly string[]).includes(m[1]!)) continue;
    const rev = Number(m[2]);
    if ((newest.get(m[1]) ?? -1) < rev) newest.set(m[1], rev);
  }
  return [...newest.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([name, rev]) => join(specDir, `draft-dogru-cedulon-${name}-${String(rev).padStart(2, "0")}.md`));
}

/**
 * The three `-00` family sources, newest revision of each name. A MUST
 * identity is defined in exactly one of these; the numbered series is
 * the inventory, not a fourth definition site.
 */
export function core00FamilyPaths(root: string): string[] {
  const specDir = join(root, "spec");
  const newest = new Map<string, number>();
  for (const f of readdirSync(specDir)) {
    const m = /^draft-dogru-cedulon-([a-z][a-z-]*)-(\d+)\.md$/.exec(f);
    if (m === null) continue;
    if (!(CORE00_FAMILY_NAMES as readonly string[]).includes(m[1]!)) continue;
    const rev = Number(m[2]);
    if ((newest.get(m[1]) ?? -1) < rev) newest.set(m[1], rev);
  }
  return CORE00_FAMILY_NAMES.map((name) => {
    const rev = newest.get(name);
    if (rev === undefined) {
      throw new Error(`no draft-dogru-cedulon-${name}-NN.md under spec/`);
    }
    return join(specDir, `draft-dogru-cedulon-${name}-${String(rev).padStart(2, "0")}.md`);
  });
}

/** Newest core document in the split family; core-01 becomes this when it lands. */
export function livingCoreDraftPath(root: string): string {
  const path = core00FamilyPaths(root).find((p) =>
    /^draft-dogru-cedulon-core-\d+\.md$/.test(basename(p)),
  );
  if (!path) {
    throw new Error("no draft-dogru-cedulon-core-NN.md in the core family");
  }
  return path;
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
