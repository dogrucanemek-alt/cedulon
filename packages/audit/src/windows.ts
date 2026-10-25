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

type Edge = "opening" | "closing";
type EdgeRef = { ref: string; edge: Edge };

/** What one window's audit hands the run besides its report. */
type WindowDetail = {
  report: AuditReport;
  /** Receipts this window carried, and the edge whose adjacent extract named them. */
  carried: EdgeRef[];
  /** Rows deferred here, with every edge band they sit in. */
  deferredRows: Array<{ ref: string; edges: Edge[] }>;
  /** Rows this window paired by name with one of its own receipts. */
  matched: string[];
  lastAttestedCheckpoint?: SignedCheckpoint;
};

/**
 * What a run needs from the single-window audit. index.ts supplies it, so the
 * audit internals stay off the package surface and this file imports types
 * only.
 */
export type WindowsDeps = {
  auditDetailed: (input: AuditInput) => WindowDetail;
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

  // Sequential, because window i is anchored on what window i-1's audit attested.
  const details: WindowDetail[] = [];
  input.windows.forEach((window, i) => {
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
    // Window i > 0 anchors on the last checkpoint the issuer root attested in
    // window i-1, never on one it refused.
    const anchor = i === 0 ? input.anchorCheckpoint : details[i - 1]!.lastAttestedCheckpoint;
    if (anchor) {
      windowInput.anchorCheckpoint = anchor;
    }
    details.push(auditDetailed(windowInput));
  });

  // One settlement row covers one receipt. Within a window the audit already
  // holds to that; across an inner edge a row can be paired by its own window
  // and carried for a receipt of the window beside it, which only the run sees.
  const uses = new Map<string, string[]>();
  const use = (window: number, ref: string, by: string) => {
    const key = `${window}\u0000${ref}`;
    uses.set(key, [...(uses.get(key) ?? []), by]);
  };
  details.forEach((d, i) => {
    for (const ref of d.matched) use(i, ref, `a receipt in window ${i}`);
    for (const c of d.carried) use(c.edge === "closing" ? i + 1 : i - 1, c.ref, `a receipt in window ${i}`);
  });
  for (const [key, by] of uses) {
    if (by.length < 2) continue;
    const [window, ref] = key.split("\u0000") as [string, string];
    findings.push({
      code: "duplicate-ref",
      id: ref,
      window: Number(window),
      detail: `settlement ${ref} in window ${window} is counted for ${by.join(" and for ")}`,
    });
  }

  const removed = new Set<string>();
  let resolved = 0;
  details.forEach((d, i) => {
    const isInner = (edge: Edge) => (edge === "opening" ? i > 0 : i < details.length - 1);
    for (const row of d.deferredRows) {
      const inner = row.edges.filter(isInner);
      if (inner.length === 0) continue;
      const carried = inner.some((edge) => {
        const adjacent = edge === "opening" ? details[i - 1]! : details[i + 1]!;
        const facing: Edge = edge === "opening" ? "closing" : "opening";
        return adjacent.carried.some((c) => c.ref === row.ref && c.edge === facing);
      });
      if (carried) {
        resolved += 1;
        removed.add(`${i}\u0000${row.ref}`);
      } else if (inner.length === row.edges.length) {
        // Every band the row sits in faces a presented window, and none of
        // them carried a receipt for it: both bags are here, so it is uncovered.
        removed.add(`${i}\u0000${row.ref}`);
        findings.push({
          code: "settlement-without-receipt",
          id: row.ref,
          window: i,
          detail: `settlement ${row.ref} was deferred at the ${inner.join(" and ")} edge and the adjacent window did not carry a receipt for its ref through that window's facing band`,
        });
      }
      // Otherwise one band faces outside the run, where its receipt may still be: the warning stays.
    }
  });

  const windows = details.map((d) => d.report);
  // Only a settlement row's deferral is resolved or hardened here; a receipt's
  // deferral at an outer edge keeps its warning even if its nonce reads like a ref.
  const warnings = details.flatMap((d, i) =>
    d.report.warnings.filter(
      (w) =>
        !(w.code === "boundary-deferred" && w.needs?.evidence === "receipts" && removed.has(`${i}\u0000${w.id}`)),
    ),
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
