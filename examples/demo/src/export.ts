import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { exportBalanced, exportBypass, stableStringify } from "./fixtures.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const dataDir = join(root, "site/panel/data");

mkdirSync(dataDir, { recursive: true });

const balanced = exportBalanced();
const bypass = exportBypass();
const balancedJson = stableStringify(balanced);
const bypassJson = stableStringify(bypass);

writeFileSync(join(dataDir, "balanced.json"), balancedJson);
writeFileSync(join(dataDir, "bypass.json"), bypassJson);
writeFileSync(
  join(root, "site/panel/fixtures.js"),
  `window.CEDULON_BALANCED = ${balancedJson.slice(0, -1)};\nwindow.CEDULON_BYPASS = ${bypassJson.slice(0, -1)};\n`,
);

process.stdout.write(`wrote ${dataDir}\\balanced.json ${balancedJson.length} bytes\n`);
process.stdout.write(`wrote ${dataDir}\\bypass.json ${bypassJson.length} bytes\n`);
process.stdout.write(`${balanced.summary}\n${bypass.summary}\n`);
