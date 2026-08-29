/**
 * Living runner splits, named and reasoned. The MUST-T identity
 * in each reason is what docs/UPGRADING.md is compared against.
 * This file is that list, not a second copy of it.
 */
export const COUNTED_SPLITS: Record<string, string> = {
  "V-T3-4-request-hash":
    "MUST-T3-4 / MUST-T6-1: posted draft names a hash of the request fields but not the octets or the digest; companion binds SHA-256 of the six-field canonical JSON. draftNamesDigest records that silence; it is not a licence to write an expected digest.",
  "V-T8-9-depart-unpinned":
    "MUST-T8-9: posted draft states a single branch that fails the audit on an unpinned departure; this tree warns and does not fail the audit on that path. The vector records the companion; draftOpen records the split.",
};
