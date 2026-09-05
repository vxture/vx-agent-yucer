import { EmptyState, ViewHeader, ViewLayout } from "@vxture/design-ui";
import { redirect } from "next/navigation";
import { resolveAppSession } from "../../lib/session";
import { getMessages } from "../../lib/i18n/server";
import { can } from "../../../authz/decide";
import { getPlanningStore } from "../../../domains/shared/registry";
import { listPipeline } from "../../../domains/pipeline/service";
import { listAccounts } from "../../../domains/account/service";
import { listTerritories } from "../../../domains/planning/service";
import { OpportunityForm } from "../../components/opportunity-form";
import { createDeal } from "../stage-action";

// 新建商机 - a page since 2026-09-05 (owner ruling; see /catalog/new for the
// shape and why the gate redirects).
//
// The territories carry their REGIONS here, unlike on the board: the
// assistant's territory suggestion runs the same region match lead routing
// runs, so a deal filed by it lands where its leads would have.

export const dynamic = "force-dynamic";

export default async function NewOpportunityPage() {
  const { SHELL_TEXT, PIPELINE_TEXT } = await getMessages();
  const session = await resolveAppSession();
  if (!session) {
    return <EmptyState title={SHELL_TEXT.signedOutTitle} description={SHELL_TEXT.signedOutDescription} />;
  }
  if (!can(session.authz, session.entitlement, "pipeline.opportunity.create", "ui").allowed) {
    redirect("/pipeline");
  }

  const ctx = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: session.stores.pipeline(),
  };
  const [deals, accounts, territories] = await Promise.all([
    listPipeline(ctx, {}),
    listAccounts({ ...ctx, store: session.stores.account() }),
    listTerritories({ ...ctx, store: getPlanningStore() }),
  ]);

  return (
    <ViewLayout>
      <ViewHeader title={PIPELINE_TEXT.newTitle} description={PIPELINE_TEXT.newWhy} />
      <OpportunityForm
        accounts={
          accounts.ok
            ? accounts.value.map((a) => ({ id: a.id, name: a.name, region: a.region, status: a.status }))
            : []
        }
        territories={
          territories.ok
            ? territories.value.map((t) => ({
                id: t.id,
                name: t.name,
                regions: t.regions,
                status: t.status,
              }))
            : []
        }
        openDeals={
          deals.ok ? deals.value.map((d) => ({ accountId: d.accountId, status: d.status })) : []
        }
        onCreate={createDeal}
      />
    </ViewLayout>
  );
}
