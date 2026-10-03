import { ViewHeader, ViewLayout } from "@vxture/design-ui";
import { PageCrumbs } from "../../components/page-crumbs";
import { redirect } from "next/navigation";
import { resolveAppSession } from "../../lib/session";
import { getMessages } from "../../lib/i18n/server";
import { can } from "../../../authz/decide";
import { getCatalogStore, getStrategyStore } from "../../../domains/shared/registry";
import { listCampaigns, listPlans, listSegments } from "../../../domains/strategy/service";
import { pricingPolicy } from "../../../domains/catalog/service";
import { planAcceptsNewWork } from "../../../domains/strategy/lib/lifecycle";
import { CampaignForm } from "../../components/campaign-form";
import { createCampaignAction, saveCampaign } from "./actions";

// 新建 / 修改战役 - the campaign's own form (the header's 新建 used to open the
// EXECUTION form, so a campaign could not be created at all).
//
// ?no=X edits that campaign: the number locks and the fields arrive filled in.
// A completed or cancelled campaign is a record, so it is not offered for edit.
// An unknown number falls back to creation rather than an edit heading over an
// empty form. Both modes ride one gate: campaign.upsert.

export const dynamic = "force-dynamic";

const dayOf = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export default async function CreateCampaignPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ no?: string }>;
}) {
  const { DOMAIN_LABEL, CAMPAIGN_TEXT } = await getMessages();
  const session = await resolveAppSession();
  if (!session) return null;
  if (!can(session.authz, session.entitlement, "campaign.upsert", "ui").allowed) redirect("/campaign");

  const ctx = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: getStrategyStore(),
  };
  const [campaigns, plans, segments, policy] = await Promise.all([
    listCampaigns(ctx),
    listPlans(ctx),
    listSegments(ctx),
    pricingPolicy({ ...ctx, store: getCatalogStore() }),
  ]);
  const rows = campaigns.ok ? campaigns.value : [];
  const { no } = await searchParams;
  const found = no ? rows.find((c) => c.campaignNo === no) : undefined;
  const editable = found && found.status !== "completed" && found.status !== "cancelled" ? found : undefined;

  // A plan the campaign already hangs under stays selectable even after it moved on;
  // otherwise only a plan that takes new work is offered.
  const offeredPlans = (plans.ok ? plans.value : [])
    .filter((p) => planAcceptsNewWork(p.status) || p.id === editable?.planId)
    .map((p) => ({ id: p.id, name: p.name }));

  return (
    <ViewLayout>
      <PageCrumbs
        trail={[{ label: DOMAIN_LABEL.campaign, href: "/campaign" }]}
        current={editable ? CAMPAIGN_TEXT.editCampaign : CAMPAIGN_TEXT.newCampaignTitle}
      />
      <ViewHeader
        title={editable ? CAMPAIGN_TEXT.editCampaign : CAMPAIGN_TEXT.newCampaignTitle}
        description={editable ? CAMPAIGN_TEXT.editCampaignWhy : CAMPAIGN_TEXT.newCampaignWhy}
      />
      <CampaignForm
        key={editable ? editable.id : "new"}
        existingNos={rows.map((c) => c.campaignNo)}
        plans={offeredPlans}
        segments={(segments.ok ? segments.value : []).map((s) => ({ id: s.id, name: s.name }))}
        defaultCurrency={policy.ok ? policy.value.defaultCurrency : "CNY"}
        initial={
          editable
            ? {
                id: editable.id,
                campaignNo: editable.campaignNo,
                name: editable.name,
                planId: editable.planId,
                segmentId: editable.segmentId,
                channel: editable.channel,
                budgetAmount: editable.budgetAmount?.amount ?? null,
                currency: editable.currency,
                ownerSub: editable.ownerSub,
                startsAt: dayOf(editable.startsAt),
                endsAt: dayOf(editable.endsAt),
              }
            : undefined
        }
        onCreate={createCampaignAction}
        onSave={saveCampaign}
      />
    </ViewLayout>
  );
}
