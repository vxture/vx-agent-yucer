import { EmptyState, StatusBadge, ViewLayout } from "@vxture/design-ui";
import { resolveAppSession } from "../lib/session";
import { getMessages } from "../lib/i18n/server";
import { can } from "../../authz/decide";
import { previewRouting } from "../../domains/signal/service";
import { listTerritories } from "../../domains/planning/service";
import { listAccounts } from "../../domains/account/service";
import { getPlanningStore } from "../../domains/shared/registry";
import { routingStats } from "../../domains/signal/lib/routing-stats";
import { RoutingTable, type RoutingRow } from "../components/routing-table";
import { RoutingAnalyseButton } from "../components/routing-analyse-button";
import { ModuleHeadline } from "../components/module-headline";
import { loadFailureText } from "../lib/load-failure";

// D5 线索分派 - the list of open leads, with the router's verdict counted in
// the title row.
//
// IT ROUTES ON LOAD, AND SHOWS NO SUGGESTIONS (owner, 2026-09-06, asked
// directly). Those are two separate decisions and an earlier version confused
// them: the owner removed the statistics strip and the analysis block, and I
// took that to mean the page must not COMPUTE the analysis either. It never
// said that - and the cost was the two numbers a manager actually opens this
// page for, 可指派 and 分不出去, which only the router can count.
//
// So the rule runs here to produce COUNTS, and the proposals themselves live
// in the assistant panel where they can be accepted one at a time. The table
// stays a list of leads.

export const dynamic = "force-dynamic";

export default async function RoutingPage() {
  const { LOAD_ERROR, ROUTING_TEXT, SHELL_TEXT } = await getMessages();
  const session = await resolveAppSession();
  if (!session) {
    return (
      <EmptyState
        title={SHELL_TEXT.signedOutTitle}
        description={SHELL_TEXT.signedOutDescription}
      />
    );
  }

  const base = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
  };

  const [territories, accounts] = await Promise.all([
    listTerritories({ ...base, store: getPlanningStore() }),
    listAccounts({ ...base, store: session.stores.account() }),
  ]);

  // The lead -> region hop. A lead knows its account; the account knows its
  // region; the territory covers regions.
  const regionOf = new Map(
    (accounts.ok ? accounts.value : []).map((a) => [a.id, a.region]),
  );

  const plan = await previewRouting(
    { ...base, store: session.stores.signal() },
    territories.ok ? territories.value : [],
    regionOf,
  );

  if (!plan.ok) {
    return (
      <EmptyState
        title={SHELL_TEXT.loadFailed}
        description={loadFailureText(plan.violations, LOAD_ERROR)}
      />
    );
  }

  const rows: RoutingRow[] = plan.value.map((p) => ({
    leadId: p.leadId,
    leadNo: p.leadNo,
    companyName: p.companyName,
    currentOwner: p.currentOwner,
    region: p.region,
  }));

  // Counted off the same plan the table is drawn from, so a badge and the list
  // under it cannot disagree.
  const stats = routingStats(
    plan.value.map((p) => ({
      currentOwner: p.currentOwner,
      suggestedOwner: p.outcome.kind === "assigned" ? p.outcome.ownerSub : null,
      unroutableReason: p.outcome.kind === "unroutable" ? p.outcome.reason : null,
      region: p.region,
    })),
  );

  return (
    <ViewLayout>
      {/* NO FOLD, BUT A REAL HEADER (owner, 2026-09-06: 去掉下拉展示内容 -
          which was the collapsible statistics strip, not the title row).
          Title, its badges and the description stay; what left is the panel
          that used to unfold beneath them.

          THE BADGES COUNT LEADS, NOT ROUTES. They used to say 可指派 and
          分不出去, which are things the ROUTER concludes - and this page no
          longer runs it. What is countable here is what a lead itself
          carries: how many there are, how many nobody holds, how many have
          no region for the rule to work from. */}
      {/* THE MODULE HEADER, minus its fold (owner, 2026-09-06: 去掉下拉展示
          内容，只留标题 - then card、icon 模式恢复). The card and the icon are
          what make this page one of the set; only the collapsible statistics
          strip was the thing being removed, and passing no `stats` is how a
          module says it has no breakdown rather than an empty one.

          THE BADGES ARE THE ROUTER'S OWN COUNTS. The page routes on load, so
          可指派 and 分不出去 are real numbers rather than facts about the
          leads - and they are counted off the very plan the table is drawn
          from, so a badge and the list under it cannot disagree. */}
      <ModuleHeadline
        moduleKey="routing"
        description={ROUTING_TEXT.why}
        tags={
          <>
            <StatusBadge tone="success">{ROUTING_TEXT.tagOpen(stats.total)}</StatusBadge>
            {stats.pending > 0 ? (
              <StatusBadge tone="warning">{ROUTING_TEXT.tagPending(stats.pending)}</StatusBadge>
            ) : null}
            {stats.blocked > 0 ? (
              <StatusBadge tone="danger">{ROUTING_TEXT.tagBlocked(stats.blocked)}</StatusBadge>
            ) : null}
          </>
        }
        action={<RoutingAnalyseButton />}
      />

      <RoutingTable rows={rows} />
    </ViewLayout>
  );
}
