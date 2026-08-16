import { DataTable, EmptyState, PageSection, StatusBadge, type DataTableColumn } from "@vxture/design-system";
import { resolveAppSession } from "../lib/session";
import { PLAN_STATUS_LABEL, SHELL_TEXT, STRATEGY_TEXT } from "../lib/messages";
import { getStrategyStore } from "../../domains/shared/registry";
import { listPlans } from "../../domains/strategy/service";
import type { PlanRecord } from "../../domains/strategy/store";

// D1 strategy: the top of the chain. Everything downstream can trace back here,
// which is what makes "how much of this quarter came from the segment we chose
// to attack" a join rather than a manual tally.

export const dynamic = "force-dynamic";

export default async function StrategyPage() {
  const session = await resolveAppSession();
  if (!session) {
    return <EmptyState title={SHELL_TEXT.signedOutTitle} description={SHELL_TEXT.signedOutDescription} />;
  }

  const result = await listPlans({
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: getStrategyStore(),
  });

  if (!result.ok) {
    return (
      <EmptyState
        title={SHELL_TEXT.loadFailed}
        description={result.violations.map((v) => v.message).join("; ")}
      />
    );
  }

  const columns: readonly DataTableColumn<PlanRecord>[] = [
    {
      id: "name",
      header: STRATEGY_TEXT.columnName,
      cell: (row) => (
        <div>
          <div>{row.name}</div>
          <div>{row.planNo}</div>
        </div>
      ),
    },
    { id: "period", header: STRATEGY_TEXT.columnPeriod, cell: (row) => row.period },
    { id: "owner", header: STRATEGY_TEXT.columnOwner, cell: (row) => row.ownerSub ?? "-" },
    {
      id: "status",
      header: STRATEGY_TEXT.columnStatus,
      cell: (row) => (
        <StatusBadge tone={row.status === "active" ? "success" : "neutral"} dot>
          {PLAN_STATUS_LABEL[row.status] ?? row.status}
        </StatusBadge>
      ),
    },
  ];

  return (
    <PageSection title={STRATEGY_TEXT.title} description={STRATEGY_TEXT.description}>
      {result.value.length === 0 ? (
        <EmptyState title={STRATEGY_TEXT.emptyTitle} description={STRATEGY_TEXT.emptyDescription} />
      ) : (
        <DataTable columns={columns} rows={result.value} rowKey={(row) => row.id} />
      )}
    </PageSection>
  );
}
