import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { execFileSync } from "node:child_process";

import {
  anchorParityFailures,
  anchorTermFailures,
  decoderFloorFailures,
  encodingTermFailures,
  genesisParityFailures,
  publishedPackagesFailures,
  strayAnchorTargets,
  strayGenesisTargets,
  workspacePackages,
} from "../scripts/core05-wording.ts";
import { livingCoreDraftPath } from "../scripts/latest-draft.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const core = readFileSync(livingCoreDraftPath(root), "utf8");
const checkpoint = readFileSync(join(root, "spec", "draft-dogru-cedulon-checkpoint-01.md"), "utf8");
const coreRel = livingCoreDraftPath(root).slice(root.length + 1).replace(/\\/g, "/");

/** Replace `from` in `text`, line breaks aside; a fixture that changes nothing is a broken fixture. */
function swap(text: string, from: string, to: string): string {
  const pattern = new RegExp(from.trim().split(/\s+/).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+"));
  assert.match(text, pattern, `fixture text not found: ${from}`);
  return text.replace(pattern, to);
}

function gitShow(revPath: string): string {
  return execFileSync("git", ["show", revPath], { cwd: root, encoding: "utf8" });
}

describe("MUST-T11-20 names one anchor target in both documents", () => {
  it("the core document and the checkpoint companion both take the lowest epoch in the working set", () => {
    assert.deepEqual(anchorParityFailures(core, checkpoint), []);
  });

  it("RED: a MUST-T11-20 row that chains the lowest presented checkpoint is caught", () => {
    const drifted = swap(
      checkpoint,
      "the checkpoint with the lowest epoch in the working set of {{CEDULON-CORE}} MUST be chained",
      "the presented checkpoint with the lowest epoch MUST be chained",
    );
    const failures = anchorParityFailures(core, drifted);
    assert.ok(failures.some((f) => f.startsWith("checkpoint: the MUST-T11-20 row")), failures.join(" | "));
    assert.ok(failures.some((f) => f.includes("names an anchor target outside the working set")), failures.join(" | "));
  });

  it("RED: an anchor defined against the lowest presented checkpoint is caught in either document", () => {
    const cp = swap(
      checkpoint,
      "preceding the checkpoint with the lowest epoch in the working set.",
      "preceding the presented checkpoint with the lowest epoch.",
    );
    assert.ok(anchorParityFailures(core, cp).some((f) => f.startsWith("checkpoint: the anchor is not defined")));
    const co = swap(
      core,
      "immediately preceding the checkpoint with the lowest epoch in the working set.",
      "immediately preceding the first presented checkpoint.",
    );
    const failures = anchorParityFailures(co, checkpoint);
    assert.ok(failures.some((f) => f.startsWith("core: the anchor is not defined")), failures.join(" | "));
    assert.ok(failures.some((f) => f.startsWith("core: names an anchor target")), failures.join(" | "));
  });

  it("a sentence about the chain without an anchor is about genesis, not the anchor target", () => {
    assert.deepEqual(
      strayAnchorTargets("Without an anchor, the first checkpoint in a presented chain is the genesis checkpoint."),
      [],
    );
    assert.equal(
      strayAnchorTargets("With a valid anchor the presented checkpoint with the lowest epoch is not a genesis checkpoint.").length,
      1,
    );
  });
});

describe("without an anchor, genesis is the lowest epoch in the working set", () => {
  it("both documents place the genesis checkpoint in the working set", () => {
    assert.deepEqual(genesisParityFailures(core, checkpoint), []);
  });

  it("RED: the 7f9412c drafts that named genesis over the presented chain are caught", () => {
    const oldCore = gitShow(`7f9412c:${coreRel}`);
    const oldCheckpoint = gitShow("7f9412c:spec/draft-dogru-cedulon-checkpoint-01.md");
    const failures = genesisParityFailures(oldCore, oldCheckpoint);
    assert.ok(failures.some((f) => f.startsWith("core:")), failures.join(" | "));
    assert.ok(failures.some((f) => f.startsWith("checkpoint:")), failures.join(" | "));
    assert.ok(failures.some((f) => f.includes("outside the working set") || f.includes("no sentence places")), failures.join(" | "));
  });

  it("RED: a genesis sentence that names the first presented checkpoint is caught", () => {
    assert.equal(
      strayGenesisTargets("Without an anchor, the first checkpoint in a presented chain is the genesis checkpoint.").length,
      1,
    );
    assert.equal(
      strayGenesisTargets(
        "Without an anchor checkpoint it is anchored at its genesis: the presented checkpoint with the lowest epoch is the genesis checkpoint of CEDULON-CHECKPOINT.",
      ).length,
      1,
    );
    assert.deepEqual(
      strayGenesisTargets(
        "Without an anchor, the checkpoint with the lowest epoch in the working set is the genesis checkpoint of the chain.",
      ),
      [],
    );
  });
});

describe("the MUST-T4-19 floor refuses nothing on size alone and accepts nothing on its own", () => {
  it("the floor paragraph and the MUST-T4-19 row both say otherwise conforming and solely because of resource bounds", () => {
    assert.deepEqual(decoderFloorFailures(core), []);
  });

  it("RED: a MUST-T4-19 row that obliges acceptance of every input within the floor is caught", () => {
    const drifted = swap(
      core,
      "An otherwise conforming input within the floor fixed in {{presented-form}} (65536 encoded octets, 16 levels of nesting, 4096 elements, 16384 octets in a string) MUST NOT be refused solely because of resource bounds, so that two conforming verifiers do not differ over the same input on size alone.",
      "It MUST accept every input within the floor fixed in {{presented-form}} (65536 encoded octets, 16 levels of nesting, 4096 elements, 16384 octets in a string), so that two conforming verifiers do not accept and refuse the same input.",
    );
    const failures = decoderFloorFailures(drifted);
    assert.ok(failures.some((f) => f.startsWith("the MUST-T4-19 row does not say")), failures.join(" | "));
    assert.ok(failures.some((f) => f === 'the MUST-T4-19 row obliges acceptance: "MUST accept"'), failures.join(" | "));
  });

  it("RED: a floor paragraph that says a verifier MUST accept an input within the floor is caught", () => {
    const drifted = swap(
      core,
      "an otherwise conforming input within 65536 octets of encoded CBOR, 16 levels of nesting below the outermost item, 4096 elements in an array or pairs in a map, and 16384 octets in a single string MUST NOT be refused solely because of resource bounds, and a verifier MAY refuse",
      "a verifier MUST accept an audit input within 65536 octets of encoded CBOR, 16 levels of nesting below the outermost item, 4096 elements in an array or pairs in a map, and 16384 octets in a single string, and MAY refuse",
    );
    const failures = decoderFloorFailures(drifted);
    assert.ok(failures.some((f) => f.startsWith("the floor paragraph does not say")), failures.join(" | "));
    assert.ok(failures.some((f) => f.startsWith("the floor paragraph obliges acceptance")), failures.join(" | "));
  });

  it("RED: dropping the sentence that the floor does not make an input conforming is caught", () => {
    const drifted = swap(core, "The floor does not make an input conforming:", "Within it:");
    assert.ok(decoderFloorFailures(drifted).some((f) => f.includes("does not make an input conforming")));
  });
});

describe("anchor checkpoint and Transparency Service are two terms", () => {
  it("the definitions, the diagram label and the section heading keep them apart", () => {
    assert.deepEqual(anchorTermFailures(core), []);
  });

  it("RED: an Anchor term defined as the SCITT service is caught", () => {
    const drifted = swap(
      core,
      "Transparency Service: : An optional SCITT Transparency Service",
      "Anchor:\n: An optional SCITT Transparency Service",
    );
    const failures = anchorTermFailures(drifted);
    assert.ok(failures.some((f) => f.startsWith("definitions: Transparency Service is not defined")), failures.join(" | "));
    assert.ok(failures.some((f) => f === 'definitions: "Anchor" is defined as the SCITT service'), failures.join(" | "));
  });

  it("RED: an anchor checkpoint definition that drops 'not a Transparency Service' is caught", () => {
    const drifted = swap(core, "It is a checkpoint, not a Transparency Service.", "");
    assert.ok(anchorTermFailures(drifted).some((f) => f.startsWith("definitions: Anchor checkpoint")));
  });

  it("RED: a diagram box labelled Anchor / SCITT is caught", () => {
    const drifted = core.replace("    Transparency Service (optional)  Report", "             Anchor / SCITT (optional)  Report");
    assert.notEqual(drifted, core);
    const failures = anchorTermFailures(drifted);
    assert.deepEqual(failures, [
      "diagram: the optional SCITT box is not labelled Transparency Service",
      "diagram: a box is labelled Anchor",
    ]);
  });

  it("RED: a section headed Anchor / SCITT is caught", () => {
    const drifted = core.replace("## Transparency Service (SCITT) {#transparency-service}", "## Anchor / SCITT");
    assert.notEqual(drifted, core);
    assert.deepEqual(anchorTermFailures(drifted), [
      "heading: no Transparency Service (SCITT) section",
      'heading: "## Anchor / SCITT" names the SCITT section an anchor',
    ]);
  });
});

describe("CBOR and JSON encodings are named apart", () => {
  it("CBOR is deterministic CBOR and a decoded claim map; JSON is the canonical encoding", () => {
    assert.deepEqual(encodingTermFailures(core), []);
  });

  it("RED: a MUST-T4-2 that compares canonical bytes is caught", () => {
    const drifted = swap(
      core,
      "or whose decoded claim map does not match the presented claims. |",
      "or whose canonical bytes do not match the signed payload. |",
    );
    const failures = encodingTermFailures(drifted);
    assert.ok(failures.some((f) => f.startsWith("MUST-T4-2: does not reject a decoded claim map")), failures.join(" | "));
    assert.ok(failures.some((f) => f.startsWith('names "canonical bytes"')), failures.join(" | "));
  });

  it("RED: a Receipt Issuer paragraph that rejects a byte mismatch is caught", () => {
    const drifted = swap(
      core,
      "Verifiers reject bad signatures and a decoded claim map that does not match the presented claims (`MUST-T4-2`).",
      "Verifiers reject bad signatures and byte mismatch (`MUST-T4-2`).",
    );
    const failures = encodingTermFailures(drifted);
    assert.ok(failures.some((f) => f.startsWith("Receipt Issuer: verifiers are not said")), failures.join(" | "));
    assert.ok(failures.some((f) => f.startsWith("Receipt Issuer: a CBOR check is named canonical")), failures.join(" | "));
  });

  it("RED: a CBOR encoding called canonical anywhere in the document is caught", () => {
    const drifted = swap(
      core,
      "signs a Spend Receipt over the deterministic CBOR encoding of its claims",
      "signs a Spend Receipt over the canonical CBOR encoding of its claims",
    );
    const failures = encodingTermFailures(drifted);
    assert.ok(failures.some((f) => f.startsWith("calls a CBOR encoding canonical")), failures.join(" | "));
  });
});

describe("the published-package sentence follows the workspace", () => {
  const packages = workspacePackages(root);

  it("the count and version are those of the public workspace packages", () => {
    assert.ok(packages.some((p) => !p.private), "no public workspace package found");
    assert.ok(packages.some((p) => p.private), "the private workspace packages were not read");
    assert.deepEqual(publishedPackagesFailures(core, packages), []);
  });

  it("RED: a count that does not match the public packages is caught", () => {
    const extra = [...packages, { name: "@cedulon/extra", version: packages.find((p) => !p.private)!.version, private: false }];
    const failures = publishedPackagesFailures(core, extra);
    assert.ok(failures.some((f) => /says \w+ published workspace packages; the workspace has \d+ public ones/.test(f)), failures.join(" | "));
    const made = packages.map((p) => (p.private ? { ...p, private: false } : p));
    assert.ok(publishedPackagesFailures(core, made).some((f) => f.includes("public ones")));
  });

  it("RED: a version that does not match the public packages is caught", () => {
    const bumped = packages.map((p) => ({ ...p, version: p.private ? p.version : "9.9.9" }));
    const failures = publishedPackagesFailures(core, bumped);
    assert.ok(failures.some((f) => f.endsWith("the public workspace packages are at 9.9.9")), failures.join(" | "));
  });

  it("RED: a sentence that names a version but no count is caught", () => {
    const drifted = swap(
      core,
      "and the nine workspace packages are published at 0.18.0 as this revision is written.",
      "and the workspace publishes 0.13.1 as this revision is written.",
    );
    assert.deepEqual(publishedPackagesFailures(drifted, packages), [
      "the core document does not say how many workspace packages are published at which version",
    ]);
  });
});
