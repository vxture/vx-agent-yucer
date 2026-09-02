import { EmptyState, Section, ViewHeader, ViewLayout } from "@vxture/design-ui";
import { resolveAppSession } from "../lib/session";
import { getStrategyStore } from "../../domains/shared/registry";
import { listCampaigns, listPlans } from "../../domains/strategy/service";
import { can } from "../../authz/decide";
import { StrategyTable } from "../components/strategy-table";
import { createStrategyPlan, movePlan } from "./actions";
import { NewPlan } from "../components/new-plan";

import { getMessages } from "../lib/i18n/server";
import { loadFailureText } from "../lib/load-failure";
// D1 strategy: the top of the chain. Everything downstream can trace back here,
// which is what makes "how much of this quarter came from the segment we chose
// to attack" a join rather than a manual tally.

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
  const tracedCampaigns = campaigns.ok
    ? campaigns.value.length - orphanCampaigns
    : 0;

  // The service picks its gate from the DESTINATION - strategy.plan.approve for
  // approving, strategy.plan.update otherwise - so the control is offered when
  // either is held and the refusal, if any, comes from the service.
  //
  // Both action ids currently resolve to the same permission (strategy.write),
  // so this is one check in practice. Making approval a genuine separation of
  // duties would move catalog.ts, the seed SQL and the role doc together, which
  // is a product decision rather than something to slip in here.
  const canMove =
    can(session.authz, session.entitlement, "strategy.plan.update", "ui")
      .allowed ||
    can(session.authz, session.entitlement, "strategy.plan.approve", "ui")
      .allowed;

  return (
    <ViewLayout>
      <ViewHeader
        title={STRATEGY_TEXT.lead(result.value.length)}
        description={
          <>
            <span className="block tabular-nums">
              {campaigns.ok
                ? STRATEGY_TEXT.leadTraced(tracedCampaigns, orphanCampaigns)
                : STRATEGY_TEXT.leadNoCampaignRead}
            </span>
            <span className="block">{STRATEGY_TEXT.leadRule}</span>
          </>
        }
      />

      {/* ABOVE the table, for the reason the target form is: on a fresh
          workspace the table is empty, and a create form under a list nobody
          can populate is a doorway behind a locked door. */}
      <NewPlan
        canCreate={
          can(session.authz, session.entitlement, "strategy.plan.create", "ui")
            .allowed
        }
        onCreate={createStrategyPlan}
      />

      <Section
        icon="graph"
        title={STRATEGY_TEXT.title}
        description={STRATEGY_TEXT.description}
      >
        <StrategyTable
          rows={result.value}
          campaignCounts={campaignCounts}
          canMove={canMove}
          onMove={movePlan}
        />
      </Section>
    </ViewLayout>
  );
}
