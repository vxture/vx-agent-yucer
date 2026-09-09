"use client";

import {
  DataTable,
  EmptyState,
  Section,
  StatusBadge,
  TableTitleCell,
} from "@vxture/design-ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ACTION_COLUMN, EDGE_COLUMNS, RowActions, useTableSort } from "./table-fittings";
import { useMessages } from "../lib/i18n/provider";
import { provinceTag } from "../../domains/shared/provinces";

/* 大区与省份 - 展示. DISPLAY ONLY.
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
 */

export interface DivisionRow {
  readonly code: string;
  readonly name: string;
  readonly sortOrder: number;
  readonly provinces: readonly string[];
  /** True while it still matches a shipped template, exactly. Derived, not stored. */
  readonly system: boolean;
}

const SORT_ON = {
  name: (r: DivisionRow) => r.name,
  provinces: (r: DivisionRow) => r.provinces.length,
};

export function DivisionPanel(
  { rows, unassigned, total, editable }:
  {
    readonly rows: readonly DivisionRow[];
    /** Provinces in no 大区 at all - the statistic this section closes on. */
    readonly unassigned: readonly string[];
    /** How many there are in total. It was the literal 34, beside a prop
     *  derived from ALL_PROVINCES - two copies of one number, one of which
     *  cannot follow the vocabulary if it ever changes. */
    readonly total: number;
    readonly editable: boolean;
  },
) {
  const { DATA_TABLE_LABELS, PLANNING_TEXT } = useMessages();
  const sorted = useTableSort<DivisionRow>([], SORT_ON);
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);

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
          rowActions={(r: DivisionRow) => (
            <RowActions
              items={
                editable
                  ? [{
                      id: "edit",
                      label: PLANNING_TEXT.divisionEdit,
                      onSelect: () =>
                        router.push(`/admin/division/${encodeURIComponent(r.code)}`),
                    }]
                  // The column still renders with no items - a table whose
                  // action column disappears for a read-only reader shifts
                  // every other column across.
                  : []
              }
            />
          )}
          rowKey={(r: DivisionRow) => r.code}
          rows={[...sorted.sortRows(rows)]}
          sort={sorted.sort}
          onSortChange={sorted.onSortChange}
          columns={[
            {
              // 首列走 TableTitleCell: the name leads, the code is its
              // description - the shape every first column in this product has.
              id: "name",
              header: PLANNING_TEXT.divisionName,
              sortable: true,
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
                  <StatusBadge tone="neutral">{PLANNING_TEXT.divisionSystem}</StatusBadge>
                ) : (
                  <StatusBadge tone="info">{PLANNING_TEXT.divisionCustom}</StatusBadge>
                ),
            },
            {
              id: "provinces",
              header: PLANNING_TEXT.divisionProvinceCount,
              sortable: true,
              align: "numeric",
              // A division holding nothing is worth flagging: it appears in
              // every menu and answers for no ground.
              cell: (r: DivisionRow) =>
                r.provinces.length === 0 ? (
                  <StatusBadge tone="warning">{r.provinces.length}</StatusBadge>
                ) : (
                  r.provinces.length
                ),
            },
            {
              id: "scope",
              header: PLANNING_TEXT.divisionScope,
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
                  {r.provinces.map((p) => (
                    <StatusBadge key={p} tone="neutral">
                      {provinceTag(p)}
                    </StatusBadge>
                  ))}
                </span>
              ),
            },
          ]}
        />
        </div>
      )}

      {/* 底部统计. THE POINT IS THE GAP, not the total: a province in no 大区
          appears in no figure grouped by one, and the situation screen draws it
          grey - which reads as "no business here" rather than "nobody has filed
          this ground". Named in full, because a count alone cannot be acted
          on. Counted off the same 34 the map and the database CHECK use. */}
      <div className="border-border gap-2xs mt-md flex flex-col border-t pt-md">
        <p className="text-body-sm">
          {PLANNING_TEXT.divisionCoverage(total - unassigned.length, total, rows.length)}
        </p>
        {unassigned.length === 0 ? (
          <p className="text-muted-foreground text-body-sm">
            {PLANNING_TEXT.divisionAllPlaced}
          </p>
        ) : (
          <>
            <p className="text-warning text-body-sm">
              {PLANNING_TEXT.divisionUnplaced(unassigned.length)}
            </p>
            <p className="text-muted-foreground text-body-sm">{unassigned.map(provinceTag).join(" · ")}</p>
          </>
        )}
      </div>
    </Section>
  );
}
