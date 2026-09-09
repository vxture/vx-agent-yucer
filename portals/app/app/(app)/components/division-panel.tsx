"use client";

import {
  DataTable,
  EmptyState,
  Section,
  StatusBadge,
  TableTitleCell,
  useToast,
} from "@vxture/design-ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ACTION_COLUMN, EDGE_COLUMNS, RowActions } from "./table-fittings";
import { useMessages } from "../lib/i18n/provider";
import type { MarketMember } from "../../domains/shared/market-division";
import type { MoveDirection } from "../../domains/catalog/lib/lifecycle";
import { moveDivisionAction } from "../admin/division/actions";
import { Tag } from "./tag";

/* 大区与成员 - 展示. DISPLAY ONLY.
 *
 * It had pickers in it, which put editing inside a roster and made the page do
 * two jobs at once. The module already had the right shape and I ignored it:
 * /admin/division lists, /admin/division/[code] edits. This is the list; the
 * division form
 * is its own page, reached from the row.
 *
 * MULTI-TENANT, so nothing here assumes five divisions or their names. A
 * workspace that sells through a 新疆基地 covering one province is dividing its
 * market correctly; the table renders whatever that workspace has.
 *
 * THE ORDER IS THE ORDER (owner, 2026-09-09: 排序影响全局). The rows come in
 * sort_order and stay in it - no sortable headers, because a header sort
 * that re-arranged the display without changing sort_order would show one
 * order here and another everywhere else. Changing the order is an
 * operation, in the row's own menu: 上移 / 下移 / 移到最顶 / 移到最低.
 */

export interface DivisionRow {
  readonly code: string;
  readonly name: string;
  readonly sortOrder: number;
  /** Provinces under 中国市场, cities under 省级市场 - key and printed label. */
  readonly members: readonly MarketMember[];
  /** True while it still matches a shipped template, exactly. Derived, not stored. */
  readonly system: boolean;
}

export function DivisionPanel(
  { rows, noun, editable }:
  {
    readonly rows: readonly DivisionRow[];
    /** 省份 / 市 - the frame's own word for what a region holds. */
    readonly noun: string;
    readonly editable: boolean;
  },
) {
  const { DATA_TABLE_LABELS, PLANNING_TEXT, TERRITORY_ERROR } = useMessages();
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const { toast } = useToast();
  const move = (code: string, direction: MoveDirection) =>
    start(async () => {
      const r = await moveDivisionAction(code, direction);
      if (!r.ok) toast({ tone: "danger", title: TERRITORY_ERROR[r.error] ?? r.error });
    });

  return (
    /* NO TITLE HERE. It carried one for a day, while this panel was the
       unnamed second table on /territory; its own page names it now, and two
       identical headings one above the other is what the module-name guard
       exists to prevent one level up. */
    <Section id="divisions">
      {rows.length === 0 ? (
        <EmptyState
          title={PLANNING_TEXT.divisionEmptyTitle}
          description={PLANNING_TEXT.divisionEmptyWhy}
        />
      ) : (
        /* 三件标配 - 选择列 / 序号列 / 操作列. table-fittings.test.ts requires
           all three on every converted table; the edge classes give the
           selection and index columns an equal share so they line up with the
           DS's own. */
        /* THE THREE SHORT COLUMNS TAKE EXPLICIT WIDTHS, and the province list
           takes what is left. Same constraint-from-outside the catalog config
           tables carry: the DS's `width` tiers are MIN-widths and fixed layout
           ignores minimums, so untiered the seven columns split evenly and
           覆盖省份 got the same ~120px as 来源 - which wrapped 广西壮族自治区
           one character per line. Under fixed layout a column with no width
           takes the remainder, so naming the short ones is what gives the
           content column its room. Measured, not guessed: with the tiers alone
           the header still computed 121px against a min-width of 200. */
        <div
          className={
            `[&_table]:table-fixed ${EDGE_COLUMNS} ${ACTION_COLUMN}`
            + " [&_thead_th:nth-child(3)]:w-[9rem]"
            + " [&_thead_th:nth-child(4)]:w-[7rem]"
            + " [&_thead_th:nth-child(5)]:w-[5rem]"
          }
        >
        <DataTable
          labels={DATA_TABLE_LABELS}
          indexStart={1}
          selectedKeys={selected}
          onSelectionChange={(keys) => setSelected([...keys])}
          rowActions={(r: DivisionRow, rowIndex: number) => (
            <RowActions
              disabled={pending}
              items={
                editable
                  ? [
                      {
                        id: "edit",
                        label: PLANNING_TEXT.divisionEdit,
                        onSelect: () =>
                          router.push(`/admin/division/${encodeURIComponent(r.code)}`),
                      },
                      /* THE FOUR MOVES, greyed at the end they cannot pass.
                         rowIndex is the global position, since the rows are
                         never re-sorted for display. */
                      {
                        id: "up",
                        label: PLANNING_TEXT.divisionMoveUp,
                        separatorBefore: true,
                        disabled: rowIndex === 0,
                        onSelect: () => move(r.code, "up"),
                      },
                      {
                        id: "down",
                        label: PLANNING_TEXT.divisionMoveDown,
                        disabled: rowIndex === rows.length - 1,
                        onSelect: () => move(r.code, "down"),
                      },
                      {
                        id: "top",
                        label: PLANNING_TEXT.divisionMoveTop,
                        disabled: rowIndex === 0,
                        onSelect: () => move(r.code, "top"),
                      },
                      {
                        id: "bottom",
                        label: PLANNING_TEXT.divisionMoveBottom,
                        disabled: rowIndex === rows.length - 1,
                        onSelect: () => move(r.code, "bottom"),
                      },
                    ]
                  // The column still renders with no items - a table whose
                  // action column disappears for a read-only reader shifts
                  // every other column across.
                  : []
              }
            />
          )}
          rowKey={(r: DivisionRow) => r.code}
          rows={rows}
          columns={[
            {
              // 首列走 TableTitleCell: the name leads, the code is its
              // description - the shape every first column in this product has.
              id: "name",
              header: PLANNING_TEXT.divisionName,
              cell: (r: DivisionRow) =>
                editable ? (
                  <Link href={`/admin/division/${encodeURIComponent(r.code)}`}>
                    <TableTitleCell title={r.name} description={r.code} tooltip={r.name} />
                  </Link>
                ) : (
                  <TableTitleCell title={r.name} description={r.code} tooltip={r.name} />
                ),
            },
            {
              // 系统配置 / 自定义. DERIVED by comparing against the shipped
              // templates, so the label cannot drift from the truth: the moment
              // a tenant renames a division or moves a province out of it, it
              // stops matching and reads as theirs.
              id: "source",
              header: PLANNING_TEXT.divisionSource,
              cell: (r: DivisionRow) =>
                r.system ? (
                  <Tag>{PLANNING_TEXT.divisionSystem}</Tag>
                ) : (
                  <StatusBadge tone="info">{PLANNING_TEXT.divisionCustom}</StatusBadge>
                ),
            },
            {
              id: "members",
              header: PLANNING_TEXT.divisionMemberCount(noun),
              /* CENTRED, which is the DS's default and its own rule for this
                 kind of number: `numeric` is for digits that have to line up
                 (money, sizes), and it puts the value in a fixed-width block -
                 on a count that never passes 34 that block leaves a gap the
                 width of the column to its left. 短数字：默认居中. */
              // A division holding nothing is worth flagging: it appears in
              // every menu and answers for no ground.
              cell: (r: DivisionRow) =>
                r.members.length === 0 ? (
                  <StatusBadge tone="warning">{r.members.length}</StatusBadge>
                ) : (
                  r.members.length
                ),
            },
            {
              id: "scope",
              header: PLANNING_TEXT.divisionScope(noun),
              align: "left",
              /* TAGS, LAID OUT ACROSS THE ROW (owner, 2026-09-08). It was
                 "江苏省 / 上海市 / ..." - one string that wrapped mid-name and
                 gave the eye nothing to land on. Each province is a chip now,
                 `JS 江苏`, and the row is scanned rather than read.
                 Listed in FULL rather than truncated: which provinces a region
                 covers IS the row's content, and a reader checking whether
                 江苏 is in it should not have to open anything. */
              cell: (r: DivisionRow) => (
                <span className="gap-2xs flex flex-wrap">
                  {r.members.map((m) => (
                    <Tag key={m.key}>
                      {m.label}
                    </Tag>
                  ))}
                </span>
              ),
            },
          ]}
        />
        </div>
      )}

      {/* NO CLOSING STATISTIC (owner, 2026-09-09). The coverage sentence is
          the page header's badge and nothing else; the table ends with its
          last row. */}
    </Section>
  );
}
