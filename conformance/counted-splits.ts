/**
 * Living runner splits, named and reasoned. The MUST-T identity
 * in each reason is what docs/UPGRADING.md is compared against.
 * This file is that list, not a second copy of it.
 *
 * One living split: Table 3 of posted -04 names lowercase hex SHA-256, and
 * Appendix A of the same draft still signs policyHash=aa. Companion enforces
 * the table. The appendix is re-signed in -05; this tree does not re-sign it.
 * The two -03 splits (request-hash octets, unpinned MUST-T8-9) are closed.
 *
 * The guard that reads this list fires when a split appears in the runner and
 * is not registered here, and when an entry here no longer corresponds to a
 * split. Both directions are proved by fixtures in tests/stale-claims.ts, which
 * build a synthetic entry rather than borrowing a live one, so the proof does
 * not depend on a divergence existing.
 */
export const COUNTED_SPLITS: Record<string, string> = {
  "V-T4-appendix-a-policy-hash":
    "Posted -04 Appendix A still signs policyHash=aa. Table 3 of the same draft names lowercase hex SHA-256. Companion enforces the table and refuses to produce that vector. The appendix is re-signed in -05; this tree does not re-sign it.",
};
