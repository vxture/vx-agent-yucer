import { EmptyState, ViewHeader, ViewLayout } from "@vxture/design-ui";
import { redirect } from "next/navigation";
import { resolveAppSession } from "../../lib/session";
import { getMessages } from "../../lib/i18n/server";
import { can } from "../../../authz/decide";
import { getPlanningStore } from "../../../domains/shared/registry";
import { listTargets, listTerritories } from "../../../domains/planning/service";
import { currentPeriod } from "../../../domains/shared/period";
import { TargetForm } from "../../components/target-form";
import { createSalesTarget } from "../actions";

// 设定目标 - a page since 2026-09-05. The assistant names the scopes still
// owed an answer this period - the metrics with no workspace target, the
// territories with none at all - and NEVER suggests an amount: a quota is a
// commitment somebody carries, and pointing at the blanks is where the
// assistant's job ends (the same line ADR-019 draws for the floor).

export const dynamic = "force-dynamic";

export default async function NewTargetPage() {
  const { SHELL_TEXT, PLANNING_TEXT } = await getMessages();
  const session = await resolveAppSession();
  if (!session) {
    return <EmptyState title={SHELL_TEXT.signedOutTitle} description={SHELL_TEXT.signedOutDescription} />;
  }
  if (!can(session.authz, session.entitlement, "planning.target.create", "ui").allowed) {
    redirect("/planning");
  }

  const period = currentPeriod(new Date());
  const ctx = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: getPlanningStore(),
  };
  const [territories, targets] = await Promise.all([
    listTerritories(ctx, { includeRetired: false }),
    listTargets(ctx, { period }),
  ]);

  return (
    <ViewLayout>
      <ViewHeader title={PLANNING_TEXT.setTarget} description={PLANNING_TEXT.setTargetWhy} />
      <TargetForm
        period={period}
        territories={territories.ok ? territories.value : []}
        existingTargets={targets.ok ? targets.value : []}
        metricLabel={{
          revenue: PLANNING_TEXT.metricRevenue,
          new_logo: PLANNING_TEXT.metricNewLogo,
          pipeline: PLANNING_TEXT.metricPipeline,
          margin: PLANNING_TEXT.metricMargin,
        }}
        onCreate={createSalesTarget}
      />
    </ViewLayout>
  );
}
