/**
 * Living runner splits, named and reasoned. The MUST-T identity
 * in each reason is what docs/UPGRADING.md is compared against.
 * This file is that list, not a second copy of it.
 *
 * Empty, and that is a state rather than an oversight. Both entries were
 * divergences from the posted -03: it named a hash of the request fields
 * without the octets or the digest, and it failed the audit on an unpinned
 * departure from manifest terms where this tree warned. -04 is posted with
 * both closed - it states the digest, the encoding and the request document
 * member by member, and it states the two-branch form of MUST-T8-9 with the
 * reason - so the companion and the posted draft now agree and there is
 * nothing to count. The two vectors are still run; they are ordinary vectors
 * now, checked against the draft rather than recorded as departing from it.
 *
 * The guard that reads this list fires when a split appears in the runner and
 * is not registered here, and when an entry here no longer corresponds to a
 * split. Both directions are proved by fixtures in tests/stale-claims.ts, which
 * build a synthetic entry rather than borrowing a live one, so the proof does
 * not depend on a divergence existing.
 */
export const COUNTED_SPLITS: Record<string, string> = {};
