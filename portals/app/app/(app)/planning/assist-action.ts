"use server";
import { can } from "../../authz/decide";
import { AtlasClient } from "../../agent/atlas/client";
import { RunosClient } from "../../agent/runos/client";
import { preparePlanningDraft, type PlanningAssistInput } from "../../domains/planning/plan-assist-service";
import { validateContent } from "../../domains/planning/plan-model";
import { readSalesPlan } from "../../domains/planning/plan-service";
import { applyPlanningDraft } from "../lib/planning-assist";
import { getMessages } from "../lib/i18n/server";
import { PlanError } from "../../domains/planning/plan-values";
import { getCopilotStore } from "../../domains/shared/registry";
import { resolveAppSession, tenantIdOf } from "../lib/session";
import { resolveLocale } from "../lib/i18n/locale";
import { loadPlanSources, salesPlanContext, verifyPlanSources } from "./plan-data";
export async function assistPlanningDraft(input: PlanningAssistInput) {
  const session = await resolveAppSession();
  if (!session) return { ok: false as const, error: "not_authenticated" };
  try {
    if (session.scope.kind !== "workspace" || !can(session.authz, session.entitlement, "planning.target.update", "data").allowed || !can(session.authz, session.entitlement, "copilot.ask", "data").allowed) return { ok: false as const, error: "plan_denied" };
    await readSalesPlan(salesPlanContext(session), input.year);
    validateContent(input.values, false);
    // Validate workspace source UUIDs before giving unsaved values to a model.
    await verifyPlanSources(session, input.values, await loadPlanSources(session));
    const result = await preparePlanningDraft(salesPlanContext(session), input, {
      tenantId: tenantIdOf(session), subjectToken: (await session.accessToken()) ?? undefined,
      locale: await resolveLocale(), copilotStore: getCopilotStore(), atlasClient: new AtlasClient(), runosClient: new RunosClient(),
    });
    if (!result.ok) return result;
    const plan = await readSalesPlan(salesPlanContext(session), input.year);
    const next = applyPlanningDraft(input.values, result.patch, input.regionId, plan?.events.filter(e => e.kind === "lock").map(e => e.period!) ?? []);
    validateContent(next, false);
    const { PLAN_WORKSPACE_TEXT: W } = await getMessages();
    const changed = JSON.stringify(next) !== JSON.stringify(input.values);
    return { ...result, patch: next, message: changed ? W.assistantApplied : W.assistantNoChange };
  } catch (error) { return { ok: false as const, error: error instanceof PlanError ? error.code : "source_read_failed" }; }
}
