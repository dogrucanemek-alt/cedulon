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
