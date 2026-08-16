import { DataTable, EmptyState, PageSection, StatusBadge, type DataTableColumn } from "@vxture/design-system";
import { resolveAppSession } from "../lib/session";
import { CAMPAIGN_STATUS_LABEL, CAMPAIGN_TEXT, SHELL_TEXT } from "../lib/messages";
import { formatMoney } from "../lib/view-model";
import { getStrategyStore } from "../../domains/shared/registry";
import { campaignReturn, listCampaigns } from "../../domains/strategy/service";
import { nextCampaignStatuses, type CampaignStatus } from "../../domains/strategy/lib/lifecycle";
import { can } from "../../authz/decide";
import { LifecycleControl } from "../components/lifecycle-control";
import { moveCampaign } from "./actions";

export const dynamic = "force-dynamic";

interface Row {
  id: string;
  name: string;
  campaignNo: string;
  channel: string | null;
  budget: number | null;
  currency: string;
  status: string;
  done: number;
  total: number;
  skipped: number;
  wonAmount: number | null;
  returnOnBudget: number | null;
}

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

  const rows: Row[] = [];
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

  const columns: readonly DataTableColumn<Row>[] = [
    {
      id: "name",
      header: CAMPAIGN_TEXT.columnName,
      cell: (row) => (
        <div>
          <div>{row.name}</div>
          <div>{row.campaignNo}</div>
        </div>
      ),
    },
    { id: "channel", header: CAMPAIGN_TEXT.columnChannel, cell: (row) => row.channel ?? "-" },
    {
      id: "budget",
      header: CAMPAIGN_TEXT.columnBudget,
      align: "right",
      cell: (row) => formatMoney(row.budget, row.currency),
    },
    {
      id: "progress",
      header: CAMPAIGN_TEXT.columnProgress,
      cell: (row) => CAMPAIGN_TEXT.progress(row.done, row.total, row.skipped),
    },
    {
      id: "return",
      header: "ROI",
      align: "right",
      cell: (row) =>
        row.returnOnBudget == null ? "-" : (
          <StatusBadge tone={row.returnOnBudget >= 1 ? "success" : "neutral"}>
            {row.returnOnBudget.toFixed(1)}x
          </StatusBadge>
        ),
    },
    {
      id: "status",
      header: CAMPAIGN_TEXT.columnStatus,
      cell: (row) => (
        <StatusBadge tone={row.status === "running" ? "success" : "neutral"} dot>
          {CAMPAIGN_STATUS_LABEL[row.status] ?? row.status}
        </StatusBadge>
      ),
    },
    {
      id: "actions",
      header: "",
      align: "right",
      // Completing is guarded: a campaign with outstanding executions cannot be
      // completed, and the refusal names the count. Both terminal states offer
      // no further move and render nothing.
      cell: (row) => (
        <LifecycleControl
          id={row.id}
          status={row.status}
          options={nextCampaignStatuses(row.status as CampaignStatus)}
          label={CAMPAIGN_STATUS_LABEL}
          canChange={canMove}
          onChange={moveCampaign}
        />
      ),
    },
  ];

  return (
    <PageSection title={CAMPAIGN_TEXT.title} description={CAMPAIGN_TEXT.description}>
      {rows.length === 0 ? (
        <EmptyState title={CAMPAIGN_TEXT.emptyTitle} description={CAMPAIGN_TEXT.emptyDescription} />
      ) : (
        <DataTable columns={columns} rows={rows} rowKey={(row) => row.id} />
      )}
    </PageSection>
  );
}
