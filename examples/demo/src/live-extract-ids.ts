import { escapeReportText } from "@cedulon/audit";

/** Identity lines the live-audit demo prints before `formatAudit`. */
export function formatLiveExtractIds(accountId: string, railId: string): string[] {
  return [`rail=${escapeReportText(railId)}`, `account=${escapeReportText(accountId)}`];
}
