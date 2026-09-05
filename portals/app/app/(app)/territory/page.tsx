import { EmptyState, ViewHeader, ViewLayout } from "@vxture/design-ui";
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

  return (
    <ViewLayout>
      <ViewHeader
        title={PLANNING_TEXT.territoryTitle}
        description={PLANNING_TEXT.territoryWhy}
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
