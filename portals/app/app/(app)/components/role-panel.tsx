"use client";

import { DataTable, EmptyState, Section, StatusBadge, TableTitleCell, useToast } from "@vxture/design-ui";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ACTION_COLUMN, EDGE_COLUMNS, RowActions } from "./table-fittings";
import { useMessages } from "../lib/i18n/provider";
import type { MoveDirection } from "../../domains/shared/ordering";
import { moveRoleAction } from "../admin/roles/actions";
import { RolePermissionsDrawer } from "./role-permissions-drawer";
import { Tag } from "./tag";

/* 角色管理 - 展示. DISPLAY ONLY, the shape /admin/division has (owner,
 * 2026-09-09: 基本遵循区域设定思路).
 *
 * THE ROSTER GIVES A SENTENCE AND A COUNT (owner: 不显示所有权限名称，给出最简单
 * 的角色描述，给出权限数量). Twenty-five permission names on one row was a
 * wall; what a reader scanning the list wants is what each role is FOR and
 * how much it holds. The grants themselves are one click away - 权限详情 in
 * the row's menu opens the four-level tree, in a drawer, for that role.
 *
 * MULTI-TENANT, so nothing here assumes nine roles or their names: the nine
 * presets are a starting point, and a workspace with a 渠道经理 of its own is
 * listed the same way. 系统预置 / 自定义 is DERIVED by comparing against the
 * preset - rename one or move a permission and it reads as theirs.
 *
 * THE ORDER IS THE ORDER, as it is for the 大区: sort_order is what the
 * roster, the assignment menu on /admin/members and the columns of 权限管理
 * all follow, so there are no sortable headers; the moves are in the row's
 * menu and change the order for everybody.
 */

export interface RoleRow {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly description: string;
  readonly permissions: readonly string[];
  /** Still exactly its preset - name, description and grants. Derived. */
  readonly preset: boolean;
  readonly members: number;
}

export function RolePanel({
  rows,
  total,
  editable,
}: {
  readonly rows: readonly RoleRow[];
  /** How many permissions the catalogue has - the count's denominator. */
  readonly total: number;
  readonly editable: boolean;
}) {
  const { DATA_TABLE_LABELS, ROLE_ERROR, ROLE_TEXT } = useMessages();
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [details, setDetails] = useState<RoleRow | null>(null);
  const [pending, start] = useTransition();
  const { toast } = useToast();
  const move = (code: string, direction: MoveDirection) =>
    start(async () => {
      const r = await moveRoleAction(code, direction);
      if (!r.ok) toast({ tone: "danger", title: ROLE_ERROR[r.error] ?? r.error });
    });

  return (
    <Section id="roles">
      {rows.length === 0 ? (
        <EmptyState title={ROLE_TEXT.emptyTitle} description={ROLE_TEXT.emptyWhy} />
      ) : (
        /* 三件标配, and the short columns take explicit widths so the
           description column gets the room - the same constraint-from-outside
           every roster here carries: the DS's width tiers are MIN-widths and
           fixed layout ignores minimums. */
        <div
          className={
            `[&_table]:table-fixed ${EDGE_COLUMNS} ${ACTION_COLUMN}`
            + " [&_thead_th:nth-child(3)]:w-[14rem]"
            + " [&_thead_th:nth-child(4)]:w-[7rem]"
            + " [&_thead_th:nth-child(6)]:w-[6rem]"
            + " [&_thead_th:nth-child(7)]:w-[6rem]"
          }
        >
          <DataTable
            labels={DATA_TABLE_LABELS}
            indexStart={1}
            selectedKeys={selected}
            onSelectionChange={(keys) => setSelected([...keys])}
            rowActions={(r: RoleRow, rowIndex: number) => (
              <RowActions
                disabled={pending}
                items={[
                  /* 权限详情 FIRST, and for every reader: the drawer is the
                     one thing a read-only reader came here to open. */
                  {
                    id: "details",
                    label: ROLE_TEXT.details,
                    onSelect: () => setDetails(r),
                  },
                  ...(editable
                    ? [
                        {
                          id: "edit",
                          label: ROLE_TEXT.edit,
                          onSelect: () => router.push(`/admin/roles/${r.id}`),
                        },
                        /* THE FOUR MOVES, greyed at the end they cannot pass.
                           rowIndex is the global position, since the rows are
                           never re-sorted for display. */
                        {
                          id: "up",
                          label: ROLE_TEXT.moveUp,
                          separatorBefore: true,
                          disabled: rowIndex === 0,
                          onSelect: () => move(r.code, "up"),
                        },
                        {
                          id: "down",
                          label: ROLE_TEXT.moveDown,
                          disabled: rowIndex === rows.length - 1,
                          onSelect: () => move(r.code, "down"),
                        },
                        {
                          id: "top",
                          label: ROLE_TEXT.moveTop,
                          disabled: rowIndex === 0,
                          onSelect: () => move(r.code, "top"),
                        },
                        {
                          id: "bottom",
                          label: ROLE_TEXT.moveBottom,
                          disabled: rowIndex === rows.length - 1,
                          onSelect: () => move(r.code, "bottom"),
                        },
                      ]
                    : []),
                ]}
              />
            )}
            rowKey={(r: RoleRow) => r.code}
            rows={rows}
            columns={[
              {
                /* 首列走 TableTitleCell: the name leads, the code is its
                   description. THE NAME OPENS 权限详情 (owner, 2026-09-09: 点击
                   角色名改为抽屉查看权限), for every reader - a role's name
                   is a question about what it may do. Editing is the row
                   menu's 配置, and only for those who may. */
                id: "name",
                header: ROLE_TEXT.colRole,
                cell: (r: RoleRow) => (
                  <button
                    type="button"
                    className="cursor-pointer text-left"
                    aria-label={ROLE_TEXT.detailsTitle(r.name)}
                    onClick={() => setDetails(r)}
                  >
                    <TableTitleCell title={r.name} description={r.code} tooltip={r.name} />
                  </button>
                ),
              },
              {
                // 系统预置 / 自定义. DERIVED by comparing against the preset,
                // so the label cannot drift from the truth.
                id: "source",
                header: ROLE_TEXT.colSource,
                cell: (r: RoleRow) =>
                  r.preset ? (
                    <Tag>{ROLE_TEXT.preset}</Tag>
                  ) : (
                    <StatusBadge tone="info">{ROLE_TEXT.custom}</StatusBadge>
                  ),
              },
              {
                /* THE SENTENCE (owner: 最简单的角色描述). It takes what the
                   short columns leave, and a role with none says so in the
                   muted tone rather than leaving a hole. */
                id: "description",
                header: ROLE_TEXT.colDescription,
                cell: (r: RoleRow) =>
                  r.description ? (
                    <span className="text-body-sm">{r.description}</span>
                  ) : (
                    <span className="text-muted-foreground text-body-sm">{ROLE_TEXT.noDescription}</span>
                  ),
              },
              {
                /* THE COUNT, over the catalogue's total (owner: 给出权限数量).
                   A role holding nothing is flagged: whoever holds it opens
                   the product and finds every module missing. */
                id: "permissions",
                header: ROLE_TEXT.colPerms,
                cell: (r: RoleRow) =>
                  r.permissions.length === 0 ? (
                    <StatusBadge tone="warning">{ROLE_TEXT.permCount(0, total)}</StatusBadge>
                  ) : (
                    <span className="tabular-nums">{ROLE_TEXT.permCount(r.permissions.length, total)}</span>
                  ),
              },
              {
                id: "members",
                header: ROLE_TEXT.colMembers,
                // A role nobody holds is a fact worth seeing, not a zero to
                // skim past - and it is the only kind that can be deleted.
                cell: (r: RoleRow) =>
                  r.members === 0 ? <Tag>{ROLE_TEXT.noMember}</Tag> : ROLE_TEXT.members(r.members),
              },
            ]}
          />
        </div>
      )}

      <RolePermissionsDrawer
        role={details}
        total={total}
        open={details !== null}
        onClose={() => setDetails(null)}
      />
    </Section>
  );
}
