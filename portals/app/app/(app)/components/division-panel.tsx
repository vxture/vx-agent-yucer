"use client";

import {
  BulkActionBar,
  Button,
  DataTable,
  Drawer,
  EmptyState,
  FilterBar,
  Input,
  ListCard,
  ListCardGrid,
  NativeSelect,
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
  type FilterBarView,
} from "@vxture/design-ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { ACTION_COLUMN, EDGE_COLUMNS, FilterSlot, RowActions, SearchSlot, moveItems } from "./table-fittings";
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
  /** The territories covering it (0052), each with the units that work it. */
  readonly coveredBy: readonly { readonly name: string; readonly units: readonly string[] }[];
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
  const { DATA_TABLE_LABELS, DS_LABELS, PLANNING_TEXT, ROW_OPS, TERRITORY_ERROR } = useMessages();
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [view, setView] = useState<FilterBarView>("list");
  /* 搜索/筛选 (owner: 表头操作行参照 /admin/permissions 补齐, 筛选组的补齐) -
     a flat list, unlike 组织架构's tree, so filtering is a plain array
     filter with nothing to flatten first. */
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<"" | "system" | "custom">("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (q === "" || r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q))
        && (sourceFilter === "" || (sourceFilter === "system") === r.system),
    );
  }, [rows, query, sourceFilter]);
  const searching = query.trim() !== "" || sourceFilter !== "";
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
  /* 批量删除 (owner, 2026-09-11: 添加表操作行，模式按照组织架构) - a flat
     list, unlike 组织架构's tree, so there is no subtree to pre-filter: every
     selected row is attempted, and one still covering members is refused by
     the server (the same FK RESTRICT the single-row menu already shows) and
     reported as skipped rather than as an error. */
  const bulkRemove = () =>
    start(async () => {
      const byCode = new Map(rows.map((r) => [r.code, r]));
      const targets = selected.map((code) => byCode.get(code)).filter((r): r is DivisionRow => r !== undefined);
      let removed = 0;
      let skipped = 0;
      for (const r of targets) {
        if (r.members.length > 0) {
          skipped += 1;
          continue;
        }
        const res = await removeDivisionAction(r.code);
        if (res.ok) removed += 1;
        else toast({ tone: "danger", title: `${r.name}: ${TERRITORY_ERROR[res.error] ?? res.error}` });
      }
      if (removed > 0) toast({ tone: "success", title: PLANNING_TEXT.divisionBulkRemoveDone(removed) });
      if (skipped > 0) toast({ tone: "info", title: PLANNING_TEXT.divisionBulkRemoveSkipped(skipped, noun) });
      setSelected([]);
      router.refresh();
    });

  /* Shared between the table row and the card - same menu either way
     (owner, 2026-09-11: 添加表操作行，模式按照组织架构). rowIndex is the
     row's position in `filtered`, not the true stored order - 上移/下移
     greying reflects what a reader is currently looking at, matching
     vocabulary-config.tsx's own choice while a search narrows the rows. */
  const actionsFor = (r: DivisionRow) => {
    const rowIndex = filtered.findIndex((x) => x.code === r.code);
    return (
      <RowActions
        disabled={pending}
        items={[
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
                ...moveItems(ROW_OPS, rowIndex, filtered.length, (d) => move(r.code, d)),
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
                    consequence:
                      r.coveredBy.length > 0
                        ? `${PLANNING_TEXT.divisionRemoveCoverage(r.coveredBy.length)}${PLANNING_TEXT.divisionRemoveConsequence}`
                        : PLANNING_TEXT.divisionRemoveConsequence,
                    titleTemplate: PLANNING_TEXT.destructiveTitle,
                    cancelLabel: PLANNING_TEXT.templateCancel,
                    onConfirm: () => remove(r.code),
                  },
                },
              ]
            : []),
        ]}
      />
    );
  };

  return (
    /* NO TITLE HERE. It carried one for a day, while this panel was the
       unnamed second table on /territory; its own page names it now, and two
       identical headings one above the other is what the module-name guard
       exists to prevent one level up. */
    <Section id="divisions">
      {rows.length > 0 ? (
        <FilterBar
          count={
            searching
              ? PLANNING_TEXT.divisionToolbarFilteredCount(filtered.length, rows.length)
              : PLANNING_TEXT.divisionToolbarCount(rows.length)
          }
          view={view}
          onViewChange={(v) => {
            setView(v);
            setSelected([]);
          }}
          search={
            <SearchSlot>
              <Input
                type="search"
                className="w-full"
                value={query}
                placeholder={PLANNING_TEXT.divisionSearchPlaceholder}
                aria-label={PLANNING_TEXT.divisionSearchLabel}
                onChange={(e) => setQuery(e.target.value)}
              />
            </SearchSlot>
          }
          onReset={searching ? () => { setQuery(""); setSourceFilter(""); } : undefined}
          resetLabel={PLANNING_TEXT.divisionResetFilters}
          actions={editable ? <Button onClick={() => router.push("/admin/division/new")}>{PLANNING_TEXT.divisionNew}</Button> : undefined}
        >
          <FilterSlot width="w-[9rem]">
            <NativeSelect
              value={sourceFilter}
              aria-label={PLANNING_TEXT.divisionSourceFilterLabel}
              onChange={(e) => setSourceFilter(e.target.value as "" | "system" | "custom")}
            >
              <option value="">{PLANNING_TEXT.divisionFilterAllSources}</option>
              <option value="system">{PLANNING_TEXT.divisionSystem}</option>
              <option value="custom">{PLANNING_TEXT.divisionCustom}</option>
            </NativeSelect>
          </FilterSlot>
        </FilterBar>
      ) : null}
      {editable && view === "list" ? (
        <BulkActionBar
          count={selected.length}
          noun={PLANNING_TEXT.divisionSelectionNoun}
          selectionTemplate={DS_LABELS.bulkSelectionTemplate}
          toolbarLabel={DS_LABELS.bulkToolbar}
          clearLabel={PLANNING_TEXT.divisionClearSelection}
          onClear={() => setSelected([])}
          actions={[
            {
              id: "remove",
              label: PLANNING_TEXT.divisionBulkRemove,
              danger: true as const,
              confirm: {
                verb: PLANNING_TEXT.divisionBulkRemove,
                target: PLANNING_TEXT.divisionBulkRemoveTarget(selected.length),
                consequence: PLANNING_TEXT.divisionBulkRemoveConsequence(noun),
                titleTemplate: PLANNING_TEXT.destructiveTitle,
                cancelLabel: PLANNING_TEXT.templateCancel,
                onConfirm: bulkRemove,
              },
            },
          ]}
        />
      ) : null}
      {rows.length === 0 ? (
        <EmptyState
          title={PLANNING_TEXT.divisionEmptyTitle}
          description={PLANNING_TEXT.divisionEmptyWhy}
        />
      ) : filtered.length === 0 ? (
        <p className="text-muted-foreground text-body-sm">{PLANNING_TEXT.divisionFilterEmpty}</p>
      ) : view === "cards" ? (
        <ListCardGrid>
          {filtered.map((r) => (
            <ListCard
              key={r.code}
              title={r.name}
              description={r.code}
              onTitleClick={() => setDetails(r)}
              status={r.system ? <Tag>{PLANNING_TEXT.divisionSystem}</Tag> : <StatusBadge tone="info">{PLANNING_TEXT.divisionCustom}</StatusBadge>}
              actions={actionsFor(r)}
              meta={
                <div className="gap-xs flex flex-wrap items-center">
                  <span className="text-muted-foreground text-body-sm tabular-nums">
                    {PLANNING_TEXT.divisionMemberCount(noun)}: {r.members.length}
                  </span>
                  {r.members.map((m) => <Tag key={m.key}>{m.label}</Tag>)}
                </div>
              }
            />
          ))}
        </ListCardGrid>
      ) : (
        /* 三件标配 - 选择列 / 序号列 / 操作列. table-fittings.test.ts requires
           all three on every converted table; the edge classes give the
           selection and index columns an equal share so they line up with the
           DS's own.

           COLUMN WIDTHS (owner, 表格列宽新一轮规则: 首列 30%-50%，按业务列
           数量分档 - 4 列落在 "2-4 列→40%" 这档，比这里之前的 25% 宽). 首列
           40%，其余三列按原有 1:1:4 的比例摊剩余 60%：来源/省份数各 10%，
           覆盖省份 40% - 覆盖省份仍然是最宽的一列（规则 3 允许特殊列按倍数
           分配，覆盖省份的标签本来就要换行，这个意图不变，只是跟着首列一起
           缩小了绝对占比）。四个百分比仍然恰好加总 100%，跟 org-panel.tsx
           同样的理由 (table-fittings.test.ts's WIDTH_EXEMPTIONS): 没有缺口
           留给 table-fixed 去按比例分摊，选择/序号/操作照样精确 64px。 */
        <div
          className={
            `[&_table]:table-fixed ${EDGE_COLUMNS} ${ACTION_COLUMN}`
            + " [&_thead_th:nth-child(3)]:w-[40%]"
            + " [&_thead_th:nth-child(4)]:w-[10%]"
            + " [&_thead_th:nth-child(5)]:w-[10%]"
            + " [&_thead_th:nth-child(6)]:w-[40%]"
          }
        >
        <DataTable
          labels={DATA_TABLE_LABELS}
          indexStart={1}
          selectedKeys={selected}
          onSelectionChange={(keys) => setSelected([...keys])}
          rowActions={actionsFor}
          rowKey={(r: DivisionRow) => r.code}
          rows={filtered}
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
        {/* WHO WORKS THIS GROUND (0052): the territories covering the 大区,
            and the units behind each - the chain read from the map's end. */}
        {details ? (
          <div className="mt-lg">
            <Section title={PLANNING_TEXT.divisionCoveredBy(details.coveredBy.length)}>
              {details.coveredBy.length === 0 ? (
                <p className="text-muted-foreground text-body-sm">{PLANNING_TEXT.divisionCoveredNone}</p>
              ) : (
                <ul className="gap-xs flex flex-col">
                  {details.coveredBy.map((t) => (
                    <li key={t.name} className="gap-xs flex items-center">
                      <span className="text-body-md">{t.name}</span>
                      <span className="text-muted-foreground text-body-sm">
                        {t.units.length > 0 ? PLANNING_TEXT.divisionCoveredUnits(t.units.join(" / ")) : PLANNING_TEXT.divisionCoveredNoUnits}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>
        ) : null}
      </Drawer>
    </Section>
  );
}
