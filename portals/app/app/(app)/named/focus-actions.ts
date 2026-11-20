"use server";
import { revalidatePath } from "next/cache";
import { resolveAppSession } from "../lib/session";
import { salesPlanContext, loadPlanSources, verifyPlanSources } from "../planning/plan-data";
import { salesPlanCommandAction } from "../planning/plan-actions";
import { readSalesPlan, changeSalesPlan } from "../../domains/planning/plan-service";
import { demand, digest, PlanError, planVersions } from "../../domains/planning/plan-model";
import { applyFocusChange } from "../../domains/planning/focus-change";
import type { FocusSaveInput } from "../../domains/planning/focus-model";
import { readFocusWorkspace } from "../../domains/planning/focus-read";
import { can } from "../../authz/decide";

export async function startFocusDraft(input: { year: number; expectedEventNo: number; revisionId: string; requestKey: string }) {
  const session = await resolveAppSession();
  if (!session) return { ok: false as const, error: "not_authenticated" };
  try {
    const plan = await readSalesPlan(salesPlanContext(session), input.year);
    const state = plan && planVersions(plan, new Date().toISOString());
    demand(state?.current?.id === input.revisionId && !state.draft && state.eventNo === input.expectedEventNo, "plan_conflict");
    const reply = await salesPlanCommandAction({ year: input.year, expectedEventNo: input.expectedEventNo, requestKey: input.requestKey, command: { kind: "draft", scope: "regions", content: state.current.content } });
    if (!reply.ok) return reply;
    return { ok: true as const, revisionId: planVersions(reply.plan, new Date().toISOString()).draft!.id };
  } catch (e) { return { ok: false as const, error: e instanceof PlanError ? e.code : "plan_save_failed" }; }
}
export async function saveFocusChange(input: FocusSaveInput) {
  const session = await resolveAppSession();
  if (!session) return { ok: false as const, error: "not_authenticated" };
  try {
    demand(session.scope.kind === "workspace" && can(session.authz, session.entitlement, "planning.target.update", "data").allowed, "plan_denied");
    const ctx = salesPlanContext(session), plan = await readSalesPlan(ctx, input.year);
    demand(plan, "draft_not_found");
    const requestDigest = digest({ actor: session.user.sub, input });
    const retry = plan.events.find(e => e.requestKey === input.requestKey);
    if (retry) { demand(retry.requestHash === requestDigest, "idempotency_conflict"); return { ok: true as const, revisionId: retry.revisionId! }; }
    const state = planVersions(plan, new Date().toISOString()), draft = state.draft;
    demand(draft?.id === input.revisionId && draft.editToken === input.editToken, "draft_conflict");
    demand(draft.content.releaseScope === "regions" && draft.baseId === state.current?.id && state.eventNo === input.expectedEventNo && !state.closed, "plan_conflict");
    const sources = await loadPlanSources(session);
    const content = applyFocusChange(draft.content, input.change, sources.accounts, plan.events.filter(e => e.kind === "lock").map(e => e.period!), () => crypto.randomUUID(), new Date().toISOString());
    await verifyPlanSources(session, content, sources, true);
    await changeSalesPlan({ ...ctx, requestDigest }, { year: input.year, expectedEventNo: input.expectedEventNo, requestKey: input.requestKey, command: { kind: "save", revisionId: draft.id, editToken: draft.editToken, content } });
    for (const path of ["/named", "/planning", "/domain/deployment"]) revalidatePath(path);
    return { ok: true as const, revisionId: draft.id };
  } catch (e) { return { ok: false as const, error: e instanceof PlanError ? e.code : "plan_save_failed" }; }
}
export async function loadFocusTargets(year: number, revisionId: string, regionId: string) {
  const session = await resolveAppSession();
  if (!session) return { ok: false as const, error: "not_authenticated" };
  try {
    const ctx = salesPlanContext(session);
    const view = await readFocusWorkspace({ ...ctx, accounts: session.stores.account() }, { year, revisionId, regionId });
    demand(view.canEdit && view.revision?.draft, "plan_denied");
    const plan = await readSalesPlan(ctx, year);
    const draft = plan!.revisions.find(r => r.id === revisionId)!;
    return { ok: true as const, targets: draft.content.targets.filter(t => t.scope === `territory:${regionId}`), editToken: draft.editToken };
  } catch (e) { return { ok: false as const, error: e instanceof PlanError ? e.code : "source_read_failed" }; }
}

export async function loadFocusCandidates(year: number, revisionId: string, editToken: number) {
  const session = await resolveAppSession();
  if (!session) return { ok: false as const, error: "not_authenticated" };
  try {
    const workspace = await readFocusWorkspace({ ...salesPlanContext(session), accounts: session.stores.account() }, { year, revisionId });
    demand(workspace.canEdit && workspace.revision?.draft, "plan_denied");
    demand(workspace.editToken === editToken, "draft_conflict");
    return { ok: true as const, candidates: workspace.candidates };
  } catch (e) { return { ok: false as const, error: e instanceof PlanError ? e.code : "source_read_failed" }; }
}
