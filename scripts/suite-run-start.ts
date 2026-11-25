/**
 * Stamp the wall-clock start of a `test:pre-release` run. The impl-status
 * gate refuses `.suite-count.xml` / `.suite-node-summary.txt` that predate
 * this marker, so a leftover report cannot stand in for a run that did not
 * happen.
 */
import { writeFileSync } from "node:fs";

import { SUITE_RUN_STARTED_PATH } from "./impl-status-gate.ts";

const path = process.env.SUITE_RUN_STARTED ?? SUITE_RUN_STARTED_PATH;
const startedAtMs = Date.now();
writeFileSync(path, `${startedAtMs}\n`, "utf8");
console.log(`suite-run-start: ${path}=${startedAtMs}`);
