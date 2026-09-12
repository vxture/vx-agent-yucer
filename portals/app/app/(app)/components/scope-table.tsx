"use client";

import { DataTable, StatusBadge, TableTitleCell } from "@vxture/design-ui";
import { ACTION_COLUMN, EDGE_COLUMNS, RowActions, useTableSort } from "./table-fittings";
import { useMessages } from "../lib/i18n/provider";
import { Tag } from "./tag";

/* 数据范围 - which rows each member may see (incr/0022).
 *
 * A PAGE OF ITS OWN because it is a different question from the roles beside
 * which it used to sit: a role says what someone may DO, a scope says what
 * they may do it TO. Two members with the same role and different scopes see
 * different products of the same permission, and that is the fact an
 * administrator comes here to check.
 *
 * READ-ONLY HERE, and deliberately: a scope is an attribute of a member, so it
 * is changed where the member is - one page owns the write, this one answers
 * "who sits at which" across everyone at once.
 */

export interface ScopeRow {
  readonly sub: string;
  readonly name: string;
  readonly scope: string;
  readonly territories: number;
  readonly active: boolean;
}

const SORT_ON = {
  member: (r: ScopeRow) => r.name,
  scope: (r: ScopeRow) => r.scope,
};

export function ScopeTable({ rows }: { readonly rows: readonly ScopeRow[] }) {
  const { ADMIN_PAGE_TEXT, DATA_TABLE_LABELS, MEMBER_TEXT, SCOPE_LABEL } = useMessages();
  const sorted = useTableSort<ScopeRow>([], SORT_ON);

  return (
    <div
      className={
        /* 首列 40% (owner, 表格列宽新一轮规则: 首列按业务列数量分档 - 成员/
           数据范围/详情三个业务列落在 "2-4 列→40%" 这档)。详情列继续留白
           自适应。 */
        `[&_table]:table-fixed ${EDGE_COLUMNS} ${ACTION_COLUMN}`
        + " [&_thead_th:nth-child(3)]:w-[40%]"
        + " [&_thead_th:nth-child(4)]:w-[9rem]"
      }
    >
      <DataTable
        labels={DATA_TABLE_LABELS}
        leadingSpacer
        indexStart={1}
        rowActions={() => <RowActions items={[]} />}
        rowKey={(r: ScopeRow) => r.sub}
        rows={[...sorted.sortRows(rows)]}
        sort={sorted.sort}
        onSortChange={sorted.onSortChange}
        columns={[
          {
            id: "member",
            header: ADMIN_PAGE_TEXT.scopeColumnMember,
            sortable: true,
            /* The sub is the description, not the title, and it is here for
               the same reason the account roster shows one: this product has
               no directory, and dressing an id up as a person is a defect this
               repo has already fixed once. */
            cell: (r: ScopeRow) => (
              <TableTitleCell
                title={r.name}
                description={r.sub}
                tooltip={r.name}
              />
            ),
          },
          {
            id: "scope",
            header: ADMIN_PAGE_TEXT.scopeColumnScope,
            sortable: true,
            cell: (r: ScopeRow) => (
              <Tag tone={r.scope === "workspace" ? "info" : "neutral"}>
                {SCOPE_LABEL[r.scope] ?? r.scope}
              </Tag>
            ),
          },
          {
            id: "detail",
            header: ADMIN_PAGE_TEXT.scopeColumnDetail,
            /* A territory scope with no territory sees NOTHING, which is a
               configuration nobody intends and nothing else reports. It reads
               as a warning rather than as an empty cell. */
            cell: (r: ScopeRow) => {
              if (!r.active) return <Tag>{MEMBER_TEXT.inactive}</Tag>;
              if (r.scope !== "territory") return null;
              return r.territories === 0 ? (
                <StatusBadge tone="warning">{ADMIN_PAGE_TEXT.scopeNoTerritory}</StatusBadge>
              ) : (
                ADMIN_PAGE_TEXT.scopeTerritories(r.territories)
              );
            },
          },
        ]}
      />
    </div>
  );
}
