/**
 * Living runner splits, named and reasoned. The MUST-T identity
 * in each reason is what docs/UPGRADING.md is compared against.
 * This file is that list, not a second copy of it.
 *
 * No living split. The two that stood against posted -06 closed on
 * 2 September 2026, when -07 was posted: the companion warns
 * `unstated-audit-scope` and names the account, rail and window it computed
 * over, which -07 states as MUST-T10-18 and MUST-T10-19; and it refuses to
 * read a settlement charge out of an extract its pin has just refused, saying
 * so with `settlement-comparison-skipped`, which -07 states as MUST-T10-20.
 *
 * The one before those was against posted -05, which said nothing about duplicate
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
export const COUNTED_SPLITS: Record<string, string> = {};
