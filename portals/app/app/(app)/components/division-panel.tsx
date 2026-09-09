"use client";

import {
  Button,
  DataTable,
  Drawer,
  EmptyState,
  Section,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableTitleCell,
  useToast,
} from "@vxture/design-ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ACTION_COLUMN, EDGE_COLUMNS, RowActions, moveItems } from "./table-fittings";
import { useMessages } from "../lib/i18n/provider";
import type { MarketMember } from "../../domains/shared/market-division";
import type { MoveDirection } from "../../domains/shared/ordering";
import { moveDivisionAction, removeDivisionAction } from "../admin/division/actions";
import { Tag } from "./tag";

/* 大区与成员 - 展示. DISPLAY ONLY.
 *
 * It had pickers in it, which put editing inside a roster and made the page do
 * two jobs at once. The module already had the right shape and I ignored it:
 * /admin/division lists, /admin/division/[id] edits. This is the list; the
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
  /** The row's id - what the edit link carries. The code is unique only
   *  within a frame (0045); the id is unique full stop. */
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly sortOrder: number;
  /** Provinces under 中国市场, cities under 省级市场 - key and printed label. */
  readonly members: readonly MarketMember[];
  /** True while it still matches a shipped template, exactly. Derived, not stored. */
  readonly system: boolean;
}

export function DivisionPanel(
  { rows, unassigned, noun, editable }:
  {
    readonly rows: readonly DivisionRow[];
    /** Members in no 大区 at all - named one by one at the foot. */
    readonly unassigned: readonly MarketMember[];
    /** 省份 / 市 - the frame's own word for what a region holds. */
    readonly noun: string;
    readonly editable: boolean;
  },
) {
  const { DATA_TABLE_LABELS, PLANNING_TEXT, ROW_OPS, TERRITORY_ERROR } = useMessages();
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  /* 区域详情 - the members as the form's four-column roster, in a drawer:
     the one menu every panel has (owner, 2026-09-09) starts with XX详情. */
  const [details, setDetails] = useState<DivisionRow | null>(null);
  const [pending, start] = useTransition();
  const { toast } = useToast();
  const move = (code: string, direction: MoveDirection) =>
    start(async () => {
      const r = await moveDivisionAction(code, direction);
      if (!r.ok) toast({ tone: "danger", title: TERRITORY_ERROR[r.error] ?? r.error });
      // Read the new order back explicitly - see vocabulary-config.tsx.
      else router.refresh();
    });
  /* 删除区域, behind the DS's confirm, greyed with its reason while the region
     still covers anything (the FK's RESTRICT, said first). A refusal is
     toasted and RE-THROWN so the confirmation stays open. */
  const remove = async (code: string) => {
    const r = await removeDivisionAction(code);
    if (!r.ok) {
      toast({ tone: "danger", title: TERRITORY_ERROR[r.error] ?? r.error });
      throw new Error(r.error);
    }
    router.refresh();
  };

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
              items={[
                /* THE ONE MENU EVERY PANEL HAS (owner, 2026-09-09: 各操作面板
                   尽量统一): 区域详情 / 区域配置 ｜ the four moves ｜ 删除区域.
                   详情 for every reader; the rest for those who may edit. The
                   column still renders with 详情 alone for a read-only reader -
                   a table whose action column disappears shifts every other
                   column across. */
                {
                  id: "details",
                  label: ROW_OPS.details(PLANNING_TEXT.divisionName),
                  onSelect: () => setDetails(r),
                },
                ...(editable
                  ? [
                      {
                        id: "edit",
                        label: ROW_OPS.configure(PLANNING_TEXT.divisionName),
                        onSelect: () => router.push(`/admin/division/${r.id}`),
                      },
                      /* rowIndex is the global position, since the rows are
                         never re-sorted for display. */
                      ...moveItems(ROW_OPS, rowIndex, rows.length, (d) => move(r.code, d)),
                      {
                        id: "remove",
                        label: ROW_OPS.remove(PLANNING_TEXT.divisionName),
                        separatorBefore: true,
                        danger: true as const,
                        disabled: r.members.length > 0,
                        hint: r.members.length > 0 ? PLANNING_TEXT.divisionRemoveHeldHint(r.members.length, noun) : undefined,
                        confirm: {
                          verb: ROW_OPS.remove(PLANNING_TEXT.divisionName),
                          target: PLANNING_TEXT.divisionRemoveTarget(r.name),
                          consequence: PLANNING_TEXT.divisionRemoveConsequence,
                          titleTemplate: PLANNING_TEXT.destructiveTitle,
                          cancelLabel: PLANNING_TEXT.templateCancel,
                          onConfirm: () => remove(r.code),
                        },
                      },
                    ]
                  : []),
              ]}
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
                  <Link href={`/admin/division/${r.id}`}>
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
              /* CENTRED (owner, 2026-09-09): left-aligned, a region holding
                 one unit put its single tag far from a header centred over
                 the widest column on the page. Tags wrap from the middle. */
              align: "center",
              /* TAGS, LAID OUT ACROSS THE ROW (owner, 2026-09-08). It was
                 "江苏省 / 上海市 / ..." - one string that wrapped mid-name and
                 gave the eye nothing to land on. Each province is a chip now,
                 `JS 江苏`, and the row is scanned rather than read.
                 Listed in FULL rather than truncated: which provinces a region
                 covers IS the row's content, and a reader checking whether
                 江苏 is in it should not have to open anything. */
              cell: (r: DivisionRow) => (
                <span className="gap-2xs flex flex-wrap justify-center">
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

      {/* THE CONCLUSION, UNDER A RULE (owner, 2026-09-09). The header's badge
          gives the COUNT; this line gives the NAMES. A reader told "3 省份未归入"
          should not have to scan five rows of tags to work out which three -
          they are listed here, as tags, in the same shape the rows use, in a
          warning tone so the eye lands on them. When nothing is unplaced the
          line says so in one sentence and stops. */}
      <div className="border-border gap-2xs mt-md flex flex-col border-t pt-md">
        {unassigned.length === 0 ? (
          <p className="text-muted-foreground text-body-sm">
            {PLANNING_TEXT.divisionAllPlaced(noun)}
          </p>
        ) : (
          <div className="gap-sm flex flex-wrap items-center">
            <span className="text-body-sm">
              {PLANNING_TEXT.divisionUnplacedLead(unassigned.length, noun)}
            </span>
            {unassigned.map((m) => (
              <Tag key={m.key} tone="warning">
                {m.label}
              </Tag>
            ))}
          </div>
        )}
      </div>
      <Drawer
        open={details !== null}
        onClose={() => setDetails(null)}
        width="md"
        title={details ? PLANNING_TEXT.divisionDetailsTitle(details.name) : ""}
        description={details ? PLANNING_TEXT.divisionDetailsWhy(details.members.length, noun) : ""}
        closeLabel={PLANNING_TEXT.divisionDetailsDone}
        footer={
          <div className="flex justify-end">
            <Button variant="secondary" onClick={() => setDetails(null)}>{PLANNING_TEXT.divisionDetailsDone}</Button>
          </div>
        }
      >
        {/* The form's roster, read-only: 序号 / 简称代号 / 名称 / 行政区划代码. */}
        {details && details.members.length > 0 ? (
          <Table className="w-full table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[4rem] text-center">{PLANNING_TEXT.colIndex}</TableHead>
                <TableHead className="w-[6rem]">{PLANNING_TEXT.colAbbr}</TableHead>
                <TableHead>{PLANNING_TEXT.colName}</TableHead>
                <TableHead className="w-[8rem]">{PLANNING_TEXT.colAdcode}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {details.members.map((m, i) => (
                <TableRow key={m.key}>
                  <TableCell className="text-muted-foreground text-center tabular-nums">{i + 1}</TableCell>
                  <TableCell className="font-medium tabular-nums">{m.abbr ?? ""}</TableCell>
                  <TableCell>{m.name}</TableCell>
                  <TableCell className="tabular-nums">{m.adcode}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <EmptyState title={PLANNING_TEXT.divisionPickEmpty(noun)} description={PLANNING_TEXT.divisionRemoveWhy(noun)} />
        )}
      </Drawer>
    </Section>
  );
}
