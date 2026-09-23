import { ViewHeader, ViewLayout } from "@vxture/design-ui";
import { PageCrumbs } from "../../components/page-crumbs";
import { redirect } from "next/navigation";
import { resolveAppSession } from "../../lib/session";
import { getMessages } from "../../lib/i18n/server";
import { can } from "../../../authz/decide";
import { getDeliveryStore, getPlanningStore } from "../../../domains/shared/registry";
import { listPipeline } from "../../../domains/pipeline/service";
import { accountStatuses, listAccounts } from "../../../domains/account/service";
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
  const { DOMAIN_LABEL, PIPELINE_TEXT } = await getMessages();
  const session = await resolveAppSession();
  if (!session) return null;
  // Unreachable: (app)/layout.tsx already renders the shared SignIn
  // screen and never mounts this page when there is no session. Kept
  // only because TypeScript needs it to narrow `session` below.
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

  // The suggestion leaves churned customers out - by the DERIVED status
  // (YC-021 L5). Unreadable: nobody is left out on a guess.
  const statusRead = accounts.ok
    ? await accountStatuses(
        { ...ctx, store: session.stores.account(), pipeline: session.stores.pipeline(), delivery: getDeliveryStore() },
        accounts.value.map((a) => a.id),
      ).catch(() => null)
    : null;
  const statusOf = statusRead?.ok ? statusRead.value : null;

  return (
    <ViewLayout>
      <PageCrumbs
        trail={[{ label: DOMAIN_LABEL.pipeline, href: "/pipeline" }]}
        current={PIPELINE_TEXT.newTitle}
      />
      <ViewHeader title={PIPELINE_TEXT.newTitle} description={PIPELINE_TEXT.newWhy} />
      <OpportunityForm
        accounts={
          accounts.ok
            ? accounts.value.map((a) => ({ id: a.id, name: a.name, region: a.region, status: statusOf?.get(a.id) ?? "unknown" }))
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
