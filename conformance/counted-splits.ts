/**
 * Living runner splits, named and reasoned. The MUST-T identity
 * in each reason is what docs/UPGRADING.md is compared against.
 * This file is that list, not a second copy of it.
 *
 * One living split: posted -05 says nothing about duplicate member names in
 * the extract text; RFC 8785 requires I-JSON input; companion refuses
 * `json-duplicate-key`. Closes when -06 states the rule. The last closed
 * split was against the posted -04 (Appendix A policyHash=aa vs Table 3);
 * that closed when -05 was posted. The two -03 splits (request-hash octets,
 * unpinned MUST-T8-9) closed when -04 was posted.
 *
 * The guard that reads this list fires when a split appears in the runner and
 * is not registered here, and when an entry here no longer corresponds to a
 * split. Both directions are proved by fixtures in tests/stale-claims.ts, which
 * build a synthetic entry rather than borrowing a live one, so the proof does
 * not depend on a divergence existing.
 */
export const COUNTED_SPLITS: Record<string, string> = {
  "V-T4-19-json-duplicate-key":
    "-05 says nothing about duplicate member names in the extract text; RFC 8785 requires I-JSON input; companion refuses; closes when -06 states the rule",
};
