import { retainedRegionalBasis } from "./strategy-acceptance-workspace";
import { companyAcceptances, regionalAcceptances } from "./strategy-handoff";
import type { PlanContent, PlanRevision, SalesPlan } from "./plan-model";
import { canonical, demand } from "./plan-values";

export function companyPlanningSlice(content: PlanContent) {
  return {
    strategyAcceptances: companyAcceptances(content),
    periods: content.periods,
    targets: content.targets.filter((line) => line.scope === "workspace"),
  };
}

export function companyPlanningRevision(
  plan: SalesPlan,
  revision: PlanRevision,
) {
  return revision.content.releaseScope === "regions"
    ? (plan.revisions.find(
        (r) => r.id === revision.content.companyRevisionId,
      ) ?? null)
    : revision;
}

export function validatePlanningWorkflow(
  plan: SalesPlan,
  content: PlanContent,
  baseId: string | null,
) {
  if (!("releaseScope" in content)) {
    demand(!content.companyRevisionId, "company_basis_changed");
    // Existing drafts remain editable, but cannot remove an established scope.
    demand(
      !plan.revisions.find((r) => r.id === baseId)?.content.releaseScope,
      "company_basis_changed",
    );
    return;
  }
  demand(
    content.releaseScope === "company" || content.releaseScope === "regions",
    "invalid_plan",
  );
  const base = plan.revisions.find((r) => r.id === baseId);
  if (content.releaseScope === "regions") {
    const company = base && companyPlanningRevision(plan, base);
    demand(
      company?.state === "sealed" && content.companyRevisionId === company.id,
      "company_release_required",
    );
    demand(
      canonical(companyPlanningSlice(content)) ===
        canonical(companyPlanningSlice(company.content)),
      "company_basis_changed",
    );
  } else {
    demand(!content.companyRevisionId, "company_basis_changed");
    const regionalSlice = (c?: PlanContent) => ({
      strategyAllocations: regionalAcceptances(c),
      regions: c?.regions ?? [],
      targets: c?.targets.filter((t) => t.scope !== "workspace") ?? [],
      budgets: c?.budgets ?? [],
      contributions: c?.contributions ?? [],
      team: c?.team ?? [],
      actions: c?.actions ?? [],
    });
    demand(
      canonical(regionalSlice(content)) ===
        canonical(regionalSlice(retainedRegionalBasis(base?.content, content))),
      "regional_draft_required",
    );
  }
}

/** Latest explicitly published regional slice carried by this revision. */
export function regionalPlanningRevision(plan: SalesPlan, revision: PlanRevision) {
  let regional = revision;
  const visited = new Set<string>();
  while (regional.content.releaseScope === "company" && regional.baseId && !visited.has(regional.id)) {
    visited.add(regional.id);
    const parent = plan.revisions.find(r => r.id === regional.baseId && r.state === "sealed");
    if (!parent) break;
    regional = parent;
  }
  return regional.content.releaseScope === "company" ? null : regional;
}
