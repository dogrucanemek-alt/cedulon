import type { SignedCheckpoint } from "@cedulon/checkpoint";

import type {
  AuditInput,
  AuditReport,
  Finding,
  PresentedExtract,
  PresentedRecord,
  RailTrustPin,
} from "./index.ts";
import type { ProfileWords } from "./profile.ts";

type EdgeRef = { ref: string; edge: "opening" | "closing" };

/**
 * What a run needs from the single-window audit. index.ts supplies it, so the
 * audit internals stay off the package surface and this file imports types
 * only.
 */
export type WindowsDeps = {
  auditDetailed: (input: AuditInput) => { report: AuditReport; carried: EdgeRef[]; deferredRows: EdgeRef[] };
  guarantee: (warnings: Finding[], hard: Finding[]) => AuditReport["guarantee"];
  summary: (hard: Finding[], words: ProfileWords, rowWithoutRecord: string) => string;
  defaultProfile: { words: ProfileWords; codes: { rowWithoutRecord: string } };
};

export type WindowInput = {
  receipts: PresentedRecord[];
  checkpoints: SignedCheckpoint[];
  extract: PresentedExtract;
};

export type WindowsInput = Omit<
  AuditInput,
  "receipts" | "checkpoints" | "extract" | "previousExtract" | "nextExtract" | "settlements"
> & {
  windows: WindowInput[];
};

export type WindowsReport = {
  ok: boolean;
  guarantee: AuditReport["guarantee"];
  summary: string;
  windows: AuditReport[];
  findings: Array<Finding & { window?: number }>;
  resolved: number;
};

function highestEpoch(checkpoints: SignedCheckpoint[]): SignedCheckpoint | undefined {
  if (checkpoints.length === 0) return undefined;
  return checkpoints.reduce((a, b) => (a.claims.epoch >= b.claims.epoch ? a : b));
}

function tilingDetail(windows: WindowInput[], trust?: RailTrustPin): string | null {
  if (windows.length === 0) {
    return "no windows were presented";
  }
  const statedStart = trust?.windowStartMs;
  const statedEnd = trust?.windowEndMs;
  const stated = statedStart !== undefined && statedEnd !== undefined;
  const first = windows[0].extract.body;
  if (stated && first.windowStartMs !== statedStart) {
    return `first window starts at ${first.windowStartMs}, not the stated run start ${statedStart}`;
  }
  for (let i = 1; i < windows.length; i += 1) {
    const prevEnd = windows[i - 1].extract.body.windowEndMs;
    const nextStart = windows[i].extract.body.windowStartMs;
    if (nextStart !== prevEnd) {
      return `window ${i} starts at ${nextStart}, not at the previous window's end ${prevEnd}`;
    }
  }
  const last = windows[windows.length - 1].extract.body;
  if (stated && last.windowEndMs !== statedEnd) {
    return `last window ends at ${last.windowEndMs}, not the stated run end ${statedEnd}`;
  }
  return null;
}

function trustForWindow(
  trust: RailTrustPin | undefined,
  extract: PresentedExtract,
  tilingOk: boolean,
): RailTrustPin | undefined {
  if (!trust) return undefined;
  const stated = trust.windowStartMs !== undefined && trust.windowEndMs !== undefined;
  if (tilingOk && stated) {
    return {
      ...trust,
      windowStartMs: extract.body.windowStartMs,
      windowEndMs: extract.body.windowEndMs,
    };
  }
  if (!tilingOk) {
    // A broken tile must not inherit the stated run bounds, and must not
    // invent bounds from the broken sequence.
    return {
      publicKeyPem: trust.publicKeyPem,
      ...(trust.accountId !== undefined ? { accountId: trust.accountId } : {}),
      ...(trust.railId !== undefined ? { railId: trust.railId } : {}),
    };
  }
  return trust;
}

export function runWindows(input: WindowsInput, deps: WindowsDeps): WindowsReport {
  const { auditDetailed } = deps;
  const findings: Array<Finding & { window?: number }> = [];
  const tile = tilingDetail(input.windows, input.trust);
  const tilingOk = tile === null;
  if (tile !== null) {
    findings.push({
      code: "extract-scope-mismatch",
      id: "windows",
      detail: tile,
    });
  }

  const details = input.windows.map((window, i) => {
    const extract = window.extract;
    const windowInput: AuditInput = {
      issuerTrust: input.issuerTrust,
      witnessTrust: input.witnessTrust,
      payeeTrust: input.payeeTrust,
      manifest: input.manifest,
      manifestTrust: input.manifestTrust,
      inclusionReceipts: input.inclusionReceipts,
      layer2: input.layer2,
      profile: input.profile,
      receipts: window.receipts,
      checkpoints: window.checkpoints,
      extract,
      previousExtract: input.windows[i - 1]?.extract,
      nextExtract: input.windows[i + 1]?.extract,
      trust: trustForWindow(input.trust, extract, tilingOk),
    };
    const anchor =
      i === 0 ? input.anchorCheckpoint : highestEpoch(input.windows[i - 1].checkpoints);
    if (anchor) {
      windowInput.anchorCheckpoint = anchor;
    }
    return auditDetailed(windowInput);
  });

  const removed = new Set<string>();
  let resolved = 0;
  for (let i = 0; i < details.length; i += 1) {
    const innerOpen = i > 0;
    const innerClose = i < details.length - 1;
    for (const row of details[i].deferredRows) {
      const inner = (row.edge === "opening" && innerOpen) || (row.edge === "closing" && innerClose);
      if (!inner) continue;
      const adjacent = row.edge === "opening" ? details[i - 1] : details[i + 1];
      const want = row.edge === "opening" ? "closing" : "opening";
      const carried = adjacent.carried.some((c) => c.ref === row.ref && c.edge === want);
      removed.add(`${i}:${row.ref}`);
      if (carried) {
        resolved += 1;
      } else {
        findings.push({
          code: "settlement-without-receipt",
          id: row.ref,
          window: i,
          detail: `settlement ${row.ref} was deferred at the ${row.edge} edge and the adjacent window did not carry a receipt for its ref through that window's facing band`,
        });
      }
    }
  }

  const windows = details.map((d) => d.report);
  const warnings = details.flatMap((d, i) =>
    d.report.warnings.filter((w) => !(w.code === "boundary-deferred" && removed.has(`${i}:${w.id}`))),
  );
  const hard = [...findings, ...windows.flatMap((r) => r.findings)];
  const profile = input.profile ?? deps.defaultProfile;
  return {
    ok: windows.every((r) => r.ok) && findings.length === 0,
    guarantee: deps.guarantee(warnings, hard),
    summary: deps.summary(hard, profile.words, profile.codes.rowWithoutRecord),
    windows,
    findings,
    resolved,
  };
}
