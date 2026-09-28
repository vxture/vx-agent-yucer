"use server";

import { AtlasClient } from "../../agent/atlas/client";
import { RunosClient } from "../../agent/runos/client";
import { runAdvisor } from "../../domains/copilot/advisor";
import { runCopilotTurn } from "../../domains/copilot/turn-service";
import { canRunAdvisor } from "../../domains/copilot/lib/advisor-gate";
import {
  PRICE_CAPABILITY,
  PRICE_NOTE_WINDOW,
  admitPriceAdvice,
  priceQuestion,
  type PriceAdvice,
  type PriceAdviceInput,
} from "../../domains/copilot/lib/price-advice";
import { concessionSheet } from "../../domains/catalog/lib/pricing";
import { listOpportunityLines, listPrices, listProducts } from "../../domains/catalog/service";
import { getOpportunityDetail } from "../../domains/pipeline/service";
import { listInteractions } from "../../domains/account/field-service";
import { getCatalogStore, getCopilotStore, getFieldStore } from "../../domains/shared/registry";
import { ADVISOR_RUN_TURN_METER } from "../../usage/lib/copilot-turns";
import { resolveAppSession, tenantIdOf } from "../lib/session";

// 价格参谋 (deal batch 10b, YC-066 S4) - one press in the signing dialog.
//
// The same concession sheet the approver is looking at, and the deal's latest
// follow-ups, go to the model through the one door (runAdvisor: gated on the
// deal's feature, one yucer.advisor.runs, the same inputs answer from the
// cache). What comes back is ADMITTED by lib/price-advice.ts before anyone
// sees it: figures that are not the sheet's and quotes that are not in a note
// are dropped. It proposes nothing - every proposal the turn produces is
// refused - and it never says approve or reject.

export type PriceAdviceResult =
  | { ok: true; advice: PriceAdvice; cached: boolean }
  | { ok: false; error: string };

interface PriceAdviceRun {
  readonly advice: PriceAdvice | null;
}

export async function adviseOnPrice(opportunityId: string): Promise<PriceAdviceResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };
  const gate = canRunAdvisor(session.authz, session.entitlement, PRICE_CAPABILITY);
  if (!gate.allowed) return { ok: false, error: gate.reason ?? "denied" };
  const tenantId = tenantIdOf(session);
  if (!tenantId) return { ok: false, error: "no_active_tenant" };

  const base = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
  };
  const catalogCtx = { ...base, store: getCatalogStore() };
  const deal = await getOpportunityDetail({ ...base, store: session.stores.pipeline() }, opportunityId);
  if (!deal.ok) return { ok: false, error: deal.violations[0]?.code ?? "denied" };

  const [lines, prices, products, notes] = await Promise.all([
    listOpportunityLines(catalogCtx),
    listPrices(catalogCtx),
    listProducts(catalogCtx),
    listInteractions({ ...base, store: getFieldStore() }, { opportunityId, limit: PRICE_NOTE_WINDOW }),
  ]);
  if (!lines.ok || !prices.ok) return { ok: false, error: "denied" };
  const dealLines = lines.value.filter((l) => l.opportunityId === opportunityId);
  // Nothing waits for a signature: there is no discount to advise on.
  if (!dealLines.some((l) => l.needsApproval && !l.approved)) return { ok: false, error: "price_nothing_pending" };

  const sheet = concessionSheet(dealLines, prices.value);
  const nameOf = new Map((products.ok ? products.value : []).map((p) => [p.id, p.name]));
  const input: PriceAdviceInput = {
    dealName: deal.value.name,
    currency: deal.value.currency,
    lines: sheet.rows.map((r) => ({
      product: nameOf.get(r.productId) ?? r.productId,
      quantity: r.quantity,
      listPrice: r.listPrice,
      floorPrice: r.floorPrice,
      unitPrice: r.unitPrice,
      belowFloor: r.belowFloor,
    })),
    listAmount: sheet.listAmount,
    concession: sheet.concession,
    rate: sheet.rate,
    notes: (notes.ok ? notes.value : [])
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
      .slice(0, PRICE_NOTE_WINDOW)
      .map((n) => ({ id: n.id, date: n.occurredAt.toISOString().slice(0, 10), text: n.rawNote })),
  };
  const question = priceQuestion(input);

  const copilotCtx = { ...base, store: getCopilotStore() };
  const run = await runAdvisor<PriceAdviceRun>(copilotCtx, {
    capability: PRICE_CAPABILITY,
    kind: "price_advice",
    subject: { type: "opportunity", id: opportunityId },
    input: { question },
    generate: async ({ runId, atlas }) => {
      const turn = await runCopilotTurn(
        copilotCtx,
        {
          question,
          tenantId,
          subject: { type: "opportunity", id: opportunityId, summary: deal.value.name },
          autopilotActive: false,
          capability: PRICE_CAPABILITY,
          // A finding, not a proposal: nothing this turn suggests is filed.
          admitProposal: () => false,
          advisorRun: { featureId: atlas.featureId, runId },
        },
        { atlasClient: new AtlasClient(), runosClient: new RunosClient(), meter: ADVISOR_RUN_TURN_METER },
      );
      return turn.ok ? { ok: true as const, value: { advice: admitPriceAdvice(turn.value.answer, input) } } : turn;
    },
  });
  if (!run.ok) return { ok: false, error: run.violations[0]?.code ?? "denied" };
  const advice = run.value.content.advice;
  if (!advice) return { ok: false, error: "price_advice_empty" };
  return { ok: true, advice, cached: run.value.cached };
}
