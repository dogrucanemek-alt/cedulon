/**
 * Emit a CycloneDX 1.5 SBOM from package-lock.json. No extra dependency:
 * the lock file is the inventory, and a generated document that cannot be
 * rebuilt from the lock is just another sentence that goes stale.
 *
 * Usage: node --experimental-strip-types scripts/sbom.ts > sbom.cdx.json
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8")) as {
  name: string;
  version?: string;
  lockfileVersion: number;
  packages: Record<
    string,
    { name?: string; version?: string; license?: string; resolved?: string; integrity?: string; dev?: boolean }
  >;
};

const rootPkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  name: string;
  version?: string;
  license?: string;
};

type Component = {
  type: "library";
  name: string;
  version: string;
  "bom-ref": string;
  scope?: "required" | "optional" | "excluded";
  licenses?: Array<{ license: { id?: string; name?: string } }>;
  purl?: string;
  hashes?: Array<{ alg: string; content: string }>;
};

const components: Component[] = [];
for (const [path, meta] of Object.entries(lock.packages)) {
  if (path === "") continue;
  const name = meta.name ?? path.replace(/^node_modules\//, "").replace(/\/node_modules\//g, "/");
  const version = meta.version;
  if (!name || !version) continue;
  const purl = `pkg:npm/${name.replace("/", "%2F")}@${version}`;
  const component: Component = {
    type: "library",
    name,
    version,
    "bom-ref": purl,
    scope: meta.dev ? "optional" : "required",
    purl,
  };
  if (meta.license) {
    component.licenses = [{ license: { id: meta.license } }];
  }
  if (meta.integrity) {
    const content = meta.integrity.includes("-") ? meta.integrity.split("-")[1] : meta.integrity;
    const alg = meta.integrity.startsWith("sha512") ? "SHA-512" : "SHA-256";
    if (content) component.hashes = [{ alg, content }];
  }
  components.push(component);
}
components.sort((a, b) => a["bom-ref"].localeCompare(b["bom-ref"]));

const bom = {
  bomFormat: "CycloneDX",
  specVersion: "1.5",
  version: 1,
  serialNumber: `urn:uuid:${createHash("sha256").update(JSON.stringify(components)).digest("hex").slice(0, 32).replace(
    /^(.{8})(.{4})(.{4})(.{4})(.{12})$/,
    "$1-$2-$3-$4-$5",
  )}`,
  metadata: {
    timestamp: "1970-01-01T00:00:00.000Z",
    tools: [{ name: "cedulon-sbom", version: "1" }],
    component: {
      type: "application",
      name: rootPkg.name,
      version: rootPkg.version ?? lock.version ?? "0.0.0",
      licenses: rootPkg.license ? [{ license: { id: rootPkg.license } }] : undefined,
    },
  },
  components,
};

process.stdout.write(`${JSON.stringify(bom, null, 2)}\n`);
