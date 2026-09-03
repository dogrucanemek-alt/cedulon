import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { FINDING_CODES, FINDING_OBJECT_VERSION, toFindingObject } from "@cedulon/audit";
import { documentedRuns, runDocumentedCommand } from "./doc-runs.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const schema = JSON.parse(
  readFileSync(join(root, "docs", "finding-object.schema.json"), "utf8"),
) as Schema;

type Schema = {
  type?: string;
  const?: unknown;
  enum?: unknown[];
  required?: string[];
  additionalProperties?: boolean;
  properties?: Record<string, Schema>;
  items?: Schema;
  minimum?: number;
  minLength?: number;
  $defs?: Record<string, Schema>;
  $ref?: string;
};

function resolve(s: Schema, rootSchema: Schema): Schema {
  if (!s.$ref) return s;
  const name = s.$ref.replace("#/$defs/", "");
  const def = rootSchema.$defs?.[name];
  if (!def) throw new Error(`schema $ref not found: ${s.$ref}`);
  return def;
}

function validate(data: unknown, s: Schema, path: string, rootSchema: Schema, errors: string[]): void {
  const spec = resolve(s, rootSchema);
  if (spec.type === "object") {
    if (data === null || typeof data !== "object" || Array.isArray(data)) {
      errors.push(`${path}: expected object`);
      return;
    }
    const obj = data as Record<string, unknown>;
    for (const key of spec.required ?? []) {
      if (!(key in obj)) errors.push(`${path}: missing ${key}`);
    }
    if (spec.additionalProperties === false) {
      const allowed = new Set(Object.keys(spec.properties ?? {}));
      for (const key of Object.keys(obj)) {
        if (!allowed.has(key)) errors.push(`${path}: unexpected ${key}`);
      }
    }
    for (const [key, child] of Object.entries(spec.properties ?? {})) {
      if (key in obj) validate(obj[key], child, `${path}.${key}`, rootSchema, errors);
    }
    return;
  }
  if (spec.type === "array") {
    if (!Array.isArray(data)) {
      errors.push(`${path}: expected array`);
      return;
    }
    if (spec.items) {
      data.forEach((item, i) => validate(item, spec.items as Schema, `${path}[${i}]`, rootSchema, errors));
    }
    return;
  }
  if (spec.type === "string" && typeof data !== "string") errors.push(`${path}: expected string`);
  if (spec.type === "boolean" && typeof data !== "boolean") errors.push(`${path}: expected boolean`);
  if (spec.type === "integer" && (!Number.isInteger(data) || typeof data !== "number")) {
    errors.push(`${path}: expected integer`);
  }
  if (typeof spec.minLength === "number" && typeof data === "string" && data.length < spec.minLength) {
    errors.push(`${path}: shorter than ${spec.minLength}`);
  }
  if (typeof spec.minimum === "number" && typeof data === "number" && data < spec.minimum) {
    errors.push(`${path}: below ${spec.minimum}`);
  }
  if (spec.const !== undefined && data !== spec.const) errors.push(`${path}: expected ${JSON.stringify(spec.const)}`);
  if (spec.enum && !spec.enum.includes(data)) errors.push(`${path}: not in enum`);
}

function assertSchema(data: unknown): void {
  const errors: string[] = [];
  validate(data, schema, "$", schema, errors);
  assert.deepEqual(errors, [], errors.join("\n"));
}

describe("finding object schema", () => {
  it("uses the version the package exports", () => {
    assert.equal(schema.properties?.findingObjectVersion?.const, FINDING_OBJECT_VERSION);
  });

  it("lists every finding code the engine can emit", () => {
    assert.ok(FINDING_CODES.length > 0);
    for (const code of FINDING_CODES) {
      assert.match(code, /^[a-z]+(-[a-z]+)*$/);
    }
    const listed = schema.$defs?.finding?.properties?.code?.enum;
    assert.deepEqual(listed, [...FINDING_CODES]);
  });

  it("audit --json matches the schema and leaves human output alone", () => {
    const human = runDocumentedCommand("npm run audit", root);
    const verifier = documentedRuns(
      readFileSync(join(root, "docs", "RUN_AS_VERIFIER.md"), "utf8"),
    ).find((r) => r.command === "npm run audit");
    assert.ok(verifier);
    assert.equal(human, verifier.expected);

    const raw = execFileSync("npm", ["run", "audit", "--silent", "--", "--json"], {
      cwd: root,
      encoding: "utf8",
      shell: process.platform === "win32",
    });
    const parsed = JSON.parse(raw) as ReturnType<typeof toFindingObject>;
    assertSchema(parsed);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.guarantee, "conditional");
    assert.equal(parsed.receipts, 2);
    assert.equal(parsed.findings.length, 0);
    // The demo hands the audit neither root, and the report names both gaps
    // rather than reporting a balance as if it settled the question.
    assert.deepEqual(
      parsed.warnings.map((w) => w.code).sort(),
      ["unauthenticated-extract", "unauthenticated-issuer"],
    );
  });
});
