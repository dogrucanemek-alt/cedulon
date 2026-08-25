import type { Decision, SpendRequest } from "./types.ts";
import type { PolicyEngine } from "./policy.ts";

/** Hole used only to show the unprotected path (red). Never call from adapters. */
export function naivePayAlwaysAllow(_engine: PolicyEngine | null, _req: SpendRequest): Decision {
  return { allow: true, decisionId: "naive", requestHash: "naive", reason: "allow" };
}

export function failClosedEvaluate(
  engine: PolicyEngine | null | undefined,
  req: SpendRequest,
): Decision {
  if (!engine) {
    return { allow: false, reason: "engine-unavailable" };
  }
  try {
    return engine.evaluate(req);
  } catch {
    return { allow: false, reason: "engine-fault" };
  }
}
