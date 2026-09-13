"use client";

import {
  BulkActionBar,
  Button,
  ButtonGroup,
  Checkbox,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  DataTable,
  DialogForm,
  Field,
  FieldLabel,
  Icon,
  NativeSelect,
  Section,
  StatusBadge,
  TableTitleCell,
  UserAvatar,
  useListPagination,
  useToast,
} from "@vxture/design-ui";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { ACTION_COLUMN, EDGE_COLUMNS, PaginationFooter, RowActions } from "./table-fittings";
import { useMessages } from "../lib/i18n/provider";
import { UNPLACED_ROW_ID, branchNodes, flattenOrgView, personRowId, unitOptions, type OrgView, type OrgViewPerson, type OrgViewRow } from "../lib/member-org-view";
import { orgUnitIcon } from "../lib/org-unit-icon";
import { collapseFromDepth, depthLevels } from "../lib/tree-expand";
import { addMemberToUnits, bulkPlaceMembers, moveMemberToUnit, placeMembersInUnit } from "../admin/members/actions";
import { MemberViewSwitch, type MemberView } from "./member-view-switch";
import { Tag } from "./tag";

/* 组织视图 - THE TREE, people and units as rows of one table (owner,
 * 2026-09-10, five points):
 *
 *   1. 每个人是一行，与组织是同级的行 - a person is a row under their unit,
 *      not a name crammed into the unit's cell. The same person appears
 *      under every unit they are in (0053).
 *   2. 人有头像，单位有 icon，按层级/是否有下属分 - the DS's UserAvatar
 *      before a person's name; a unit's icon is not its `org_unit_kind`, and
 *      past L1 it is not raw depth either (owner, 2026-09-12 x2: 现在统一为
 *      building 不合理, then 按 Ln 定位有点绝对了) - L0/L1 stay depth-only
 *      (headquarters, regional office), L2 and deeper reads whether the unit
 *      itself still branches (`children > 0`) rather than how deep it sits,
 *      so a department over departments and a plain team read apart at the
 *      same depth. Four icons total: three "this still branches"
 *      (L0/L1/L2+), one "this is a leaf". That is how the two kinds of row
 *      tell apart, and how a unit row tells its own shape apart from a
 *      sibling's.
 *   3. 淡化下拉展开箭头，不要常态背景 - the chevron is a muted glyph on a
 *      bare button; no ghost tile, no `aria-expanded` tint (the DS Button
 *      paints `bg-muted` on aria-expanded, which is the background the
 *      owner saw). The open/closed state is in the label instead.
 *   4. 同级下方，先全部组织，再人员；人员带角色 - under a unit its child
 *      units come first, then its people, each with their roles.
 *   5. 操作行：切换居左，右侧添加成员；成员行菜单多几项 - the switch is the
 *      toolbar's left end, 添加成员 its right; a person's row menu offers
 *      成员详情 / 成员配置 / 移动到单位 / 添加到单位 (+ 新角色) / 移出本单位.
 *
 * THE COLUMNS (owner, 2026-09-10): 选择｜序号｜名称｜关联区域｜数据范围｜角色｜
 * 操作 - the first two are the DS DataTable's fittings, the last its action
 * column. A unit's 关联区域 is the ground it works (0052); a person's is
 * what their territory scope assigns them, and 数据范围 is that scope.
 *
 * THE SELECTION (owner: 多选后 = 移除原单位、移动到单位、复用到单位): the DS
 * BulkActionBar over the selected PERSON rows - a person selected under two
 * units is two placements. 移除 ends those placements; 移动 sends them to
 * a unit; 复用 adds the unit and ends nothing.
 *
 * THE DEPARTED ARE APART (owner, 2026-09-10: 已停用人员现在还混合在租户清单
 * 中，需要单独拆分处理，放到组织管理下方，默认收起来，点击再展开，表结构与上面
 * 一样): the tree holds the people in standing; whoever is deactivated sits
 * in a second table under it, the same columns, folded until opened. Their
 * row menu is what a departed person still needs - 详情, 配置, 恢复在岗.
 *
 * Every write goes through the members actions, which go through the
 * services' own gates; the view only asks.
 */

export interface RoleOption {
  readonly code: string;
  readonly name: string;
  readonly admin: boolean;
}

export function MemberOrgView({ view, inactive, canManage, roster, roleOptions, rolesOf, viewValue, onViewChange, onOpen, onConfigure, onReactivate }: {
  readonly view: OrgView;
  /** Whoever is deactivated - kept out of the tree, listed apart. */
  readonly inactive: readonly OrgViewPerson[];
  readonly canManage: boolean;
  /** Everyone active, for 添加成员's pick list. */
  readonly roster: readonly { readonly sub: string; readonly name: string }[];
  /** The workspace's roles, for 添加到单位's 新角色. */
  readonly roleOptions: readonly RoleOption[];
  /** sub -> the roles they hold, for the person rows. */
  readonly rolesOf: ReadonlyMap<string, readonly RoleOption[]>;
  readonly viewValue: MemberView;
  readonly onViewChange: (v: MemberView) => void;
  readonly onOpen: (sub: string) => void;
  readonly onConfigure: (sub: string) => void;
  readonly onReactivate: (sub: string) => void;
}) {
  const { DATA_TABLE_LABELS, DS_LABELS, MEMBER_ERROR, MEMBER_TEXT, ORG_TEXT, ROW_OPS } = useMessages();
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string[]>([]);
  const [showInactive, setShowInactive] = useState(false);
  const [selectedInactive, setSelectedInactive] = useState<string[]>([]);
  const inactiveRows = useMemo<OrgViewRow[]>(
    () => inactive.map((p) => ({ kind: "person", id: personRowId(null, p.sub), sub: p.sub, name: p.name, status: p.status, depth: 0, unitId: null, scope: p.scope, territories: p.territories })),
    [inactive],
  );
  const rows = useMemo(() => flattenOrgView(view, collapsed), [view, collapsed]);
  /* 分页页脚 (owner: 表格列宽新一轮规则, 规则 5) - 按拍平后的行数组分页，
     页大小放宽到 50 (而不是其它表的 20)，把"展开全部后子树被截断到下一页"
     的概率压低：这是树形表的已知局部妥协，见 plan 的"不做"一节。 */
  const pagination = useListPagination(rows, 50);
  const inactivePagination = useListPagination(inactiveRows, 50);
  const branches = useMemo(() => branchNodes(view), [view]);
  /* EVERY DEPTH, not just the ones that branch (owner, 2026-09-12: 应该有
     多少层就要展开到多少层，后面层级不能没有) - a leaf tier (a team with no
     units of its own, or the people under any unit, always one level
     deeper than it) still needs its own "展开到" button. Read off the tree
     FULLY expanded, not the current `rows` - the button list must not
     shrink just because something is folded right now. */
  const levels = useMemo(() => depthLevels(flattenOrgView(view, new Set())), [view]);
  const units = useMemo(() => unitOptions(view), [view]);
  const unitName = (id: string | null) => (id === null ? MEMBER_TEXT.orgUnplaced : (units.find((u) => u.id === id)?.name ?? id));
  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const fail = (error?: string): void => {
    toast({ tone: "danger", title: MEMBER_ERROR[error ?? "denied"] ?? error ?? "denied" });
  };
  const done = (title: string): void => {
    toast({ tone: "success", title });
    setDialog(null);
    router.refresh();
  };

  /* ONE DIALOG STATE, four shapes. */
  type Dialog =
    | { kind: "place"; unitId: string | null; mode: "add" | "remove"; unitName: string }
    | { kind: "move"; sub: string; name: string; fromUnitId: string }
    | { kind: "addTo"; sub: string; name: string }
    | { kind: "bulk"; mode: "move" | "copy"; items: readonly { sub: string; unitId: string | null }[] };
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [tickedRoles, setTickedRoles] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState("");
  const open = (d: Dialog) => {
    setTicked(new Set());
    setTickedRoles(new Set());
    setTarget("");
    setDialog(d);
  };
  const flip = (set: (f: (prev: Set<string>) => Set<string>) => void) => (key: string) =>
    set((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const tick = flip(setTicked);
  const tickRole = flip(setTickedRoles);

  const peopleIn = (unitId: string | null) => new Set(rows.filter((r) => r.kind === "person" && r.unitId === unitId).map((r) => (r as { sub: string }).sub));
  const unitsOf = (sub: string) => new Set(rows.filter((r) => r.kind === "person" && (r as { sub: string }).sub === sub).map((r) => (r as { unitId: string | null }).unitId));
  const candidates = useMemo(() => {
    if (!dialog || dialog.kind !== "place") return [];
    const here = peopleIn(dialog.unitId);
    return dialog.mode === "add" ? roster.filter((m) => !here.has(m.sub)) : roster.filter((m) => here.has(m.sub));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialog, roster, rows]);

  const submit = () =>
    start(async () => {
      if (!dialog) return;
      if (dialog.kind === "place") {
        if (dialog.unitId === null) return;
        const unitId = target || dialog.unitId;
        const res = await placeMembersInUnit(unitId, [...ticked], dialog.mode);
        if (!res.ok) return fail(res.error);
        const name = unitName(unitId);
        return done(dialog.mode === "add" ? MEMBER_TEXT.orgPlaced(ticked.size, name) : MEMBER_TEXT.orgRemoved(ticked.size, name));
      }
      if (dialog.kind === "move") {
        if (!target) return;
        const res = await moveMemberToUnit(dialog.sub, dialog.fromUnitId, target);
        if (!res.ok) return fail(res.error);
        return done(MEMBER_TEXT.orgMoved(dialog.name, unitName(target)));
      }
      if (dialog.kind === "bulk") {
        if (!target) return;
        const res = await bulkPlaceMembers(dialog.items, dialog.mode, target);
        if (!res.ok) return fail(res.error);
        setSelected([]);
        return done(MEMBER_TEXT.orgBulkDone(dialog.items.length, unitName(target)));
      }
      const res = await addMemberToUnits(dialog.sub, [...ticked], [...tickedRoles]);
      if (!res.ok) return fail(res.error);
      return done(MEMBER_TEXT.orgAddedTo(dialog.name, ticked.size, tickedRoles.size));
    });

  /* THE SELECTION: the person rows among the selected keys. */
  const selectedItems = useMemo(
    () => rows.filter((r): r is Extract<OrgViewRow, { kind: "person" }> => r.kind === "person" && selected.includes(r.id)).map((r) => ({ sub: r.sub, unitId: r.unitId })),
    [rows, selected],
  );
  const bulkRemove = async () => {
    const res = await bulkPlaceMembers(selectedItems, "remove");
    if (!res.ok) {
      fail(res.error);
      throw new Error(res.error);
    }
    toast({ tone: "success", title: MEMBER_TEXT.orgBulkRemoved(selectedItems.length) });
    setSelected([]);
    router.refresh();
  };

  const remove = async (sub: string, name: string, unitId: string) => {
    const res = await placeMembersInUnit(unitId, [sub], "remove");
    if (!res.ok) {
      fail(res.error);
      throw new Error(res.error);
    }
    toast({ tone: "success", title: MEMBER_TEXT.orgRemovedOne(name, unitName(unitId)) });
    router.refresh();
  };

  /* THE CHEVRON (point 3): a bare button, a muted glyph, state in the
     label. Not the DS Button: its ghost variant tiles on hover and tints on
     aria-expanded, and both are the "常态背景" the owner asked to lose. */
  const chevron = (id: string, name: string) => (
    <button
      type="button"
      className="text-muted-foreground hover:text-foreground flex size-6 shrink-0 cursor-pointer items-center justify-center"
      aria-label={collapsed.has(id) ? MEMBER_TEXT.orgExpand(name) : MEMBER_TEXT.orgCollapse(name)}
      onClick={() => toggle(id)}
    >
      <Icon name={collapsed.has(id) ? "chevron-right" : "chevron-down"} size="xs" />
    </button>
  );

  const rowActions = (r: OrgViewRow) => {
    if (!canManage) {
      return r.kind === "person" ? [{ id: "details", label: ROW_OPS.details(MEMBER_TEXT.noun), onSelect: () => onOpen(r.sub) }] : [];
    }
    if (r.kind === "unit") {
      if (r.unplaced) return [];
      return [
        { id: "add", label: MEMBER_TEXT.orgAdd, onSelect: () => open({ kind: "place", unitId: r.id, mode: "add", unitName: r.name }) },
        { id: "remove", label: MEMBER_TEXT.orgRemove, disabled: r.headcount === 0, onSelect: () => open({ kind: "place", unitId: r.id, mode: "remove", unitName: r.name }) },
      ];
    }
    const here = r.unitId;
    return [
      { id: "details", label: ROW_OPS.details(MEMBER_TEXT.noun), onSelect: () => onOpen(r.sub) },
      { id: "configure", label: ROW_OPS.configure(MEMBER_TEXT.noun), onSelect: () => onConfigure(r.sub) },
      ...(here !== null
        ? [{ id: "move", label: MEMBER_TEXT.orgMoveTo, separatorBefore: true, onSelect: () => open({ kind: "move", sub: r.sub, name: r.name, fromUnitId: here }) }]
        : []),
      { id: "addTo", label: MEMBER_TEXT.orgAddTo, separatorBefore: here === null, onSelect: () => open({ kind: "addTo", sub: r.sub, name: r.name }) },
      ...(here !== null
        ? [{
            id: "removeOne",
            label: MEMBER_TEXT.orgRemoveOne,
            separatorBefore: true,
            danger: true as const,
            confirm: {
              verb: MEMBER_TEXT.orgRemoveOne,
              target: MEMBER_TEXT.orgRemoveOneTarget(r.name, unitName(here)),
              consequence: MEMBER_TEXT.orgRemoveOneWhy,
              titleTemplate: MEMBER_TEXT.destructiveTitle,
              cancelLabel: MEMBER_TEXT.cancel,
              onConfirm: () => remove(r.sub, r.name, here),
            },
          }]
        : []),
    ];
  };

  /* THE COLUMNS, shared by the tree and the deactivated table under it. */
  const columns = [
      {
        /* THE TREE COLUMN: indent, a muted chevron where there is
           something to fold, then the row's own face - a branch-or-leaf
           icon for every unit, an avatar for every person (point 2). */
        id: "name",
        header: MEMBER_TEXT.orgColName,
        cell: (r: OrgViewRow) => (
          <span className="gap-xs flex items-center" style={{ paddingLeft: `${r.depth * 1.5}rem` }}>
            {r.kind === "unit" && (r.children > 0 || r.headcount > 0) ? chevron(r.id, r.unplaced ? MEMBER_TEXT.orgUnplaced : r.name) : <span className="size-6 shrink-0" />}
            {r.kind === "unit" ? (
              r.unplaced
                ? <TableTitleCell icon={orgUnitIcon(r)} title={MEMBER_TEXT.orgUnplaced} titleSuffix={<Tag>{MEMBER_TEXT.orgHeadcount(r.headcount)}</Tag>} />
                : <TableTitleCell icon={orgUnitIcon(r)} title={r.name} tooltip={r.name} titleSuffix={<Tag>{MEMBER_TEXT.orgHeadcount(r.headcount)}</Tag>} />
            ) : (
              <span className="gap-sm flex min-w-0 items-center">
                <UserAvatar alt={r.name} className="size-6 shrink-0" />
                {/* 标题不走手写 button (owner, 2026-09-12: admin 标题体系统一) -
                    两行上面的 unit 分支已经用 TableTitleCell，这里看齐它，
                    只是没有 icon（UserAvatar 已经是这一行的头像）。 */}
                <TableTitleCell
                  title={r.name}
                  tooltip={r.name}
                  onTitleClick={() => onOpen(r.sub)}
                  titleSuffix={r.status === "inactive" ? <Tag>{MEMBER_TEXT.inactive}</Tag> : undefined}
                />
              </span>
            )}
          </span>
        ),
      },
      {
        /* 关联区域: the unit's ground, or the person's assigned territories. */
        id: "territories",
        header: MEMBER_TEXT.orgColTerritories,
        cell: (r: OrgViewRow) => {
          if (r.kind === "unit" && r.unplaced) return null;
          const list = r.territories;
          return list.length === 0 ? (
            <span className="text-muted-foreground text-body-sm">{MEMBER_TEXT.orgTerritoriesNone}</span>
          ) : (
            <span className="gap-2xs flex flex-wrap">
              {list.map((t) => <Tag key={t}>{t}</Tag>)}
            </span>
          );
        },
      },
      {
        /* 数据范围: the person's scope kind; nothing on a unit row. */
        id: "scope",
        header: MEMBER_TEXT.orgColScope,
        cell: (r: OrgViewRow) =>
          r.kind === "person" ? <span className="text-body-md">{MEMBER_TEXT.scopeLabels[r.scope] ?? r.scope}</span> : null,
      },
      {
        /* THE ROLES (point 4), on the person rows. */
        id: "roles",
        header: MEMBER_TEXT.columnRoles,
        cell: (r: OrgViewRow) => {
          if (r.kind !== "person") return null;
          const held = rolesOf.get(r.sub) ?? [];
          return held.length === 0 ? (
            <StatusBadge tone="warning" dot>{MEMBER_TEXT.noRoles}</StatusBadge>
          ) : (
            <span className="gap-2xs flex flex-wrap">
              {held.map((x) => <Tag key={x.code} tone={x.admin ? "info" : "neutral"}>{x.name}</Tag>)}
            </span>
          );
        },
      },
  ];

  const unitSelect = (value: string, onChange: (v: string) => void, exclude: ReadonlySet<string | null>) => (
    <NativeSelect value={value} onChange={(e) => onChange(e.target.value)} disabled={pending}>
      <option value="">{MEMBER_TEXT.orgPickUnit}</option>
      {units.filter((u) => !exclude.has(u.id)).map((u) => (
        <option key={u.id} value={u.id}>{ORG_TEXT.optionIndent(u.depth, u.name)}</option>
      ))}
    </NativeSelect>
  );

  return (
    <div className="gap-md flex flex-col">
      {/* THE TOOLBAR (point 5, revised 2026-09-12): the switch and 展开到
          both belong to "这张表长什么样" - a view-state cluster, not a
          command - so both sit at the left end, the same side org-panel.tsx's
          FilterBar keeps its own `scope`; 添加成员, the one thing here that
          DOES something, stands alone at the right. */}
      <div className="gap-sm flex items-center justify-between">
        <div className="gap-sm flex items-center">
          <MemberViewSwitch value={viewValue} onChange={onViewChange} ariaLabel={MEMBER_TEXT.viewAria} labels={{ list: MEMBER_TEXT.viewList, org: MEMBER_TEXT.viewOrg }} />
          <span className="text-muted-foreground text-body-sm">{MEMBER_TEXT.orgExpandTo}</span>
          <ButtonGroup>
            {levels.map((lvl) => (
              <Button key={lvl} variant="secondary" size="sm" onClick={() => { setCollapsed(collapseFromDepth(branches, lvl)); pagination.resetPage(); }}>
                {MEMBER_TEXT.orgLevelLabel(lvl)}
              </Button>
            ))}
            <Button variant="secondary" size="sm" onClick={() => { setCollapsed(new Set(branches.map((b) => b.id))); pagination.resetPage(); }}>
              {MEMBER_TEXT.orgCollapseAll}
            </Button>
          </ButtonGroup>
        </div>
        {canManage ? (
          <Button size="sm" onClick={() => open({ kind: "place", unitId: units[0]?.id ?? null, mode: "add", unitName: "" })}>{MEMBER_TEXT.orgAdd}</Button>
        ) : null}
      </div>
      {canManage ? (
        <BulkActionBar
          count={selectedItems.length}
          noun={MEMBER_TEXT.orgSelectionNoun}
          selectionTemplate={DS_LABELS.bulkSelectionTemplate}
          toolbarLabel={DS_LABELS.bulkToolbar}
          clearLabel={MEMBER_TEXT.orgClearSelection}
          onClear={() => setSelected([])}
          actions={[
            {
              id: "remove",
              label: MEMBER_TEXT.orgBulkRemove,
              danger: true as const,
              disabled: selectedItems.every((it) => it.unitId === null),
              confirm: {
                verb: MEMBER_TEXT.orgBulkRemove,
                target: MEMBER_TEXT.orgBulkRemoveTarget(selectedItems.length),
                consequence: MEMBER_TEXT.orgBulkRemoveWhy,
                titleTemplate: MEMBER_TEXT.destructiveTitle,
                cancelLabel: MEMBER_TEXT.cancel,
                onConfirm: bulkRemove,
              },
            },
            { id: "move", label: MEMBER_TEXT.orgBulkMove, onSelect: () => open({ kind: "bulk", mode: "move", items: selectedItems }) },
            { id: "copy", label: MEMBER_TEXT.orgBulkCopy, onSelect: () => open({ kind: "bulk", mode: "copy", items: selectedItems }) },
          ]}
        />
      ) : null}
      {/* 首列 40% (owner, 表格列宽新一轮规则: 首列按业务列数量分档 - 名称/
          关联区域/数据范围/角色四个业务列落在 "2-4 列→40%" 这档). 关联区域、
          角色两列继续留白自适应。 */}
      <div className={`[&_table]:table-fixed ${EDGE_COLUMNS} ${ACTION_COLUMN} [&_thead_th:nth-child(3)]:w-[40%] [&_thead_th:nth-child(5)]:w-[7rem]`}>
        <DataTable
          labels={DATA_TABLE_LABELS}
          indexStart={pagination.indexStart}
          selectedKeys={selected}
          onSelectionChange={(keys) => setSelected([...keys])}
          rowKey={(r: OrgViewRow) => r.id}
          rows={pagination.pageRows}
          rowActions={(r: OrgViewRow) => <RowActions disabled={pending} items={rowActions(r)} />}
          columns={columns}
        />
      </div>
      {rows.length > 0 ? <PaginationFooter pagination={pagination} total={rows.length} /> : null}

      {/* THE DEPARTED, under the tree, folded until opened - the same table.
          THE TITLE IS A Section NOW, NOT THE TRIGGER (batch 2 heading pass):
          it used to be a hand-rolled <button> carrying the title text itself,
          which read as a heading nowhere the accessibility tree or the DS's
          own SectionHeader could see it. The title/description sit still,
          same as overdue-commitments.tsx/signal-queue.tsx; only the icon
          button that actually toggles goes in CollapsibleTrigger. */}
      {inactive.length > 0 ? (
        <Collapsible open={showInactive} onOpenChange={setShowInactive}>
          <Section
            level={4}
            title={MEMBER_TEXT.orgInactiveTitle(inactive.length)}
            description={MEMBER_TEXT.orgInactiveWhy}
            action={
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={showInactive ? MEMBER_TEXT.orgCollapse(MEMBER_TEXT.orgInactiveTitle(inactive.length)) : MEMBER_TEXT.orgExpand(MEMBER_TEXT.orgInactiveTitle(inactive.length))}
                >
                  <Icon name={showInactive ? "chevron-down" : "chevron-right"} size="xs" />
                </Button>
              </CollapsibleTrigger>
            }
          >
            <CollapsibleContent>
              <div className={`[&_table]:table-fixed ${EDGE_COLUMNS} ${ACTION_COLUMN} [&_thead_th:nth-child(3)]:w-[40%] [&_thead_th:nth-child(5)]:w-[7rem]`}>
                <DataTable
                  labels={DATA_TABLE_LABELS}
                  indexStart={inactivePagination.indexStart}
                  selectedKeys={selectedInactive}
                  onSelectionChange={(keys) => setSelectedInactive([...keys])}
                  rowKey={(r: OrgViewRow) => r.id}
                  rows={inactivePagination.pageRows}
                  rowActions={(r: OrgViewRow) => (
                    <RowActions
                      disabled={pending}
                      items={
                        r.kind === "person"
                          ? [
                              { id: "details", label: ROW_OPS.details(MEMBER_TEXT.noun), onSelect: () => onOpen(r.sub) },
                              ...(canManage
                                ? [
                                    { id: "configure", label: ROW_OPS.configure(MEMBER_TEXT.noun), onSelect: () => onConfigure(r.sub) },
                                    { id: "reactivate", label: MEMBER_TEXT.reactivate, separatorBefore: true, onSelect: () => onReactivate(r.sub) },
                                  ]
                                : []),
                            ]
                          : []
                      }
                    />
                  )}
                  columns={columns}
                />
              </div>
              {inactiveRows.length > 0 ? (
                <PaginationFooter pagination={inactivePagination} total={inactiveRows.length} />
              ) : null}
            </CollapsibleContent>
          </Section>
        </Collapsible>
      ) : null}

      {/* 添加成员 / 移出成员 on a unit (or from the toolbar, with a unit to pick). */}
      <DialogForm
        open={dialog?.kind === "place"}
        onOpenChange={(o) => { if (!o) setDialog(null); }}
        title={dialog?.kind === "place" ? (dialog.mode === "add" ? (dialog.unitName ? MEMBER_TEXT.orgAddTitle(dialog.unitName) : MEMBER_TEXT.orgAdd) : MEMBER_TEXT.orgRemoveTitle(dialog.unitName)) : ""}
        description={dialog?.kind === "place" && dialog.mode === "remove" ? MEMBER_TEXT.orgRemoveWhy : MEMBER_TEXT.orgAddWhy}
        submitLabel={MEMBER_TEXT.orgConfirm}
        cancelLabel={MEMBER_TEXT.cancel}
        submitDisabled={ticked.size === 0 || pending || (dialog?.kind === "place" && !dialog.unitName && !target)}
        danger={dialog?.kind === "place" && dialog.mode === "remove"}
        onSubmit={(e) => { e.preventDefault(); submit(); }}
      >
        <div className="gap-md flex flex-col">
          {dialog?.kind === "place" && !dialog.unitName ? (
            <Field>
              <FieldLabel>{MEMBER_TEXT.orgTargetUnit}</FieldLabel>
              {unitSelect(target, setTarget, new Set())}
            </Field>
          ) : null}
          {candidates.length === 0 ? (
            <p className="text-muted-foreground text-body-md">{MEMBER_TEXT.orgAddNone}</p>
          ) : (
            <div className="gap-2xs md:grid-cols-2 grid grid-cols-1">
              {candidates.map((m) => (
                <label className="gap-2xs flex items-center" key={m.sub} htmlFor={`place-${m.sub}`}>
                  <Checkbox id={`place-${m.sub}`} checked={ticked.has(m.sub)} disabled={pending} onCheckedChange={() => tick(m.sub)} />
                  <span className="text-body-md">{m.name}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      </DialogForm>

      {/* 移动到单位: one placement goes elsewhere. */}
      <DialogForm
        open={dialog?.kind === "move"}
        onOpenChange={(o) => { if (!o) setDialog(null); }}
        title={dialog?.kind === "move" ? MEMBER_TEXT.orgMoveTitle(dialog.name, unitName(dialog.fromUnitId)) : ""}
        description={MEMBER_TEXT.orgMoveWhy}
        submitLabel={MEMBER_TEXT.orgConfirm}
        cancelLabel={MEMBER_TEXT.cancel}
        submitDisabled={!target || pending}
        onSubmit={(e) => { e.preventDefault(); submit(); }}
      >
        <Field>
          <FieldLabel>{MEMBER_TEXT.orgTargetUnit}</FieldLabel>
          {dialog?.kind === "move" ? unitSelect(target, setTarget, new Set([dialog.fromUnitId])) : null}
        </Field>
      </DialogForm>

      {/* 移动到单位 / 复用到单位 for the selection: one target for all. */}
      <DialogForm
        open={dialog?.kind === "bulk"}
        onOpenChange={(o) => { if (!o) setDialog(null); }}
        title={dialog?.kind === "bulk" ? (dialog.mode === "move" ? MEMBER_TEXT.orgBulkMoveTitle(dialog.items.length) : MEMBER_TEXT.orgBulkCopyTitle(dialog.items.length)) : ""}
        description={dialog?.kind === "bulk" && dialog.mode === "move" ? MEMBER_TEXT.orgBulkMoveWhy : MEMBER_TEXT.orgBulkCopyWhy}
        submitLabel={MEMBER_TEXT.orgConfirm}
        cancelLabel={MEMBER_TEXT.cancel}
        submitDisabled={!target || pending}
        onSubmit={(e) => { e.preventDefault(); submit(); }}
      >
        <Field>
          <FieldLabel>{MEMBER_TEXT.orgTargetUnit}</FieldLabel>
          {dialog?.kind === "bulk" ? unitSelect(target, setTarget, new Set()) : null}
        </Field>
      </DialogForm>

      {/* 添加到单位 (+ 新角色): more units, and roles alongside. */}
      <DialogForm
        open={dialog?.kind === "addTo"}
        onOpenChange={(o) => { if (!o) setDialog(null); }}
        title={dialog?.kind === "addTo" ? MEMBER_TEXT.orgAddToTitle(dialog.name) : ""}
        description={MEMBER_TEXT.orgAddToWhy}
        submitLabel={MEMBER_TEXT.orgConfirm}
        cancelLabel={MEMBER_TEXT.cancel}
        submitDisabled={(ticked.size === 0 && tickedRoles.size === 0) || pending}
        onSubmit={(e) => { e.preventDefault(); submit(); }}
      >
        {dialog?.kind === "addTo" ? (() => {
          const already = unitsOf(dialog.sub);
          const open_ = units.filter((u) => !already.has(u.id));
          const held = new Set((rolesOf.get(dialog.sub) ?? []).map((x) => x.code));
          return (
            <div className="gap-md flex flex-col">
              <Field>
                <FieldLabel>{MEMBER_TEXT.unitField}</FieldLabel>
                {open_.length === 0 ? (
                  <p className="text-muted-foreground text-body-md">{MEMBER_TEXT.orgAddToNoUnit}</p>
                ) : (
                  <div className="gap-2xs md:grid-cols-2 grid grid-cols-1">
                    {open_.map((u) => (
                      <label className="gap-2xs flex items-center" key={u.id} htmlFor={`addto-${u.id}`}>
                        <Checkbox id={`addto-${u.id}`} checked={ticked.has(u.id)} disabled={pending} onCheckedChange={() => tick(u.id)} />
                        <span className="text-body-md whitespace-pre">{ORG_TEXT.optionIndent(u.depth, u.name)}</span>
                      </label>
                    ))}
                  </div>
                )}
              </Field>
              <Field>
                <FieldLabel>{MEMBER_TEXT.orgAddToRoles}</FieldLabel>
                <div className="gap-2xs md:grid-cols-2 grid grid-cols-1">
                  {roleOptions.filter((x) => !held.has(x.code)).map((x) => (
                    <label className="gap-2xs flex items-center" key={x.code} htmlFor={`addrole-${x.code}`}>
                      <Checkbox id={`addrole-${x.code}`} checked={tickedRoles.has(x.code)} disabled={pending} onCheckedChange={() => tickRole(x.code)} />
                      <span className="text-body-md">{x.name}</span>
                      {x.admin ? <Tag tone="info">{MEMBER_TEXT.adminBadge}</Tag> : null}
                    </label>
                  ))}
                </div>
              </Field>
            </div>
          );
        })() : null}
      </DialogForm>
    </div>
  );
}
