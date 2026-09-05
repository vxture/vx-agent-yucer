import { EmptyState, ViewHeader, ViewLayout } from "@vxture/design-ui";
import { redirect } from "next/navigation";
import { resolveAppSession } from "../../lib/session";
import { getMessages } from "../../lib/i18n/server";
import { can } from "../../../authz/decide";
import { getStrategyStore } from "../../../domains/shared/registry";
import { campaignReturn, listCampaigns } from "../../../domains/strategy/service";
import { ExecutionForm, type ExecutionFormRow } from "../../components/execution-form";
import { saveExecution } from "../actions";

// 新建/编辑执行项 - a page since 2026-09-05 (owner ruling; see /catalog/new for
// the shape and why the gate redirects).
//
// The executions are read the way the list page reads them: through
// campaignReturn, per campaign. That call is business-tier - under a lower
// tier the edit select is simply empty while creation still works, which is
// the same degradation the list page chose.

export const dynamic = "force-dynamic";

export default async function NewExecutionPage() {
  const { SHELL_TEXT, CAMPAIGN_TEXT } = await getMessages();
  const session = await resolveAppSession();
  if (!session) {
    return <EmptyState title={SHELL_TEXT.signedOutTitle} description={SHELL_TEXT.signedOutDescription} />;
  }
  if (!can(session.authz, session.entitlement, "campaign.execution.upsert", "ui").allowed) {
    redirect("/campaign");
  }

  const ctx = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: getStrategyStore(),
  };
  const campaigns = await listCampaigns(ctx);
  const rows = campaigns.ok ? campaigns.value : [];

  const executions: ExecutionFormRow[] = [];
  for (const c of rows) {
    const detail = await campaignReturn(ctx, c.id);
    if (!detail.ok) continue;
    for (const e of detail.value.executions) {
      executions.push({
        id: e.id,
        campaignId: c.id,
        campaignStatus: c.status,
        title: e.title,
        actionType: e.actionType,
        assigneeSub: e.assigneeSub,
        dueAt: e.dueAt ? e.dueAt.toISOString().slice(0, 10) : null,
        status: e.status,
      });
    }
  }

  return (
    <ViewLayout>
      <ViewHeader title={CAMPAIGN_TEXT.executionsTitle} description={CAMPAIGN_TEXT.executionsWhy} />
      <ExecutionForm
        rows={executions}
        campaigns={rows
          .filter((r) => r.status !== "completed")
          .map((r) => ({ id: r.id, name: r.name, status: r.status }))}
        onSave={saveExecution}
      />
    </ViewLayout>
  );
}
