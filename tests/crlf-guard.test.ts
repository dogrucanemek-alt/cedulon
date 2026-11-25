import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  BINARY_EXCEPTIONS,
  countCarriageReturns,
  findCarriageReturns,
  isBinaryPath,
  trackedFiles,
} from "../scripts/crlf-guard.ts";
import {
  livingDraftCarriageReturns,
  livingUnpublishedDraftPaths,
  storedDraftBytes,
} from "../scripts/latest-draft.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("crlf-guard", () => {
  it("exceptions name a file and a reason", () => {
    assert.ok(BINARY_EXCEPTIONS.length > 0);
    for (const ex of BINARY_EXCEPTIONS) {
      assert.ok(ex.file.length > 0);
      assert.ok(ex.reason.length > 20, `${ex.file}: reason is too short`);
      assert.equal(isBinaryPath(ex.file), true);
    }
  });

  it("RED then GREEN: a CRLF text blob is rejected, then the tree is clean", () => {
    const probe = Buffer.from("hello\r\nworld\n", "utf8");
    assert.ok(countCarriageReturns(probe) > 0);
    const red = findCarriageReturns(root, [{ file: "tests/.crlf-guard-probe.txt", bytes: probe }]);
    assert.ok(
      red.some((h) => h.file === "tests/.crlf-guard-probe.txt" && h.count > 0),
      `expected a hit on the CRLF probe, got ${JSON.stringify(red)}`,
    );
    const green = findCarriageReturns(root);
    assert.deepEqual(green, [], green.map((h) => `${h.file}:${h.count}`).join("\n"));
  });

  it("reads spec/ and does not rewrite it", () => {
    const spec = trackedFiles(root).filter((f) => f.startsWith("spec/"));
    assert.ok(spec.length > 0, "expected frozen drafts to be tracked");
    // An empty working tree is not the criterion. This scan must not
    // write; an uncommitted spec edit that was already there is not a
    // rewrite. Compare the spec diff to itself across the scan.
    const before = execFileSync("git", ["diff", "--", "spec"], { cwd: root, encoding: "utf8" });
    const hits = findCarriageReturns(root).filter((h) => h.file.startsWith("spec/"));
    assert.deepEqual(hits, []);
    const after = execFileSync("git", ["diff", "--", "spec"], { cwd: root, encoding: "utf8" });
    assert.equal(after, before);
  });

  it("the gate script is the same scan (exit 0)", () => {
    const stdout = execFileSync(
      process.execPath,
      ["--experimental-strip-types", "scripts/crlf-guard.ts"],
      { cwd: root, encoding: "utf8" },
    );
    assert.match(stdout, /crlf-guard: no CR in tracked text blobs/);
  });

  // The .xml is left out on purpose: author-tools writes a non-breaking space
  // into the BCP 14 boilerplate itself, and -02's published XML carries the
  // same bytes. The source and the text that goes to the datatracker are ours.
  //
  // -01 acquired two em-dashes and -03 acquired a section sign, each from an
  // editing pass that had no reason to think about encoding. idnits reports
  // non-ASCII as a nit and the drafts before them were plain ASCII, so the
  // cheapest place to notice is here, before a rebuild rather than after a
  // submission.
  it("draft sources stay ASCII", () => {
    const specDir = join(root, "spec");
    const drafts = readdirSync(specDir).filter((n) => /^draft-.*\.(md|txt)$/.test(n));
    assert.ok(drafts.length > 0, "no draft sources found to check");
    for (const name of drafts) {
      const bytes = readFileSync(join(specDir, name));
      const offenders: string[] = [];
      for (let i = 0; i < bytes.length; i += 1) {
        if (bytes[i] > 126) {
          offenders.push(`${name}:byte ${i} (0x${bytes[i].toString(16)})`);
          if (offenders.length > 3) break;
        }
      }
      assert.deepEqual(offenders, [], `non-ASCII in ${name}: ${offenders.join(", ")}`);
    }
  });

  it(".gitattributes does not attach a rule to spec/", () => {
    const attrs = readFileSync(join(root, ".gitattributes"), "utf8");
    for (const line of attrs.split(/\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      assert.equal(trimmed.startsWith("spec/") || trimmed.startsWith("/spec/"), false, trimmed);
    }
  });

  it("living unpublished drafts have no CR; a CR-injected copy is refused", () => {
    const living = livingUnpublishedDraftPaths(root);
    assert.ok(living.length > 0, "expected at least one living unpublished draft");
    const names = living.map((p) => p.replace(/\\/g, "/").split("/").pop()!);
    const short = (name: string) => name.replace(/^draft-dogru-cedulon-/, "").replace(/\.md$/, "");
    for (const path of living) {
      assert.ok(
        !existsSync(path.replace(/\.md$/, ".txt")),
        `${short(basename(path))} carries an archive text, so it is posted and must not be in the living-unpublished set`,
      );
    }
    for (const expected of [
      "draft-dogru-cedulon-core-06.md",
      "draft-dogru-cedulon-resolution-00.md",
      "draft-dogru-cedulon-10.md",
    ]) {
      assert.ok(
        names.includes(expected),
        `${short(expected)} has no archive text beside it and must be in the living-unpublished set, got ${names.join(", ")}`,
      );
    }
    for (const posted of [
      "draft-dogru-cedulon-checkpoint-01.md",
      "draft-dogru-cedulon-threats-00.md",
      "draft-dogru-cedulon-core-05.md",
      "draft-dogru-cedulon-decision-profile-04.md",
    ]) {
      assert.ok(
        existsSync(join(root, "spec", posted.replace(/\.md$/, ".txt"))),
        `posted ${short(posted)} must carry its archive text in spec/`,
      );
      assert.ok(
        !names.includes(posted),
        `posted ${short(posted)} carries its archive text and must stay out of the living-unpublished set`,
      );
    }
    assert.deepEqual(livingDraftCarriageReturns(root), []);
    const sample = living.find((p) =>
      p.replace(/\\/g, "/").endsWith("draft-dogru-cedulon-resolution-00.md"),
    )!;
    const clean = storedDraftBytes(root, sample);
    assert.equal(countCarriageReturns(clean), 0);
    const withCr = Buffer.from(clean.toString("utf8").replace(/\n/g, "\r\n"), "utf8");
    assert.ok(countCarriageReturns(withCr) > 0);
    const red = livingDraftCarriageReturns(root, [
      { file: "spec/draft-dogru-cedulon-resolution-00.md.cr-probe", bytes: withCr },
    ]);
    assert.ok(
      red.some((h) => h.file.endsWith("resolution-00.md.cr-probe") && h.count > 0),
      `expected a CR hit on the probe, got ${JSON.stringify(red)}`,
    );
  });

  it("RED then GREEN: the living-draft check reads what git stores, not the checkout's line endings", () => {
    const sample = livingUnpublishedDraftPaths(root).find((p) =>
      p.replace(/\\/g, "/").endsWith("draft-dogru-cedulon-resolution-00.md"),
    )!;
    const lf = storedDraftBytes(root, sample);
    assert.equal(countCarriageReturns(lf), 0);
    const crlf = Buffer.from(lf.toString("utf8").replace(/\n/g, "\r\n"), "utf8");
    // A Windows checkout with core.autocrlf=true writes these CRLF bytes to
    // disk for an LF blob. Read raw, they look like a CR edit; that read is
    // what failed on the hosted Windows runner.
    assert.ok(countCarriageReturns(crlf) > 0);
    const viaAutocrlf = storedDraftBytes(root, sample, {
      bytes: crlf,
      gitConfig: ["-c", "core.autocrlf=true"],
    });
    assert.equal(countCarriageReturns(viaAutocrlf), 0, "autocrlf checkout must read as the LF git stores");
    assert.deepEqual(viaAutocrlf, lf);
    // Without that conversion the same bytes would be committed with CR:
    // the edit this check exists to refuse.
    const asWritten = storedDraftBytes(root, sample, {
      bytes: crlf,
      gitConfig: ["-c", "core.autocrlf=false"],
    });
    assert.ok(countCarriageReturns(asWritten) > 0, "a CR that would be committed must still be seen");
  });
});
