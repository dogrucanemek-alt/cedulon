function hasLoneSurrogate(s: string): boolean {
  for (let i = 0; i < s.length; i += 1) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const n = s.charCodeAt(i + 1);
      if (n < 0xdc00 || n > 0xdfff) return true;
      i += 1;
    } else if (c >= 0xdc00 && c <= 0xdfff) {
      return true;
    }
  }
  return false;
}

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
  if (typeof value === "string") {
    if (hasLoneSurrogate(value)) {
      throw new Error("lone-surrogate");
    }
    return JSON.stringify(value);
  }
  if (typeof value === "boolean") {
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
    for (const k of keys) {
      if (hasLoneSurrogate(k)) {
        throw new Error("lone-surrogate");
      }
    }
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(rec[k])}`).join(",")}}`;
  }
  throw new Error("unencodable");
}
