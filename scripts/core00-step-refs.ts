/**
 * Cross-document verification-step citations for the `-00` family.
 *
 * Core defines steps 1–11; the checkpoint companion defines steps 1–6.
 * An unqualified "step N" must exist in the document that wrote it. A
 * citation that names the other document (`step N of {{CEDULON-CORE}}`
 * or `{{CEDULON-CHECKPOINT}}`) must exist there. The trap this catches
 * is a leftover "step 15" in core, or a companion "step 6" that meant
 * issuer order and was not qualified — once companion has its own
 * step 6, a naive local-number check goes green.
 */

export type FamilyStepDocs = {
  core: string;
  checkpoint: string;
};

export type StepCite = {
  doc: "core" | "checkpoint";
  n: number;
  target: "core" | "checkpoint" | "local";
  raw: string;
  index: number;
};

export const REQUIRED_CORE_QUALS = [
  "step 4 of {{CEDULON-CORE}}",
  "step 6 of {{CEDULON-CORE}}",
] as const;

export function verificationBody(text: string): string | null {
  const start = text.search(/^## Verification algorithm \{#verification\}/m);
  if (start < 0) return null;
  const from = text.slice(start);
  const next = from.slice(1).search(/^## /m);
  return next < 0 ? from : from.slice(0, next + 1);
}

export function definedSteps(text: string): Set<number> {
  const section = verificationBody(text);
  if (section === null) return new Set();
  const steps = new Set<number>();
  for (const m of section.matchAll(/^(\d+)\.\s/gm)) {
    steps.add(Number(m[1]));
  }
  return steps;
}

function markRange(consumed: boolean[], start: number, end: number): void {
  for (let i = start; i < end && i < consumed.length; i++) consumed[i] = true;
}

function overlaps(consumed: boolean[], start: number, end: number): boolean {
  for (let i = start; i < end && i < consumed.length; i++) {
    if (consumed[i]) return true;
  }
  return false;
}

export function collectStepCites(text: string, doc: "core" | "checkpoint"): StepCite[] {
  const cites: StepCite[] = [];
  const consumed = Array.from({ length: text.length }, () => false);

  const qualified =
    /steps?\s+(\d+)(?:'s)?\s+of\s+\{\{(CEDULON-CORE|CEDULON-CHECKPOINT)\}\}/gi;
  for (const m of text.matchAll(qualified)) {
    const target = m[2] === "CEDULON-CORE" ? "core" : "checkpoint";
    cites.push({ doc, n: Number(m[1]), target, raw: m[0], index: m.index! });
    markRange(consumed, m.index!, m.index! + m[0].length);
  }

  const ranges = /steps?\s+(\d+)\s+through\s+(\d+)/gi;
  for (const m of text.matchAll(ranges)) {
    if (overlaps(consumed, m.index!, m.index! + m[0].length)) continue;
    const a = Number(m[1]);
    const b = Number(m[2]);
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    for (let n = lo; n <= hi; n++) {
      cites.push({ doc, n, target: "local", raw: m[0], index: m.index! });
    }
    markRange(consumed, m.index!, m.index! + m[0].length);
  }

  const pairs = /steps?\s+(\d+)\s+and\s+(\d+)/gi;
  for (const m of text.matchAll(pairs)) {
    if (overlaps(consumed, m.index!, m.index! + m[0].length)) continue;
    cites.push({ doc, n: Number(m[1]), target: "local", raw: m[0], index: m.index! });
    cites.push({ doc, n: Number(m[2]), target: "local", raw: m[0], index: m.index! });
    markRange(consumed, m.index!, m.index! + m[0].length);
  }

  const singles = /steps?\s+(\d+)(?:'s)?/gi;
  for (const m of text.matchAll(singles)) {
    if (overlaps(consumed, m.index!, m.index! + m[0].length)) continue;
    cites.push({ doc, n: Number(m[1]), target: "local", raw: m[0], index: m.index! });
    markRange(consumed, m.index!, m.index! + m[0].length);
  }

  return cites;
}

export function stepRefFailures(docs: FamilyStepDocs): string[] {
  const fails: string[] = [];
  const coreSteps = definedSteps(docs.core);
  const checkpointSteps = definedSteps(docs.checkpoint);
  if (coreSteps.size === 0) fails.push("core has no verification-algorithm steps");
  if (checkpointSteps.size === 0) fails.push("checkpoint has no verification-algorithm steps");

  const byDoc = {
    core: { text: docs.core, steps: coreSteps },
    checkpoint: { text: docs.checkpoint, steps: checkpointSteps },
  } as const;

  for (const doc of ["core", "checkpoint"] as const) {
    for (const cite of collectStepCites(byDoc[doc].text, doc)) {
      const targetDoc = cite.target === "local" ? doc : cite.target;
      const steps = byDoc[targetDoc].steps;
      if (!steps.has(cite.n)) {
        const where = cite.target === "local" ? doc : cite.target;
        fails.push(
          `${doc} cites ${cite.raw} → step ${cite.n} is not defined in ${where}`,
        );
      }
    }
  }

  for (const required of REQUIRED_CORE_QUALS) {
    if (!docs.checkpoint.includes(required)) {
      fails.push(`checkpoint is missing the required cross-document citation ${required}`);
    }
  }

  return [...new Set(fails)];
}

export function assertStepRefs(docs: FamilyStepDocs): void {
  const fails = stepRefFailures(docs);
  if (fails.length > 0) {
    throw new Error(fails.join("\n"));
  }
}
