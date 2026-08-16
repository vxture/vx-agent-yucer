import { DataTable, EmptyState, PageSection, StatusBadge, type DataTableColumn } from "@vxture/design-system";
import { resolveAppSession } from "../lib/session";
import { PLAN_STATUS_LABEL, SHELL_TEXT, STRATEGY_TEXT } from "../lib/messages";
import { getStrategyStore } from "../../domains/shared/registry";
import { listPlans } from "../../domains/strategy/service";
import { nextPlanStatuses } from "../../domains/strategy/lib/lifecycle";
import { can } from "../../authz/decide";
import { LifecycleControl } from "../components/lifecycle-control";
import { movePlan } from "./actions";
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

  // The service picks its gate from the DESTINATION - strategy.plan.approve for
  // approving, strategy.plan.update otherwise - so the control is offered when
  // either is held and the refusal, if any, comes from the service.
  //
  // Both action ids currently resolve to the same permission (strategy.write),
  // so this is one check in practice. Making approval a genuine separation of
  // duties would move catalog.ts, the seed SQL and the role doc together, which
  // is a product decision rather than something to slip in here.
  const canMove =
    can(session.authz, session.entitlement, "strategy.plan.update", "ui").allowed ||
    can(session.authz, session.entitlement, "strategy.plan.approve", "ui").allowed;

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
    {
      id: "actions",
      header: "",
      align: "right",
      // Only the legal moves. An archived plan has none and renders nothing.
      cell: (row) => (
        <LifecycleControl
          id={row.id}
          status={row.status}
          options={nextPlanStatuses(row.status)}
          label={PLAN_STATUS_LABEL}
          canChange={canMove}
          onChange={movePlan}
        />
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
