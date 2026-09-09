"use client";

import { useMemo, useState, type CSSProperties } from "react";
import {
  Button,
  ButtonGroup,
  DataTable,
  Icon,
  SegmentedControl,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
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
 * THE ROLES ARE COLUMNS, ONE EACH (owner: 角色应该展开列，用 icon 显示，不要混合在
 * 一行), and they are the WORKSPACE'S roles (incr/0046) - the presets and
 * whatever the tenant added - so there may be nine or fourteen. The fixed
 * columns (选择 / 序号 / 权限点 / 层级 / 操作) take their stated widths and the
 * roles SPLIT WHAT IS LEFT, equally (owner: 其他列平分). A role header reads
 * icon + short name by default, drops to the icon alone when its column gets
 * too narrow for the name, and always carries the full name in a tooltip.
 * The table only scrolls sideways once a role column would fall below the
 * floor a single icon needs; then the leading columns stay put on the left
 * as the action column does on the right.
 *
 * READ-ONLY HERE: the grants are edited on /admin/roles, one role at a time.
 * The action column is the fitting every table carries, with nothing in it.
 */

/** One column: a workspace role. `short` is what the header prints. */
export interface RoleColumn {
  readonly code: string;
  readonly name: string;
  readonly short: string;
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

/* THE WIDTHS, IN REM, MEASURED AGAINST THE DS'S OWN CELL.
 *
 * A DS table cell pads 16px each side (`px-md`) and a `sm` icon is 16px, so
 * the narrowest column that still shows its icon whole is 48px - that is the
 * FLOOR, and the scroll threshold. The owner proposed 32px and asked whether
 * it holds: it does not, under this DS - 32px is exactly the padding, with
 * no room left for the mark, so a ✓ at 32px is a clipped ✓. 32px would only
 * work with the role cells' padding cut to 8px, which is restyling the DS's
 * cell to fit a number; the floor follows the cell instead.
 *
 * The header keeps its short name while the CONTENT box (column minus the
 * padding) can hold icon + gap + name at 12px: the longest short name is
 * three characters (负责人), 16 + 4 + 36 = 56px. Two steps down from there,
 * each measured: under 56px the gap goes first (16 + 36 = 52px still shows
 * the name), and under 52px the name goes and the icon stands alone. A name
 * never half-shows. Full-HD is the case that decided the second step: a
 * 1440px content area gives nine roles 85px each, 53px of content - the
 * name fits there without its gap and not with it.
 *
 * FIXED = 选择 4 + 序号 4 + 权限点 24 + 层级 6 + 操作 4. The title column is
 * wide enough for an id and its permission on one line.
 */
const FIXED_REM = 4 + 4 + 24 + 6 + 4;
const ROLE_FLOOR_REM = 3;

/* PINNED EDGES. The three leading columns (选择 / 序号 / 权限点) and the
   action column stay put while the role columns scroll under them. The
   DS pins its own action column; the left pin is this wrapper's, laid over
   the DS's cells with the surface colour so scrolled cells pass beneath. */
const PINNED =
  " [&_thead_th:nth-child(1)]:sticky [&_thead_th:nth-child(1)]:left-0 [&_tbody_td:nth-child(1)]:sticky [&_tbody_td:nth-child(1)]:left-0"
  + " [&_thead_th:nth-child(2)]:sticky [&_thead_th:nth-child(2)]:left-[4rem] [&_tbody_td:nth-child(2)]:sticky [&_tbody_td:nth-child(2)]:left-[4rem]"
  + " [&_thead_th:nth-child(3)]:sticky [&_thead_th:nth-child(3)]:left-[8rem] [&_tbody_td:nth-child(3)]:sticky [&_tbody_td:nth-child(3)]:left-[8rem]"
  + " [&_thead_th:nth-child(-n+3)]:z-10 [&_tbody_td:nth-child(-n+3)]:z-10"
  + " [&_thead_th:nth-child(-n+3)]:bg-background [&_tbody_td:nth-child(-n+3)]:bg-background";

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
  /** Column order - the workspace's sort_order. */
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
  const held = useMemo(
    () => new Map(roles.map((r) => [r.code, new Set(holds[r.code] ?? [])])),
    [roles, holds],
  );

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
          /* NO WIDTH ON THE ROLE COLUMNS. Under `table-fixed` the columns
             left unsized share the slack equally, which is the 平分; the
             minimum width below is the fixed sum plus one floor per role,
             and the wrapper scrolls only once the page is narrower than
             that. Set as a variable because the count is the roles' and
             a class string cannot compute. */
          `overflow-x-auto [&_table]:w-full [&_table]:min-w-[var(--perm-min)] [&_table]:table-fixed ${EDGE_COLUMNS} ${ACTION_COLUMN}${PINNED}`
          + " [&_thead_th:nth-child(3)]:w-[24rem] [&_thead_th:nth-child(4)]:w-[6rem]"
        }
        style={{ "--perm-min": `${FIXED_REM + roles.length * ROLE_FLOOR_REM}rem` } as CSSProperties}
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
                    <Icon name={LEVEL_ICON[n.level]} size="sm" className="text-muted-foreground shrink-0" />
                    <span className="gap-3xs flex min-w-0 flex-col">
                      <span className="gap-xs flex items-center">
                        <span className="text-body truncate font-medium">{title(n)}</span>
                        {branch ? <Tag>{T.childCount(n.children.length)}</Tag> : null}
                      </span>
                      <span className="text-muted-foreground text-body-sm truncate">{subtitle(n)}</span>
                    </span>
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
            /* ONE COLUMN PER ROLE. A leaf reads ✓ or —; a branch reads
               nothing, because a module does not hold a permission - its
               operations do, each on its own row. */
            ...roles.map((role) => ({
              id: role.code,
              header: (
                /* The header measures its own cell (`@container` on a block
                   that fills the th's content box) and hides the short name
                   once that box is under 52px, its gap under 56 - see
                   ROLE_FLOOR_REM. The tooltip carries the full name in both
                   states. */
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="@container block w-full cursor-default">
                      <span className="gap-2xs @max-[56px]:gap-0 inline-flex items-center">
                        <Icon name={roleIcon(role.code)} size="sm" />
                        <span className="@max-[52px]:hidden">{role.short}</span>
                      </span>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>{role.name}</TooltipContent>
                </Tooltip>
              ),
              align: "center" as const,
              cell: (r: PermissionRow) => {
                const p = r.node.permission;
                if (!p) return null;
                const ok = held.get(role.code)?.has(p) ?? false;
                return ok ? (
                  <Icon name="check" size="sm" className="text-success" aria-label={T.granted} />
                ) : (
                  <span className="text-muted-foreground" aria-label={T.notGranted}>—</span>
                );
              },
            })),
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
                    <Icon name={LEVEL_ICON[n.level]} size="sm" className="text-muted-foreground shrink-0" />
                    <span className="gap-3xs flex min-w-0 flex-col">
                      <span className={`text-body-sm truncate ${branch ? "font-medium" : ""}`}>{title(n)}</span>
                      <span className="text-muted-foreground text-label-sm truncate">{subtitle(n)}</span>
                    </span>
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
