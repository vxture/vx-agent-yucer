import { EmptyState, Section } from "@vxture/design-ui";
import { resolveAppSession } from "../lib/session";
import { CAMPAIGN_TEXT, SHELL_TEXT } from "../lib/messages";
import { getStrategyStore } from "../../domains/shared/registry";
import { campaignReturn, listCampaigns } from "../../domains/strategy/service";
import { can } from "../../authz/decide";
import { CampaignTable, type CampaignRow } from "../components/campaign-table";
import { moveCampaign } from "./actions";

export const dynamic = "force-dynamic";

// D3 market execution.
//
// The return column reads WON revenue, never pipeline. A campaign that generated
// a lot of unclosed pipeline has returned nothing yet, and showing pipeline as
// return is how the same spend gets justified twice.

export default async function CampaignPage() {
  const session = await resolveAppSession();
  if (!session) {
    return <EmptyState title={SHELL_TEXT.signedOutTitle} description={SHELL_TEXT.signedOutDescription} />;
  }

  const ctx = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: getStrategyStore(),
  };

  const campaigns = await listCampaigns(ctx);
  if (!campaigns.ok) {
    return (
      <EmptyState
        title={SHELL_TEXT.loadFailed}
        description={campaigns.violations.map((v) => v.message).join("; ")}
      />
    );
  }

  const rows: CampaignRow[] = [];
  for (const c of campaigns.value) {
    // campaignReturn is business-tier. When it is not bought the campaign still
    // lists - the row simply carries no return figures, rather than the whole
    // page refusing.
    const detail = await campaignReturn(ctx, c.id);
    rows.push({
      id: c.id,
      name: c.name,
      campaignNo: c.campaignNo,
      channel: c.channel,
      budget: c.budgetAmount?.amount ?? null,
      currency: c.currency,
      status: c.status,
      done: detail.ok ? detail.value.progress.done : 0,
      total: detail.ok ? detail.value.progress.total : 0,
      skipped: detail.ok ? detail.value.progress.skipped : 0,
      wonAmount: detail.ok ? detail.value.wonAmount.amount : null,
      returnOnBudget: detail.ok ? detail.value.returnOnBudget : null,
    });
  }

  const canMove = can(session.authz, session.entitlement, "campaign.upsert", "ui").allowed;

  return (
    <Section title={CAMPAIGN_TEXT.title} description={CAMPAIGN_TEXT.description}>
      <CampaignTable rows={rows} canMove={canMove} onMove={moveCampaign} />
    </Section>
  );
}
