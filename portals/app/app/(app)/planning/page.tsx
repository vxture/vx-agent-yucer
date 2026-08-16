import {
  DataTable,
  EmptyState,
  PageSection,
  StatusBadge,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  type DataTableColumn,
} from "@vxture/design-system";
import { resolveAppSession } from "../lib/session";
import { PLANNING_TEXT, SHELL_TEXT, TARGET_STATUS_LABEL } from "../lib/messages";
import { formatMoney, formatPercent } from "../lib/view-model";
import { getPlanningStore } from "../../domains/shared/registry";
import { attainment, type AttainmentRow } from "../../domains/planning/service";

// D2 planning: targets against what actually closed.
//
// The column that matters is attainment, and the thing it must never do is
// render "no snapshot yet" as 0%. Those are different facts - one means nobody
// has forecast this scope this period, the other means the period is going
// badly - and collapsing them reports an unforecast quarter as a failed one.

export const dynamic = "force-dynamic";

/** Current period, derived from today. Replaced by a picker when D2 gets one. */
function currentPeriod(now = new Date()): string {
  return `${now.getUTCFullYear()}Q${Math.floor(now.getUTCMonth() / 3) + 1}`;
}

function scopeLabel(row: AttainmentRow): string {
  const t = row.target;
  if (t.scopeType === "workspace") return PLANNING_TEXT.scopeWorkspace;
  if (t.scopeType === "territory") return t.territoryId ?? "-";
  return t.ownerSub ?? "-";
}

export default async function PlanningPage() {
  const session = await resolveAppSession();
  if (!session) {
    return <EmptyState title={SHELL_TEXT.signedOutTitle} description={SHELL_TEXT.signedOutDescription} />;
  }

  const period = currentPeriod();
  const result = await attainment(
    {
      workspaceId: session.workspaceId,
      sub: session.user.sub,
      holder: session.authz,
      entitlement: session.entitlement,
      store: getPlanningStore(),
    },
    period,
  );

  if (!result.ok) {
    return (
      <EmptyState
        title={SHELL_TEXT.loadFailed}
        description={result.violations.map((v) => v.message).join("; ")}
      />
    );
  }

  const columns: readonly DataTableColumn<AttainmentRow>[] = [
    { id: "scope", header: PLANNING_TEXT.columnScope, cell: (row) => scopeLabel(row) },
    { id: "metric", header: PLANNING_TEXT.columnMetric, cell: (row) => row.target.metric },
    {
      id: "target",
      header: PLANNING_TEXT.columnTarget,
      align: "right",
      cell: (row) => formatMoney(row.target.targetAmount.amount, row.target.targetAmount.currency),
    },
    {
      id: "closed",
      header: PLANNING_TEXT.columnClosed,
      align: "right",
      cell: (row) => (row.closed ? formatMoney(row.closed.amount, row.closed.currency) : "-"),
    },
    {
      id: "attainment",
      header: PLANNING_TEXT.columnAttainment,
      align: "right",
      // "No snapshot yet" is rendered as its own state, never as 0%.
      cell: (row) =>
        row.hasSnapshot ? (
          <StatusBadge tone={row.ratio != null && row.ratio >= 1 ? "success" : "neutral"}>
            {formatPercent(row.ratio)}
          </StatusBadge>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <StatusBadge tone="neutral">{PLANNING_TEXT.noSnapshot}</StatusBadge>
              </span>
            </TooltipTrigger>
            <TooltipContent>{PLANNING_TEXT.noSnapshotHint}</TooltipContent>
          </Tooltip>
        ),
    },
    {
      id: "status",
      header: PLANNING_TEXT.columnStatus,
      cell: (row) => (
        <StatusBadge tone={row.target.status === "committed" ? "warning" : "neutral"}>
          {TARGET_STATUS_LABEL[row.target.status] ?? row.target.status}
        </StatusBadge>
      ),
    },
  ];

  return (
    <PageSection title={`${PLANNING_TEXT.title} - ${period}`} description={PLANNING_TEXT.description}>
      {result.value.length === 0 ? (
        <EmptyState title={PLANNING_TEXT.emptyTitle} description={PLANNING_TEXT.emptyDescription} />
      ) : (
        <DataTable columns={columns} rows={result.value} rowKey={(row) => row.target.id} />
      )}
    </PageSection>
  );
}
