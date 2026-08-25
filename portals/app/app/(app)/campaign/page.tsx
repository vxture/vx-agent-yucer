import { Card, EmptyState, Section, ViewLayout } from "@vxture/design-ui";
import { resolveAppSession } from "../lib/session";
import { CAMPAIGN_TEXT, SHELL_TEXT } from "../lib/messages";
import { formatMoney } from "../lib/view-model";
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

  const canMove = can(
    session.authz,
    session.entitlement,
    "campaign.upsert",
    "ui",
  ).allowed;

  // Totalled here rather than in the table: the headline is a statement about
  // the page, and a table that also had to produce page-level sums would be
  // answering two questions at once.
  //
  // The currency is taken from the first row that carries one. Mixing
  // currencies in a single total would be wrong, and this domain has no
  // conversion - if that day comes the sum has to become per-currency rather
  // than quietly adding yuan to dollars.
  const currency = rows.find((r) => r.budget != null)?.currency ?? "CNY";
  const budgetTotal = rows.reduce((n, r) => n + (r.budget ?? 0), 0);
  const wonTotal = rows.reduce((n, r) => n + (r.wonAmount ?? 0), 0);

  return (
    <ViewLayout>
      {/* Opens with what is true of the whole page. The RETURN RULE rides here
          rather than only in the section subtitle: it is the one caveat that
          makes the ROI column mean anything, and a reader who meets the number
          first has already drawn the wrong conclusion. */}
      <Card className="p-lg">
        {/* ONE child, so Card's gap-xl never fires between a title and its own
            captions. */}
        <div className="flex flex-col gap-2xs">
          <h1 className="text-heading-2 text-foreground">
            {CAMPAIGN_TEXT.lead(rows.length)}
          </h1>
          <p className="text-muted-foreground text-body-sm tabular-nums">
            {CAMPAIGN_TEXT.leadSpend(
              formatMoney(budgetTotal, currency),
              formatMoney(wonTotal, currency),
            )}
          </p>
          <p className="text-muted-foreground text-body-sm">
            {CAMPAIGN_TEXT.leadRule}
          </p>
        </div>
      </Card>

      <Section
        icon="target"
        title={CAMPAIGN_TEXT.title}
        description={CAMPAIGN_TEXT.description}
      >
        <CampaignTable rows={rows} canMove={canMove} onMove={moveCampaign} />
      </Section>
    </ViewLayout>
  );
}
