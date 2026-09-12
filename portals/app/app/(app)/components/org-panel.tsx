"use client";

import {
  BulkActionBar,
  Button,
  ButtonGroup,
  DataTable,
  DialogForm,
  Drawer,
  EmptyState,
  Field,
  FieldLabel,
  FilterBar,
  Icon,
  Input,
  ListCard,
  ListCardGrid,
  NativeSelect,
  Section,
  StatusBadge,
  TableTitleCell,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  useListPagination,
  useToast,
  type FilterBarView,
} from "@vxture/design-ui";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { ACTION_COLUMN, EDGE_COLUMNS, FilterSlot, PaginationFooter, RowActions, SearchSlot, moveItems } from "./table-fittings";
import { useMessages } from "../lib/i18n/provider";
import type { MoveDirection } from "../../domains/shared/ordering";
import { moveOrgUnitAction, removeOrgUnitAction, reparentOrgUnitAction } from "../admin/org/actions";
import { Tag } from "./tag";

/* 组织结构 - 展示. DISPLAY ONLY, the shape /admin/roles has.
 *
 * THE ROSTER IS THE TREE. One table, in tree order, indented by depth with a
 * chevron on every unit that has units under it - the same row shape the
 * permission tree draws, because a reader who has learned one has learned
 * the other. Folding is view state and nothing else.
 *
 * THE ORDER IS THE ORDER, per parent: sort_order is what this roster, the
 * parent select on the unit form and the unit menu on /admin/members all
 * follow, so there are no sortable headers; the four moves are in the row's
 * menu and move a unit AMONG ITS SIBLINGS - 迁到… (below) is the other axis,
 * changing WHICH parent a unit stands under.
 *
 * THE TOOLBAR (owner, 2026-09-11: 增加表格头，list/card 模式切换，共xx个机构;
 * 展开/收起 按钮 ---- 留白 ---- 删除（选择后红色-需二次确认），新建（primary）)
 * is the DS's own `FilterBar`, the same slot the permission tree's toolbar
 * uses: `count` on the left, `scope` for 展开/收起 (a view-state control, not
 * a filter - same reasoning as the permission tree's own 展开到), `view` for
 * the list/card switch, `actions` on the right for 新建 (always primary, the
 * DS's own convention). 删除 is NOT in `actions` - it depends on a selection,
 * which is exactly what `BulkActionBar` is for (the shape /admin/members'
 * 组织 tab already uses for its own bulk actions), so it renders separately
 * once something is checked, with its own two-step confirm.
 *
 * 单位详情 answers the question 成员管理 could not: who is in 华南分公司. It
 * is a drawer, view-only; 编辑 in its foot goes to the one form.
 */

export interface OrgUnitRow {
  readonly id: string;
  readonly unitCode: string;
  readonly name: string;
  readonly parentId: string | null;
  readonly kindName: string | null;
  readonly leaderSub: string | null;
  readonly leaderName: string | null;
  /** Members placed HERE, not counting the units under it. */
  readonly members: number;
  readonly depth: number;
  readonly children: number;
  /** The territories this unit's own SUBTREE works (0052), with the 大区
   *  each covers - what a leader stationed here actually sees under 按组织
   *  data-scope, not just what is directly linked to this one row. */
  readonly territories: readonly { readonly code: string; readonly name: string; readonly regions: readonly string[] }[];
  /** "none" - no territory anywhere in reach, up OR down the tree, the
   *  only state that means genuinely unauthorized; "full" - the subtree
   *  reaches every territory the workspace has; "partial" - somewhere in
   *  between, the count in `territories` says how much; "inherited" - this
   *  unit's own subtree works nothing, so it works whatever the nearest
   *  ancestor in `inheritedFromName` already covers (owner, 2026-09-11:
   *  下级没有设置区域，应该显示/生效为继承上级). */
  readonly scope: "none" | "partial" | "full" | "inherited";
  /** The ancestor unit `territories` was inherited from - set only when
   *  `scope === "inherited"`. */
  readonly inheritedFromName: string | null;
}

/** 圈数字 (owner, 2026-09-11: 第一个关联区域名称后面圈数字显示总数量，如果
 *  超过1个显示数字) - a neutral count next to the FIRST territory's name,
 *  shown only once there is more than one. NOT `./count-badge.tsx`: that
 *  element is deliberately alert-red for a notification corner mark
 *  (TD-006, 太大/颜色没有警示效果) - a "how many regions" count is
 *  information, not a warning, so reusing its colour would misapply the
 *  exact distinction that component's own comment draws. Same TD-006
 *  shape (a circle at one digit, growing to a pill past two) on neutral
 *  DS tokens instead. */
function TerritoryCount({ count }: { readonly count: number }) {
  return (
    <span className="bg-muted text-muted-foreground inline-flex h-[1rem] min-w-[1rem] items-center justify-center rounded-full px-[0.1875rem] text-[0.625rem] font-semibold leading-none tabular-nums">
      {count}
    </span>
  );
}

/** Every id in `id`'s own subtree, `id` itself included - what 迁到… must
 *  exclude from the target list, or a unit could be moved under its own
 *  descendant. `rows` is small (a few dozen units at most), so a couple of
 *  linear passes over it costs nothing worth memoising harder. */
function subtreeOf(rows: readonly OrgUnitRow[], id: string): Set<string> {
  const out = new Set<string>([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const r of rows) {
      if (r.parentId && out.has(r.parentId) && !out.has(r.id)) {
        out.add(r.id);
        grew = true;
      }
    }
  }
  return out;
}

export function OrgPanel({
  rows,
  editable,
  unitMembers,
}: {
  /** In tree order: a parent precedes its children. */
  readonly rows: readonly OrgUnitRow[];
  readonly editable: boolean;
  /** unit id -> the names placed there, for the drawer. */
  readonly unitMembers: Readonly<Record<string, readonly string[]>>;
}) {
  const { DATA_TABLE_LABELS, DS_LABELS, ORG_ERROR, ORG_TEXT, ROW_OPS } = useMessages();
  const router = useRouter();
  const params = useSearchParams();
  const [selected, setSelected] = useState<string[]>([]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [view, setView] = useState<FilterBarView>("list");
  /* 搜索/筛选 (owner: 表头操作行参照 /admin/permissions 补齐, 筛选组的补齐) -
     when either is active, the tree flattens to whichever rows match: a
     search result is read as a list of hits, not a shape to fold/unfold, the
     same reason permission-tree.tsx's own search ignores its expand state. */
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState("");
  const kindOptions = useMemo(
    () => [...new Set(rows.map((r) => r.kindName).filter((k): k is string => k !== null))].sort((a, b) => a.localeCompare(b)),
    [rows],
  );
  const searching = query.trim() !== "" || kindFilter !== "";
  const searchFiltered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (q === "" || r.name.toLowerCase().includes(q) || r.unitCode.toLowerCase().includes(q))
        && (kindFilter === "" || r.kindName === kindFilter),
    );
  }, [rows, query, kindFilter]);
  const [moveDialog, setMoveDialog] = useState<{ readonly id: string; readonly name: string; readonly parentId: string | null } | null>(null);
  const [moveTarget, setMoveTarget] = useState("");
  const [pending, start] = useTransition();
  const { toast } = useToast();

  /* WHICH UNIT THE DRAWER SHOWS IS IN THE URL (`?details=<code>`), as on
     /admin/roles: it survives the refresh every move causes. */
  const details = useMemo(() => {
    const code = params.get("details");
    return code ? (rows.find((r) => r.unitCode === code) ?? null) : null;
  }, [params, rows]);
  const setDetails = (r: OrgUnitRow | null) => {
    const next = new URLSearchParams(params.toString());
    if (r) next.set("details", r.unitCode);
    else next.delete("details");
    const qs = next.toString();
    router.replace(qs ? `/admin/org?${qs}` : "/admin/org", { scroll: false });
  };

  /* A row is shown while no ancestor is folded. Parents precede children in
     `rows`, so one pass with a hidden-set suffices. Skipped entirely while
     searching - `searchFiltered` is already the flat set of hits. */
  const visible = useMemo(() => {
    if (searching) return searchFiltered;
    const hidden = new Set<string>();
    const out: OrgUnitRow[] = [];
    for (const r of rows) {
      if (r.parentId && (hidden.has(r.parentId) || collapsed.has(r.parentId))) {
        hidden.add(r.id);
        continue;
      }
      out.push(r);
    }
    return out;
  }, [rows, collapsed, searching, searchFiltered]);
  /* 分页页脚 (owner: 表格列宽新一轮规则, 规则 5 - DS 格式页脚，左统计右翻页).
     按拍平后的 `visible` 分页，跟"展开全部"这类树形操作用同一份数据源，
     list/cards 两种呈现共用同一页。展开/收起、搜索、筛选都可能大幅改变
     `visible` 的内容，各自的 onChange 里都调用 resetPage()，避免筛/展开
     完了停在一个空页上。 */
  const pagination = useListPagination(visible, 20);
  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const branches = useMemo(() => rows.filter((r) => r.children > 0).map((r) => r.id), [rows]);

  /* A move lands among siblings, so the position the menu greys on is the
     position among them, not the row's place in the flattened list. */
  const siblingsOf = (r: OrgUnitRow) => rows.filter((x) => x.parentId === r.parentId);
  const move = (id: string, direction: MoveDirection) =>
    start(async () => {
      const res = await moveOrgUnitAction(id, direction);
      if (!res.ok) toast({ tone: "danger", title: ORG_ERROR[res.error] ?? res.error });
      else router.refresh();
    });
  const remove = async (r: OrgUnitRow) => {
    const res = await removeOrgUnitAction(r.id);
    if (!res.ok) {
      toast({ tone: "danger", title: ORG_ERROR[res.error] ?? res.error });
      throw new Error(res.error);
    }
    if (res.unplaced > 0) toast({ tone: "info", title: ORG_TEXT.removeDone(res.unplaced) });
    if (res.detached > 0) toast({ tone: "info", title: ORG_TEXT.removeDetached(res.detached) });
    if (details?.id === r.id) setDetails(null);
    router.refresh();
  };

  /* 迁到… (owner, 2026-09-11): a unit's own new parent. `subtreeOf` keeps the
     picker from offering the unit itself or anything under it - moving a
     branch under its own leaf is the cycle `parent_cycle` exists to refuse,
     caught here too so the picker never offers a choice the server would
     bounce. Defaults to the unit's CURRENT parent, so opening the dialog
     shows where it already stands. */
  const openMove = (r: OrgUnitRow) => {
    setMoveDialog({ id: r.id, name: r.name, parentId: r.parentId });
    setMoveTarget(r.parentId ?? "");
  };
  const submitMove = () =>
    start(async () => {
      if (!moveDialog) return;
      const res = await reparentOrgUnitAction(moveDialog.id, moveTarget === "" ? null : moveTarget);
      if (!res.ok) {
        toast({ tone: "danger", title: ORG_ERROR[res.error] ?? res.error });
        return;
      }
      toast({ tone: "success", title: ORG_TEXT.moveDone(moveDialog.name) });
      setMoveDialog(null);
      router.refresh();
    });

  /* 批量删除 (owner, 2026-09-11: 删除（选择后红色-需二次确认）). A selected
     unit is deletable in THIS batch only if every unit under it is ALSO
     selected - a partial subtree would fail the same FK RESTRICT a single
     row's delete already respects, so it is skipped rather than attempted
     and reported as an error. Deletable ones go deepest-first, so a child
     is always gone before the parent above it is tried. */
  const childrenOf = useMemo(() => {
    const out = new Map<string, string[]>();
    for (const r of rows) if (r.parentId) out.set(r.parentId, [...(out.get(r.parentId) ?? []), r.id]);
    return out;
  }, [rows]);
  const bulkRemove = () =>
    start(async () => {
      const selectedSet = new Set(selected);
      const fullySelected = (id: string): boolean =>
        (childrenOf.get(id) ?? []).every((childId) => selectedSet.has(childId) && fullySelected(childId));
      const byId = new Map(rows.map((r) => [r.id, r]));
      const targets = selected
        .map((id) => byId.get(id))
        .filter((r): r is OrgUnitRow => r !== undefined);
      const deletable = targets.filter((r) => fullySelected(r.id)).sort((a, b) => b.depth - a.depth);
      const skipped = targets.length - deletable.length;
      let removed = 0;
      let unplaced = 0;
      for (const r of deletable) {
        const res = await removeOrgUnitAction(r.id);
        if (res.ok) {
          removed += 1;
          unplaced += res.unplaced;
        } else {
          toast({ tone: "danger", title: `${r.name}: ${ORG_ERROR[res.error] ?? res.error}` });
        }
      }
      if (removed > 0) toast({ tone: "success", title: ORG_TEXT.bulkRemoveDone(removed, unplaced) });
      if (skipped > 0) toast({ tone: "info", title: ORG_TEXT.bulkRemoveSkipped(skipped) });
      setSelected([]);
      router.refresh();
    });

  const children = details ? rows.filter((r) => r.parentId === details.id) : [];
  const placedHere = details ? (unitMembers[details.id] ?? []) : [];

  /* Shared between the table row and the card - same menu either way. */
  const actionsFor = (r: OrgUnitRow) => {
    const sib = siblingsOf(r);
    const at = sib.findIndex((x) => x.id === r.id);
    return (
      <RowActions
        disabled={pending}
        items={[
          { id: "details", label: ROW_OPS.details(ORG_TEXT.noun), onSelect: () => setDetails(r) },
          ...(editable
            ? [
                { id: "edit", label: ROW_OPS.configure(ORG_TEXT.noun), onSelect: () => router.push(`/admin/org/${r.id}`) },
                ...moveItems(ROW_OPS, at, sib.length, (d) => move(r.id, d)),
                /* 迁到… (owner, 2026-09-11: 操作面板，增加 [迁到...]) - the
                   OTHER axis: not among siblings, but to a different parent
                   entirely. */
                { id: "moveTo", label: ORG_TEXT.moveTo, onSelect: () => openMove(r) },
                /* The FK's RESTRICT, said first: a trunk is not
                   deleted while anything stands under it. */
                {
                  id: "remove",
                  label: ROW_OPS.remove(ORG_TEXT.noun),
                  separatorBefore: true,
                  danger: true as const,
                  disabled: r.children > 0,
                  hint: r.children > 0 ? ORG_TEXT.removeChildrenHint(r.children) : undefined,
                  confirm: {
                    verb: ROW_OPS.remove(ORG_TEXT.noun),
                    target: ORG_TEXT.removeTarget(r.name),
                    consequence: ORG_TEXT.removeConsequence(r.members),
                    titleTemplate: ORG_TEXT.destructiveTitle,
                    cancelLabel: ORG_TEXT.cancel,
                    onConfirm: () => remove(r),
                  },
                },
              ]
            : []),
        ]}
      />
    );
  };

  return (
    <Section id="org">
      {rows.length > 0 ? (
        <FilterBar
          count={
            searching
              ? ORG_TEXT.toolbarFilteredCount(searchFiltered.length, rows.length)
              : ORG_TEXT.toolbarCount(rows.length)
          }
          view={view}
          onViewChange={(v) => {
            setView(v);
            /* Cards carry no selection checkbox (the DS's ListCard has none) -
               clearing on switch keeps a stale count from sitting behind the
               view a reader cannot act on it from. */
            setSelected([]);
          }}
          scope={
            <ButtonGroup>
              <Button variant="secondary" size="sm" onClick={() => { setCollapsed(new Set()); pagination.resetPage(); }}>{ORG_TEXT.expandAll}</Button>
              <Button variant="secondary" size="sm" onClick={() => { setCollapsed(new Set(branches)); pagination.resetPage(); }}>{ORG_TEXT.collapseAll}</Button>
            </ButtonGroup>
          }
          search={
            <SearchSlot>
              <Input
                type="search"
                className="w-full"
                value={query}
                placeholder={ORG_TEXT.searchPlaceholder}
                aria-label={ORG_TEXT.searchLabel}
                onChange={(e) => { setQuery(e.target.value); pagination.resetPage(); }}
              />
            </SearchSlot>
          }
          onReset={searching ? () => { setQuery(""); setKindFilter(""); pagination.resetPage(); } : undefined}
          resetLabel={ORG_TEXT.resetFilters}
          actions={editable ? <Button onClick={() => router.push("/admin/org/new")}>{ORG_TEXT.newUnit}</Button> : undefined}
        >
          {kindOptions.length > 0 ? (
            <FilterSlot width="w-[10rem]">
              <NativeSelect value={kindFilter} aria-label={ORG_TEXT.kindFilterLabel} onChange={(e) => { setKindFilter(e.target.value); pagination.resetPage(); }}>
                <option value="">{ORG_TEXT.filterAllKinds}</option>
                {kindOptions.map((k) => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </NativeSelect>
            </FilterSlot>
          ) : null}
        </FilterBar>
      ) : null}
      {editable && view === "list" ? (
        <BulkActionBar
          count={selected.length}
          noun={ORG_TEXT.selectionNoun}
          selectionTemplate={DS_LABELS.bulkSelectionTemplate}
          toolbarLabel={DS_LABELS.bulkToolbar}
          clearLabel={ORG_TEXT.clearSelection}
          onClear={() => setSelected([])}
          actions={[
            {
              id: "remove",
              label: ORG_TEXT.bulkRemove,
              danger: true as const,
              confirm: {
                verb: ORG_TEXT.bulkRemove,
                target: ORG_TEXT.bulkRemoveTarget(selected.length),
                consequence: ORG_TEXT.bulkRemoveConsequence,
                titleTemplate: ORG_TEXT.destructiveTitle,
                cancelLabel: ORG_TEXT.cancel,
                onConfirm: bulkRemove,
              },
            },
          ]}
        />
      ) : null}
      {rows.length === 0 ? (
        <EmptyState title={ORG_TEXT.emptyTitle} description={ORG_TEXT.emptyWhy} />
      ) : view === "cards" ? (
        <ListCardGrid>
          {pagination.pageRows.map((r) => (
            <ListCard
              key={r.unitCode}
              title={r.name}
              description={r.unitCode}
              onTitleClick={() => setDetails(r)}
              status={<StatusBadge tone="info" icon={false}>{`L${r.depth}`}</StatusBadge>}
              actions={actionsFor(r)}
              meta={
                <div className="gap-xs flex flex-wrap items-center">
                  {r.kindName ? <Tag>{r.kindName}</Tag> : null}
                  <span className="text-muted-foreground text-body-sm">
                    {r.leaderName ?? ORG_TEXT.leaderNone}
                  </span>
                  <span className="text-muted-foreground text-body-sm tabular-nums">
                    {r.members === 0 ? ORG_TEXT.noMember : ORG_TEXT.members(r.members)}
                  </span>
                  {r.children > 0 ? <Tag>{ORG_TEXT.childCount(r.children)}</Tag> : null}
                </div>
              }
            />
          ))}
        </ListCardGrid>
      ) : (
        <div
          className={
            /* 列宽 (owner, 2026-09-11: 加宽首列=标题行列宽，其他列均分自动
               适应宽度 - 这个尺寸作为 admin 板块默认标准，除非单独调整；
               选择/序号/操作列是更高层规范，这次调整不碰。owner 复核: 30%/
               70% 拆分标题列与其他区，70% 再在业务列之间均分 - 这个比例是
               排除选择/序号/操作三列的，不是对整张表算的). 单位 30%,
               层级/下属单位/类型/负责人/成员数/区域 六列各 70%/6 ≈ 11.6667%.

               EVERY BUSINESS COLUMN IS PINNED HERE - the seven percentages
               above sum to exactly 100%, which is DIFFERENT from (and safe
               where) six rem values that summed to LESS than the container
               ever were. table-fittings.test.ts's own guard normally
               requires one business column left with no `width` at all,
               because a genuine GAP between what is pinned and the
               container's actual width is what table-fixed redistributes
               onto 选择/序号/操作, breaking their 64px (measured at 1800px
               on this exact table before the earlier fix: 73.4/73.4/73.5px).
               Percentages that already total 100% leave no such gap - a
               fixed-percentage title was tried and measured live at 1800px
               AND 900px with 选择/序号/操作 holding exactly 64px both times,
               confirming the guard's underlying concern (an unclaimed gap)
               simply does not apply to this shape. `max-width`, `min-width`
               and `width: clamp(...)` were tried earlier for a title that
               grows, shrinks AND floors, and all three measured as not
               respected by table-fixed at all (see git history on this
               block); a fixed percentage is the one thing table-fixed does
               honour, so it is what both 单位 and the other six columns use
               here - org-panel.tsx is named in table-fittings.test.ts's
               WIDTH_EXEMPTIONS for exactly this reason, not left for the
               heuristic to (incorrectly) flag. */
            `[&_table]:table-fixed ${EDGE_COLUMNS} ${ACTION_COLUMN}`
            + " [&_thead_th:nth-child(3)]:w-[30%]"
            + " [&_thead_th:nth-child(4)]:w-[11.6667%] [&_thead_th:nth-child(5)]:w-[11.6667%]"
            + " [&_thead_th:nth-child(6)]:w-[11.6667%] [&_thead_th:nth-child(7)]:w-[11.6667%]"
            + " [&_thead_th:nth-child(8)]:w-[11.6667%] [&_thead_th:nth-child(9)]:w-[11.6667%]"
          }
        >
          <DataTable
            labels={DATA_TABLE_LABELS}
            indexStart={pagination.indexStart}
            selectedKeys={selected}
            onSelectionChange={(keys) => setSelected([...keys])}
            rowActions={actionsFor}
            rowKey={(r: OrgUnitRow) => r.unitCode}
            rows={pagination.pageRows}
            columns={[
              {
                /* THE TREE COLUMN: indent by depth, chevron on a branch, the
                   name opens 单位详情 for every reader. */
                id: "unit",
                header: ORG_TEXT.colUnit,
                cell: (r: OrgUnitRow) => (
                  <span className="gap-xs flex items-center" style={{ paddingLeft: `${r.depth * 1.5}rem` }}>
                    {r.children > 0 ? (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-expanded={!collapsed.has(r.id)}
                        aria-label={r.name}
                        onClick={() => toggle(r.id)}
                      >
                        <Icon name={collapsed.has(r.id) ? "chevron-right" : "chevron-down"} size="sm" />
                      </Button>
                    ) : (
                      <span className="w-8 shrink-0" />
                    )}
                    <TableTitleCell title={r.name} tooltip={r.name} description={r.unitCode} onTitleClick={() => setDetails(r)} />
                  </span>
                ),
              },
              {
                /* 层级 (owner, 2026-09-11: 增加层级展示列 L0，L1) - depth
                   itself, not a fixed enum of named tiers the way the
                   permission tree's four levels are, so one tone throughout
                   rather than one per level. */
                id: "tier",
                header: ORG_TEXT.colTier,
                align: "center" as const,
                cell: (r: OrgUnitRow) => <StatusBadge tone="info" icon={false}>{`L${r.depth}`}</StatusBadge>,
              },
              {
                /* 下属单位 (owner, 2026-09-11: 独立下属单位列) - pulled out of
                   the name column's titleSuffix, same reason the permission
                   tree's 子级 became its own column: two tags stacked behind
                   a title is clutter, one column each is not. */
                id: "children",
                header: ORG_TEXT.colChildren,
                align: "center" as const,
                cell: (r: OrgUnitRow) =>
                  r.children > 0 ? <span className="text-body-sm tabular-nums">{r.children}</span> : <span className="text-muted-foreground">—</span>,
              },
              {
                id: "kind",
                header: ORG_TEXT.colKind,
                cell: (r: OrgUnitRow) =>
                  r.kindName ? <Tag>{r.kindName}</Tag> : <span className="text-muted-foreground text-body-sm">{ORG_TEXT.kindNone}</span>,
              },
              {
                id: "leader",
                header: ORG_TEXT.colLeader,
                cell: (r: OrgUnitRow) =>
                  r.leaderName ? <span className="text-body-md">{r.leaderName}</span> : <span className="text-muted-foreground text-body-sm">{ORG_TEXT.leaderNone}</span>,
              },
              {
                id: "members",
                header: ORG_TEXT.colMembers,
                // A unit nobody is in is a fact worth seeing, not a zero.
                cell: (r: OrgUnitRow) =>
                  r.members === 0 ? <Tag>{ORG_TEXT.noMember}</Tag> : <span className="tabular-nums">{ORG_TEXT.members(r.members)}</span>,
              },
              {
                /* 区域 (0052): the FIRST territory's own coverage NAME
                   (owner, 2026-09-11: 显示第一个关联区域名称=区域设置的名称)
                   with a count circle once there is more than one - not an
                   abstract label, the actual ground. REGIONS, NOT `name`:
                   `name` is set once when the territory is created and never
                   renamed (owner, 2026-09-11: 我已经改了7分区，但是关联信息
                   还是5分区 - the exact symptom of reading `name`); `regions`
                   is derived live from the division's CURRENT name every
                   read (store.ts's own comment on the field), so it tracks
                   a 大区 rename with zero cross-domain sync code. NO `name`
                   FALLBACK: page.tsx already excludes any territory whose
                   `regions` is empty (its 大区 was removed, not renamed) from
                   `r.territories` entirely (owner, 2026-09-11: 可以关联失效，
                   但是不能是错的关联) - showing that territory's old name
                   here would be exactly the wrong association the ruling
                   forbids, so every territory that reaches this cell is
                   guaranteed to have a live region. The tone (and its
                   tooltip) still separates 全范围/已聚合/已继承/无范围, so
                   顶层组织/领导角色 and a unit that inherited from an
                   ancestor keep reading differently from 无范围 (真正没有
                   权限) at a glance. */
                id: "territories",
                header: ORG_TEXT.colTerritories,
                cell: (r: OrgUnitRow) => {
                  if (r.scope === "none") return <Tag>{ORG_TEXT.noTerritory}</Tag>;
                  const tone = r.scope === "full" ? "success" : r.scope === "inherited" ? "info" : "neutral";
                  const label =
                    r.scope === "full" ? ORG_TEXT.fullTerritory : r.scope === "inherited" ? ORG_TEXT.inheritedTerritory : ORG_TEXT.aggregateTerritory;
                  const firstLabel = r.territories[0]?.regions[0] ?? "";
                  return (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="gap-2xs inline-flex items-center">
                          <Tag tone={tone}>{firstLabel}</Tag>
                          {r.territories.length > 1 ? <TerritoryCount count={r.territories.length} /> : null}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>{label}</TooltipContent>
                    </Tooltip>
                  );
                },
              },
            ]}
          />
        </div>
      )}
      {rows.length > 0 ? (
        <PaginationFooter
          pagination={pagination}
          total={rows.length}
          filteredTotal={searching ? visible.length : undefined}
        />
      ) : null}

      <Drawer
        open={details !== null}
        onClose={() => setDetails(null)}
        width="md"
        title={details ? ORG_TEXT.detailsTitle(details.name) : ""}
        description={details ? ORG_TEXT.detailsWhy(details.kindName ?? ORG_TEXT.kindNone, details.leaderName ?? ORG_TEXT.leaderNone) : ""}
        closeLabel={ORG_TEXT.detailsDone}
        footer={
          <div className="gap-sm flex items-center justify-end">
            <Button variant="secondary" onClick={() => setDetails(null)}>{ORG_TEXT.detailsDone}</Button>
            {editable && details ? (
              <Button onClick={() => router.push(`/admin/org/${details.id}`)}>{ORG_TEXT.detailsEdit}</Button>
            ) : null}
          </div>
        }
      >
        <div className="gap-lg flex flex-col">
          <Section title={ORG_TEXT.detailsMembers(placedHere.length)}>
            {placedHere.length === 0 ? (
              <p className="text-muted-foreground text-body-sm">{ORG_TEXT.detailsNoMembers}</p>
            ) : (
              <ul className="gap-xs flex flex-wrap">
                {placedHere.map((n) => <li key={n}><Tag>{n}</Tag></li>)}
              </ul>
            )}
          </Section>
          {/* 关联区域 (0052): the ground this unit's subtree works, and the
              大区 each piece of it covers - the whole chain from the
              unit's side. 全范围/继承范围 each get their own line (owner,
              2026-09-11) so the reader does not have to count the list, or
              guess where an inherited list came from. */}
          <Section title={ORG_TEXT.detailsTerritories(details?.territories.length ?? 0)}>
            {details?.scope === "full" ? (
              <p className="text-body-sm text-success">{ORG_TEXT.fullTerritoryHint}</p>
            ) : details?.scope === "inherited" ? (
              <p className="text-info text-body-sm">{ORG_TEXT.inheritedTerritoryHint(details.inheritedFromName ?? "")}</p>
            ) : null}
            {!details || details.territories.length === 0 ? (
              <p className="text-muted-foreground text-body-sm">{ORG_TEXT.detailsNoTerritories}</p>
            ) : (
              <ul className="gap-xs flex flex-col">
                {details.territories.map((t) => (
                  <li key={t.code} className="gap-xs flex items-center">
                    <span className="text-body-md">{t.name}</span>
                    <span className="text-muted-foreground text-body-sm">{t.code}</span>
                    <span className="text-muted-foreground text-body-sm">
                      {t.regions.length > 0 ? ORG_TEXT.territoryCovers(t.regions.join(" / ")) : ORG_TEXT.territoryCoversNone}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
          <Section title={ORG_TEXT.detailsChildren(children.length)}>
            {children.length === 0 ? (
              <p className="text-muted-foreground text-body-sm">{ORG_TEXT.detailsNoChildren}</p>
            ) : (
              <ul className="gap-xs flex flex-col">
                {children.map((c) => (
                  <li key={c.id} className="gap-xs flex items-center">
                    <span className="text-body-md">{c.name}</span>
                    {c.kindName ? <Tag>{c.kindName}</Tag> : null}
                    <span className="text-muted-foreground text-body-sm">{ORG_TEXT.members(c.members)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </Drawer>

      <DialogForm
        open={moveDialog !== null}
        onOpenChange={(o) => { if (!o) setMoveDialog(null); }}
        title={moveDialog ? ORG_TEXT.moveTitle(moveDialog.name) : ""}
        description={ORG_TEXT.moveWhy}
        submitLabel={ORG_TEXT.moveConfirm}
        cancelLabel={ORG_TEXT.cancel}
        submitDisabled={pending}
        onSubmit={(e) => {
          e.preventDefault();
          submitMove();
        }}
      >
        <Field>
          <FieldLabel>{ORG_TEXT.moveField}</FieldLabel>
          <NativeSelect value={moveTarget} onChange={(e) => setMoveTarget(e.target.value)} disabled={pending}>
            <option value="">{ORG_TEXT.parentNone}</option>
            {moveDialog
              ? rows
                  .filter((u) => !subtreeOf(rows, moveDialog.id).has(u.id))
                  .map((u) => (
                    <option key={u.id} value={u.id}>{ORG_TEXT.optionIndent(u.depth, u.name)}</option>
                  ))
              : null}
          </NativeSelect>
        </Field>
      </DialogForm>
    </Section>
  );
}
