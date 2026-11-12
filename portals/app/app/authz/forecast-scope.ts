import type { DataScope } from "./scope";

type ReportingScope = {
  scopeType: string;
  territoryId: string | null;
  ownerSub: string | null;
};

// Aggregate access is stricter than visibility of an individual shared row.
// Seeing a public deal never grants the whole company's forecast or quota.
export function canReadReportingScope(
  access: DataScope,
  scope: ReportingScope,
  sub: string,
): boolean {
  if (access.kind === "workspace") return true;
  if (scope.scopeType === "workspace") return false;
  if (scope.scopeType === "owner") {
    if (scope.ownerSub === sub) return true;
    return (
      access.kind === "unit" && access.memberSubs.includes(scope.ownerSub ?? "")
    );
  }
  return (
    access.kind !== "own" &&
    access.territoryIds.includes(scope.territoryId ?? "")
  );
}
