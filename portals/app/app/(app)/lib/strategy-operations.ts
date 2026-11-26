import type { PlanRecord } from "../../domains/strategy/store";
import { nextPlanStatuses } from "../../domains/strategy/lib/lifecycle";

type OperationPlan = Pick<PlanRecord, "id" | "lineageId" | "basePlanId" | "versionNo" | "status">;
type OperationRights = { canEdit: boolean; canApprove: boolean };
export type StrategyOperation = "view" | "edit" | "publish" | "revise" | "resume" | "versions" | "validation" | "active" | "closed" | "archived" | "discard";

function lifecycleOperations(plan: OperationPlan, allowed: boolean): StrategyOperation[] {
  if (!allowed) return [];
  return nextPlanStatuses(plan.status).filter(status => status === "active" || status === "closed" || status === "archived");
}

function primaryOperation(actions: readonly StrategyOperation[], editable: boolean): StrategyOperation | undefined {
  if (editable) return actions.find(a => a === "edit" || a === "publish");
  if (actions.includes("active")) return "active";
  return actions.find(a => a === "resume" || a === "revise");
}

function validStrategyDraft(plan: OperationPlan, latest: OperationPlan | undefined): boolean {
  if (plan.status !== "draft" || plan.versionNo) return false;
  if (!plan.basePlanId) return !latest;
  return plan.basePlanId === latest?.id && ["approved", "active"].includes(latest.status);
}

function draftEditingOperations(editable: boolean, rights: OperationRights): StrategyOperation[] {
  if (!editable) return [];
  const actions: StrategyOperation[] = [];
  if (rights.canEdit) actions.push("edit");
  if (rights.canApprove) actions.push("publish");
  return actions;
}

/** Presentation policy only; domain services independently enforce every write. */
export function strategyOperations(plan: OperationPlan, plans: readonly OperationPlan[], rights: OperationRights) {
  const lineage = plan.lineageId ?? plan.id;
  const family = plans.filter(p => (p.lineageId ?? p.id) === lineage);
  const published = family.filter(p => p.versionNo != null).sort((a, b) => (b.versionNo ?? 0) - (a.versionNo ?? 0));
  const latest = published[0];
  const isLatest = latest?.id === plan.id;
  const revisable = latest != null && ["approved", "active"].includes(latest.status);
  const draft = family.find(p => validStrategyDraft(p, latest));
  const editable = validStrategyDraft(plan, latest);
  const actions: StrategyOperation[] = ["view", ...draftEditingOperations(editable, rights)];
  if (rights.canEdit && isLatest && revisable) actions.push(draft ? "resume" : "revise");
  if (plan.versionNo) actions.push("validation");
  if (published.length) actions.push("versions");
  actions.push(...lifecycleOperations(plan, rights.canEdit && isLatest));
  if (rights.canEdit && plan.status === "draft" && !plan.versionNo) actions.push("discard");

  const primary = primaryOperation(actions, editable);
  const detailPrimary = actions.includes("publish") ? "publish" : primary;
  return { actions, primary, detailPrimary, draftId: draft?.id, staleDraft: plan.status === "draft" && !editable };
}
