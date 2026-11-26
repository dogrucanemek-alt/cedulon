/**
 * Stamp the wall-clock start of a `test:pre-release` run together with a
 * content identity of the sources the impl-status claim answers to. The
 * impl-status gate refuses `.suite-count.xml` / `.suite-node-summary.txt`
 * that predate this marker, or whose marker identity no longer matches the
 * sources, so a leftover report cannot stand in for a run that did not
 * happen — including after the living draft changed.
 *
 * Beside the marker it records the `cedulon-*` names already in the temp
 * directory, so the temp-leak gate after the suite counts only what this run
 * added.
 */
import { writeFileSync } from "node:fs";

import {
  SUITE_RUN_STARTED_PATH,
  formatSuiteRunMarker,
  sourceTreeIdentity,
} from "./impl-status-gate.ts";
import { SUITE_TEMP_ENTRIES_PATH, writeTempSnapshot } from "./temp-dir-guard.ts";

const path = process.env.SUITE_RUN_STARTED ?? SUITE_RUN_STARTED_PATH;
const startedAtMs = Date.now();
const sourceIdentity = sourceTreeIdentity(".");
writeFileSync(path, formatSuiteRunMarker({ startedAtMs, sourceIdentity }), "utf8");
console.log(`suite-run-start: ${path}=${startedAtMs} identity=${sourceIdentity.slice(0, 12)}...`);

const tempPath = process.env.SUITE_TEMP_ENTRIES ?? SUITE_TEMP_ENTRIES_PATH;
const snapshot = writeTempSnapshot(tempPath);
console.log(`suite-run-start: ${tempPath} holds ${snapshot.entries.length} cedulon-* names in ${snapshot.tmpdir}`);
