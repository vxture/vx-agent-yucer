"use client";

import { DataTable, StatusBadge, TableTitleCell } from "@vxture/design-ui";
import { ACTION_COLUMN, EDGE_COLUMNS, RowActions, useTableSort } from "./table-fittings";
import { useMessages } from "../lib/i18n/provider";

/* 权限管理 - the twenty-five permissions, and who holds each.
 *
 * THE OTHER DIRECTION FROM 角色管理, and both are needed. "What may a 销售经理
 * do" and "who may authorise a below-floor price" are different questions, and
 * a reader with only the role table has to scan nine lists to answer the
 * second one.
 *
 * READ-ONLY for the same reason the role table is: the grants are seeded DDL
 * mirrored in authz/catalog.ts, and the mirror tests fail in both directions.
 */

export interface PermissionRow {
  readonly code: string;
  readonly name: string;
  readonly roles: readonly string[];
}

const SORT_ON = {
  code: (r: PermissionRow) => r.code,
  roles: (r: PermissionRow) => r.roles.length,
};

export function PermissionTable({ rows }: { readonly rows: readonly PermissionRow[] }) {
  const { ADMIN_PAGE_TEXT, DATA_TABLE_LABELS } = useMessages();
  const sorted = useTableSort<PermissionRow>([], SORT_ON);

  return (
    <div
      className={
        `[&_table]:table-fixed ${EDGE_COLUMNS} ${ACTION_COLUMN}`
        + " [&_thead_th:nth-child(3)]:w-[11rem]"
      }
    >
      <DataTable
        labels={DATA_TABLE_LABELS}
        leadingSpacer
        indexStart={1}
        rowActions={() => <RowActions items={[]} />}
        rowKey={(r: PermissionRow) => r.code}
        rows={[...sorted.sortRows(rows)]}
        sort={sorted.sort}
        onSortChange={sorted.onSortChange}
        columns={[
          {
            id: "code",
            header: ADMIN_PAGE_TEXT.permissionsColumnCode,
            sortable: true,
            // The CODE leads and the sentence is its description: a permission
            // is quoted by code in every refusal the product prints, so the
            // code is what a reader arrives holding.
            cell: (r: PermissionRow) => (
              <TableTitleCell title={r.code} description={r.name} tooltip={r.code} />
            ),
          },
          {
            id: "roles",
            header: ADMIN_PAGE_TEXT.permissionsColumnRoles,
            sortable: true,
            // A permission no role holds is dead weight in the catalogue, or a
            // grant somebody forgot. Either way it is worth seeing.
            cell: (r: PermissionRow) =>
              r.roles.length === 0 ? (
                <StatusBadge tone="warning">{ADMIN_PAGE_TEXT.permissionsNoRole}</StatusBadge>
              ) : (
                r.roles.join(" · ")
              ),
          },
        ]}
      />
    </div>
  );
}
