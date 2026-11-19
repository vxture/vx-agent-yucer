import type { AtlasClient } from "../../agent/atlas/client";
import type { RunosClient } from "../../agent/runos/client";
import { can } from "../../authz/decide";
import type { TurnMeter } from "../../usage/lib/copilot-turns";
import { listIndustries, listCustomerSizes, listMarketDivisions, type AccountContext } from "../account/service";
import { listProductReferences, listSolutionReferences } from "../catalog/service";
import type { CatalogStore } from "../catalog/store";
import { runCopilotTurn } from "../copilot/turn-service";
import type { CopilotStore } from "../copilot/store";
import { listSegments, type StrategyContext } from "./service";
import { readSegmentDraft, segmentDraftFrame, SEGMENT_FILL_FIELDS, SEGMENT_LIST_FIELDS, SEGMENT_TEXT_FIELDS, type SegmentFillField, type SegmentFillValues, type SegmentVocabulary } from "./lib/segment-draft";
import { SEGMENT_SUMMARY_LIMIT } from "./lib/segment-summary";

export interface SegmentAssistInput {
  text: string; editId?: string; sessionId?: string; retryMessageId?: string;
  values: SegmentFillValues; manualFields?: readonly SegmentFillField[];
}
export type SegmentAssistResult =
  | { ok: true; sessionId: string; message: string; patch: Partial<SegmentFillValues> }
  | { ok: false; error: string; sessionId?: string; recovery?: { sessionId: string; messageId: string } };

/** Configured choices are available even before the first customer exists. */
export async function segmentVocabulary(account: AccountContext, catalog: CatalogStore): Promise<SegmentVocabulary> {
  const base = { workspaceId: account.workspaceId, sub: account.sub, holder: account.holder, entitlement: account.entitlement };
  const [industries, regions, sizes, solutions, products] = await Promise.all([
    listIndustries(account), listMarketDivisions(account), listCustomerSizes(account),
    can(account.holder, account.entitlement, "catalog.solution.view", "data").allowed
      ? listSolutionReferences({ ...base, store: catalog }).catch(() => null) : null,
    can(account.holder, account.entitlement, "catalog.product.view", "data").allowed
      ? listProductReferences({ ...base, store: catalog }).catch(() => null) : null,
  ]);
  return { industries: industries.ok ? industries.value.map(r => r.name) : [],
    regions: regions.ok ? regions.value.map(r => r.name) : [], sizes: sizes.ok ? sizes.value.map(r => r.name) : [],
    solutions: solutions?.ok ? solutions.value : null, products: products?.ok ? products.value : null };
}

/** Uses the shared metered Atlas/Runos turn. Only the existing Save can write a market. */
export async function prepareSegmentDraft(ctx: StrategyContext, input: SegmentAssistInput, deps: {
  tenantId: string | null; subjectToken?: string; locale: string; account: AccountContext; catalog: CatalogStore;
  copilotStore: CopilotStore; atlasClient: AtlasClient; runosClient: RunosClient; meter?: TurnMeter;
}): Promise<SegmentAssistResult> {
  if (!can(ctx.holder, ctx.entitlement, "strategy.segment.upsert", "data").allowed || !can(ctx.holder, ctx.entitlement, "copilot.ask", "data").allowed) return { ok: false, error: "denied" };
  if (typeof input?.text !== "string" || !input.text.trim() || input.text.length > 4000 ||
    [input.editId, input.sessionId, input.retryMessageId].some(id => id !== undefined && (typeof id !== "string" || id.length > 128))) return { ok: false, error: "invalid_input" };
  if (!deps.tenantId) return { ok: false, error: "no_active_tenant" };
  try {
    if (input.sessionId) {
      const session = await deps.copilotStore.getSession(ctx.workspaceId, input.sessionId);
      if (!session || session.actorSub !== ctx.sub || !session.title?.startsWith("[segment-draft]")) return { ok: false, error: "not_found" };
    }
    const segments = await listSegments(ctx);
    if (!segments.ok) return { ok: false, error: segments.violations[0]?.code ?? "denied" };
    const original = segments.value.find(row => row.id === input.editId);
    if (input.editId && !original) return { ok: false, error: "not_found" };
    const vocab = await segmentVocabulary(deps.account, deps.catalog);
    const current = {} as SegmentFillValues;
    for (const key of SEGMENT_TEXT_FIELDS) current[key] = typeof input.values?.[key] === "string" ? input.values[key].slice(0, key === "name" ? 200 : key === "needSummary" ? SEGMENT_SUMMARY_LIMIT : 2000) : "";
    for (const key of SEGMENT_LIST_FIELDS) {
      const choices = key === "solutionIds" ? [...(vocab.solutions ?? []).map(r => r.id), ...(original?.solutionIds ?? [])]
        : key === "productIds" ? [...(vocab.products ?? []).map(r => r.id), ...(original?.productIds ?? [])]
        : [...vocab[key], ...(original?.criteria[key] ?? [])];
      current[key] = Array.isArray(input.values?.[key]) ? [...new Set(input.values[key].filter(value => choices.includes(value)))].slice(0, 100) : [];
    }
    const manualFields = Array.isArray(input.manualFields) ? SEGMENT_FILL_FIELDS.filter(key => input.manualFields!.includes(key)) : [];
    const turn = await runCopilotTurn({ workspaceId: ctx.workspaceId, sub: ctx.sub, holder: ctx.holder, entitlement: ctx.entitlement, store: deps.copilotStore }, {
      question: input.text.trim(), sessionId: input.sessionId, retryMessageId: input.retryMessageId,
      tenantId: deps.tenantId, subjectToken: deps.subjectToken, profile: "drafting",
      framing: segmentDraftFrame(vocab, current, manualFields, deps.locale), draftOnly: true, readOnlyTools: true, autopilotActive: false,
      capabilityQuery: "industry market research web search",
      reviewAnswer: answer => {
        const draft = readSegmentDraft(answer, vocab, current, manualFields);
        return { answer, ...(!draft ? { feedback: "Return the requested JSON fields object, not a prose claim of filling. Fill a useful draft using the supplied vocabulary." }
          : draft.rejected.length ? { feedback: `Correct invalid fields ${draft.rejected.join(", ")}. Use exact configured names and catalog IDs. Return the complete corrected JSON fields object.` } : {}) };
      },
    }, { atlasClient: deps.atlasClient, runosClient: deps.runosClient, meter: deps.meter });
    if (!turn.ok) return { ok: false, error: turn.violations[0]?.code ?? "turn_failed", recovery: turn.recovery };
    const draft = readSegmentDraft(turn.value.answer, vocab, current, manualFields);
    if (!draft) return { ok: false, error: "invalid_draft", sessionId: turn.value.session.id };
    return { ok: true, sessionId: turn.value.session.id, message: draft.message, patch: draft.patch };
  } catch { return { ok: false, error: "turn_failed" }; }
}
