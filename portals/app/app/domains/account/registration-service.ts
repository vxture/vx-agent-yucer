import { matchRegistrationRelations, readRegistrationRelations, type RegistrationHierarchyResult } from "./lib/registration-hierarchy";
import type { AtlasClient } from "../../agent/atlas/client";
import type { RunosClient } from "../../agent/runos/client";
import { can } from "../../authz/decide";
import type { TurnMeter } from "../../usage/lib/copilot-turns";
import { listAccounts, listCustomerNatures, listCustomerSizes, listCustomerTypes, listIndustries, listMarketDivisions, type AccountContext } from "./service";
import { readRegistrationDraft, registrationFrame, similarRegistrations, REGISTRATION_DRAFT_FIELDS, type RegistrationDraftValues } from "./lib/registration-draft";
import { listSegments } from "../strategy/service";
import type { StrategyStore } from "../strategy/store";
import type { CopilotStore } from "../copilot/store";
import { runCopilotTurn } from "../copilot/turn-service";

export type RegistrationAssistResult =
  | { ok: true; sessionId: string; patch: Partial<RegistrationDraftValues>; message: string; similar: { id: string; name: string; accountNo: string }[]; hierarchy: RegistrationHierarchyResult }
  | { ok: false; error: string; sessionId?: string; recovery?: { sessionId: string; messageId: string } };

export interface RegistrationAssistInput { text: string; sessionId?: string; retryMessageId?: string; values: RegistrationDraftValues; hierarchy?: {parentId?:string|null;childIds?:readonly string[]} }
export interface RegistrationAssistDeps {
  tenantId: string | null;
  /** Resolved by the server session, using the shared Atlas OBO flow. */
  subjectToken?: string;
  locale: string;
  copilotStore: CopilotStore;
  strategyStore: StrategyStore;
  atlasClient: AtlasClient;
  runosClient: RunosClient;
  meter?: TurnMeter;
}

/** A metered, read-only extraction turn. Customer writes remain in createAccount. */
export async function prepareAccountRegistration(ctx: AccountContext, input: RegistrationAssistInput, deps: RegistrationAssistDeps): Promise<RegistrationAssistResult> {
  if (!can(ctx.holder, ctx.entitlement, "account.upsert", "data").allowed || !can(ctx.holder, ctx.entitlement, "copilot.ask", "data").allowed) return { ok: false, error: "denied" };
  if (typeof input?.text !== "string" || !input.text.trim() || input.text.length > 4000) return { ok: false, error: "invalid_input" };
  if ([input.sessionId, input.retryMessageId].some(id => id !== undefined && (typeof id !== "string" || id.length > 128))) return { ok: false, error: "invalid_input" };
  const tenantId = deps.tenantId;
  if (!tenantId) return { ok: false, error: "no_active_tenant" };
  const store = deps.copilotStore;
  if (input.sessionId) {
    const thread = await store.getSession(ctx.workspaceId, input.sessionId);
    if (!thread || thread.actorSub !== ctx.sub || !thread.title?.startsWith("[account-registration]")) return { ok: false, error: "not_found" };
  }
  const current = Object.fromEntries(REGISTRATION_DRAFT_FIELDS.map(k => [k, typeof input.values?.[k] === "string" ? input.values[k].slice(0, 500) : ""])) as RegistrationDraftValues;
  const base = { workspaceId: ctx.workspaceId, sub: ctx.sub, holder: ctx.holder, entitlement: ctx.entitlement };
  const [industries, types, sizes, natures, regions, segments] = await Promise.all([
    listIndustries(ctx), listCustomerTypes(ctx), listCustomerSizes(ctx), listCustomerNatures(ctx), listMarketDivisions(ctx),
    listSegments({ ...base, store: deps.strategyStore }),
  ]);
  const options = (r: { ok: boolean; value?: readonly { id: string; name: string }[] }) => r.ok ? r.value?.map(({ id, name }) => ({ id, name })) ?? [] : [];
  const vocab = { industries: options(industries), customerTypes: options(types), customerSizes: options(sizes), customerNatures: options(natures), regions: options(regions),
    segments: segments.ok ? segments.value.filter(s => s.status === "active").map(s => ({ id: s.segmentCode, name: s.name })) : [] };
  try {
    const turn = await runCopilotTurn({ ...base, store }, {
      question: input.text.trim(), sessionId: input.sessionId, retryMessageId: input.retryMessageId, tenantId, subjectToken: deps.subjectToken,
      framing: registrationFrame(vocab, current, deps.locale), profile: "drafting", draftOnly: true, autopilotActive: false,
    }, { atlasClient: deps.atlasClient, runosClient: deps.runosClient, meter: deps.meter });
    if (!turn.ok) return { ok: false, error: turn.violations[0]?.code ?? "denied", recovery: turn.recovery };
    const draft = readRegistrationDraft(turn.value.answer, input.text.trim(), vocab);
    if (!draft) return { ok: false, error: "invalid_draft", sessionId: turn.value.session.id };
    if (draft.patch.province && !draft.patch.region && !current.region && regions.ok) {
      const matches = regions.value.filter(region => region.scope === "china" && region.members.some(member => member.key === draft.patch.province));
      if (matches.length === 1) draft.patch.region = matches[0]!.name;
    }
    const customers = await listAccounts(ctx);
    const hierarchy = matchRegistrationRelations(readRegistrationRelations(turn.value.answer,input.text.trim()),
      customers.ok ? customers.value : [], {name:draft.patch.name ?? current.name,creditCode:draft.patch.creditCode ?? current.creditCode},
      {parentId:typeof input.hierarchy?.parentId==="string"?input.hierarchy.parentId:null,
        childIds:Array.isArray(input.hierarchy?.childIds)?input.hierarchy.childIds.filter(id=>typeof id==="string").slice(0,100):[]});
    return { ok: true, hierarchy, sessionId: turn.value.session.id, ...draft,
      similar: customers.ok ? similarRegistrations(draft.patch.name ?? current.name, customers.value) : [] };
  } catch { return { ok: false, error: "turn_failed" }; }
}
