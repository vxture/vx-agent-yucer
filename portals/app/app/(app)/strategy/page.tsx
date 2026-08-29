import { Card, EmptyState, Section, ViewLayout } from "@vxture/design-ui";
import { resolveAppSession } from "../lib/session";
import { getAccountStore, getStrategyStore } from "../../domains/shared/registry";
import { listCampaigns, listPlans, listSegments } from "../../domains/strategy/service";
import { accountMatchesCriteria } from "../../domains/strategy/lib/lifecycle";
import { listAccounts } from "../../domains/account/service";
import { can } from "../../authz/decide";
import { StrategyTable } from "../components/strategy-table";
import { createStrategyPlan, movePlan, saveSegment } from "./actions";
import { NewPlan } from "../components/new-plan";
import { SegmentPanel, type SegmentRow } from "../components/segment-panel";

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
  // Segments, and the number the anchor was missing.
  //
  // account.segment_code points here by plain string with no foreign key, so
  // "how many accounts are actually in this cut" is a count nothing in the
  // database will do for us. Counted here, once, from the accounts this member
  // is allowed to see - a segment whose count reads 0 to a rep and 40 to a
  // leader is telling each of them the truth about their own view.
  //
  // A segment nothing points at still shows, with a zero. That is a cut of the
  // market nobody is working, which is a finding rather than a row to hide.
  const segments = await listSegments(ctx);
  const accounts = await listAccounts({
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: getAccountStore(),
  });
  const perCode = new Map<string, number>();
  if (accounts.ok) {
    for (const a of accounts.value) {
      if (a.segmentCode) perCode.set(a.segmentCode, (perCode.get(a.segmentCode) ?? 0) + 1);
    }
  }
  const planNames = new Map(result.value.map((p) => [p.id, p.name]));
  const segmentRows: SegmentRow[] = segments.ok
    ? segments.value.map((g) => ({
        id: g.id,
        segmentCode: g.segmentCode,
        name: g.name,
        planId: g.planId,
        planName: g.planId ? (planNames.get(g.planId) ?? null) : null,
        priority: g.priority,
        status: g.status,
        accountCount: perCode.get(g.segmentCode) ?? 0,
        criteria: g.criteria,
        // Counted against the accounts this member can see, same as the
        // assigned count beside it - the two numbers must share a population
        // or their difference stops meaning anything.
        matchedCount: accounts.ok
          ? accounts.value.filter((a) => accountMatchesCriteria(a, g.criteria)).length
          : 0,
      }))
    : [];
  // Closed and archived plans are absent on purpose: their segmentation is
  // settled, and the rule behind the form would refuse the write anyway. An
  // option that always fails is worse than no option.
  const openPlans = result.value
    .filter((p) => p.status !== "closed" && p.status !== "archived")
    .map((p) => ({ id: p.id, name: p.name }));

  const canMove =
    can(session.authz, session.entitlement, "strategy.plan.update", "ui")
      .allowed ||
    can(session.authz, session.entitlement, "strategy.plan.approve", "ui")
      .allowed;

  return (
    <ViewLayout>
      <Card className="p-lg">
        {/* ONE child, so Card's gap-xl never fires between a title and its own
            captions. */}
        <div className="flex flex-col gap-2xs">
          <h1 className="text-heading-2 text-foreground">
            {STRATEGY_TEXT.lead(result.value.length)}
          </h1>
          <p className="text-muted-foreground text-body-sm tabular-nums">
            {campaigns.ok
              ? STRATEGY_TEXT.leadTraced(tracedCampaigns, orphanCampaigns)
              : STRATEGY_TEXT.leadNoCampaignRead}
          </p>
          <p className="text-muted-foreground text-body-sm">
            {STRATEGY_TEXT.leadRule}
          </p>
        </div>
      </Card>

      {/* ABOVE the table, for the reason the target form is: on a fresh
          workspace the table is empty, and a create form under a list nobody
          can populate is a doorway behind a locked door. */}
      <NewPlan
        canCreate={
          can(session.authz, session.entitlement, "strategy.plan.create", "ui").allowed
        }
        onCreate={createStrategyPlan}
      />

      <SegmentPanel
        rows={segmentRows}
        plans={openPlans}
        canEdit={
          can(session.authz, session.entitlement, "strategy.segment.upsert", "ui").allowed
        }
        onSave={saveSegment}
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
