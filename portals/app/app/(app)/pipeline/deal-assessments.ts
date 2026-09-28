import { decisionChainsByOpportunity } from "../../domains/account/service";
import { chainRecency, listCommitments, listInteractions } from "../../domains/account/field-service";
import { listOpportunityLines } from "../../domains/catalog/service";
import {
  competitionFor,
  dealScoreWeights,
  evidenceFor,
  listExitCriteria,
  listStageDefinitions,
  slippagesFor,
  stallRules,
} from "../../domains/pipeline/service";
import { checkStage, dealFactsFrom } from "../../domains/pipeline/lib/exit-criteria";
import {
  DEFAULT_DEAL_SCORE_WEIGHTS,
  competitionFactsFrom,
  dealScore,
  dealScoreBand,
  scoreFactsFrom,
  type DealScore,
} from "../../domains/pipeline/lib/deal-score";
import { stallLineFor } from "../../domains/pipeline/lib/forecast-rule";
import type { OpportunityRecord } from "../../domains/pipeline/store";
import type { AssessedDeal } from "../../domains/pipeline/lib/unverified";
import { getCatalogStore, getFieldStore } from "../../domains/shared/registry";
import type { AppSession } from "../lib/session";

// Many deals' exit check and 商机评估 at once, for 预测检视台's 未经证实金额
// (deal batch 9d).
//
// THE SAME JUDGEMENT AS EACH DEAL'S OWN PAGE: the facts come from
// dealFactsFrom (the exit check) and scoreFactsFrom (the assessment), the two
// builders the deal page itself uses, so the forecast cannot call a deal risky
// that its page calls sound.
//
// READS ARE BATCHED - "每类一次批量读，不逐单查" (YC-067 section 11): evidence,
// competition, slippage and lines once for every deal; the chain, the
// recency, the follow-ups and the promises once per ACCOUNT (their stores are
// keyed that way), never once per deal. A refused read degrades exactly as on
// the deal page: unknown, not met.

/** The page reads a deal's latest 50 follow-ups; the batch keeps the same window. */
const NOTE_WINDOW = 50;

/** One deal's judgement. `assessment` and `stallLine` are for 局势简报
 *  (deal batch 8b), which explains the same five dimensions the page shows. */
export type DealAssessment = Omit<AssessedDeal, "category" | "amount" | "name"> & {
  readonly assessment: DealScore;
  readonly stallLine: number;
};

export async function assessDeals(
  session: AppSession,
  deals: readonly { readonly opportunity: OpportunityRecord; readonly daysAtStage: number | null }[],
  rivalWords: readonly string[],
  now: Date = new Date(),
): Promise<Map<string, DealAssessment>> {
  const base = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
  };
  const pipelineCtx = { ...base, store: session.stores.pipeline() };
  const fieldCtx = { ...base, store: getFieldStore() };
  const accountCtx = { ...base, store: session.stores.account() };
  const ids = deals.map((d) => d.opportunity.id);
  if (ids.length === 0) return new Map();

  // The stage catalog first: a workspace's factory exit criteria are seeded
  // with its catalog on first read (listStageDefinitions), and a forecast read
  // before any deal page must not see "no criteria" and call everything proven.
  await listStageDefinitions(pipelineCtx);
  const [criteria, weights, stall, evidence, competition, slips, lines] = await Promise.all([
    listExitCriteria(pipelineCtx),
    dealScoreWeights(pipelineCtx),
    stallRules(pipelineCtx),
    evidenceFor(pipelineCtx, ids),
    competitionFor(pipelineCtx, ids, now),
    slippagesFor(pipelineCtx, ids),
    listOpportunityLines({ ...base, store: getCatalogStore() }),
  ]);

  // Once per account: its deals' chains, when each person was last in a note,
  // and its follow-ups and promises.
  const byAccount = new Map<string, OpportunityRecord[]>();
  for (const { opportunity: o } of deals) {
    if (!o.accountId) continue;
    byAccount.set(o.accountId, [...(byAccount.get(o.accountId) ?? []), o]);
  }
  const perAccount = new Map(
    await Promise.all(
      [...byAccount].map(async ([accountId, own]) => {
        const [chains, notes, promises] = await Promise.all([
          decisionChainsByOpportunity(accountCtx, accountId, own.map((o) => ({ id: o.id, name: o.name }))).catch(() => null),
          listInteractions(fieldCtx, { accountId }),
          listCommitments(fieldCtx, { accountId }),
        ]);
        const everyone = chains?.ok ? chains.value.flatMap((c) => c.people) : [];
        const recency = chains?.ok ? await chainRecency(fieldCtx, accountId, everyone, [], { now }) : null;
        return [accountId, { chains, notes, promises, recency }] as const;
      }),
    ),
  );

  const out = new Map<string, DealAssessment>();
  for (const { opportunity: o, daysAtStage } of deals) {
    const acc = o.accountId ? perAccount.get(o.accountId) : undefined;
    const chain = acc?.chains?.ok ? (acc.chains.value.find((c) => c.opportunityId === o.id) ?? null) : null;
    const active = chain ? chain.people.filter((p) => p.status === "active") : null;
    const recencyOk = acc?.recency?.ok ?? false;
    const lastContact = (id: string) => (acc?.recency?.ok ? (acc.recency.value.lastContactAt.get(id) ?? null) : null);
    const slots = evidence.ok ? evidence.value.get(o.id) : undefined;
    const filledSlots = slots ? new Set(Object.values(slots).filter((s) => s.filled).map((s) => s.slot)) : null;
    const dealLines = lines.ok ? lines.value.filter((l) => l.opportunityId === o.id) : null;
    const commitments = acc?.promises.ok ? acc.promises.value.filter((c) => c.opportunityId === o.id) : null;
    const interactions = acc?.notes.ok
      ? acc.notes.value
          .filter((n) => n.opportunityId === o.id)
          .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
          .slice(0, NOTE_WINDOW)
      : [];

    const exitCheck =
      criteria.ok && o.status === "open"
        ? checkStage(
            o.stage,
            criteria.value,
            dealFactsFrom({
              people: active ? active.map((p) => ({ decisionRole: p.decisionRole, lastContactAt: lastContact(p.id) })) : null,
              recencyKnown: recencyOk,
              filledSlots,
              lines: dealLines,
              commitments,
              expectedCloseAt: o.expectedCloseAt,
              now,
            }),
          )
        : null;
    const view = competition.ok ? competition.value.get(o.id) : undefined;
    const stallLine = stallLineFor(
      { stallDaysOverride: stall.ok ? stall.value.overrideFor(o.businessFormId) : null },
      stall.ok ? stall.value.thresholds : undefined,
    );
    const score = dealScore(
      scoreFactsFrom({
        open: o.status === "open",
        customerBudgetKnown: o.customerBudget != null,
        expectedCloseAt: o.expectedCloseAt,
        filledSlots,
        people: chain && active
          ? active.map((p) => ({ role: p.decisionRole, stance: p.stance ?? null, lastContactAt: lastContact(p.id) }))
          : null,
        interactions,
        rivalWords,
        competition: view ? competitionFactsFrom(view) : undefined,
        commitments: commitments ?? [],
        exit: exitCheck,
        daysInStage: o.status === "open" ? daysAtStage : null,
        stallLine,
        slips: slips.ok ? (slips.value.get(o.id)?.pushes ?? 0) : 0,
        pendingApprovals: (dealLines ?? []).filter((l) => l.needsApproval && !l.approved).length,
        now,
      }),
      weights.ok ? weights.value : DEFAULT_DEAL_SCORE_WEIGHTS,
    );
    const names = (s: string) => (exitCheck ? exitCheck.checks.filter((c) => c.status === s).map((c) => c.criterion.name) : []);
    out.set(o.id, {
      id: o.id,
      exit: exitCheck ? { total: exitCheck.total, unmet: names("unmet"), unknown: names("unknown") } : null,
      score: score.score,
      risk: dealScoreBand(score.score) === "bad",
      assessment: score,
      stallLine,
    });
  }
  return out;
}
