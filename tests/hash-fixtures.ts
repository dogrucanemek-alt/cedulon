import { createHash } from "node:crypto";

/** SHA-256 of a fixed input, not a made-up 64-hex string. */
export function testHash(input = "cedulon/test-policy"): string {
  return createHash("sha256").update(input).digest("hex");
}

export const TEST_HASH = testHash();
export const TEST_HASH_OTHER = testHash("cedulon/test-other");
