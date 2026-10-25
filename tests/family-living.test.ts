import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { loadVectors } from "../conformance/run.ts";
import * as identity from "../scripts/core00-identity.ts";
import { core00FamilyPaths, latestDraftRevision } from "../scripts/latest-draft.ts";

/**
 * The identity gate reads the frozen -00 files by name, so a row added to a
 * later revision of the family is invisible to it: checkpoint-01 carried
 * MUST-T11-20 and the whole suite stayed green. This file holds the living
 * family - the newest revision of each name - to the same rules, with the
 * identities a later revision may add named on a list rather than counted
 * by hand.
 */
type FamilyDocs = { core: string; checkpoint: string; threats: string };
type LivingFamilyFailures = (docs: FamilyDocs, names: FamilyDocs, inventory: Iterable<string>) => string[];

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p: string) => readFileSync(p, "utf8");
const livingFamilyFailures = (identity as unknown as { livingFamilyFailures?: LivingFamilyFailures })
  .livingFamilyFailures;
const NEW_IN_CHECKPOINT_01 = (identity as unknown as { NEW_IN_CHECKPOINT_01?: readonly string[] })
  .NEW_IN_CHECKPOINT_01;

function living(): { docs: FamilyDocs; names: FamilyDocs } {
  const paths = core00FamilyPaths(root);
  const pick = (name: string) => {
    const p = paths.find((x) => basename(x).startsWith(`draft-dogru-cedulon-${name}-`));
    assert.ok(p, `no ${name} document in the family`);
    return p;
  };
  const core = pick("core");
  const checkpoint = pick("checkpoint");
  const threats = pick("threats");
  return {
    docs: { core: read(core), checkpoint: read(checkpoint), threats: read(threats) },
    names: {
      core: basename(core, ".md"),
      checkpoint: basename(checkpoint, ".md"),
      threats: basename(threats, ".md"),
    },
  };
}

function inventory(): string[] {
  const numbered = read(join(root, "spec", `draft-dogru-cedulon-${latestDraftRevision(join(root, "spec"))}.md`));
  return identity.tableDefinedIds(numbered).filter((id) => id.startsWith("MUST-"));
}

describe("the living -00 family: newest core, checkpoint and threats", () => {
  it("names the identity checkpoint-01 adds", () => {
    assert.deepEqual(NEW_IN_CHECKPOINT_01, ["MUST-T11-20"]);
  });

  it("defines MUST-T11-20 in the newest checkpoint document and in no other", () => {
    const { docs, names } = living();
    assert.equal(names.checkpoint, "draft-dogru-cedulon-checkpoint-01");
    assert.ok(identity.tableDefinedIds(docs.checkpoint).includes("MUST-T11-20"));
    assert.ok(!identity.tableDefinedIds(docs.core).includes("MUST-T11-20"));
    assert.ok(!identity.tableDefinedIds(docs.threats).includes("MUST-T11-20"));
  });

  it("passes the identity gate, with the expected set derived from the inventory and the named lists", () => {
    assert.equal(typeof livingFamilyFailures, "function");
    const { docs, names } = living();
    assert.deepEqual(livingFamilyFailures!(docs, names, inventory()), []);
  });

  it("RED: the checkpoint document without its MUST-T11-20 row is refused", () => {
    assert.equal(typeof livingFamilyFailures, "function");
    const { docs, names } = living();
    const stripped = docs.checkpoint.replace(/^\| MUST-T11-20 \|[^\n]*\n/m, "");
    assert.notEqual(stripped, docs.checkpoint, "fixture: the row was not removed");
    const fails = livingFamilyFailures!({ ...docs, checkpoint: stripped }, names, inventory());
    assert.ok(fails.some((f) => f.includes("MUST-T11-20")), fails.join("\n"));
  });

  it("RED: MUST-T11-20 defined in the core document as well is refused", () => {
    assert.equal(typeof livingFamilyFailures, "function");
    const { docs, names } = living();
    const doubled = docs.core.replace(
      /^(\| MUST-T10-20 \|[^\n]*\n)/m,
      "$1| MUST-T11-20 | duplicated row. |\n",
    );
    assert.notEqual(doubled, docs.core, "fixture: the row was not added");
    const fails = livingFamilyFailures!({ ...docs, core: doubled }, names, inventory());
    assert.ok(fails.some((f) => f.includes("MUST-T11-20")), fails.join("\n"));
  });

  it("RED: an identity on no list and in no inventory is refused", () => {
    assert.equal(typeof livingFamilyFailures, "function");
    const { docs, names } = living();
    const invented = docs.checkpoint.replace(
      /^(\| MUST-T11-20 \|[^\n]*\n)/m,
      "$1| MUST-T99-1 | invented identity. |\n",
    );
    const fails = livingFamilyFailures!({ ...docs, checkpoint: invented }, names, inventory());
    assert.ok(fails.some((f) => f.includes("MUST-T99-1")), fails.join("\n"));
  });

  it("the -00 family itself is unchanged: MUST-T11-20 is not defined in checkpoint-00", () => {
    const frozen = read(join(root, "spec", "draft-dogru-cedulon-checkpoint-00.md"));
    assert.ok(!identity.tableDefinedIds(frozen).includes("MUST-T11-20"));
  });
});

describe("a conformance vector that cites one MUST identity cites one that is defined", () => {
  it("every such identity is a table row of the numbered inventory or of the living family", () => {
    const { docs } = living();
    const defined = new Set([
      ...inventory(),
      ...identity.tableDefinedIds(docs.core),
      ...identity.tableDefinedIds(docs.checkpoint),
      ...identity.tableDefinedIds(docs.threats),
    ]);
    const cited = loadVectors().filter((v) => /^MUST-T\d+-\d+$/.test(v.must));
    assert.ok(cited.some((v) => v.must === "MUST-T11-20"), "the anchor vectors cite MUST-T11-20");
    for (const v of cited) {
      assert.ok(defined.has(v.must), `${v.id} cites ${v.must}, which no table defines`);
    }
  });
});
