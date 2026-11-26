import { can } from "../../authz/decide";
import { listStrategyAdoptions } from "../../domains/planning/plan-service";
import { PlanError } from "../../domains/planning/plan-model";
import type { StrategyAdoption } from "../../domains/planning/strategy-adoption";
import { getSalesPlanStore } from "../../domains/shared/registry";
import type { AppSession } from "./session";

export type StrategyAdoptionRead = { state: "ready"; rows: StrategyAdoption[] } | { state: "restricted" | "unavailable" };

export async function loadStrategyAdoptions(s: AppSession): Promise<StrategyAdoptionRead> {
  if (s.scope.kind !== "workspace" || !["strategy.plan.view", "planning.target.view"].every(permission =>
    can(s.authz, s.entitlement, permission as "strategy.plan.view", "data").allowed)) return { state: "restricted" };
  try {
    return { state: "ready", rows: await listStrategyAdoptions({ workspaceId: s.workspaceId, sub: s.user.sub,
      holder: s.authz, entitlement: s.entitlement, scope: s.scope, store: getSalesPlanStore() }) };
  } catch (error) {
    if (error instanceof PlanError && ["plan_denied", "plan_scope_required", "strategy_source_permission", "plan_source_permission"].includes(error.code)) return { state: "restricted" };
    console.error("Strategy adoption summary unavailable");
    return { state: "unavailable" };
  }
}
