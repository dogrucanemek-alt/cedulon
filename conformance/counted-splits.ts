/**
 * Living runner splits, named and reasoned. The MUST-T identity
 * in each reason is what docs/UPGRADING.md is compared against.
 * This file is that list, not a second copy of it.
 *
 * One living split, against posted -06: the companion warns
 * `unstated-audit-scope` and names the account, rail and window it computed
 * over, and the posted draft states neither rule. It closes when -07 is
 * posted with MUST-T10-18 and MUST-T10-19.
 *
 * The previous one was against posted -05, which said nothing about duplicate
 * member names in the extract text while the companion refused
 * `json-duplicate-key`; it closed when -06 was posted with MUST-T4-20. Before
 * that, the -04 split (Appendix A policyHash=aa vs Table 3) closed when -05
 * was posted, and the two -03 splits (request-hash octets, unpinned
 * MUST-T8-9) closed when -04 was posted.
 *
 * The guard that reads this list fires when a split appears in the runner and
 * is not registered here, and when an entry here no longer corresponds to a
 * split. Both directions are proved by fixtures in tests/stale-claims.ts, which
 * build a synthetic entry rather than borrowing a live one, so the proof does
 * not depend on a divergence existing.
 */
export const COUNTED_SPLITS: Record<string, string> = {
  "V-T10-18-unstated-audit-scope":
    "Posted -06 makes an unstated period conditional and is silent on an unstated account or rail, and asks no report to name the settlement path it covered. The companion warns unstated-audit-scope and carries the scope in both the printed report and the finding object. Closes when -07 is posted with MUST-T10-18 and MUST-T10-19.",
};
