import type { AtlasClient } from "../../agent/atlas/client";
import type { RunosClient } from "../../agent/runos/client";
import { can } from "../../authz/decide";
import type { TurnMeter } from "../../usage/lib/copilot-turns";
import { runCopilotTurn } from "../copilot/turn-service";
import type { CopilotStore } from "../copilot/store";
import type { CatalogContext } from "./service";
import { catalogDraftFields, catalogDraftFrame, readCatalogDraft, type CatalogDraftField, type CatalogDraftKind, type CatalogDraftValues, type CatalogDraftVocabulary } from "./lib/catalog-draft";

export interface CatalogAssistInput {
  text: string; editId?: string; sessionId?: string; retryMessageId?: string;
  values: CatalogDraftValues; manualFields?: readonly CatalogDraftField[];
}
export type CatalogAssistResult =
  | { ok: true; sessionId: string; message: string; patch: Partial<CatalogDraftValues> }
  | { ok: false; error: string; sessionId?: string; recovery?: { sessionId: string; messageId: string } };

/** Existing Atlas/Runos turn and billing; this function cannot persist catalog rows. */
export async function prepareCatalogDraft(ctx: CatalogContext, kind: CatalogDraftKind, input: CatalogAssistInput, deps: {
  tenantId: string | null; subjectToken?: string; locale: string; copilotStore: CopilotStore;
  atlasClient: AtlasClient; runosClient: RunosClient; meter?: TurnMeter;
}): Promise<CatalogAssistResult> {
  const error = requestError(ctx, kind, input, deps.tenantId);
  if (error) return { ok: false, error };
  if (!deps.tenantId) return { ok: false, error: "no_active_tenant" };
  try {
    const title = `[catalog-${kind}-draft]`;
    if (input.sessionId) {
      const session = await deps.copilotStore.getSession(ctx.workspaceId, input.sessionId);
      if (session?.actorSub !== ctx.sub || !session.title?.startsWith(title)) return { ok: false, error: "not_found" };
    }
    // Bound to this workspace after the same write gate as the form; reference
    // reads need their own view permission before being sent to the model.
    const [types, units, products, statuses, solutions] = await Promise.all([
      ctx.store.listProductTypes(ctx.workspaceId), ctx.store.listProductUnits(ctx.workspaceId),
      ctx.store.listProducts(ctx.workspaceId), ctx.store.listStatusConfigs(ctx.workspaceId),
      kind === "solution" ? ctx.store.listSolutions(ctx.workspaceId) : [],
    ]);
    const original = kind === "product" ? products.find(p => p.id === input.editId) : solutions.find(s => s.id === input.editId);
    if (input.editId && !original) return { ok: false, error: "not_found" };
    const activeId = statuses.find(s => s.statusCode === "active")?.id;
    const vocab: CatalogDraftVocabulary = { types, units, products: kind === "solution" ? products.filter(p => p.statusId === activeId) : [] };
    const current = await sanitizedCurrent(ctx, kind, input.values, vocab, original);
    const manual = Array.isArray(input.manualFields) ? catalogDraftFields(kind).filter(key => input.manualFields!.includes(key)) : [];
    const turn = await runCopilotTurn({ workspaceId: ctx.workspaceId, sub: ctx.sub, holder: ctx.holder, entitlement: ctx.entitlement, store: deps.copilotStore }, {
      question: input.text.trim(), sessionId: input.sessionId, retryMessageId: input.retryMessageId,
      tenantId: deps.tenantId, subjectToken: deps.subjectToken, profile: "drafting",
      framing: catalogDraftFrame(kind, vocab, current, manual, deps.locale), draftOnly: true, readOnlyTools: true, autopilotActive: false,
      capabilityQuery: "product solution industry research web search",
      reviewAnswer: answer => reviewDraft(answer, kind, vocab, current, manual),
    }, { atlasClient: deps.atlasClient, runosClient: deps.runosClient, meter: deps.meter });
    if (!turn.ok) return { ok: false, error: turn.violations[0]?.code ?? "turn_failed", recovery: turn.recovery };
    const draft = readCatalogDraft(turn.value.answer, kind, vocab, current, manual);
    if (!draft) return { ok: false, error: "invalid_draft", sessionId: turn.value.session.id };
    return { ok: true, sessionId: turn.value.session.id, message: draft.message, patch: draft.patch };
  } catch { return { ok: false, error: "turn_failed" }; }
}

function requestError(ctx: CatalogContext, kind: CatalogDraftKind, input: CatalogAssistInput, tenantId: string | null): string | undefined {
  const gate = kind === "product" ? "catalog.product.upsert" : "catalog.solution.upsert";
  if (!can(ctx.holder, ctx.entitlement, gate, "data").allowed || !can(ctx.holder, ctx.entitlement, "copilot.ask", "data").allowed) return "denied";
  if (typeof input?.text !== "string" || !input.text.trim() || input.text.length > 4000 || !input.values ||
    [input.editId, input.sessionId, input.retryMessageId].some(id => id !== undefined && (typeof id !== "string" || id.length > 128))) return "invalid_input";
  if (!can(ctx.holder, ctx.entitlement, "catalog.product.view", "data").allowed) return "denied";
  if (!tenantId) return "no_active_tenant";
}
function reviewDraft(answer: string, kind: CatalogDraftKind, vocab: CatalogDraftVocabulary, current: CatalogDraftValues, manual: readonly CatalogDraftField[]) {
  const draft = readCatalogDraft(answer, kind, vocab, current, manual);
  if (!draft) return { answer, feedback: "Return the requested JSON fields object, not a prose claim of filling." };
  if (draft.rejected.length) return { answer, feedback: `Correct invalid fields ${draft.rejected.join(", ")}. Use exact configured UUIDs and positive quantities, retain at least one standard product. Return a corrected JSON fields object.` };
  return { answer };
}

async function sanitizedCurrent(ctx: CatalogContext, kind: CatalogDraftKind, values: CatalogDraftValues, vocab: CatalogDraftVocabulary,
  original: { id: string; typeId?: string | null; unitId?: string } | undefined) {
  const existingItems = kind === "solution" && original ? await ctx.store.listSolutionItems(ctx.workspaceId, original.id) : [];
  const prior: CatalogDraftValues = { name: "", novelty: null, items: existingItems.map(i => ({ ...i, note: i.note ?? "" })) };
  if (kind === "product" && original?.unitId) {
    prior.typeId = original.typeId ?? "";
    prior.unitId = original.unitId;
  }
  const sanitized = readCatalogDraft(JSON.stringify({ fields: values }), kind, vocab, prior);
  return Object.assign({ name: "", novelty: null }, sanitized?.patch) as CatalogDraftValues;
}
