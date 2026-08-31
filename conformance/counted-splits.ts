/**
 * Living runner splits, named and reasoned. The MUST-T identity
 * in each reason is what docs/UPGRADING.md is compared against.
 * This file is that list, not a second copy of it.
 *
 * Empty, and that is a state rather than an oversight. The last living split
 * was against the posted -04: Table 3 named lowercase hex SHA-256 while
 * Appendix A of the same draft still signed policyHash=aa, and the companion
 * enforced the table. -05 is posted (31 August 2026) with the appendix vector
 * regenerated from a computed digest, so the posted draft and the companion
 * agree: a receipt carrying policyHash=aa is refused by name, and the vector
 * that recorded the divergence is an ordinary vector now, checked against the
 * draft rather than recorded as departing from it. The two -03 splits
 * (request-hash octets, unpinned MUST-T8-9) closed when -04 was posted.
 *
 * The guard that reads this list fires when a split appears in the runner and
 * is not registered here, and when an entry here no longer corresponds to a
 * split. Both directions are proved by fixtures in tests/stale-claims.ts, which
 * build a synthetic entry rather than borrowing a live one, so the proof does
 * not depend on a divergence existing.
 */
export const COUNTED_SPLITS: Record<string, string> = {};
