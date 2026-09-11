"use client";

import { useMemo, useState } from "react";
import {
  Button,
  ButtonGroup,
  DataTable,
  FilterBar,
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
  Icon,
  Input,
  NativeSelect,
  SegmentedControl,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableTitleCell,
  useToast,
  type IconName,
} from "@vxture/design-ui";
import { ACTION_COLUMN, FilterSlot, RowActions, SearchSlot } from "./table-fittings";
import { useMessages } from "../lib/i18n/provider";
import {
  filterPermissionTree,
  flattenTree,
  keysDownTo,
  type PermissionLevel,
  type PermissionNode,
  type PermissionRow,
} from "../lib/permission-tree";
import { Tag } from "./tag";

/* 权限策略 - 业务域 / 模块 / 页面 / 操作, one tree in one table (owner,
 * 2026-09-09; the reference is the platform console's permission tree; the
 * page renamed from 权限管理 to 权限策略 and its toolbar redrawn 2026-09-10
 * against a second reference - the platform GOVERNANCE plane's own 权限策略
 * screen: a search box, a type filter, and 名称 / 类型 / 来源 / 授权角色 /
 * 操作 columns over a numbered list).
 *
 * WHAT CARRIES OVER AND WHAT DOES NOT. That screen edits a flat permission
 * registry - it has a 状态 column (enabled/disabled) and a 新增权限 button
 * because ITS permissions are rows a person creates. Ours are not: every
 * node here is read off authz/actions.ts, a source file, and nothing in
 * this product ever inserts a row into it from a screen. So there is no
 * 状态 (nothing here is ever disabled) and no 新增权限 button (there is
 * nowhere for it to write) - and 来源 says as much, honestly, on every row:
 * 系统预置. What DOES carry over: the search box, a filter that narrows the
 * tree instead of just folding it, and 名称 / 类型 / 来源 / 授权角色 in that
 * order. 类型 keeps this page's own four-tone level badges (业务域 / 模块 /
 * 页面 / 操作) rather than the reference's plain 菜单/接口 pair - strictly
 * more information in the same slot, not a slot for a slot's sake.
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
 * SEARCH, A LEVEL FILTER AND THE DOMAIN FILTER SHARE ONE PRUNE
 * (filterPermissionTree, in the lib, extended 2026-09-10 for 层级): 业务域
 * narrows the root array, then 层级 and a text query prune what is left
 * together, keeping every ancestor of a match so a hit stays legible inside
 * its branch. While any is active every remaining branch opens (keysDownTo
 * the deepest level) and the row chevrons stop writing to the manual expand
 * state - so clearing the filter restores exactly the fold state you had
 * before searching, not whatever you clicked while the tree was pruned.
 *
 * 角色汇聚 ON A BRANCH ROW (owner, 2026-09-10: 权限应该有继承关系，角色应该
 * 是汇聚关系 - 看不到域就看不到模块，看不到页面就看不到按钮，你的权限树
 * 组织也需要这种思路): read the other way, a domain/module/page's own
 * 授权角色 is exactly the UNION of its children's - a role can do something
 * on a page if it can do something under one of the page's operations. 编号
 * (its own column since 2026-09-10: 把 xx.xx.xx 直接作为编号) is the same
 * containment made legible as a number: a child's path is its parent's with
 * one more segment, so "05.01.01" already says "under 05, under 05.01"
 * before you read a single word.
 *
 * READ-ONLY HERE: the grants are edited on /admin/roles, one role at a time.
 * The action column carries one action a read-only page can still offer -
 * 复制权限码 - and nothing else; on a branch, which has no code of its own
 * to copy, it is the empty case every table's action column has to have.
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

/* L0-L3 (owner, 2026-09-10: 层级标签没有加上 - the compact depth pill next
   to the title, on top of the 类型 column's own tone-coded badge rather
   than instead of it; renumbered 2026-09-11 to match the owner's own
   L0 业务/L1 模块/L2 页面/L3 操作 framing). Mapped to LEVEL, not raw indent
   depth: an action hanging directly off a module (no page between) is still
   L3, the same as one three levels down - "L3" names WHAT it is, not how far
   this one particular row happened to nest. */
export const LEVEL_NUMBER: Readonly<Record<PermissionLevel, string>> = {
  domain: "L0",
  module: "L1",
  page: "L2",
  action: "L3",
};

/* One shared tone per level, for BOTH the 类型 column's badge and the L0-L3
   pill beside the title (owner, 2026-09-11: 四层的名称...不需要 tone 语气，
   需要分颜色显示 tag - four tiers, four genuinely distinct colors, chosen
   to be told apart rather than to mean anything; `neutral` is not a color
   and is never one of the four). The two badges used to diverge on `page`
   only because the 类型 column tolerated neutral there and the inline pill
   could not (it used to render identically to the 子级 tag beside it) - one
   map that never reaches for neutral satisfies both at once. */
const LEVEL_TONE = {
  domain: "brand",
  module: "info",
  page: "success",
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
  const { toast } = useToast();
  // Open to the pages by default: the shape is visible, the operations are
  // one click away each rather than a wall.
  const [expanded, setExpanded] = useState<Set<string>>(() => keysDownTo(tree, "page"));
  const [query, setQuery] = useState("");
  const [domain, setDomain] = useState("");
  // 层级筛选 (owner, 2026-09-10: 参考平台治理平面的"全部类型" - 与业务域筛选
  // 并列的第二种入口): narrows to one PermissionLevel, ancestors kept the
  // same way a text match keeps them, through the one shared prune.
  const [level, setLevel] = useState<PermissionLevel | "">("");
  const q = query.trim().toLowerCase();
  const isFiltering = q !== "" || domain !== "" || level !== "";

  /* THE TOOLBAR'S THREE NARROWING CONTROLS (owner, 2026-09-10: 参考平台治理
     平面的搜索/筛选布局), one prune: 业务域 narrows the root array first
     (it IS the tree's top level, no pruning needed for it alone); 层级 and
     a text query then prune what is left through the SAME predicate - a
     node survives if it matches both active conditions itself, or has a
     surviving child, so an ancestor of a match stays even though the
     ancestor's own level or text does not match. */
  const filtered = useMemo(() => {
    const byDomain = domain ? tree.filter((g) => g.key === domain) : tree;
    if (q === "" && level === "") return byDomain;
    return filterPermissionTree(byDomain, (n) => {
      if (level !== "" && n.level !== level) return false;
      if (q === "") return true;
      const hay = `${title(n)} ${subtitle(n)} ${n.name} ${n.permission ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree, domain, level, q]);

  /* While filtering, every branch that survived the prune opens on its own
     - there is nothing left to fold - and the chevrons stop writing to
     `expanded` (below) so the fold state a reader had before searching is
     exactly what comes back when the filter clears. */
  const rows = useMemo(
    () => flattenTree(filtered, isFiltering ? keysDownTo(filtered, "action") : expanded),
    [filtered, isFiltering, expanded],
  );
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
  /* 角色汇聚 (owner, 2026-09-10: 权限应该有继承关系，角色应该是汇聚关系 -
     看不到域就看不到模块，看不到页面就看不到按钮). Read the other way, for
     a BRANCH row: a domain/module/page's own reach is exactly the UNION of
     what its children's reach is - a page can be done by a role if some
     operation on it can. One pass over the WHOLE tree (not the filtered
     view; a branch's reach is a structural fact, not something a search
     should appear to change), permission codes collected bottom-up per
     node key, keyed once and read by every row. */
  const subtreePermissions = useMemo(() => {
    const out = new Map<string, ReadonlySet<string>>();
    const collect = (n: PermissionNode): ReadonlySet<string> => {
      if (n.level === "action") {
        const own = new Set<string>(n.permission ? [n.permission] : []);
        out.set(n.key, own);
        return own;
      }
      const union = new Set<string>();
      for (const c of n.children) for (const p of collect(c)) union.add(p);
      out.set(n.key, union);
      return union;
    };
    for (const root of tree) collect(root);
    return out;
  }, [tree]);
  /* Roles that can reach AT LEAST ONE action in a node's subtree, in
     roster order - a branch's own "授权角色". */
  const branchHolders = (node: PermissionNode): RoleColumn[] => {
    const perms = subtreePermissions.get(node.key);
    if (!perms || perms.size === 0) return [];
    return roles.filter((r) => (holds[r.code] ?? []).some((p) => perms.has(p)));
  };
  const countActions = (nodes: readonly PermissionNode[]): number =>
    nodes.reduce((sum, n) => sum + (n.level === "action" ? 1 : countActions(n.children)), 0);
  const total = countActions(tree);
  const shown = countActions(filtered);

  const toggle = (key: string) => {
    // A branch is already forced open while filtering (see `rows` above);
    // clicking it would silently rewrite `expanded` to something the reader
    // never asked for and never sees take effect until they clear the
    // filter, so the click is a no-op here rather than a surprise later.
    if (isFiltering) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  /* 复制权限码 (owner, 2026-09-10): the one thing a read-only page can still
     DO - hand a developer or support reader the exact string the service
     layer checks, for a bug report or a permission catalog. Nothing is
     written anywhere; the clipboard is the browser's, not this product's. */
  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code).then(
      () => toast({ tone: "success", title: T.codeCopied(code) }),
      () => toast({ tone: "danger", title: T.copyFailed }),
    );
  };

  return (
    <div className="gap-md flex flex-col">
      {/* THE FILTER ROW (owner, 2026-09-11: 把表格顶部的操作行换成标准的
          DS 结构，不要自造). 展开到...全部收起 不再是页面自己拼的一个
          `<div>` - FilterBar 自己就有这个位置: `scope`，其文档写的正是
          "这一屏在看哪一个切面"、"与视图切换同属'这张表长什么样'的一段，
          一起靠左"、并且排在 `count` 之后 - 与展开层级完全同一件事，不是
          "在同一份数据里少看几行"的筛选，不该再另起一行。按钮组本身不变。 */}
      <FilterBar
        count={shown === total ? T.toolbarCount(total) : T.toolbarFilteredCount(shown, total)}
        scope={
          <span className="gap-sm flex items-center">
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
          </span>
        }
        search={
          <SearchSlot>
            <Input
              type="search"
              className="w-full"
              value={query}
              placeholder={T.searchHint}
              aria-label={T.searchLabel}
              onChange={(e) => setQuery(e.target.value)}
            />
          </SearchSlot>
        }
        onReset={isFiltering ? () => { setQuery(""); setDomain(""); setLevel(""); } : undefined}
        resetLabel={T.resetFilters}
      >
        <FilterSlot width="w-[8rem]">
          <NativeSelect
            value={level}
            aria-label={T.levelFilterLabel}
            onChange={(e) => setLevel(e.target.value as PermissionLevel | "")}
          >
            <option value="">{T.filterAllLevels}</option>
            {(["domain", "module", "page", "action"] as const).map((lvl) => (
              <option key={lvl} value={lvl}>{T.levelLabel[lvl]}</option>
            ))}
          </NativeSelect>
        </FilterSlot>
        <FilterSlot width="w-[10rem]">
          <NativeSelect value={domain} aria-label={T.domainFilterLabel} onChange={(e) => setDomain(e.target.value)}>
            <option value="">{T.filterAllDomains}</option>
            {tree.map((g) => (
              <option key={g.key} value={g.key}>{title(g)}</option>
            ))}
          </NativeSelect>
        </FilterSlot>
      </FilterBar>

      {filtered.length === 0 ? (
        <p className="text-muted-foreground text-body-sm">{T.filterEmpty}</p>
      ) : (
      <div
        className={
          /* EVERY COLUMN NAMED, NOTHING LEFT TO AUTO (owner, 2026-09-10:
             列宽固定，不够可以放宽但固定；除了名称列宽一些，其他的列平分
             列宽；then: 把 xx.xx.xx 直接作为编号，列宽适当优化). 编号 is
             now the tree path itself (up to "01.01.01.01", eleven
             characters) rather than the DS's own flat `indexStart` count,
             so it gets more room than that fitting's usual 4rem. 类型 /
             来源 / 授权角色 split evenly; 操作 is ACTION_COLUMN, the
             cross-table rule's own fixed width (owner, 2026-09-06;
             编号...是高一层要求的固定列宽 no longer applies to 编号 itself,
             since this table's 编号 is no longer that fitting - see
             table-fittings.test.ts's FITTING_EXEMPTIONS). */
          "[&_table]:table-fixed " + ACTION_COLUMN
          + " [&_thead_th:nth-child(1)]:w-[6rem] [&_thead_th:nth-child(2)]:w-[20rem]"
          + " [&_thead_th:nth-child(3)]:w-[7rem] [&_thead_th:nth-child(4)]:w-[7rem]"
          + " [&_thead_th:nth-child(5)]:w-[7rem]"
        }
      >
        <DataTable
          labels={DATA_TABLE_LABELS}
          /* 去掉左侧占位列 与 把 xx.xx.xx 直接作为编号 (owner, 2026-09-10):
             neither the DS's `leadingSpacer` nor its `indexStart` fitting
             is used - a bulk-select gutter has nothing to select in a
             read-only catalogue, and a flat 1-N count would say less than
             the 编号 column below already does. table-fittings.test.ts's
             FITTING_EXEMPTIONS names this file and both fittings, with the
             reason; 操作 still applies. */
          rowActions={(r: PermissionRow) =>
            <RowActions items={r.node.permission ? [{ id: "copy", label: T.copyCode, icon: "copy", onSelect: () => copyCode(r.node.permission!) }] : []} />
          }
          rowKey={(r: PermissionRow) => r.node.key}
          rows={rows}
          columns={[
            {
              /* 编号 (owner, 2026-09-10): the row's OWN path, not a running
                 count - "05" for the fifth root, "05.01.01" for its
                 grandchild's first child. Each ancestor's ordinal among
                 ITS siblings, so the column already says how deep and
                 where among its siblings a row sits before the indent or
                 a single word of the title is read. */
              id: "path",
              header: "#",
              align: "center" as const,
              cell: (r: PermissionRow) => <span className="text-body-sm tabular-nums">{r.path}</span>,
            },
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
                      titleSuffix={
                        <span className="gap-xs flex items-center">
                          {/* L0-L3 (owner, 2026-09-10: 层级标签没有加上; then
                              用一个亮一点的背景，两个标签相近拥挤). The
                              SAME tone the 类型 column colors that level by
                              (LEVEL_TONE) - not neutral, which is what made
                              this badge and 子级 read as the same grey blob
                              at a glance - plus an explicit gap, since a
                              bare Fragment left them touching. */}
                          <Tag tone={LEVEL_TONE[n.level]}>{LEVEL_NUMBER[n.level]}</Tag>
                          {branch ? <Tag>{T.childCount(n.children.length)}</Tag> : null}
                          {/* 占位模块 (owner, 2026-09-11: 先建占位，应该有
                              自己的权限点 / 先加一个空占位模块，后续补表) -
                              a module with zero pages has no permission
                              point of its own yet; say so rather than
                              rendering an unexplained empty row. */}
                          {n.level === "module" && n.children.length === 0 ? (
                            <Tag tone="warning">{T.modulePending}</Tag>
                          ) : null}
                        </span>
                      }
                      description={subtitle(n)}
                    />
                  </span>
                );
              },
            },
            {
              id: "level",
              header: T.colLevel,
              align: "center" as const,
              cell: (r: PermissionRow) => (
                <StatusBadge tone={LEVEL_TONE[r.node.level]}>{T.levelLabel[r.node.level]}</StatusBadge>
              ),
            },
            /* 来源 (owner, 2026-09-10): every row, branch or leaf, reads
               系统预置 - the whole tree is read off authz/actions.ts, a
               source file, and nothing on this page ever writes a row into
               it. One constant Tag, not a lookup, because the fact is the
               same for all of them. */
            {
              id: "source",
              header: T.colSource,
              align: "center" as const,
              cell: () => <Tag>{T.source}</Tag>,
            },
            /* 授权角色 (owner, 2026-09-10: 只留数字，tags 模式，鼠标浮动显示
               角色列表保留；分支行读 branchHolders - 角色应该是汇聚关系，一
               个分支能被谁触达是它每个子节点能被谁触达的并集). A name list
               wraps in a narrow column and reads worse the harder it is
               forced to center; a single count badge does not have that
               problem and says the one fact a reader scanning seventy rows
               actually wants - "how many" - with the full roster one hover
               away, unchanged. Zero holders is its own warning-toned badge,
               not a hover target - there is nothing to list, on a leaf
               (nobody may perform it) or on a branch (nobody may do
               anything under it at all). */
            {
              id: "holders",
              header: T.colHolders,
              align: "center" as const,
              cell: (r: PermissionRow) => {
                const n = r.node;
                const list = n.permission ? (holders.get(n.permission) ?? []) : branchHolders(n);
                if (list.length === 0) {
                  return <StatusBadge tone="warning" dot>{T.holdersNone}</StatusBadge>;
                }
                return (
                  <HoverCard openDelay={150} closeDelay={100}>
                    <HoverCardTrigger asChild>
                      {/* 授权角色只留数字 (owner, 2026-09-10: 表述太啰嗦，
                          满屏一样的字，只留 tag「icon xx」数字) - the column
                          header already says 授权角色; repeating "个角色" on
                          every one of seventy rows said nothing "共 31" did
                          not. The hover panel keeps the full sentence -
                          that is the ONE place per row it appears, not the
                          whole screen. */}
                      <span className="inline-flex cursor-default">
                        <StatusBadge tone="brand" icon="users">{list.length}</StatusBadge>
                      </span>
                    </HoverCardTrigger>
                    <HoverCardContent align="start" className="w-auto min-w-[16rem] max-w-[28rem]">
                      <div className="gap-sm flex flex-col">
                        <span className="text-label-md font-semibold">
                          {n.permission ? T.holdersTitle(title(n), list.length) : T.holdersTitleBranch(title(n), list.length)}
                        </span>
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
      )}
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
            {/* Owner, 2026-09-10: 除了名称首列，其他全部居中. */}
            <TableHead className="w-[6.5rem] text-center">{T.colLevel}</TableHead>
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
                <TableCell className="text-center">
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
