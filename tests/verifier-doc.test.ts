import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { KILL_GRACE_MS } from "../scripts/bounded-run.ts";
import { DOCUMENTED_COMMAND_TIMEOUT_MS, documentedRuns, runDocumentedCommand } from "./doc-runs.ts";

// docs/RUN_AS_VERIFIER.md prints the exact stdout an outside verifier should
// see, and outside verifiers have been pointed at it. Those blocks are a second
// copy of what the demos produce, so they go stale silently: adding the
// `guarantee` column to the bypass output left the documented four lines wrong
// while every test stayed green.
//
// This runs each documented command and compares the real output to the block
// printed under it.

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const doc = readFileSync(join(root, "docs", "RUN_AS_VERIFIER.md"), "utf8");

describe("run-as-verifier doc", () => {
  const runs = documentedRuns(doc);

  // The file shipped with two sections numbered 6, and inserting a section
  // silently moved the targets of its own cross-references.
  const sections = [...doc.matchAll(/^## (\d+)\./gm)].map((m) => Number(m[1]));

  it("numbers its sections 1..n once each", () => {
    assert.deepEqual(
      sections,
      sections.map((_, i) => i + 1),
    );
  });

  it("does not restate the suite size", () => {
    // Twice this file named a count the suite had already moved past. The run
    // prints its own total; a second copy here only goes stale.
    const claim = doc.match(/\*?\*?\d+\*?\*?\s+tests?\s+passing/i);
    assert.equal(
      claim,
      null,
      `remove the hard-coded count ${JSON.stringify(claim?.[0])}: it goes stale on the next test added`,
    );
  });

  it("cross-references sections that exist", () => {
    const referenced = [...doc.matchAll(/[Ss]ection (\d+)/g)].map((m) => Number(m[1]));
    assert.notEqual(referenced.length, 0, "expected the doc to cross-reference its sections");
    for (const n of referenced) {
      assert.ok(sections.includes(n), `text points at section ${n}, which does not exist`);
    }
  });

  it("documents the commands it claims to", () => {
    assert.deepEqual(
      runs.map((r) => r.command),
      ["npm run audit", "npm run demo:bypass", "npm run demo:bypasses"],
      "the doc's runnable command/output pairs changed; update this list deliberately",
    );
  });

  for (const { command, expected } of runs) {
    it(`${command} prints what the doc says`, { timeout: DOCUMENTED_COMMAND_TIMEOUT_MS + KILL_GRACE_MS + 10_000 }, async () => {
      assert.match(command, /^npm run [a-z:]+$/, "only npm scripts are run from the doc");
      // The bypass demos exit non-zero by design; their stdout is the subject.
      assert.equal(await runDocumentedCommand(command, root), expected);
    });
  }

  it("site/verify.html shows the same unpinned audit counts as the documented demo", () => {
    const audit = runs.find((r) => r.command === "npm run audit");
    assert.ok(audit, "expected a documented npm run audit block");
    const countsLine = audit.expected
      .split("\n")
      .find((l) => l.startsWith("counts\treceipts\t"));
    assert.ok(countsLine, "documented audit output has no receipts counts line");
    assert.match(countsLine, /attested=0/);
    assert.match(countsLine, /covering=2/);
    const page = readFileSync(join(root, "site", "verify.html"), "utf8");
    assert.ok(
      page.includes(countsLine),
      "site/verify.html must embed the documented formatAudit receipts counts line",
    );
    assert.equal(
      page.includes("submitted=2 attested=2 in-scope=2"),
      false,
      "site/verify.html still shows the pre-covering attested=2 pinless example",
    );
  });

  it("the pin paragraph scopes exclusions to coverage and keeps the chain-walk exception with the matrix", () => {
    // The matrix (names a pin / invalid → receipt-chain-break; dropped from
    // coverage, walked for the name) is the decided behaviour. A paragraph
    // that said every signer-dependent inference including the receipt chain
    // dropped the object contradicted that cell.
    const failures = pinParagraphFailures(doc);
    assert.deepEqual(failures, []);
  });

  it("RED: a pin paragraph that excluded the receipt chain wholesale is caught", () => {
    const oldDoc = readFileSync(
      join(root, "tests", "fixtures", "wording-red", "verifier-pin-excludes-receipt-chain.md"),
      "utf8",
    );
    const failures = pinParagraphFailures(oldDoc);
    assert.ok(
      failures.some((f) => /receipt chain|wholesale|coverage-dependent/i.test(f)),
      failures.join(" | "),
    );
  });
});

/** Keep the prose about pins rejecting objects aligned with the issuer pin matrix. */
export function pinParagraphFailures(text: string): string[] {
  const failures: string[] = [];
  // Old wording: pins reject → left out of every inference … receipt chain …
  if (
    /Everything the pins reject is then left out of every inference[\s\S]{0,120}?receipt chain/i.test(
      text,
    )
  ) {
    failures.push(
      "pin paragraph still excludes the receipt chain wholesale; scope it to coverage-dependent checks",
    );
  }
  if (!/coverage-dependent/i.test(text)) {
    failures.push("pin paragraph omits coverage-dependent (must match the matrix)");
  }
  if (!/receipt-chain-break/i.test(text) || !/walked/i.test(text)) {
    failures.push(
      "pin paragraph must name the receipt-chain-break walk exception the matrix states",
    );
  }
  if (
    !/dropped from coverage,\s*walked for the name/i.test(text) &&
    !/dropped from coverage[\s\S]{0,80}?walked for the name/i.test(text)
  ) {
    failures.push("issuer pin matrix must keep the walked-for-the-name cell");
  }
  return failures;
}
