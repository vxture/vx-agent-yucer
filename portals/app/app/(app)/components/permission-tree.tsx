"use client";

import { useMemo, useState } from "react";
import {
  Button,
  ButtonGroup,
  DataTable,
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
  Icon,
  SegmentedControl,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableTitleCell,
  type IconName,
} from "@vxture/design-ui";
import { ACTION_COLUMN, EDGE_COLUMNS, RowActions } from "./table-fittings";
import { useMessages } from "../lib/i18n/provider";
import {
  flattenTree,
  keysDownTo,
  type PermissionLevel,
  type PermissionNode,
  type PermissionRow,
} from "../lib/permission-tree";
import { Tag } from "./tag";

/* 权限管理 - 业务域 / 模块 / 页面 / 操作, one tree in one table (owner,
 * 2026-09-09; the reference is the platform console's permission tree).
 *
 * ONE FLAT TABLE, NOT NESTED TABLES. The tree is flattened by its expansion
 * state and each row indents by its depth, so the DS's DataTable draws it
 * with its own three fittings and its own header - what a nested component
 * per level would have had to fake. A chevron on a row that has children
 * opens it; a level tag says what the row is.
 *
 * THE ROLES ARE ONE COLUMN (owner, 2026-09-10: 角色已经很多，撤掉角色横铺模式).
 * With thirty-one presets a column per role was a wall that scrolled; an
 * operation now reads the FIRST THREE roles that may perform it, in roster
 * order, and how many may in all, and the whole list opens on hover - the
 * DS's HoverCard, a panel to read rather than a tooltip line. The roster
 * order is the workspace's own (sort_order), so the three named are the
 * highest rungs that hold the permission.
 *
 * READ-ONLY HERE: the grants are edited on /admin/roles, one role at a time.
 * The action column is the fitting every table carries, with nothing in it.
 */

/** One workspace role, in roster order. `group` is its line and rung, for
 *  the hover panel - 销售 · 总监. */
export interface RoleColumn {
  readonly code: string;
  readonly name: string;
  readonly group: string | null;
}

/** The presets' icons. A role the tenant added wears the generic one. */
export const ROLE_ICON: Readonly<Record<string, IconName>> = {
  sales_leader: "star",
  marketing_manager: "megaphone",
  sales_rep: "user",
  presales: "headset",
  delivery_manager: "cube",
  sales_ops: "settings",
  viewer: "eye",
  sales_manager: "users",
  regional_director: "flag",
};

export function roleIcon(code: string): IconName {
  return ROLE_ICON[code] ?? "user-circle";
}

export const LEVEL_ICON: Readonly<Record<PermissionLevel, IconName>> = {
  domain: "folder",
  module: "squares-four",
  page: "table",
  action: "key",
};

const LEVEL_TONE = {
  domain: "brand",
  module: "info",
  page: "neutral",
  action: "warning",
} as const;

/** The words for a node, from the dictionaries: the group, the module, the
 *  page, the operation. Shared by the table and the drawer list. */
export function useNodeCopy() {
  const { DOMAIN_GROUP_LABEL, DOMAIN_LABEL, PERMISSION_TREE_TEXT: T } = useMessages();
  const title = (n: PermissionNode): string => {
    if (n.level === "domain") return T.groupLabel[n.name] ?? DOMAIN_GROUP_LABEL[n.name] ?? n.name;
    if (n.level === "module") return T.moduleLabel[n.name] ?? DOMAIN_LABEL[n.name] ?? n.name;
    if (n.level === "page") return T.pageLabel[n.name] ?? n.name;
    return T.actionLabel[n.name] ?? n.name;
  };
  /* THE SUBTITLE IS THE CODE (owner: 权限码副标题): the node's own name, and
     for an operation the permission it needs after it - that is the column
     the roles are read against. */
  const subtitle = (n: PermissionNode): string =>
    n.level === "action" && n.permission ? `${n.name} · ${n.permission}` : n.name;
  return { title, subtitle };
}

export function PermissionTree({
  tree,
  roles,
  holds,
}: {
  readonly tree: readonly PermissionNode[];
  /** The workspace's roles, in its sort_order. */
  readonly roles: readonly RoleColumn[];
  /** role code -> the permissions it holds. */
  readonly holds: Readonly<Record<string, readonly string[]>>;
}) {
  const { DATA_TABLE_LABELS, PERMISSION_TREE_TEXT: T } = useMessages();
  const { title, subtitle } = useNodeCopy();
  // Open to the pages by default: the shape is visible, the operations are
  // one click away each rather than a wall.
  const [expanded, setExpanded] = useState<Set<string>>(() => keysDownTo(tree, "page"));
  const rows = useMemo(() => flattenTree(tree, expanded), [tree, expanded]);
  /* permission -> the roles that hold it, in roster order. Built once; a
     cell reads its slice. */
  const holders = useMemo(() => {
    const out = new Map<string, RoleColumn[]>();
    for (const r of roles) {
      for (const p of holds[r.code] ?? []) {
        const list = out.get(p) ?? [];
        list.push(r);
        out.set(p, list);
      }
    }
    return out;
  }, [roles, holds]);

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className="gap-md flex flex-col">
      {/* Expand to a level, or fold everything: the two things a reader does
          with a tree of this size. */}
      <div className="gap-sm flex items-center">
        <span className="text-muted-foreground text-body-sm">{T.expandTo}</span>
        <ButtonGroup>
          {(["module", "page", "action"] as const).map((lvl) => (
            <Button key={lvl} variant="secondary" size="sm" onClick={() => setExpanded(keysDownTo(tree, lvl))}>
              {T.levelLabel[lvl]}
            </Button>
          ))}
          <Button variant="secondary" size="sm" onClick={() => setExpanded(new Set())}>
            {T.collapseAll}
          </Button>
        </ButtonGroup>
      </div>

      <div
        className={
          /* FIXED LAYOUT, FOUR NAMED WIDTHS: the two fittings, the point, the
             level and the action column; 授权角色 takes what is left. Nothing
             scrolls and nothing is pinned - one column holds thirty-one
             roles as well as it holds nine. */
          `[&_table]:table-fixed ${EDGE_COLUMNS} ${ACTION_COLUMN}`
          + " [&_thead_th:nth-child(3)]:w-[24rem] [&_thead_th:nth-child(4)]:w-[6rem]"
        }
      >
        <DataTable
          labels={DATA_TABLE_LABELS}
          leadingSpacer
          indexStart={1}
          rowActions={() => <RowActions items={[]} />}
          rowKey={(r: PermissionRow) => r.node.key}
          rows={rows}
          columns={[
            {
              id: "point",
              header: T.colPoint,
              cell: (r: PermissionRow) => {
                const n = r.node;
                const branch = n.children.length > 0;
                return (
                  <span className="gap-xs flex items-center" style={{ paddingLeft: `${r.depth * 1.5}rem` }}>
                    {/* The chevron is the row's own control; a leaf keeps
                        its width so titles line up down a level. */}
                    {branch ? (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-expanded={r.expanded}
                        aria-label={title(n)}
                        onClick={() => toggle(n.key)}
                      >
                        <Icon name={r.expanded ? "chevron-down" : "chevron-right"} size="sm" />
                      </Button>
                    ) : (
                      <span className="w-8 shrink-0" />
                    )}
                    {/* THE DS'S TABLE TITLE CELL (owner, 2026-09-10: 权限视图
                        文字小了): the title wore `text-body`, a tier that does
                        not exist, and fell through to the table's 12px. The
                        DS's cell sets the table tier - label-md bold over
                        body-sm - and carries the level icon itself. */}
                    <TableTitleCell
                      icon={LEVEL_ICON[n.level]}
                      title={title(n)}
                      tooltip={title(n)}
                      titleSuffix={branch ? <Tag>{T.childCount(n.children.length)}</Tag> : undefined}
                      description={subtitle(n)}
                    />
                  </span>
                );
              },
            },
            {
              id: "level",
              header: T.colLevel,
              cell: (r: PermissionRow) => (
                <StatusBadge tone={LEVEL_TONE[r.node.level]}>{T.levelLabel[r.node.level]}</StatusBadge>
              ),
            },
            /* 授权角色: the first three holders in roster order, then how
               many in all; every holder on hover. A branch reads nothing -
               a module does not hold a permission, its operations do. */
            {
              id: "holders",
              header: T.colHolders,
              // Names are read, not compared: left, like the point column.
              align: "left" as const,
              cell: (r: PermissionRow) => {
                const p = r.node.permission;
                if (!p) return null;
                const list = holders.get(p) ?? [];
                if (list.length === 0) {
                  return <span className="text-muted-foreground text-body-sm">{T.holdersNone}</span>;
                }
                const lead = list.slice(0, 3);
                return (
                  <HoverCard openDelay={150} closeDelay={100}>
                    <HoverCardTrigger asChild>
                      <span className="gap-xs inline-flex cursor-default items-center">
                        <span className="text-body-md">{lead.map((x) => x.name).join(T.holdersJoin)}</span>
                        {list.length > 3 ? <Tag>{T.holdersMore(list.length - 3)}</Tag> : null}
                        <span className="text-muted-foreground text-label-md">{T.holdersCount(list.length)}</span>
                      </span>
                    </HoverCardTrigger>
                    <HoverCardContent align="start" className="w-auto min-w-[16rem] max-w-[28rem]">
                      <div className="gap-sm flex flex-col">
                        <span className="text-label-md font-semibold">{T.holdersTitle(title(r.node), list.length)}</span>
                        <ul className="gap-2xs flex flex-col">
                          {list.map((x, i) => (
                            <li key={x.code} className="gap-sm flex items-baseline">
                              <span className="text-muted-foreground text-label-md w-5 shrink-0 text-right tabular-nums">{i + 1}</span>
                              <span className="text-body-md">{x.name}</span>
                              {x.group ? <span className="text-muted-foreground text-label-md">{x.group}</span> : null}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </HoverCardContent>
                  </HoverCard>
                );
              },
            },
          ]}
        />
      </div>
    </div>
  );
}

/**
 * The same tree for ONE role, AS A TABLE (owner, 2026-09-09: 抽屉权限布局按
 * 表格模式优化，树状结构并能操作树展开收起) - what the roster's 权限详情
 * drawer shows. The DS's table primitives rather than DataTable, whose three
 * fittings are for tables somebody acts in; the tree is the same one
 * /admin/permissions draws, with the same chevrons and the same expand-to
 * buttons, read for one role: a leaf reads ✓ or —, a branch counts the
 * operations under it the role may perform. `onlyGranted` prunes to what
 * the role can do before flattening, so the counts and the rows agree.
 */
export type PermissionView = "granted" | "all";

export function PermissionTreeTable({
  tree,
  held,
  view,
  onViewChange,
}: {
  readonly tree: readonly PermissionNode[];
  readonly held: ReadonlySet<string>;
  /** 只看可执行 / 显示全部 - the switch sits on the table's own toolbar row. */
  readonly view: PermissionView;
  readonly onViewChange: (view: PermissionView) => void;
}) {
  const { PERMISSION_TREE_TEXT: T, ROLE_TEXT } = useMessages();
  const onlyGranted = view === "granted";
  const { title, subtitle } = useNodeCopy();

  const granted = (n: PermissionNode) => n.permission !== null && held.has(n.permission);
  const leaves = (n: PermissionNode): PermissionNode[] =>
    n.children.length === 0 ? [n] : n.children.flatMap(leaves);
  /* Pruned first, flattened second: a branch with nothing the role can do
     is not a row when only the granted are shown. */
  const prune = (nodes: readonly PermissionNode[]): PermissionNode[] =>
    nodes
      .filter((n) => !onlyGranted || leaves(n).some(granted))
      .map((n) => ({ ...n, children: prune(n.children) }));
  // 114 nodes at most: pruned and flattened on every render, no memo.
  const shown = prune(tree);
  // Open to the pages by default, like the full table.
  const [expanded, setExpanded] = useState<Set<string>>(() => keysDownTo(tree, "page"));
  const rows = flattenTree(shown, expanded);

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className="gap-md flex flex-col">
      {/* ONE TOOLBAR ROW (owner, 2026-09-09: 展开操作、显示切换同一操作行): the
          expand-to buttons on the left, the 滑块式 view switch on the right. */}
      <div className="gap-sm flex flex-wrap items-center justify-between">
        <div className="gap-sm flex items-center">
          <span className="text-muted-foreground text-body-sm">{T.expandTo}</span>
          <ButtonGroup>
            {/* Keys from the FULL tree, so switching 只看可执行 / 显示全部 keeps
                the same level open rather than showing the newly revealed
                branches folded. */}
            {(["module", "page", "action"] as const).map((lvl) => (
              <Button key={lvl} variant="secondary" size="sm" onClick={() => setExpanded(keysDownTo(tree, lvl))}>
                {T.levelLabel[lvl]}
              </Button>
            ))}
            <Button variant="secondary" size="sm" onClick={() => setExpanded(new Set())}>
              {T.collapseAll}
            </Button>
          </ButtonGroup>
        </div>
        <SegmentedControl<PermissionView>
          size="sm"
          value={view}
          onChange={onViewChange}
          ariaLabel={ROLE_TEXT.details}
          items={[
            { value: "granted", label: ROLE_TEXT.detailsOnlyGranted },
            { value: "all", label: ROLE_TEXT.detailsAll },
          ]}
        />
      </div>
      {/* FIXED LAYOUT, THREE SHARES: the point takes what the two short
          columns leave; the level tag and the mark each get a slot SIZED TO
          THEIR WIDEST CONTENT, measured - 业务域 in a badge is 90px and
          `3 / 12` in a tag 85px, and the DS strips the last column's right
          padding, so 5.5rem / 5rem overflowed the table by ten pixels and
          the drawer grew a horizontal scrollbar (owner: 需要优化自适应列宽).
          6.5rem and 6rem hold both with the cell's own padding. */}
      <Table className="w-full table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead>{T.colPoint}</TableHead>
            <TableHead className="w-[6.5rem]">{T.colLevel}</TableHead>
            <TableHead className="w-[6rem] text-center">{ROLE_TEXT.detailsColHeld}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const n = r.node;
            const branch = n.children.length > 0;
            const all = leaves(n);
            const ok = all.filter(granted).length;
            return (
              <TableRow key={n.key}>
                <TableCell>
                  <span className="gap-xs flex items-center" style={{ paddingLeft: `${r.depth * 1.25}rem` }}>
                    {branch ? (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-expanded={r.expanded}
                        aria-label={title(n)}
                        onClick={() => toggle(n.key)}
                      >
                        <Icon name={r.expanded ? "chevron-down" : "chevron-right"} size="sm" />
                      </Button>
                    ) : (
                      <span className="w-8 shrink-0" />
                    )}
                    <TableTitleCell icon={LEVEL_ICON[n.level]} title={title(n)} tooltip={title(n)} description={subtitle(n)} />
                  </span>
                </TableCell>
                <TableCell>
                  <StatusBadge tone={LEVEL_TONE[n.level]}>{T.levelLabel[n.level]}</StatusBadge>
                </TableCell>
                <TableCell className="text-center">
                  {branch ? (
                    <Tag tone={ok === 0 ? "neutral" : ok === all.length ? "success" : "info"}>
                      {`${ok} / ${all.length}`}
                    </Tag>
                  ) : granted(n) ? (
                    <Icon name="check" size="sm" className="text-success" aria-label={T.granted} />
                  ) : (
                    <span className="text-muted-foreground" aria-label={T.notGranted}>—</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
