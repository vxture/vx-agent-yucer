import type { AtlasClient } from "../../agent/atlas/client";
import type { RunosClient } from "../../agent/runos/client";
import { can } from "../../authz/decide";
import type { TurnMeter } from "../../usage/lib/copilot-turns";
import { runCopilotTurn } from "../copilot/turn-service";
import type { CopilotStore } from "../copilot/store";
import { readSalesPlan, type SalesPlanContext } from "./plan-service";
import { digest, PlanError, validateContent, type PlanContent, type SalesPlan } from "./plan-model";
import { planVersions } from "./plan-state";
import { planningDraftScope, readPlanningDraft, type PlanningDraftContext } from "./plan-assist-draft";
export type PlanningAssistInput = PlanningDraftContext & { text: string; values: PlanContent; sessionId?: string; retryMessageId?: string };

/** Draft-only use of the established Atlas/Runos turn, audit and usage chain. */
export async function preparePlanningDraft(ctx: SalesPlanContext, input: PlanningAssistInput, deps: {
  tenantId: string | null; subjectToken?: string; locale: string; copilotStore: CopilotStore;
  atlasClient: AtlasClient; runosClient: RunosClient; meter?: TurnMeter;
}) {
  const now = () => (ctx.now?.() ?? new Date()).toISOString();
  try {
    const requestError = planningAssistRequestError(ctx, input, deps.tenantId);
    if (requestError) return { ok: false as const, error: requestError };
    const plan = await readSalesPlan(ctx, input.year);
    const draft = validAssistDraft(plan, input, now());
    if (!plan || !draft) return { ok: false as const, error: "draft_conflict" };
    validateContent(input.values, false);
    if (input.values.year !== plan.year || input.values.releaseScope !== draft.content.releaseScope || input.values.companyRevisionId !== draft.content.companyRevisionId) return { ok: false as const, error: "invalid_input" };
    const scope = planningDraftScope(input.values, input.regionId);
    if (!scope) return { ok: false as const, error: "invalid_input" };
    const context = digest({ workspace: ctx.workspaceId, year: input.year, revision: draft.id, token: draft.editToken, region: input.regionId ?? null }).slice(0, 24);
    const title = `[planning-draft] ${context}`;
    if (input.sessionId) {
      const session = await deps.copilotStore.getSession(ctx.workspaceId, input.sessionId);
      if (session?.actorSub !== ctx.sub || !session.title?.startsWith(title)) return { ok: false as const, error: "not_found" };
    }
    const targets = input.values.targets.filter(t => t.scope === scope && t.period === `Y${input.year}`);
    const companyTargets = scope === "workspace" ? undefined : input.values.targets.filter(t => t.scope === "workspace");
    const regionalTargets = scope === "workspace" ? undefined : input.values.targets.filter(t => t.scope !== "workspace");
    const framing = `${title}
You are drafting the visible sales planning form, not publishing or saving it. Reply in ${deps.locale}.
Context: ${JSON.stringify({ year: input.year, planId: plan.id, revisionId: draft.id, editToken: draft.editToken, companyRevisionId: draft.content.companyRevisionId, scope, companyTargets, regionalTargets, lockedPeriods: plan.events.filter(e => e.kind === "lock").map(e => e.period), targets, assumptions: input.values.assumptions, allocationNote: input.values.allocationNote, capacityNote: input.values.capacityNote })}
Return ONLY JSON {"message":"brief actual draft summary", "fields":{"targets":[{"metric":"revenue|new_logo|pipeline|margin","value":"canonical numeric amount"}],"assumptions":"text","allocationNote":"text","capacityNote":"text"}}. Optional fields.newCustomerEstimate={"preset":"general|software|projects|equipment|subscription|custom","currency":"same as revenue","revenueShare":"50","firstOrderAmount":"100000","automatic":true} estimates integer customers as ceil(revenue target * share/100 / first-order average). For CNY, editable planning starting points (not verified market statistics) are general/software100000, projects500000, equipment200000, subscription30000, share50%. Use available research and user context to refine these assumptions, and state the basis. Never apply CNY references as another currency. An explicit new_logo target overrides an estimate. All fields optional. Annual targets only. Currency follows existing targets; new_logo is integer customers. margin is a percentage from 0 to 100 (40 means 40%, never a currency amount). Other monetary values are currency units, convert \u4e07/\u767e\u4e07 correctly. Keep user corrections. Use reasonable stated assumptions to complete planning, ask only blocking questions. For a regional scope, companyTargets are the published read-only limits and regionalTargets include other regional allocations. Keep company targets unchanged. Prefer metrics already set by the company; respect annual and same-quarter remaining capacity. Never increase a regional quota merely to balance a missing fact. The form computes floor60%, stretch120%, quarterly10/20/30/Q4remainder for company planning; regional revenue follows the published company quarterly timing, auxiliary quarters follow regional revenue, and new customers are integers; margin uses rates30/40/50 against the SAME annual revenue target (not revenue floor/stretch); quarters inherit the target rate rather than splitting percentages. Pipeline defaults to three times baseline revenue target, representing required opportunity stock, not expected closed revenue. Do not independently alter quarters, UUIDs, regions, members, customers, versions or publication. Do not claim saved/published. For unsupported operations explain the required visible control and return empty fields. Existing assumptions may be structured text: preserve existing content when not asked to change it.`;
    const sessionId = input.sessionId ?? (await deps.copilotStore.createSession(ctx.workspaceId, { actorSub: ctx.sub, title, subjectType: null, subjectId: null })).id;
    const turn = await runCopilotTurn({ workspaceId: ctx.workspaceId, sub: ctx.sub, holder: ctx.holder, entitlement: ctx.entitlement, store: deps.copilotStore }, {
      question: input.text.trim(), sessionId, retryMessageId: input.retryMessageId,
      tenantId: deps.tenantId!, subjectToken: deps.subjectToken, profile: "drafting", framing,
      draftOnly: true, readOnlyTools: true, autopilotActive: false, capabilityQuery: "sales planning target allocation research",
      reviewAnswer: answer => readPlanningDraft(answer) ? { answer } : { answer, feedback: "Return the specified JSON fields. Use canonical nonnegative amounts, integer new_logo, no UUID or publication fields." },
    }, { atlasClient: deps.atlasClient, runosClient: deps.runosClient, meter: deps.meter });
    if (!turn.ok) return { ok: false as const, error: turn.violations[0]?.code ?? "turn_failed", recovery: turn.recovery };
    // Detect another editor's save/release while the model was running.
    const latest = await readSalesPlan(ctx, input.year);
    const latestState = latest && planVersions(latest, now());
    if (!validAssistDraft(latest, input, now()) || latestState?.current?.id !== planVersions(plan, now()).current?.id) return { ok: false as const, error: "draft_conflict" };
    const parsed = readPlanningDraft(turn.value.answer);
    return parsed ? { ok: true as const, sessionId: turn.value.session.id, message: parsed.message, patch: parsed.patch } : { ok: false as const, error: "invalid_draft" };
  } catch (error) { return { ok: false as const, error: error instanceof PlanError ? error.code : "turn_failed" }; }
}

function planningAssistRequestError(ctx: SalesPlanContext, input: PlanningAssistInput, tenantId: string | null) {
  if (!can(ctx.holder, ctx.entitlement, "planning.target.update", "data").allowed || !can(ctx.holder, ctx.entitlement, "copilot.ask", "data").allowed || ctx.scope.kind !== "workspace") return "plan_denied";
  if (!tenantId) return "no_active_tenant";
  if (typeof input?.text !== "string" || !input.text.trim() || input.text.length > 4000 || !Number.isInteger(input.year) ||
    !Number.isInteger(input.editToken) || typeof input.revisionId !== "string" || input.revisionId.length > 128) return "invalid_input";
  if ([input.regionId, input.sessionId, input.retryMessageId].some(id => id !== undefined && (typeof id !== "string" || id.length > 128))) return "invalid_input";
  return null;
}
function validAssistDraft(plan: SalesPlan | null, input: PlanningAssistInput, at: string) {
  if (!plan) return null;
  const state = planVersions(plan, at), draft = state.draft;
  if (draft?.id !== input.revisionId || draft.editToken !== input.editToken || state.closed || draft.baseId !== (state.current?.id ?? null)) return null;
  return draft;
}
