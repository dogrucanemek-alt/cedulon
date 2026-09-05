/**
 * Implementation Status may say a MUST "was published as X". That
 * sentence is a claim about a tarball, not about this tree. -00 and
 * T12-4 both used it for a requirement the installed package did not
 * carry. This scan extracts those claims and looks for a marker in the
 * published package at that version.
 *
 * A MUST named only as an exception ("not a published npm release") is
 * not a claim and is not checked. A MUST claimed published with no
 * catalogued marker fails closed: add the marker or stop claiming it.
 *
 * npm pack needs the network. Callers that cannot reach the registry
 * must skip and say so; a quiet pass is how the claim survives.
 */

export type PublishedClaim = {
  id: string;
  version: string;
  paragraph: string;
};

export type Marker = {
  package: string;
  needles: readonly string[];
};

/** Tokens that must appear in the published package if the draft claims the MUST is there. */
export const PUBLISHED_MARKERS: Record<string, Marker> = {
  "MUST-T4-15": {
    package: "@cedulon/audit",
    needles: ["unauthenticated-manifest", "manifest-key-mismatch"],
  },
  "MUST-T4-16": {
    package: "@cedulon/x402-adapter",
    needles: ["manifest-unauthenticated"],
  },
  "MUST-T12-4": {
    package: "@cedulon/mcp-server",
    needles: ["indeterminate"],
  },
};

const PUBLISHED_AS = /were published as (\d+\.\d+\.\d+)/;

export function publishedClaims(md: string): PublishedClaim[] {
  const claims: PublishedClaim[] = [];
  const blocks = md.split(/\r?\n(?:\r?\n)+/);
  for (const paragraph of blocks) {
    const ver = PUBLISHED_AS.exec(paragraph);
    if (!ver) continue;
    const ids = [...paragraph.matchAll(/MUST-T\d+-[\da-z]+/g)].map((m) => m[0]);
    for (const id of [...new Set(ids)]) {
      claims.push({ id, version: ver[1], paragraph });
    }
  }
  return claims;
}

export type ClaimCheck = {
  id: string;
  version: string;
  package: string;
  ok: boolean;
  detail: string;
};

export function checkClaimAgainstText(
  claim: PublishedClaim,
  packageText: string,
  marker: Marker | undefined = PUBLISHED_MARKERS[claim.id],
): ClaimCheck {
  if (!marker) {
    return {
      id: claim.id,
      version: claim.version,
      package: "",
      ok: false,
      detail: `${claim.id} is claimed published as ${claim.version} but has no catalogued marker`,
    };
  }
  const missing = marker.needles.filter((n) => !packageText.includes(n));
  return {
    id: claim.id,
    version: claim.version,
    package: marker.package,
    ok: missing.length === 0,
    detail:
      missing.length === 0
        ? `${claim.id} markers present in ${marker.package}@${claim.version}`
        : `${claim.id} claimed published as ${claim.version}; ${marker.package} is missing ${missing.join(", ")}`,
  };
}

/**
 * A STATUS sentence that names what npm or the MCP Registry serves is
 * two claims. "The version STATUS names was published" holds forever
 * at that commit. "And it is the one served as latest" is true today.
 * A pinned commit outlives today: run after the next release, the
 * second claim is false and the first is still true, and a red result
 * cannot say which of the two failed (Nicholas Templeman, 5 September
 * 2026, reproducing da7bf9b after 0.13.0 shipped).
 *
 * So the live claim is sorted before it is judged:
 *   agrees       the named version is the one served today.
 *   world-moved  the named version was published, the registry has
 *                moved past it, and it has moved past this checkout
 *                too (live > workspace). The pin is fine; the world
 *                moved. Reported, not failed.
 *   stale        everything else: a name never published, a publish
 *                claimed before it happened, or a checkout that shipped
 *                the version the registry serves while STATUS still
 *                names the one before it (the 0.6.0 shape). Red.
 *
 * The workspace comparison is what keeps the third state from being a
 * fail-open door: a checkout whose own version is the one being served
 * cannot blame the world for moving.
 */
export type LiveClaimState = "agrees" | "world-moved" | "stale";

export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => Number.parseInt(n, 10));
  const pb = b.split(".").map((n) => Number.parseInt(n, 10));
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

export function classifyLiveClaim(input: {
  named: string;
  live: string;
  workspace: string;
  published: readonly string[];
}): { state: LiveClaimState; message: string } {
  const { named, live, workspace, published } = input;
  if (named === live) return { state: "agrees", message: `STATUS names ${named}; the registry serves ${live}` };
  if (!published.includes(named)) {
    return {
      state: "stale",
      message: `STATUS names ${named}, which was never published (the registry serves ${live})`,
    };
  }
  if (compareVersions(live, named) > 0 && compareVersions(live, workspace) > 0) {
    return {
      state: "world-moved",
      message: `this pin is fine, the world moved: STATUS at this commit names ${named} (published), the registry now serves ${live}, and this checkout is ${workspace}`,
    };
  }
  return {
    state: "stale",
    message: `STATUS names ${named}; the registry serves ${live}; this checkout is ${workspace}`,
  };
}
