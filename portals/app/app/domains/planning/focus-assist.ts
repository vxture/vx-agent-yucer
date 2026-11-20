import type { TurnMeter } from "../../usage/lib/copilot-turns";
import type { AtlasClient } from "../../agent/atlas/client";
import type { RunosClient } from "../../agent/runos/client";
import type { CopilotStore } from "../copilot/store";
import { runCopilotTurn } from "../copilot/turn-service";
import { readAssistantFields } from "../shared/assistant-fields";
import { can } from "../../authz/decide";
import { readSalesPlan, type SalesPlanContext } from "./plan-service";
import { digest, PlanError, planVersions } from "./plan-model";
import { minor } from "./plan-values";
export type FocusDraftFields = { objective: string; due: string; budget: string; amount: string; note: string };
export type FocusAssistInput = { year: number; revisionId: string; editToken: number; accountId: string; regionId: string; targetKey?: string; text: string; values: FocusDraftFields; sessionId?: string; retryMessageId?: string };
export function readFocusDraft(answer: string) {
  const raw = readAssistantFields(answer);
  if (!raw || Object.keys(raw.fields).some(k => !["objective", "due", "budget", "amount", "note"].includes(k))) return null;
  const patch: Partial<FocusDraftFields> = {};
  for (const key of ["objective", "due", "budget", "amount", "note"] as const) {
    const value = raw.fields[key];
    if (value === undefined) continue;
    if (!validField(key, value)) return null;
    patch[key] = value;
  }
  return { patch, message: raw.message };
}
function validField(key: keyof FocusDraftFields, value: unknown): value is string {
  if (typeof value !== "string" || value.length > (key === "objective" ? 1000 : 2000)) return false;
  if (!value) return true;
  if (["budget", "amount"].includes(key)) { try { minor(value); } catch { return false; } }
  return key !== "due" || /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
}
function validInput(input: FocusAssistInput, accountId: string) {
  if (typeof input?.text !== "string" || !input.text.trim() || input.text.length > 4000 || input.accountId !== accountId) return false;
  if (!Number.isInteger(input.year) || !Number.isInteger(input.editToken)) return false;
  if ([input.revisionId, input.accountId, input.regionId].some(id => typeof id !== "string" || !id || id.length > 128)) return false;
  if ([input.targetKey, input.sessionId, input.retryMessageId].some(id => id !== undefined && (typeof id !== "string" || id.length > 128))) return false;
  return !!input.values && !!readFocusDraft(JSON.stringify({ fields: input.values }));
}
function currentDraft(state: ReturnType<typeof planVersions> | null, input: FocusAssistInput) {
  const draft = state?.draft;
  if (draft?.id !== input.revisionId || draft.editToken !== input.editToken || draft.baseId !== state?.current?.id || state?.closed || draft.content.releaseScope !== "regions") return null;
  return draft;
}
export async function prepareFocusDraft(ctx: SalesPlanContext, input: FocusAssistInput, deps: {
  tenantId: string | null; subjectToken?: string; locale: string; copilotStore: CopilotStore; atlasClient: AtlasClient; runosClient: RunosClient;
  account: { id: string; name: string; tier: string }; meter?: TurnMeter;
}) {
  try {
    if (!assistAllowed(ctx)) return { ok: false as const, error: "plan_denied" };
    if (!deps.tenantId || !validInput(input, deps.account.id)) return { ok: false as const, error: "invalid_input" };
    const plan = await readSalesPlan(ctx, input.year);
    const state = plan && planVersions(plan, (ctx.now?.() ?? new Date()).toISOString()), draft = currentDraft(state, input);
    if (!draft) return { ok: false as const, error: "draft_conflict" };
    const region = draft.content.regions.find(r => r.id === input.regionId && r.included);
    const target = draft.content.targets.find(t => t.key === input.targetKey && t.scope === `territory:${input.regionId}`);
    if (!region || (input.targetKey && !target)) return { ok: false as const, error: "invalid_input" };
    const title = `[focus-draft] ${digest({ workspace: ctx.workspaceId, actor: ctx.sub, year: input.year, revision: draft.id, token: draft.editToken, account: input.accountId, region: input.regionId, target: input.targetKey }).slice(0,24)}`;
    if (input.sessionId) {
      const session = await deps.copilotStore.getSession(ctx.workspaceId, input.sessionId);
      if (session?.actorSub !== ctx.sub || session.title !== title) return { ok: false as const, error: "not_found" };
    }
    const sessionId = input.sessionId ?? (await deps.copilotStore.createSession(ctx.workspaceId, { actorSub: ctx.sub, title, subjectType: "account", subjectId: input.accountId })).id;
    const framing = `${title}
Prepare the customer deployment form, never save or publish. Reply in ${deps.locale}.
Context: ${JSON.stringify({ account: deps.account, year: input.year, region: { id: region.id, name: region.name }, target, existing: input.values })}
Return ONLY JSON {"message":"brief actual field summary", "fields":{"objective":"specific next action", "due":"YYYY-MM-DD", "budget":"nonnegative decimal", "amount":"nonnegative decimal", "note":"budget basis and assumptions"}}. All fields optional; do not change IDs, owners, targets or customer tier. Research public facts when helpful, distinguish facts and assumptions, complete a useful draft first for human correction, ask only blocking questions. Budget is customer total for the selected target period/metric; amount is this region's contribution, not greater than budget or regional target. Money uses target currency; new_logo uses integer customers. Convert Chinese amount units correctly. No invented zero budget when unknown. Due must be in this planning year. Do not claim saved/published or completed actions. User corrections take priority.`;
    const turn = await runCopilotTurn({ workspaceId: ctx.workspaceId, sub: ctx.sub, holder: ctx.holder, entitlement: ctx.entitlement, store: deps.copilotStore }, { question: input.text.trim(), subject: { type: "account", id: input.accountId }, sessionId, retryMessageId: input.retryMessageId, tenantId: deps.tenantId, subjectToken: deps.subjectToken, profile: "drafting", framing, draftOnly: true, readOnlyTools: true, autopilotActive: false, capabilityQuery: "customer account deployment planning research", reviewAnswer: answer => readFocusDraft(answer) ? { answer } : { answer, feedback: "Use only the requested JSON fields with valid dates and numeric amounts." } }, { atlasClient: deps.atlasClient, runosClient: deps.runosClient, meter: deps.meter });
    if (!turn.ok) return { ok: false as const, error: turn.violations[0]?.code ?? "turn_failed", recovery: turn.recovery };
    const latest = await readSalesPlan(ctx, input.year), now = latest && planVersions(latest, (ctx.now?.() ?? new Date()).toISOString());
    if (!currentDraft(now, input) || now?.current?.id !== state?.current?.id) return { ok: false as const, error: "draft_conflict" };
    const parsed = readFocusDraft(turn.value.answer);
    const error = responseError(parsed, target?.metric, input.year);
    if (error || !parsed) return { ok: false as const, error: error ?? "invalid_draft" };
    return { ok: true as const, sessionId: turn.value.session.id, message: parsed.message, patch: parsed.patch };
  } catch (e) { return { ok: false as const, error: e instanceof PlanError ? e.code : "turn_failed" }; }
}

function responseError(parsed: ReturnType<typeof readFocusDraft>, metric: string | undefined, year: number) {
  if (!parsed) return "invalid_draft";
  if (parsed.patch.due && !parsed.patch.due.startsWith(`${year}-`)) return "invalid_action";
  if (metric === "new_logo" && [parsed.patch.budget, parsed.patch.amount].some(value => !!value && minor(value) % 100n !== 0n)) return "count_integer";
  return null;
}

function assistAllowed(ctx: SalesPlanContext) {
  return ctx.scope.kind === "workspace" && can(ctx.holder, ctx.entitlement, "planning.target.update", "data").allowed && can(ctx.holder, ctx.entitlement, "copilot.ask", "data").allowed;
}
