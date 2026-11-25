/**
 * Writes the Node test-runner summary counts for the impl-status gate's
 * cross-check. Built-in reporters already print this; this one records it
 * where the gate can read it after the run closes.
 */
export default async function* nodeSummaryReporter(source) {
  let summary;
  for await (const event of source) {
    if (event.type === "test:summary" && event.data?.file === undefined) {
      summary = event.data;
    }
  }
  if (!summary) {
    yield "no Node test:summary event\n";
    return;
  }
  const { counts } = summary;
  const fail =
    counts.tests - counts.passed - counts.skipped - counts.todo - counts.cancelled;
  yield `tests ${counts.tests}\n`;
  yield `suites ${counts.suites}\n`;
  yield `pass ${counts.passed}\n`;
  yield `fail ${fail}\n`;
  yield `cancelled ${counts.cancelled}\n`;
  yield `skipped ${counts.skipped}\n`;
  yield `todo ${counts.todo}\n`;
  yield `duration_ms ${summary.duration_ms}\n`;
}
