/**
 * Why encoding this value would refuse, by name, or null when it would not.
 * verify paths answer only "verified or not"; a report that says "signature
 * failed" for a body the encoder refused has kept the bound and lost the name.
 * The COSE side splits the same two questions with coseDecodeRefusal.
 */
export function jcsEncodeRefusal(value: unknown): string | null {
  try {
    canonical(value);
    return null;
  } catch (err) {
    return err instanceof Error && err.message !== "" ? err.message : "unencodable";
  }
}

export function canonical(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("non-finite number");
    }
    return JSON.stringify(value);
  }
  if (typeof value === "bigint") {
    return JSON.stringify(value.toString());
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonical).join(",")}]`;
  }
  if (typeof value === "object") {
    const rec = value as Record<string, unknown>;
    const keys = Object.keys(rec).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(rec[k])}`).join(",")}}`;
  }
  throw new Error("unencodable");
}
