"use client";

import {
  BulkActionBar,
  Button,
  DataTable,
  EmptyState,
  FilterBar,
  Input,
  ListCard,
  ListCardGrid,
  NativeSelect,
  Section,
  StatusBadge,
  TableTitleCell,
  useToast,
  type FilterBarView,
} from "@vxture/design-ui";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { ACTION_COLUMN, EDGE_COLUMNS, FilterSlot, RowActions, SearchSlot, moveItems } from "./table-fittings";
import { useMessages } from "../lib/i18n/provider";
import type { MoveDirection } from "../../domains/shared/ordering";
import { moveRoleAction, removeRoleAction } from "../admin/roles/actions";
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
 * roster, the assignment menu on /admin/members and the columns of 权限策略
 * all follow, so there are no sortable headers; the moves are in the row's
 * menu and change the order for everybody.
 */

export interface RoleRow {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly description: string;
  /** The group rows' names (0047); null reads as 未分组. */
  readonly line: { readonly code: string; readonly name: string } | null;
  readonly rank: { readonly code: string; readonly name: string } | null;
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
  const { DATA_TABLE_LABELS, DS_LABELS, ROLE_ERROR, ROLE_TEXT, ROW_OPS } = useMessages();
  const router = useRouter();
  const params = useSearchParams();
  const [selected, setSelected] = useState<string[]>([]);
  const [view, setView] = useState<FilterBarView>("list");
  /* 搜索/筛选 (owner: 表头操作行参照 /admin/permissions 补齐, 筛选组的补齐) -
     a flat list, so filtering is a plain array filter. */
  const [query, setQuery] = useState("");
  const [lineFilter, setLineFilter] = useState("");
  const [rankFilter, setRankFilter] = useState("");
  const lineOptions = useMemo(
    () => [...new Map(rows.filter((r) => r.line).map((r) => [r.line!.code, r.line!.name])).entries()],
    [rows],
  );
  const rankOptions = useMemo(
    () => [...new Map(rows.filter((r) => r.rank).map((r) => [r.rank!.code, r.rank!.name])).entries()],
    [rows],
  );
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (q === "" || r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q))
        && (lineFilter === "" || r.line?.code === lineFilter)
        && (rankFilter === "" || r.rank?.code === rankFilter),
    );
  }, [rows, query, lineFilter, rankFilter]);
  const searching = query.trim() !== "" || lineFilter !== "" || rankFilter !== "";
  /* WHICH ROLE THE DRAWER SHOWS IS IN THE URL (`?details=<code>`), not in
     component state (owner, 2026-09-09: 保持侧边栏抽屉打开状态). So it survives
     the refresh every row move - and every save inside the drawer - causes,
     and a reload. A code the list no longer has reads as closed. */
  const details = useMemo(() => {
    const code = params.get("details");
    return code ? (rows.find((r) => r.code === code) ?? null) : null;
  }, [params, rows]);
  const setDetails = (r: RoleRow | null) => {
    const next = new URLSearchParams(params.toString());
    if (r) next.set("details", r.code);
    else next.delete("details");
    const qs = next.toString();
    router.replace(qs ? `/admin/roles?${qs}` : "/admin/roles", { scroll: false });
  };
  const [pending, start] = useTransition();
  const { toast } = useToast();
  /* A move that landed is read back with an explicit refresh - the same
     reason vocabulary-config.tsx gives: the payload on the action response
     did not always reach the page, and a re-ordered list nobody could see
     is a move that "did not work". */
  const move = (code: string, direction: MoveDirection) =>
    start(async () => {
      const r = await moveRoleAction(code, direction);
      if (!r.ok) toast({ tone: "danger", title: ROLE_ERROR[r.error] ?? r.error });
      else router.refresh();
    });
  /* The hammer, behind the DS's confirm (owner, 2026-09-09: 所有删除、重置、清空
     等危险操作，按区域设置模式弹窗确认). A refusal is shown as a toast and
     RE-THROWN so the DS keeps the confirmation open: the person must see
     that the click did not land. */
  const remove = async (code: string) => {
    const r = await removeRoleAction(code);
    if (!r.ok) {
      toast({ tone: "danger", title: ROLE_ERROR[r.error] ?? r.error });
      throw new Error(r.error);
    }
    if (details?.code === code) setDetails(null);
    router.refresh();
  };
  /* 批量删除 (模式按照组织架构/区域设置) - a flat list, so every selected
     row is attempted; one still held by a member is skipped rather than
     failing the whole batch (the same FK RESTRICT the single-row menu
     already shows), and the counts are reported separately. */
  const bulkRemove = () =>
    start(async () => {
      const byCode = new Map(rows.map((r) => [r.code, r]));
      const targets = selected.map((code) => byCode.get(code)).filter((r): r is RoleRow => r !== undefined);
      let removed = 0;
      let skipped = 0;
      for (const r of targets) {
        if (r.members > 0) {
          skipped += 1;
          continue;
        }
        const res = await removeRoleAction(r.code);
        if (res.ok) {
          removed += 1;
          if (details?.code === r.code) setDetails(null);
        } else {
          toast({ tone: "danger", title: `${r.name}: ${ROLE_ERROR[res.error] ?? res.error}` });
        }
      }
      if (removed > 0) toast({ tone: "success", title: ROLE_TEXT.bulkRemoveDone(removed) });
      if (skipped > 0) toast({ tone: "info", title: ROLE_TEXT.bulkRemoveSkipped(skipped) });
      setSelected([]);
      router.refresh();
    });

  /* Shared between the table row and the card - same menu either way
     (模式按照组织架构/区域设置). rowIndex is the row's position in
     `filtered`, not the true stored order - 上移/下移 greying reflects what
     a reader is currently looking at, matching vocabulary-config.tsx's own
     choice while a search narrows the rows. */
  const actionsFor = (r: RoleRow) => {
    const rowIndex = filtered.findIndex((x) => x.code === r.code);
    return (
      <RowActions
        disabled={pending}
        items={[
          /* THREE GROUPS, SEPARATED (owner, 2026-09-09): read and
             configure; the four moves; delete. 权限详情 FIRST, and for
             every reader: the drawer is the one thing a read-only
             reader came here to open. */
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
                /* THE FOUR MOVES, one set for every panel (ROW_OPS),
                   greyed at the end they cannot pass. rowIndex is the
                   global position, since the rows are never re-sorted
                   for display. */
                ...moveItems(ROW_OPS, rowIndex, filtered.length, (d) => move(r.code, d)),
                /* THE THIRD GROUP, UNDER ITS OWN RULE (owner: 按类用分割线
                   隔开，增加删除按钮): the one thing that cannot be
                   undone, red, confirmed by the DS - verb, target,
                   consequence - and greyed with its reason while
                   somebody holds the role (the FK's RESTRICT, said
                   first). */
                {
                  id: "remove",
                  label: ROLE_TEXT.remove,
                  separatorBefore: true,
                  danger: true as const,
                  disabled: r.members > 0,
                  hint: r.members > 0 ? ROLE_TEXT.removeHeldHint(r.members) : undefined,
                  confirm: {
                    verb: ROLE_TEXT.remove,
                    target: ROLE_TEXT.removeTarget(r.name),
                    consequence: ROLE_TEXT.removeConsequence,
                    titleTemplate: ROLE_TEXT.destructiveTitle,
                    cancelLabel: ROLE_TEXT.cancel,
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
    <Section id="roles">
      {rows.length > 0 ? (
        <FilterBar
          count={
            searching
              ? ROLE_TEXT.toolbarFilteredCount(filtered.length, rows.length)
              : ROLE_TEXT.toolbarCount(rows.length)
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
                placeholder={ROLE_TEXT.searchPlaceholder}
                aria-label={ROLE_TEXT.searchLabel}
                onChange={(e) => setQuery(e.target.value)}
              />
            </SearchSlot>
          }
          onReset={searching ? () => { setQuery(""); setLineFilter(""); setRankFilter(""); } : undefined}
          resetLabel={ROLE_TEXT.resetFilters}
          actions={editable ? <Button onClick={() => router.push("/admin/roles/new")}>{ROLE_TEXT.newRole}</Button> : undefined}
        >
          {lineOptions.length > 0 ? (
            <FilterSlot width="w-[9rem]">
              <NativeSelect value={lineFilter} aria-label={ROLE_TEXT.lineFilterLabel} onChange={(e) => setLineFilter(e.target.value)}>
                <option value="">{ROLE_TEXT.filterAllLines}</option>
                {lineOptions.map(([code, name]) => (
                  <option key={code} value={code}>{name}</option>
                ))}
              </NativeSelect>
            </FilterSlot>
          ) : null}
          {rankOptions.length > 0 ? (
            <FilterSlot width="w-[9rem]">
              <NativeSelect value={rankFilter} aria-label={ROLE_TEXT.rankFilterLabel} onChange={(e) => setRankFilter(e.target.value)}>
                <option value="">{ROLE_TEXT.filterAllRanks}</option>
                {rankOptions.map(([code, name]) => (
                  <option key={code} value={code}>{name}</option>
                ))}
              </NativeSelect>
            </FilterSlot>
          ) : null}
        </FilterBar>
      ) : null}
      {editable && view === "list" ? (
        <BulkActionBar
          count={selected.length}
          noun={ROLE_TEXT.selectionNoun}
          selectionTemplate={DS_LABELS.bulkSelectionTemplate}
          toolbarLabel={DS_LABELS.bulkToolbar}
          clearLabel={ROLE_TEXT.clearSelection}
          onClear={() => setSelected([])}
          actions={[
            {
              id: "remove",
              label: ROLE_TEXT.bulkRemove,
              danger: true as const,
              confirm: {
                verb: ROLE_TEXT.bulkRemove,
                target: ROLE_TEXT.bulkRemoveTarget(selected.length),
                consequence: ROLE_TEXT.bulkRemoveConsequence,
                titleTemplate: ROLE_TEXT.destructiveTitle,
                cancelLabel: ROLE_TEXT.cancel,
                onConfirm: bulkRemove,
              },
            },
          ]}
        />
      ) : null}
      {rows.length === 0 ? (
        <EmptyState title={ROLE_TEXT.emptyTitle} description={ROLE_TEXT.emptyWhy} />
      ) : filtered.length === 0 ? (
        <p className="text-muted-foreground text-body-sm">{ROLE_TEXT.filterEmpty}</p>
      ) : view === "cards" ? (
        <ListCardGrid>
          {filtered.map((r) => (
            <ListCard
              key={r.code}
              title={r.name}
              description={r.code}
              onTitleClick={() => setDetails(r)}
              status={r.preset ? <Tag>{ROLE_TEXT.preset}</Tag> : <StatusBadge tone="info">{ROLE_TEXT.custom}</StatusBadge>}
              actions={actionsFor(r)}
              meta={
                <div className="gap-xs flex flex-wrap items-center">
                  {r.line ? <Tag>{r.line.name}</Tag> : <span className="text-muted-foreground text-body-sm">{ROLE_TEXT.ungrouped}</span>}
                  {r.rank ? <Tag>{r.rank.name}</Tag> : <span className="text-muted-foreground text-body-sm">{ROLE_TEXT.ungrouped}</span>}
                  <span className="text-muted-foreground text-body-sm tabular-nums">
                    {r.members === 0 ? ROLE_TEXT.noMember : ROLE_TEXT.members(r.members)}
                  </span>
                  <span className="text-muted-foreground text-body-sm tabular-nums">
                    {ROLE_TEXT.permCount(r.permissions.length, total)}
                  </span>
                </div>
              }
            />
          ))}
        </ListCardGrid>
      ) : (
        /* 三件标配, and the short columns take explicit widths so the
           description column gets the room - the same constraint-from-outside
           every roster here carries: the DS's width tiers are MIN-widths and
           fixed layout ignores minimums. */
        <div
          className={
            `[&_table]:table-fixed ${EDGE_COLUMNS} ${ACTION_COLUMN}`
            + " [&_thead_th:nth-child(3)]:w-[13rem]"
            + " [&_thead_th:nth-child(4)]:w-[6.5rem]"
            + " [&_thead_th:nth-child(5)]:w-[6.5rem]"
            + " [&_thead_th:nth-child(6)]:w-[6.5rem]"
            + " [&_thead_th:nth-child(7)]:w-[6rem]"
            + " [&_thead_th:nth-child(8)]:w-[6rem]"
          }
        >
          <DataTable
            labels={DATA_TABLE_LABELS}
            indexStart={1}
            selectedKeys={selected}
            onSelectionChange={(keys) => setSelected([...keys])}
            rowActions={actionsFor}
            rowKey={(r: RoleRow) => r.code}
            rows={filtered}
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
              /* THE TWO GROUPS (0047): the workspace's own words for the line
                 and the rung, as tags; a role in neither says 未分组 in the
                 muted tone, which is a fact about it worth seeing. */
              {
                id: "line",
                header: ROLE_TEXT.colLine,
                cell: (r: RoleRow) =>
                  r.line ? <Tag>{r.line.name}</Tag> : <span className="text-muted-foreground text-body-sm">{ROLE_TEXT.ungrouped}</span>,
              },
              {
                id: "rank",
                header: ROLE_TEXT.colRank,
                cell: (r: RoleRow) =>
                  r.rank ? <Tag>{r.rank.name}</Tag> : <span className="text-muted-foreground text-body-sm">{ROLE_TEXT.ungrouped}</span>,
              },
              {
                id: "members",
                header: ROLE_TEXT.colMembers,
                // A role nobody holds is a fact worth seeing, not a zero to
                // skim past - and it is the only kind that can be deleted.
                cell: (r: RoleRow) =>
                  r.members === 0 ? <Tag>{ROLE_TEXT.noMember}</Tag> : ROLE_TEXT.members(r.members),
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
                /* THE SENTENCE (owner: 最简单的角色描述), LAST BEFORE 操作
                   (owner: 列顺序 … 成员数 ｜ 权限数 ｜ 说明 ｜ 操作). It takes what
                   the short columns leave, and a role with none says so in
                   the muted tone rather than leaving a hole. */
                id: "description",
                header: ROLE_TEXT.colDescription,
                cell: (r: RoleRow) =>
                  r.description ? (
                    <span className="text-body-sm">{r.description}</span>
                  ) : (
                    <span className="text-muted-foreground text-body-sm">{ROLE_TEXT.noDescription}</span>
                  ),
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
        editHref={editable && details ? `/admin/roles/${details.id}` : null}
      />
    </Section>
  );
}
