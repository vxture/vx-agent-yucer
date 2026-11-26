import type { PlanRevision, SalesPlan } from "./plan-model";
import { planVersions } from "./plan-state";

export interface StrategyAdoption {
  strategyId: string;
  lineageId: string;
  strategyVersion: number;
  year: number;
  revisionId: string;
  planVersion: number | null;
  state: "current" | "scheduled" | "draft" | "closed";
}

/** Only working releases and an authorized draft count, never superseded history. */
export function strategyAdoptions(plans: readonly SalesPlan[], at: string, includeDraft: boolean): StrategyAdoption[] {
  return plans.flatMap(plan => {
    const versions = planVersions(plan, at);
    const selections: { revision: PlanRevision | null; state: StrategyAdoption["state"] }[] = [
      { revision: versions.current, state: versions.closed ? "closed" : "current" },
      { revision: versions.scheduled, state: "scheduled" },
      { revision: includeDraft && !versions.closed ? versions.draft : null, state: "draft" },
    ];
    return selections.flatMap(({ revision, state }) => {
      if (!revision) return [];
      const unique = new Map((revision.content.strategyAcceptances ?? []).map(x => [x.strategyId, x]));
      return [...unique.values()].map(x => ({ strategyId: x.strategyId, lineageId: x.lineageId,
        strategyVersion: x.version, year: plan.year, revisionId: revision.id, planVersion: revision.version, state }));
    });
  });
}

export function strategyAdoptionStatus(plan: { id: string; lineageId?: string | null; versionNo?: number | null }, rows: readonly StrategyAdoption[]) {
  if (!plan.versionNo) return "unpublished";
  const family = rows.filter(r => r.lineageId === (plan.lineageId ?? plan.id));
  const sameVersion = family.filter(r => r.strategyId === plan.id);
  if (sameVersion.some(r => r.state === "current")) return "accepted";
  if (sameVersion.some(r => r.state === "scheduled")) return "scheduled";
  if (sameVersion.some(r => r.state === "draft")) return "draft";
  if (family.some(r => r.state === "current" || r.state === "scheduled")) return "previous";
  if (sameVersion.some(r => r.state === "closed")) return "closed";
  return "pending";
}
