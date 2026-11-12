/**
 * Call-scoped stamps for errors the audit itself throws (audit-too-large).
 * Nested scopes reuse the outermost set; only the outermost exit clears it.
 * Module-level permanent stamps are not used.
 */

let activeStamps: WeakSet<object> | null = null;

export function withIntentionalThrowScope<T>(fn: () => T): T {
  if (activeStamps !== null) {
    return fn();
  }
  activeStamps = new WeakSet();
  try {
    return fn();
  } finally {
    activeStamps = null;
  }
}

export function stampIntentionalThrow(err: unknown): void {
  if (typeof err === "object" && err !== null) {
    activeStamps?.add(err);
  }
}

export function isIntentionalThrow(err: unknown): boolean {
  return typeof err === "object" && err !== null && (activeStamps?.has(err) ?? false);
}
