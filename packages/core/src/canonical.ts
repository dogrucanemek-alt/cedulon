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

/**
 * The first member name that repeats inside one JSON object of `text`, or
 * null when none does. RFC 8785 constrains its input to I-JSON (RFC 7493),
 * whose objects MUST NOT carry duplicate names, and says to verify that
 * before canonicalizing; JSON.parse cannot, because it keeps the last value
 * and drops the evidence. Two verifiers that parse the same octets with
 * different parsers would then read different values under the same
 * signature. This walks the raw text: strings are skipped with their
 * escapes intact, a string that is followed by ':' inside an object is a
 * member name, and names are compared after JSON unescaping, so "a" and
 * "a" are the same name. Text that is not JSON at all is left to the
 * parser: this reports duplicates, not syntax.
 */
export function jsonDuplicateMemberName(text: string): string | null {
  type Frame = { names: Set<string> | null };
  const stack: Frame[] = [];
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i]!;
    if (c === '"') {
      const start = i;
      i += 1;
      while (i < n && text[i] !== '"') {
        if (text[i] === "\\") i += 1;
        i += 1;
      }
      const raw = text.slice(start, i + 1);
      i += 1;
      let j = i;
      while (j < n && (text[j] === " " || text[j] === "\t" || text[j] === "\n" || text[j] === "\r")) j += 1;
      const top = stack[stack.length - 1];
      if (text[j] === ":" && top !== undefined && top.names !== null) {
        let name: string;
        try {
          name = JSON.parse(raw) as string;
        } catch {
          return null;
        }
        if (top.names.has(name)) return name;
        top.names.add(name);
      }
      continue;
    }
    if (c === "{") stack.push({ names: new Set() });
    else if (c === "[") stack.push({ names: null });
    else if (c === "}" || c === "]") stack.pop();
    i += 1;
  }
  return null;
}

/**
 * Parse JSON text after refusing a duplicate member name. RFC 8785 takes
 * I-JSON as input; JSON.parse keeps the last value and drops the evidence.
 * Every protocol and evidence text ingress in this tree asks this (the
 * build scripts that read the repository's own package.json and lock file
 * do not, and are not inputs anyone else writes), so a rail extract
 * file, a demo receipts file, and a session state file give the same name
 * (`json-duplicate-key`) for the same defect. Syntax errors stay the
 * parser's; this only names the I-JSON rule the parser cannot see.
 */
export function parseIJson(text: string): unknown {
  if (jsonDuplicateMemberName(text) !== null) {
    throw new Error("json-duplicate-key");
  }
  return JSON.parse(text);
}
