import { ACTIONS, type ActionId } from "../../authz/actions";
import type { PermCode } from "../../authz/catalog";

/* 权限策略 as a TREE - 业务域 / 模块 / 页面 / 操作 (owner, 2026-09-09;
 * renamed from 权限管理 2026-09-10: the page never creates or edits a
 * permission, so "管理" overpromised - what it shows IS the policy).
 *
 * NOTHING HERE IS TYPED IN: the tree is READ off the action catalogue. An
 * action id is `<domain>.<page>.<verb>` - `pipeline.winloss.record` - or
 * `<domain>.<verb>` for a module's own page - `campaign.view`; the domain is
 * the module, the middle token the page, the whole id the operation, and the
 * permission the operation needs is the column the roles are read against.
 * A module's own actions hang off the module directly - a page row named
 * "主页" would be a level with nothing in it but a name.
 *
 * THE ONE MAP THAT IS TYPED is which 业务域 (functional domain) an action
 * domain belongs to, and permission-tree.test.ts holds it to
 * FUNCTIONAL_DOMAINS: every built module's gate action must land in the
 * group that lists the module. 智能副驾 and 配置管理 are groups of their own -
 * the copilot owns no object and admin is a plane, so neither sits inside a
 * business group.
 */

export type PermissionLevel = "domain" | "module" | "page" | "action";

export interface PermissionNode {
  /** Unique across the tree - the path: `position`, `position/pipeline`,
   *  `position/pipeline/winloss`, and the action id for a leaf. `copilot` and
   *  `admin` are both a group and a module, which is why the path. */
  readonly key: string;
  /** What the node IS, for labels: the group key, the module, `<module>.<page>`, the action id. */
  readonly name: string;
  readonly level: PermissionLevel;
  readonly children: readonly PermissionNode[];
  /** Leaves only: what the operation needs, which is what a role holds. */
  readonly permission: PermCode | null;
  /** Leaves only. */
  readonly action: ActionId | null;
}

/** 业务域 of each action domain. The five business groups are
 *  FUNCTIONAL_DOMAINS'; the two planes are their own. */
export const ACTION_DOMAIN_GROUP: Readonly<Record<string, string>> = {
  strategy: "armory",
  catalog: "armory",
  planning: "deployment",
  campaign: "recon",
  signal: "recon",
  account: "position",
  pipeline: "position",
  delivery: "settlement",
  copilot: "copilot",
  admin: "admin",
};

/** Group order: the five business groups as the sidebar lists them, then the two planes. */
export const GROUP_ORDER: readonly string[] = [
  "armory", "deployment", "recon", "position", "settlement", "copilot", "admin",
];

/** `pipeline.winloss.record` -> { module: "pipeline", page: "winloss" };
 *  `campaign.view` -> { module: "campaign", page: null }. */
export function splitActionId(id: string): { module: string; page: string | null } {
  const parts = id.split(".");
  return { module: parts[0]!, page: parts.length > 2 ? parts[1]! : null };
}

export function buildPermissionTree(): readonly PermissionNode[] {
  const ids = Object.keys(ACTIONS) as ActionId[];
  // group -> module -> page(or "") -> actions, in catalogue order throughout.
  const groups = new Map<string, Map<string, Map<string, ActionId[]>>>();
  for (const id of ids) {
    const { module, page } = splitActionId(id);
    const group = ACTION_DOMAIN_GROUP[module];
    if (!group) throw new Error(`permission-tree: no functional domain for action domain ${module}`);
    const modules = groups.get(group) ?? new Map();
    groups.set(group, modules);
    const pages = modules.get(module) ?? new Map<string, ActionId[]>();
    modules.set(module, pages);
    const list = pages.get(page ?? "") ?? [];
    pages.set(page ?? "", list);
    list.push(id);
  }
  const leaf = (id: ActionId): PermissionNode => ({
    key: id, name: id, level: "action", children: [], permission: ACTIONS[id].permission, action: id,
  });
  return GROUP_ORDER.filter((g) => groups.has(g)).map((g) => ({
    key: g,
    name: g,
    level: "domain",
    permission: null,
    action: null,
    children: [...groups.get(g)!.entries()].map(([module, pages]) => ({
      key: `${g}/${module}`,
      name: module,
      level: "module",
      permission: null,
      action: null,
      children: [
        // The module's own operations first, then its pages.
        ...(pages.get("") ?? []).map(leaf),
        ...[...pages.entries()]
          .filter(([page]) => page !== "")
          .map(([page, actions]) => ({
            key: `${g}/${module}/${page}`,
            name: `${module}.${page}`,
            level: "page" as const,
            permission: null,
            action: null,
            children: actions.map(leaf),
          })),
      ],
    })),
  }));
}

/** The tree flattened to the rows a table shows: a node is visible when every
 *  ancestor is expanded. `depth` is what the indent reads. */
export interface PermissionRow {
  readonly node: PermissionNode;
  readonly depth: number;
  readonly expanded: boolean;
}

export function flattenTree(
  nodes: readonly PermissionNode[],
  expanded: ReadonlySet<string>,
  depth = 0,
): PermissionRow[] {
  const out: PermissionRow[] = [];
  for (const node of nodes) {
    const open = expanded.has(node.key);
    out.push({ node, depth, expanded: open });
    if (open && node.children.length > 0) out.push(...flattenTree(node.children, expanded, depth + 1));
  }
  return out;
}

/** Every key at or above a level - what "expand to 页面" means. */
export function keysDownTo(nodes: readonly PermissionNode[], level: PermissionLevel): Set<string> {
  const rank: Record<PermissionLevel, number> = { domain: 0, module: 1, page: 2, action: 3 };
  const out = new Set<string>();
  const walk = (list: readonly PermissionNode[]) => {
    for (const n of list) {
      if (rank[n.level] < rank[level] && n.children.length > 0) {
        out.add(n.key);
        walk(n.children);
      }
    }
  };
  walk(nodes);
  return out;
}

/**
 * Prune to the nodes a predicate keeps, plus every ancestor of a kept
 * descendant - the same shape PermissionTreeTable's own `prune` uses for
 * "只看可执行", generalised to any predicate. A branch survives if it
 * matches itself OR has a surviving child; nothing is mutated, a fresh
 * tree comes back with fewer children arrays.
 *
 * WHAT THIS IS FOR (owner, 2026-09-10: 参考平台治理平面的搜索/筛选布局): the
 * page's search box and its 业务域 filter both narrow the SAME full tree
 * through this one function - text search prunes by a title/code match,
 * the domain filter narrows the root array first and can be composed with
 * a text predicate on what is left.
 */
export function filterPermissionTree(
  nodes: readonly PermissionNode[],
  predicate: (node: PermissionNode) => boolean,
): PermissionNode[] {
  const out: PermissionNode[] = [];
  for (const n of nodes) {
    const children = filterPermissionTree(n.children, predicate);
    if (predicate(n) || children.length > 0) out.push({ ...n, children });
  }
  return out;
}
