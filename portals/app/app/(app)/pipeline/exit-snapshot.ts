import { getCatalogStore, getFieldStore } from "../../domains/shared/registry";
import { evidenceOf, getOpportunityDetail, listExitCriteria } from "../../domains/pipeline/service";
import { decisionChainsByOpportunity } from "../../domains/account/service";
import { chainRecency, listCommitments } from "../../domains/account/field-service";
import { listOpportunityLines } from "../../domains/catalog/service";
import { checkStage, dealFactsFrom, snapshotOf, type ExitSnapshot } from "../../domains/pipeline/lib/exit-criteria";
import type { AppSession } from "../lib/session";

// The current stage's exit check, for the journal (deal batch 5b, incr/0088).
//
// The same reads the deal page makes, through the same gated verbs, turned
// into facts by the same dealFactsFrom - so what the drawer showed and what
// the journal records cannot differ. Returns undefined when the deal or the
// criteria cannot be read: then nothing is enforced and the journal row says
// "not recorded", which is honest; guessing a check would not be.

export async function exitSnapshotFor(session: AppSession, opportunityId: string): Promise<ExitSnapshot | undefined> {
  const base = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
  };
  const pipelineCtx = { ...base, store: session.stores.pipeline() };
  const [deal, criteria] = await Promise.all([getOpportunityDetail(pipelineCtx, opportunityId), listExitCriteria(pipelineCtx)]);
  if (!deal.ok || !criteria.ok || deal.value.status !== "open") return undefined;
  const opp = deal.value;
  const now = new Date();
  const accountCtx = { ...base, store: session.stores.account() };
  const fieldCtx = { ...base, store: getFieldStore() };

  const [chain, evidence, lines, commitments] = await Promise.all([
    decisionChainsByOpportunity(accountCtx, opp.accountId, [{ id: opp.id, name: opp.name }]).catch(() => null),
    evidenceOf(pipelineCtx, opp.id),
    listOpportunityLines({ ...base, store: getCatalogStore() }),
    listCommitments(fieldCtx, { opportunityId: opp.id }),
  ]);
  const people = chain?.ok ? (chain.value[0]?.people ?? []).filter((p) => p.status === "active") : null;
  const recency = people ? await chainRecency(fieldCtx, opp.accountId, chain!.ok ? chain!.value[0]!.people : [], [], { now }) : null;

  const facts = dealFactsFrom({
    people: people
      ? people.map((p) => ({
          decisionRole: p.decisionRole,
          lastContactAt: recency?.ok ? (recency.value.lastContactAt.get(p.id) ?? null) : null,
        }))
      : null,
    recencyKnown: recency?.ok ?? false,
    filledSlots: evidence.ok
      ? new Set(Object.values(evidence.value).filter((s) => s.filled).map((s) => s.slot))
      : null,
    lines: lines.ok ? lines.value.filter((l) => l.opportunityId === opp.id) : null,
    commitments: commitments.ok ? commitments.value : null,
    expectedCloseAt: opp.expectedCloseAt,
    now,
  });
  return snapshotOf(opp.stage, checkStage(opp.stage, criteria.value, facts));
}
