import type { Judgement } from "./judgement";

/** Only navigate to the subject that the scoped judgement service admitted. */
export function judgementRecordHref(finding: Pick<Judgement, "subjectType" | "subjectId">): string {
  if (finding.subjectType === "team") return "/planning";
  if (!/^[a-zA-Z0-9_-]+$/.test(finding.subjectId)) return "/copilot/today";
  return `/${finding.subjectType === "opportunity" ? "pipeline" : "account"}/${encodeURIComponent(finding.subjectId)}`;
}
