import { resolveAppSession } from "../../lib/session";
import { getStrategyStore } from "../../../domains/shared/registry";
import { listCampaigns, listPlans, listSegments } from "../../../domains/strategy/service";
import { analysePlans } from "../../../domains/strategy/lib/plan-advice";
import { can } from "../../../authz/decide";
import { AgentCapture } from "../../components/agent-capture";
import { PlanAdvicePanel } from "../../components/plan-advice-panel";
import { movePlan } from "../../strategy/actions";
import { deckBundle, recordAction } from "../deck-data";

// The strategy module's dock - the assistant, then the check that belongs to
// this page.
//
// THE COUNTS ARE ASSEMBLED HERE and handed to a pure rule, the same
// construction the segment dock uses. Campaigns and segments are read through
// their own gated verbs, and a reader who holds strategy.read but not
// campaign.view simply contributes no campaign counts - which is why the two
// campaign findings are computed from a map that may legitimately be empty.

export const dynamic = "force-dynamic";

export default async function StrategyDeck() {
  const [bundle, session] = await Promise.all([deckBundle(), resolveAppSession()]);
  if (!bundle || !session) return null;

  const ctx = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: getStrategyStore(),
  };
  const [plans, campaigns, segments] = await Promise.all([
    listPlans(ctx),
    listCampaigns(ctx),
    listSegments(ctx),
  ]);

  const capture = (
    <AgentCapture data={bundle.agent} canRecord={bundle.canRecord} onRecord={recordAction("")} />
  );

  // A refused read is not an empty finding list: saying "nothing to fix" to
  // somebody who may not see the plans would be a lie the page cannot check.
  if (!plans.ok) return <div className="flex flex-col gap-sm">{capture}</div>;

  // A reader without campaign.view gets NO campaign findings rather than
  // findings computed from a zero they were never shown. The two are different
  // facts and the dock keeps them apart, exactly as the roster column does.
  const campaignCounts = new Map<string, number>();
  if (campaigns.ok) {
    for (const c of campaigns.value) {
      if (c.planId) campaignCounts.set(c.planId, (campaignCounts.get(c.planId) ?? 0) + 1);
    }
  }
  const segmentCounts = new Map<string, number>();
  if (segments.ok) {
    for (const g of segments.value) {
      if (g.planId) segmentCounts.set(g.planId, (segmentCounts.get(g.planId) ?? 0) + 1);
    }
  }

  const advice = analysePlans({
    plans: plans.value.map((p) => ({
      id: p.id,
      planNo: p.planNo,
      name: p.name,
      period: p.period,
      objective: p.objective,
      status: p.status,
    })),
    campaignCounts,
    segmentCounts,
    now: new Date(),
  }).filter((a) => {
    if (!campaigns.ok && (a.kind === "active_no_campaign" || a.kind === "work_under_inactive_plan"))
      return false;
    if (!segments.ok && a.kind === "active_no_segment") return false;
    return true;
  });

  return (
    <div className="flex flex-col gap-sm">
      {capture}
      <PlanAdvicePanel
        advice={advice}
        canApprove={
          can(session.authz, session.entitlement, "strategy.plan.approve", "ui").allowed
        }
        onApprove={movePlan}
      />
    </div>
  );
}
