import { EmptyState, StatusBadge, ViewLayout } from "@vxture/design-ui";
import { ModuleHeadline } from "../components/module-headline";
import { resolveAppSession } from "../lib/session";
import { getMessages } from "../lib/i18n/server";
import { can } from "../../authz/decide";
import { getPlanningStore } from "../../domains/shared/registry";
import { listTerritories } from "../../domains/planning/service";
import { TerritoryPanel } from "../components/territory-panel";
import { loadFailureText } from "../lib/load-failure";
import { NewEntryLink } from "../components/form-page";

// D2 sales territories - a module page since 2026-08-30.
//
// It sat directly above the target table on /planning because a territory is a
// PRECONDITION for a regional target. That relationship is still true and is
// still stated there; what changed is that a menu entry now has a page rather
// than an anchor. Retired territories are included: a target may still name
// one, and hiding it would leave that target pointing at nothing.

export const dynamic = "force-dynamic";

export default async function TerritoryPage() {
  const { LOAD_ERROR, PLANNING_TEXT, SHELL_TEXT } = await getMessages();
  const session = await resolveAppSession();
  if (!session) {
    return (
      <EmptyState
        title={SHELL_TEXT.signedOutTitle}
        description={SHELL_TEXT.signedOutDescription}
      />
    );
  }

  const territories = await listTerritories(
    {
      workspaceId: session.workspaceId,
      sub: session.user.sub,
      holder: session.authz,
      entitlement: session.entitlement,
      store: getPlanningStore(),
    },
    { includeRetired: true },
  );

  if (!territories.ok) {
    return (
      <EmptyState
        title={SHELL_TEXT.loadFailed}
        description={loadFailureText(territories.violations, LOAD_ERROR)}
      />
    );
  }

  const unowned = territories.value.filter((t) => !t.ownerSub).length;

  return (
    <ViewLayout>
      {/* NO FOLD: territories are a MAP, not a distribution - the useful
          reading is which regions are covered and by whom, and the panel below
          is exactly that. */}
      {/* Counted off the same array the panel draws, so the badge and the map
          under it cannot disagree. A territory with no owner covers ground
          nobody is answerable for - and 智能分配 refuses to place a lead into
          it, which is where that shows up. */}
      <ModuleHeadline
        moduleKey="territory"
        description={PLANNING_TEXT.territoryWhy}
        tags={
          <>
            <StatusBadge tone="success">
              {PLANNING_TEXT.tagTerritories(territories.value.length)}
            </StatusBadge>
            {unowned > 0 ? (
              <StatusBadge tone="warning">{PLANNING_TEXT.tagNoOwner(unowned)}</StatusBadge>
            ) : null}
          </>
        }
      />
      <TerritoryPanel rows={territories.value} />
      {/* Creation and editing left for /territory/new on 2026-09-05 - which
          also carries the regions field this page's panel never had. */}
      {can(session.authz, session.entitlement, "planning.territory.upsert", "ui")
        .allowed ? (
        <NewEntryLink href="/territory/new" />
      ) : null}
    </ViewLayout>
  );
}
