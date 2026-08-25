import { runDispute } from "./dispute.ts";
import { assertRunaway, runRunaway } from "./runaway.ts";

const runaway = runRunaway();
assertRunaway(runaway);
console.log(`allowed=${runaway.allowed}`);
console.log(`blocked=${runaway.blocked}`);
console.log(`receipts_verified=${runaway.receipts.length}`);

const dispute = runDispute();
console.log(`matchesAcceptance=${dispute.matchesAcceptance}`);
console.log(`bundle_ok=${dispute.bundleOk}`);
