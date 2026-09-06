import { EmptyState, StatusBadge, ViewLayout } from "@vxture/design-ui";
import { resolveAppSession } from "../lib/session";
import { getStrategyStore } from "../../domains/shared/registry";
import { listCampaigns, listPlans } from "../../domains/strategy/service";
import { can } from "../../authz/decide";
import { PlanRoster, type PlanRow } from "../components/plan-roster";
import { ModuleHeadline, type HeadlineStat } from "../components/module-headline";
import { movePlan } from "./actions";
import { getMessages } from "../lib/i18n/server";
import { loadFailureText } from "../lib/load-failure";

// D1 strategy: the top of the chain. Everything downstream can trace back here,
// which is what makes "how much of this quarter came from the segment we chose
// to attack" a join rather than a manual tally.
//
// On the module pattern since 2026-09-05 - the last list to move. What changed
// is the shape, not the reads: the headline card carries the running plans and
// their campaign counts, the roster splits running from settled, and the check
// that used to have nowhere to live now sits in @deck/strategy.

export const dynamic = "force-dynamic";

export default async function StrategyPage() {
  const { SHELL_TEXT, STRATEGY_TEXT, LOAD_ERROR } = await getMessages();
  const session = await resolveAppSession();
  if (!session) {
    return (
      <EmptyState
        title={SHELL_TEXT.signedOutTitle}
        description={SHELL_TEXT.signedOutDescription}
      />
    );
  }

  const ctx = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: getStrategyStore(),
  };
  const result = await listPlans(ctx);

  if (!result.ok) {
    return (
      <EmptyState
        title={SHELL_TEXT.loadFailed}
        description={loadFailureText(result.violations, LOAD_ERROR)}
      />
    );
  }

  // The downstream count, in ONE query rather than one per plan. campaign.view
  // is a separate permission from the one guarding plans, so a member who holds
  // only the latter gets no counts and the column says nothing - "none" and
  // "you cannot see" are different facts and the table keeps them apart.
  //
  // Campaigns with a null planId are counted separately and stated: a campaign
  // that traces back to no strategy is the exception to this page's whole
  // claim, and a page that asserts traceability owes the reader its own
  // exceptions rather than quietly omitting them from a total.
  const campaigns = await listCampaigns(ctx);
  const campaignCounts = campaigns.ok
    ? campaigns.value.reduce((m, c) => {
        if (c.planId) m.set(c.planId, (m.get(c.planId) ?? 0) + 1);
        return m;
      }, new Map<string, number>())
    : undefined;
  const orphanCampaigns = campaigns.ok
    ? campaigns.value.filter((c) => !c.planId).length
    : 0;

  const rows: PlanRow[] = result.value.map((p) => ({
    id: p.id,
    planNo: p.planNo,
    name: p.name,
    period: p.period,
    ownerSub: p.ownerSub,
    status: p.status,
    campaignCount: campaignCounts?.get(p.id) ?? (campaignCounts ? 0 : undefined),
  }));

  const running = rows.filter((r) => r.status === "active");
  const settled = rows.filter((r) => r.status === "closed" || r.status === "archived");
  // One cell per RUNNING plan, its campaign count as the number: the breakdown
  // decomposes the headline the way every other module's does, and a running
  // plan with a zero is the finding the dock then explains.
  const stats: HeadlineStat[] = running.map((r) => ({
    key: r.id,
    name: r.name,
    value: r.campaignCount ?? 0,
    note: STRATEGY_TEXT.planStatCampaigns(r.period),
  }));

  const canEdit = can(session.authz, session.entitlement, "strategy.plan.update", "ui").allowed;
  const canApprove = can(session.authz, session.entitlement, "strategy.plan.approve", "ui")
    .allowed;

  return (
    <ViewLayout>
      <ModuleHeadline
        moduleKey="strategy"
        description={STRATEGY_TEXT.description}
        tags={
          <>
            <StatusBadge tone="success">
              {STRATEGY_TEXT.tagPlanRunning(running.length)}
            </StatusBadge>
            {settled.length > 0 ? (
              <StatusBadge tone="neutral">
                {STRATEGY_TEXT.tagPlanSettled(settled.length)}
              </StatusBadge>
            ) : null}
            {campaigns.ok && orphanCampaigns > 0 ? (
              <StatusBadge tone="warning">
                {STRATEGY_TEXT.tagPlanOrphan(orphanCampaigns)}
              </StatusBadge>
            ) : null}
          </>
        }
        stats={stats}
        emptyNote={
          campaigns.ok ? STRATEGY_TEXT.planStatEmpty : STRATEGY_TEXT.leadNoCampaignRead
        }
      />
      <PlanRoster
        rows={rows}
        canEdit={canEdit}
        canApprove={canApprove}
        onMove={movePlan}
      />
    </ViewLayout>
  );
}
