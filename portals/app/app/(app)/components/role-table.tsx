"use client";

import { DataTable, StatusBadge, TableTitleCell } from "@vxture/design-ui";
import { ACTION_COLUMN, EDGE_COLUMNS, RowActions, useTableSort } from "./table-fittings";
import { useMessages } from "../lib/i18n/provider";

/* 角色管理 - the nine roles and what each of them may do.
 *
 * READ-ONLY, and the fittings say so honestly rather than by omission: the
 * selection column is a `leadingSpacer` (the slot keeps its width, offers no
 * control) and the action column renders an empty trigger. The ruling is that
 * two tables must not disagree about where things sit; a table that drops the
 * columns it has no use for is exactly that disagreement.
 *
 * THE PERMISSION LIST IS SPELLED OUT, not counted. "18 项权限" tells an
 * administrator nothing they can act on - the question is always which ones,
 * and a reader comparing two roles is comparing the lists.
 */

export interface RoleRow {
  readonly code: string;
  readonly name: string;
  readonly permissions: readonly string[];
  readonly members: number;
}

const SORT_ON = {
  name: (r: RoleRow) => r.name,
  permissions: (r: RoleRow) => r.permissions.length,
  members: (r: RoleRow) => r.members,
};

export function RoleTable({ rows }: { readonly rows: readonly RoleRow[] }) {
  const { ADMIN_PAGE_TEXT, DATA_TABLE_LABELS, PERMISSION_LABEL } = useMessages();
  const sorted = useTableSort<RoleRow>([], SORT_ON);

  return (
    <div
      className={
        `[&_table]:table-fixed ${EDGE_COLUMNS} ${ACTION_COLUMN}`
        + " [&_thead_th:nth-child(3)]:w-[11rem]"
        + " [&_thead_th:nth-child(4)]:w-[6rem]"
        + " [&_thead_th:nth-child(5)]:w-[6rem]"
      }
    >
      <DataTable
        labels={DATA_TABLE_LABELS}
        leadingSpacer
        indexStart={1}
        rowActions={() => <RowActions items={[]} />}
        rowKey={(r: RoleRow) => r.code}
        rows={[...sorted.sortRows(rows)]}
        sort={sorted.sort}
        onSortChange={sorted.onSortChange}
        columns={[
          {
            id: "name",
            header: ADMIN_PAGE_TEXT.rolesColumnRole,
            sortable: true,
            cell: (r: RoleRow) => (
              <TableTitleCell title={r.name} description={r.code} tooltip={r.name} />
            ),
          },
          {
            id: "permissions",
            header: ADMIN_PAGE_TEXT.rolesColumnPerms,
            sortable: true,
            align: "numeric",
            cell: (r: RoleRow) => r.permissions.length,
          },
          {
            id: "members",
            header: ADMIN_PAGE_TEXT.rolesColumnMembers,
            sortable: true,
            align: "numeric",
            // A role nobody holds is a fact worth seeing, not a zero to skim
            // past: it is either a role the workspace has not started using or
            // one it has stopped.
            cell: (r: RoleRow) =>
              r.members === 0 ? (
                <StatusBadge tone="neutral">{ADMIN_PAGE_TEXT.rolesNoMember}</StatusBadge>
              ) : (
                ADMIN_PAGE_TEXT.rolesMembers(r.members)
              ),
          },
          {
            id: "list",
            header: ADMIN_PAGE_TEXT.rolesColumnList,
            cell: (r: RoleRow) =>
              r.permissions.map((p) => PERMISSION_LABEL[p] ?? p).join(" · "),
          },
        ]}
      />
    </div>
  );
}
