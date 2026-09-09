import { EmptyState, ViewHeader, ViewLayout } from "@vxture/design-ui";
import { PageCrumbs } from "../../../components/page-crumbs";
import { redirect } from "next/navigation";
import { resolveAppSession } from "../../../lib/session";
import { getMessages } from "../../../lib/i18n/server";
import { can } from "../../../../authz/decide";
import { getPlanningStore } from "../../../../domains/shared/registry";
import { listTerritories } from "../../../../domains/planning/service";
import { listAccounts, listMarketDivisions } from "../../../../domains/account/service";
import { TerritoryForm } from "../../../components/territory-form";
import { saveTerritory } from "../../actions";

// 新建/编辑销售区域 - a page since 2026-09-05, and the move FIXES A GAP: the
// inline panel never sent `regions`, so every UI-created territory covered
// nothing and could route no lead. The page carries the field, and the
// assistant leads with the regions that have customers and no coverage.

export const dynamic = "force-dynamic";

export default async function NewTerritoryPage() {
  const { DOMAIN_LABEL, PLANNING_TEXT, SHELL_TEXT } = await getMessages();
  const session = await resolveAppSession();
  if (!session) {
    return <EmptyState title={SHELL_TEXT.signedOutTitle} description={SHELL_TEXT.signedOutDescription} />;
  }
  if (!can(session.authz, session.entitlement, "planning.territory.upsert", "ui").allowed) {
    redirect("/planning");
  }

  const ctx = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: getPlanningStore(),
  };
  const [territories, accounts, divisions] = await Promise.all([
    listTerritories(ctx, { includeRetired: true }),
    listAccounts({ ...ctx, store: session.stores.account() }),
    /* The coverage picker's vocabulary. Read here rather than typed into the
       form so a workspace that carves its market differently gets its own
       names - the whole point of incr/0036. */
    listMarketDivisions({ ...ctx, store: session.stores.account() }),
  ]);

  return (
    <ViewLayout>
      <PageCrumbs
        trail={[{ label: DOMAIN_LABEL.planning, href: "/planning" }]}
        current={PLANNING_TEXT.territoryFormTitle}
      />
      <ViewHeader title={PLANNING_TEXT.territoryFormTitle} description={PLANNING_TEXT.territoryFormWhy} />
      <TerritoryForm
        rows={territories.ok ? territories.value : []}
        accountRegions={accounts.ok ? accounts.value.map((a) => a.region) : []}
        divisions={divisions.ok ? divisions.value.map((d) => d.name) : []}
        onSave={saveTerritory}
      />
    </ViewLayout>
  );
}
