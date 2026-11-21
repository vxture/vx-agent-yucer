"use server";
import { can } from "../../authz/decide";
import { canRunAdvisor } from "../../domains/copilot/lib/advisor-gate";
import { REVIEW_CAPABILITY } from "../../domains/copilot/lib/review-narrative";
import { getOpportunityDetail, winLossReviewOf, listWinLossReasons } from "../../domains/pipeline/service";
import { reviewDraftFor } from "../pipeline/review-draft-data";
import { resolveAppSession } from "../lib/session";
import { getMessages } from "../lib/i18n/server";
import { stageLabelFor } from "../lib/view-model";

export async function loadWinLossDetail(id: string) {
  const session = await resolveAppSession();
  if (!session || !can(session.authz, session.entitlement, "pipeline.winloss.view", "data").allowed) return null;
  const ctx = { workspaceId: session.workspaceId, sub: session.user.sub, holder: session.authz, entitlement: session.entitlement, store: session.stores.pipeline() };
  const deal = await getOpportunityDetail(ctx, id);
  if (!deal.ok || deal.value.status === "open") return null;
  const { STAGE_LABEL, CHAIN_TEXT } = await getMessages();
  const [record, reasons, draft, rivals] = await Promise.all([
    winLossReviewOf(ctx, id), listWinLossReasons(ctx),
    reviewDraftFor(session, id, { stageName: (code, catalog) => stageLabelFor(code, catalog, STAGE_LABEL), unnamedPerson: CHAIN_TEXT.unnamedPerson }),
    ctx.store.listCompetitors(session.workspaceId),
  ]);
  if (!record.ok || !reasons.ok) return null;
  const r = record.value;
  return {
    review: r ? { ...r, competitor: r.competitorId ? rivals.find(c => c.id === r.competitorId)?.name ?? r.competitor : r.competitor } : null,
    status: deal.value.status, reasons: reasons.value, knownRivals: rivals.map(rival => rival.name), draft,
    canRecord: can(session.authz, session.entitlement, "pipeline.winloss.record", "ui").allowed,
    canNarrate: canRunAdvisor(session.authz, session.entitlement, REVIEW_CAPABILITY).allowed,
  };
}
