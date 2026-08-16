import { DataTable, EmptyState, PageSection, StatusBadge, type DataTableColumn } from "@vxture/design-system";
import { resolveAppSession } from "../lib/session";
import { ACCOUNT_STATUS_LABEL, ACCOUNT_TEXT, SHELL_TEXT } from "../lib/messages";
import { healthTone } from "../lib/view-model";
import { getAccountStore } from "../../domains/shared/registry";
import { listAccounts } from "../../domains/account/service";
import type { AccountRecord } from "../../domains/account/store";

// D4 account list.
//
// Ordered sickest-first by the store, which is a product decision rather than a
// default: a customer list sorted by name is a directory, and a directory is
// not what a salesperson opens on a Monday. The unscored rows sort last -
// "never assessed" is not the same as "in trouble".

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const session = await resolveAppSession();
  if (!session) {
    return <EmptyState title={SHELL_TEXT.signedOutTitle} description={SHELL_TEXT.signedOutDescription} />;
  }

  const result = await listAccounts({
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: getAccountStore(),
  });

  if (!result.ok) {
    return (
      <EmptyState
        title={SHELL_TEXT.loadFailed}
        description={result.violations.map((v) => v.message).join("; ")}
      />
    );
  }

  const columns: readonly DataTableColumn<AccountRecord>[] = [
    {
      id: "name",
      header: ACCOUNT_TEXT.columnName,
      cell: (row) => (
        <div>
          <div>{row.name}</div>
          <div>{row.accountNo}</div>
        </div>
      ),
    },
    { id: "industry", header: ACCOUNT_TEXT.columnIndustry, cell: (row) => row.industry ?? "-" },
    { id: "owner", header: ACCOUNT_TEXT.columnOwner, cell: (row) => row.ownerSub ?? "-" },
    {
      id: "health",
      header: ACCOUNT_TEXT.columnHealth,
      align: "right",
      cell: (row) =>
        row.healthScore == null ? (
          <StatusBadge tone="neutral">{ACCOUNT_TEXT.unscored}</StatusBadge>
        ) : (
          <StatusBadge tone={healthTone(row.healthScore)}>{row.healthScore}</StatusBadge>
        ),
    },
    {
      id: "status",
      header: ACCOUNT_TEXT.columnStatus,
      cell: (row) => (
        <StatusBadge tone={row.status === "churned" ? "danger" : "neutral"} dot>
          {ACCOUNT_STATUS_LABEL[row.status] ?? row.status}
        </StatusBadge>
      ),
    },
  ];

  return (
    <PageSection title={ACCOUNT_TEXT.title} description={ACCOUNT_TEXT.description}>
      {result.value.length === 0 ? (
        <EmptyState title={ACCOUNT_TEXT.emptyTitle} description={ACCOUNT_TEXT.emptyDescription} />
      ) : (
        <DataTable columns={columns} rows={result.value} rowKey={(row) => row.id} />
      )}
    </PageSection>
  );
}
