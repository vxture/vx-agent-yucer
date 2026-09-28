import { dealApprovals, listProducts } from "../../domains/catalog/service";
import { claimHistory, getOpportunityDetail, listStageDefinitions, stageHistory } from "../../domains/pipeline/service";
import { decisionChainsByOpportunity, getAccountDetail } from "../../domains/account/service";
import { chainRecency, listCommitments } from "../../domains/account/field-service";
import { reviewDraft, type ReviewDraft } from "../../domains/pipeline/lib/review-draft";
import { toStageCatalog } from "../../domains/pipeline/store";
import { DEFAULT_STAGE_DEFINITIONS } from "../../domains/pipeline/lib/stage";
import { getCatalogStore, getFieldStore } from "../../domains/shared/registry";
import type { AppSession } from "../lib/session";

// 复盘底稿's rule half for one closed deal (deal batch 12) - ONE assembly, used
// by the deal page and by the 参谋's narrative, so the narrative is written over
// exactly the sections the page shows. Every read goes through its gated verb;
// a refused read leaves its section empty rather than failing the draft.

export async function reviewDraftFor(
  session: AppSession,
  opportunityId: string,
  names: { stageName: (code: string, catalog: ReturnType<typeof toStageCatalog>) => string; unnamedPerson: string },
): Promise<ReviewDraft | null> {
  const base = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
  };
  const pipelineCtx = { ...base, store: session.stores.pipeline() };
  const catalogCtx = { ...base, store: getCatalogStore() };
  const fieldCtx = { ...base, store: getFieldStore() };
  const accountCtx = { ...base, store: session.stores.account() };
  const deal = await getOpportunityDetail(pipelineCtx, opportunityId);
  if (!deal.ok || deal.value.status === "open") return null;
  const o = deal.value;
  const [claims, history, stages, commitments, approvals, products, account, chains] = await Promise.all([
    claimHistory(pipelineCtx, o.id),
    stageHistory(pipelineCtx, o.id),
    listStageDefinitions(pipelineCtx),
    listCommitments(fieldCtx, { opportunityId: o.id }),
    dealApprovals(catalogCtx, o.id),
    listProducts(catalogCtx),
    getAccountDetail(accountCtx, o.accountId),
    decisionChainsByOpportunity(accountCtx, o.accountId, [{ id: o.id, name: o.name }]).catch(() => null),
  ]);
  const people = chains?.ok ? (chains.value[0]?.people ?? []).filter((p) => p.status === "active") : [];
  const recency = chains?.ok ? await chainRecency(fieldCtx, o.accountId, chains.value[0]?.people ?? [], [], {}) : null;
  const contactName = new Map((account.ok ? account.value.contacts : []).map((c) => [c.id, c.name]));
  const productName = new Map((products.ok ? products.value : []).map((p) => [p.id, p.name]));
  const catalog = stages.ok ? toStageCatalog(stages.value) : DEFAULT_STAGE_DEFINITIONS;
  return reviewDraft({
    closedAt: o.closedAt ?? new Date(),
    claims: claims.ok ? claims.value.events : [],
    stageEvents: history.ok ? history.value : [],
    stageName: (code) => names.stageName(code, catalog),
    commitments: commitments.ok ? commitments.value : [],
    people: people.map((p) => ({
      name: contactName.get(p.id) ?? names.unnamedPerson,
      role: p.decisionRole,
      lastContactAt: recency?.ok ? (recency.value.lastContactAt.get(p.id) ?? null) : null,
    })),
    approvals: (approvals.ok ? approvals.value : []).map((a) => ({
      product: productName.get(a.productId) ?? a.productId,
      unitPrice: a.unitPrice,
      floorPrice: a.floorPrice,
      approvedAt: a.approvedAt,
    })),
  });
}
