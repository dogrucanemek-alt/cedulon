/**
 * Wording guards for the living core document and its checkpoint
 * companion. Each guard reads a sentence or a set of places that have to
 * say one thing together, and returns what is wrong with them; an empty
 * list is a pass. They take the document text as an argument so the same
 * function can be held against an earlier revision.
 *
 * A guard measures a whole clause, not a word: a word survives a rewrite
 * that reverses the rule around it.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export function flatten(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Sentences of a Markdown document. Paragraphs and table rows are split
 * first, so a sentence never runs across a heading, a diagram or a row.
 */
export function sentences(text: string): string[] {
  const out: string[] = [];
  for (const block of text.replace(/\r\n/g, "\n").split(/\n[ \t]*\n/)) {
    const lines = block.split("\n");
    const units = lines.every((l) => l.trimStart().startsWith("|")) ? lines : [block];
    for (const unit of units) {
      for (const s of flatten(unit).split(/(?<=\.)\s+(?=[A-Z`({])/)) {
        if (s) out.push(s);
      }
    }
  }
  return out;
}

/** The paragraph that starts with `opening`, flattened, or null. */
export function paragraphStarting(text: string, opening: string): string | null {
  for (const block of text.replace(/\r\n/g, "\n").split(/\n[ \t]*\n/)) {
    const flat = flatten(block);
    if (flat.startsWith(opening)) return flat;
  }
  return null;
}

/** The requirements-table row that defines `id`, flattened, or null. */
export function tableRow(text: string, id: string): string | null {
  const row = text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .find((l) => new RegExp(`^\\|\\s*${id}\\s*\\|`).test(l));
  return row === undefined ? null : flatten(row);
}

/** Everything under the heading `heading` up to the next heading, flattened, or null. */
export function section(text: string, heading: string): string | null {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const start = lines.findIndex((l) => l.trim() === heading);
  if (start < 0) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^#{1,6}\s/.test(l));
  return flatten((end < 0 ? rest : rest.slice(0, end)).join("\n"));
}

// --- MUST-T11-20 and genesis: one target, the working set ---

const WORKING_SET_TARGET = /lowest epoch (?:is taken )?in the working set/;
const NO_ANCHOR = /^Without (?:a valid |an )anchor\b/;

/**
 * Sentences about an anchor that name the checkpoint it meets by "lowest
 * epoch" or "first checkpoint" without placing that checkpoint in the
 * working set. A sentence about the chain without an anchor is about the
 * genesis checkpoint, not the anchor's target, and is not counted here.
 */
export function strayAnchorTargets(text: string): string[] {
  return sentences(text).filter(
    (s) =>
      /\banchor/i.test(s) &&
      /lowest epoch|first (?:presented )?checkpoint/i.test(s) &&
      !WORKING_SET_TARGET.test(s) &&
      !NO_ANCHOR.test(s),
  );
}

/**
 * What a document says the anchor target is. Two documents carry the same
 * MUST-T11-20 when both define the anchor as preceding the checkpoint with
 * the lowest epoch in the working set, both state that this checkpoint is
 * then not a genesis checkpoint, and neither names any other target.
 */
export function anchorTargetFailures(text: string, label: string): string[] {
  const failures: string[] = [];
  const all = sentences(text);
  if (!all.some((s) => /immediately preceding the (?:presented )?checkpoint with the lowest epoch in the working set/.test(s))) {
    failures.push(`${label}: the anchor is not defined as preceding the checkpoint with the lowest epoch in the working set`);
  }
  if (!all.some((s) => /checkpoint with the lowest epoch in the working set is not a genesis checkpoint/.test(s))) {
    failures.push(`${label}: no sentence says the lowest-epoch checkpoint of the working set is not a genesis checkpoint under a valid anchor`);
  }
  if (!all.some((s) => /`MUST-T11-20`/.test(s) && /\banchor/.test(s))) {
    failures.push(`${label}: MUST-T11-20 is not cited beside the anchor rule`);
  }
  for (const s of strayAnchorTargets(text)) {
    failures.push(`${label}: names an anchor target outside the working set: "${s}"`);
  }
  return failures;
}

/** MUST-T11-20 of the checkpoint companion and the anchor rule of the core document state one semantics. */
export function anchorParityFailures(core: string, checkpoint: string): string[] {
  const failures = [
    ...anchorTargetFailures(core, "core"),
    ...anchorTargetFailures(checkpoint, "checkpoint"),
  ];
  const row = tableRow(checkpoint, "MUST-T11-20");
  if (row === null) {
    failures.push("checkpoint: no MUST-T11-20 row");
  } else if (!/the checkpoint with the lowest epoch in the working set of \{\{CEDULON-CORE\}\} MUST be chained to the anchor's checkpoint hash/.test(row)) {
    failures.push("checkpoint: the MUST-T11-20 row does not chain the lowest-epoch checkpoint of the working set of {{CEDULON-CORE}} to the anchor");
  }
  if (!/`MUST-T11-20` of \{\{CEDULON-CHECKPOINT\}\}/.test(flatten(core))) {
    failures.push("core: the anchor rule does not cite MUST-T11-20 of {{CEDULON-CHECKPOINT}}");
  }
  if (!/the attested set - the receipts and checkpoints that verify under a usable pinned issuer key/.test(flatten(core))) {
    failures.push("core: the attested set the companion cites is not defined");
  }
  return failures;
}

/**
 * Sentences that place the genesis checkpoint somewhere other than the
 * lowest epoch in the working set - the old "first in a presented chain"
 * and "presented checkpoint with the lowest epoch" wordings, and any
 * without-anchor genesis sentence that omits the working set.
 */
export function strayGenesisTargets(text: string): string[] {
  return sentences(text).filter(
    (s) =>
      /genesis checkpoint/i.test(s) &&
      !WORKING_SET_TARGET.test(s) &&
      (/Without (?:a valid |an )anchor/i.test(s) ||
        /first checkpoint in a presented chain/i.test(s) ||
        /presented checkpoint with the lowest epoch/i.test(s)),
  );
}

/**
 * What a document says the genesis checkpoint is when no valid anchor is
 * presented: the checkpoint with the lowest epoch in the working set.
 */
export function genesisTargetFailures(text: string, label: string): string[] {
  const failures: string[] = [];
  const all = sentences(text);
  if (!all.some((s) => /genesis checkpoint/i.test(s) && WORKING_SET_TARGET.test(s))) {
    failures.push(`${label}: no sentence places the genesis checkpoint at the lowest epoch in the working set`);
  }
  for (const s of strayGenesisTargets(text)) {
    failures.push(`${label}: names a genesis target outside the working set: "${s}"`);
  }
  return failures;
}

/** Both drafts place genesis over the working set, the same set the anchor precedes. */
export function genesisParityFailures(core: string, checkpoint: string): string[] {
  return [
    ...genesisTargetFailures(core, "core"),
    ...genesisTargetFailures(checkpoint, "checkpoint"),
  ];
}

// --- MUST-T11-8 / window-coverage: working set, not the whole presented bag ---

/**
 * Step 2 of the companion and the core's checkpoint-verification sentence
 * both say the window-coverage check runs on the working set of
 * {{CEDULON-CORE}}, not on every presented checkpoint window.
 */
export function windowCoverageScopeFailures(core: string, checkpoint: string): string[] {
  const failures: string[] = [];
  const cpFlat = flatten(checkpoint);
  if (!/The check runs against the windows of the working set of \{\{CEDULON-CORE\}\}/.test(cpFlat)) {
    failures.push("checkpoint: step 2 does not run window-coverage against the working set of {{CEDULON-CORE}}");
  }
  if (/runs against the presented checkpoint windows/.test(cpFlat)) {
    failures.push("checkpoint: step 2 still names presented checkpoint windows as the coverage set");
  }
  const coreFlat = flatten(core);
  if (
    !/falls in no window of a checkpoint in the working set/.test(coreFlat) &&
    !/window of a checkpoint in the working set/.test(coreFlat)
  ) {
    failures.push("core: window-coverage is not scoped to windows of the working set");
  }
  if (/falls in no presented checkpoint window/.test(coreFlat)) {
    failures.push("core: window-coverage still names a presented checkpoint window");
  }
  return failures;
}

/**
 * MUST-T11-8 consecutive epochs / adjacent windows are a property of the
 * working set. Both documents state that; neither says "Presented checkpoint
 * epochs" for the rule.
 */
export function consecutiveEpochScopeFailures(core: string, checkpoint: string): string[] {
  const failures: string[] = [];
  const row = tableRow(checkpoint, "MUST-T11-8");
  if (row === null) {
    failures.push("checkpoint: no MUST-T11-8 row");
  } else if (!/working set of \{\{CEDULON-CORE\}\}/.test(row)) {
    failures.push("checkpoint: the MUST-T11-8 row does not scope consecutive epochs to the working set of {{CEDULON-CORE}}");
  } else if (/Presented checkpoint epochs/.test(row)) {
    failures.push("checkpoint: the MUST-T11-8 row still says Presented checkpoint epochs");
  }
  const genesis = section(checkpoint, "## Genesis and continuity {#genesis}");
  if (genesis === null) {
    failures.push("checkpoint: the Genesis and continuity section is missing");
  } else if (!/Epoch numbers of the working set of \{\{CEDULON-CORE\}\} MUST be consecutive/.test(genesis)) {
    failures.push("checkpoint: Genesis and continuity does not require consecutive epochs of the working set");
  }
  const coreFlat = flatten(core);
  if (
    !/Epoch numbers of the working set MUST be consecutive/.test(coreFlat) ||
    !/`MUST-T11-8`/.test(coreFlat)
  ) {
    failures.push("core: does not require consecutive working-set epochs under MUST-T11-8");
  }
  return failures;
}

// --- MUST-T4-19: the decoder floor ---

const FLOOR_OPENING = "The decoder bounds of `MUST-T4-19` are fixed as a floor";
const NOT_REFUSED_ON_SIZE = /otherwise conforming input within [^.]*?MUST NOT be refused solely because of resource bounds/;
const ACCEPTS_ALL = /\bMUST accept\b|\baccepts? (?:every|the same|an?) (?:audit )?(?:input|object)/;

/**
 * The floor keeps two verifiers from differing over size alone. It does
 * not oblige a verifier to accept an input another rule refuses, so both
 * places that state it say "otherwise conforming" and "solely because of
 * resource bounds", and neither says "MUST accept".
 */
export function decoderFloorFailures(core: string): string[] {
  const failures: string[] = [];
  const places: [string, string | null][] = [
    ["the floor paragraph", paragraphStarting(core, FLOOR_OPENING)],
    ["the MUST-T4-19 row", tableRow(core, "MUST-T4-19")],
  ];
  for (const [label, text] of places) {
    if (text === null) {
      failures.push(`${label} is missing`);
      continue;
    }
    if (!NOT_REFUSED_ON_SIZE.test(text)) {
      failures.push(`${label} does not say an otherwise conforming input within the floor MUST NOT be refused solely because of resource bounds`);
    }
    const accepts = ACCEPTS_ALL.exec(text);
    if (accepts) failures.push(`${label} obliges acceptance: "${accepts[0]}"`);
  }
  const paragraph = places[0]![1];
  if (paragraph !== null && !/The floor does not make an input conforming/.test(paragraph)) {
    failures.push("the floor paragraph does not say the floor does not make an input conforming");
  }
  return failures;
}

// --- Anchor checkpoint and Transparency Service are two terms ---

/** The ASCII diagrams (`~~~~` fences) of a document. */
function diagrams(text: string): string[] {
  return [...text.replace(/\r\n/g, "\n").matchAll(/^~~~~\n([\s\S]*?)\n~~~~$/gm)].map((m) => m[1]!);
}

/**
 * An anchor checkpoint is a checkpoint of the issuer's own chain; a
 * Transparency Service is a SCITT service. The four places that name
 * them - both definitions, the architecture diagram and the section
 * heading - are measured together, and none of them may call the SCITT
 * service an anchor.
 */
export function anchorTermFailures(core: string): string[] {
  const failures: string[] = [];
  const text = core.replace(/\r\n/g, "\n");
  const definition = (term: string): string | null => {
    const m = new RegExp(`^${term}:\\n((?::|  ).*(?:\\n  .*)*)`, "m").exec(text);
    return m ? flatten(m[1]!) : null;
  };

  const ts = definition("Transparency Service");
  if (ts === null || !/SCITT Transparency Service \{\{RFC9943\}\}/.test(ts)) {
    failures.push("definitions: Transparency Service is not defined as the SCITT service");
  }
  const anchor = definition("Anchor checkpoint");
  if (anchor === null || !/issuer-signed epoch checkpoint/.test(anchor) || !/It is a checkpoint, not a Transparency Service/.test(anchor)) {
    failures.push("definitions: Anchor checkpoint is not defined as an issuer-signed checkpoint that is not a Transparency Service");
  }
  for (const m of text.matchAll(/^(Anchor[^:\n]*):\n((?::|  ).*(?:\n  .*)*)/gm)) {
    if (/SCITT|Transparency Service \{\{RFC9943\}\}|COSE receipt/.test(flatten(m[2]!)) && !/not a Transparency Service/.test(m[2]!)) {
      failures.push(`definitions: "${m[1]}" is defined as the SCITT service`);
    }
  }

  const architecture = diagrams(text).find((d) => /Payment Adapter/.test(d) && /Verifier/.test(d));
  if (architecture === undefined) {
    failures.push("diagram: the architecture diagram is missing");
  } else {
    if (!/Transparency Service \(optional\)/.test(architecture)) {
      failures.push("diagram: the optional SCITT box is not labelled Transparency Service");
    }
    if (/Anchor/i.test(architecture)) failures.push("diagram: a box is labelled Anchor");
  }

  if (!/^## Transparency Service \(SCITT\) \{#transparency-service\}$/m.test(text)) {
    failures.push("heading: no Transparency Service (SCITT) section");
  }
  for (const m of text.matchAll(/^#{1,6} (?:.*\bAnchor\b.*SCITT|.*SCITT.*\bAnchor\b).*$/gm)) {
    failures.push(`heading: "${m[0]}" names the SCITT section an anchor`);
  }
  return failures;
}

// --- CBOR and JSON encodings are named apart ---

/**
 * "Canonical encoding" names the JSON encoding of {{canonical-json}}. A
 * CBOR object is signed over its deterministic CBOR encoding and checked
 * by its decoded claim map; "canonical bytes" names neither.
 */
export function encodingTermFailures(core: string): string[] {
  const failures: string[] = [];
  const issuer = section(core, "## Receipt Issuer");
  if (issuer === null) {
    failures.push("the Receipt Issuer section is missing");
  } else {
    if (!/signs a Spend Receipt over the deterministic CBOR encoding of its claims/.test(issuer)) {
      failures.push("Receipt Issuer: the receipt is not signed over the deterministic CBOR encoding");
    }
    if (!/reject bad signatures and a decoded claim map that does not match the presented claims/.test(issuer)) {
      failures.push("Receipt Issuer: verifiers are not said to reject a decoded claim map that does not match");
    }
    if (/canonical|byte mismatch/i.test(issuer)) failures.push("Receipt Issuer: a CBOR check is named canonical or a byte mismatch");
  }
  const t41 = tableRow(core, "MUST-T4-1");
  if (t41 === null || !/over the deterministic CBOR encoding of its claims/.test(t41) || !/The phrase "canonical encoding" is reserved for JSON documents/.test(t41)) {
    failures.push("MUST-T4-1: does not sign over deterministic CBOR and reserve \"canonical encoding\" for JSON");
  }
  const t42 = tableRow(core, "MUST-T4-2");
  if (t42 === null || !/whose decoded claim map does not match the presented claims/.test(t42)) {
    failures.push("MUST-T4-2: does not reject a decoded claim map that does not match the presented claims");
  } else if (/canonical/i.test(t42)) {
    failures.push("MUST-T4-2: names the CBOR comparison canonical");
  }
  if (!/Where this document says "the canonical encoding" of a JSON document, it means the encoding defined by \{\{RFC8785\}\}/.test(flatten(core))) {
    failures.push("canonical-json: \"the canonical encoding\" is not tied to a JSON document and RFC 8785");
  }
  for (const s of sentences(core)) {
    if (/canonical bytes/i.test(s)) failures.push(`names "canonical bytes": "${s}"`);
    else if (/\bCBOR\b/.test(s) && /\bcanonical(?:ly)?\b/i.test(s)) failures.push(`calls a CBOR encoding canonical: "${s}"`);
  }
  return failures;
}

// --- The published-package sentence ---

const NUMBER_WORDS = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen",
  "nineteen", "twenty",
] as const;

export type WorkspacePackage = { name: string; version: string; private: boolean };

/** Every package of the root `workspaces` globs (`dir/*` form). */
export function workspacePackages(root: string): WorkspacePackage[] {
  const rootPkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { workspaces?: string[] };
  const found: WorkspacePackage[] = [];
  for (const glob of rootPkg.workspaces ?? []) {
    const m = /^([^*]+)\/\*$/.exec(glob);
    if (!m) throw new Error(`workspace glob ${glob} is not of the form dir/*`);
    for (const dir of readdirSync(join(root, m[1]!))) {
      let raw: string;
      try {
        raw = readFileSync(join(root, m[1]!, dir, "package.json"), "utf8");
      } catch {
        continue;
      }
      const pkg = JSON.parse(raw) as { name?: string; version?: string; private?: boolean };
      if (!pkg.name || !pkg.version) continue;
      found.push({ name: pkg.name, version: pkg.version, private: pkg.private === true });
    }
  }
  return found.sort((a, b) => a.name.localeCompare(b.name));
}

/** The core sentence names as many public workspace packages, at the one version they share. */
export function publishedPackagesFailures(core: string, packages: WorkspacePackage[]): string[] {
  const published = packages.filter((p) => !p.private);
  const versions = [...new Set(published.map((p) => p.version))];
  const failures: string[] = [];
  if (versions.length !== 1) {
    failures.push(`public workspace packages disagree on their version: ${versions.join(", ") || "none"}`);
  }
  const m = /the (\w+) workspace packages are published at (\d+\.\d+\.\d+) as this revision is written/.exec(flatten(core));
  if (!m) {
    failures.push("the core document does not say how many workspace packages are published at which version");
    return failures;
  }
  const count = NUMBER_WORDS.indexOf(m[1] as (typeof NUMBER_WORDS)[number]);
  if (count !== published.length) {
    failures.push(`the core document says ${m[1]} published workspace packages; the workspace has ${published.length} public ones`);
  }
  if (versions.length === 1 && m[2] !== versions[0]) {
    failures.push(`the core document says ${m[2]}; the public workspace packages are at ${versions[0]}`);
  }
  return failures;
}
