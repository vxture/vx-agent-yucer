import { DataTable, EmptyState, PageSection, StatusBadge, type DataTableColumn } from "@vxture/design-system";
import { resolveAppSession } from "../lib/session";
import { DELIVERY_TEXT, PROJECT_HEALTH_LABEL, SHELL_TEXT } from "../lib/messages";
import { formatMoney } from "../lib/view-model";
import { getDeliveryStore } from "../../domains/shared/registry";
import { listProjects, projectView } from "../../domains/delivery/service";
import type { ProjectHealth } from "../../domains/delivery/lib/revenue";

export const dynamic = "force-dynamic";

const HEALTH_TONE: Record<ProjectHealth, "success" | "warning" | "danger"> = {
  green: "success",
  amber: "warning",
  red: "danger",
};

interface Row {
  id: string;
  name: string;
  projectNo: string;
  accountId: string;
  managerSub: string | null;
  contractAmount: number | null;
  currency: string;
  status: string;
  reported: ProjectHealth;
  derived: ProjectHealth;
  overriddenBecause: string | null;
}

// D7 delivery list.
//
// The health column shows the DERIVED value, and marks the row when it differs
// from what the delivery team reported. A list that showed the reported colour
// would hide exactly the projects worth looking at: the overdue-forbids-green
// rule exists because "we are fine" next to "they have not paid" is how a
// failing engagement stays green until it is a crisis.

export default async function DeliveryPage() {
  const session = await resolveAppSession();
  if (!session) {
    return <EmptyState title={SHELL_TEXT.signedOutTitle} description={SHELL_TEXT.signedOutDescription} />;
  }

  const ctx = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: getDeliveryStore(),
  };

  const projects = await listProjects(ctx, { limit: 100 });
  if (!projects.ok) {
    return (
      <EmptyState
        title={SHELL_TEXT.loadFailed}
        description={projects.violations.map((v) => v.message).join("; ")}
      />
    );
  }

  // Each row's health is reconciled against its instalments and milestones.
  // Done per project because the rule needs both, and a list query cannot carry
  // them; the page is capped at 100 rows for the same reason.
  const rows: Row[] = [];
  for (const p of projects.value) {
    const view = await projectView(ctx, p.id);
    rows.push({
      id: p.id,
      name: p.name,
      projectNo: p.projectNo,
      accountId: p.accountId,
      managerSub: p.managerSub,
      contractAmount: p.contractAmount?.amount ?? null,
      currency: p.currency,
      status: p.status,
      reported: p.health,
      derived: view.ok ? view.value.derivedHealth : p.health,
      overriddenBecause: view.ok ? view.value.healthOverriddenBecause : null,
    });
  }

  const columns: readonly DataTableColumn<Row>[] = [
    {
      id: "name",
      header: DELIVERY_TEXT.columnName,
      cell: (row) => (
        <div>
          <div>{row.name}</div>
          <div>{row.projectNo}</div>
        </div>
      ),
    },
    { id: "account", header: DELIVERY_TEXT.columnAccount, cell: (row) => row.accountId.slice(0, 8) },
    { id: "manager", header: DELIVERY_TEXT.columnManager, cell: (row) => row.managerSub ?? "-" },
    {
      id: "health",
      header: DELIVERY_TEXT.columnHealth,
      cell: (row) => (
        <>
          <StatusBadge tone={HEALTH_TONE[row.derived]} dot>
            {PROJECT_HEALTH_LABEL[row.derived] ?? row.derived}
          </StatusBadge>
          {/* The downgrade is shown, with its reason, rather than quietly
              replacing what the team reported. */}
          {row.overriddenBecause ? (
            <StatusBadge tone="warning">{DELIVERY_TEXT.healthOverridden}</StatusBadge>
          ) : null}
        </>
      ),
    },
    {
      id: "contract",
      header: DELIVERY_TEXT.columnContract,
      align: "right",
      cell: (row) => formatMoney(row.contractAmount, row.currency),
    },
    { id: "status", header: DELIVERY_TEXT.columnStatus, cell: (row) => row.status },
  ];

  return (
    <PageSection title={DELIVERY_TEXT.title} description={DELIVERY_TEXT.description}>
      {rows.length === 0 ? (
        <EmptyState title={DELIVERY_TEXT.emptyTitle} description={DELIVERY_TEXT.emptyDescription} />
      ) : (
        <DataTable columns={columns} rows={rows} rowKey={(row) => row.id} />
      )}
    </PageSection>
  );
}
