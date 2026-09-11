import { ACTIONS, type ActionId } from "../../authz/actions";
import type { PermCode } from "../../authz/catalog";

/* 权限策略 as a TREE - 业务 / 模块 / 页面 / 操作 (owner, 2026-09-09; renamed
 * from 权限管理 2026-09-10: the page never creates or edits a permission,
 * so "管理" overpromised - what it shows IS the policy. Re-leveled
 * 2026-09-11: the second tier used to be the nine ACTIONS-catalogue domains
 * (strategy/catalog/planning/...); it is now the sidebar's own 20 nav
 * MODULES (`lib/functional-domains.ts`'s `FUNCTIONAL_DOMAINS`), because that
 * is the count and the grouping the owner actually reads the product by -
 * "去哪个模块" is a nav question, and the old tier answered a different one
 * (which table owns the row) that nobody standing at this page was asking).
 *
 * NOTHING HERE IS TYPED IN AT THE LEAF: the tree is still READ off the
 * action catalogue. An action id is `<domain>.<page>.<verb>` -
 * `pipeline.winloss.record` - or `<domain>.<verb>` for a domain's own
 * module-level action - `campaign.view`; `splitActionId` reads the two
 * tokens the SAME way it always did. WHAT IS TYPED, because it can no
 * longer be derived, is REGROUP: which new 模块 (and which 业务) each
 * `(domain, page)` pair now lands under - segment used to be a page of the
 * `strategy` capability partition and is now its own module in 战略武备域;
 * planning/attainment crosses all the way from `planning`'s own domain
 * (作战部署域) into 阵地经营域, because that is where 承诺达成 sits in the
 * nav (the objective is read as part of the ground it is fought over, not
 * as part of how it was set). A domain/page pair not in REGROUP is a build
 * error, not a silently-dropped row - the same contract the old
 * ACTION_DOMAIN_GROUP carried.
 *
 * EVERY MODULE HOLDS AT LEAST ONE PAGE (owner, 2026-09-11: 合成占位页面，
 * 复用模块名) - a domain's module-level actions (campaign.view, signal.view,
 * account.view, pipeline.view, copilot.ask) get a synthesized page reusing
 * the module's own name (`campaign.base`, ...) rather than hanging off the
 * module directly; a page row named after its module is not a lie the way
 * "主页" would have been.
 *
 * PLACEHOLDER MODULES (PLACEHOLDER_MODULES): five nav routes shipped ahead
 * of their own permission point (namedAccount/forecastRule/funnel/quote/
 * renewal currently read through another module's gate) plus 合同管理,
 * reserved in 战果沉淀域 with no schema yet. Both render as an empty module -
 * a row with zero pages - so the gap is a fact on the page rather than a
 * silent omission (owner, 2026-09-11: 先建占位，应该有自己的权限点 /
 * 先加一个空占位模块，后续补表).
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

/** Group order: the five business groups as the sidebar lists them, then the two planes. */
export const GROUP_ORDER: readonly string[] = [
  "armory", "deployment", "recon", "position", "settlement", "copilot", "admin",
];

/** Every 模块, in the order the sidebar's nav lists it (`FUNCTIONAL_DOMAINS`),
 *  or, for the two planes, the single module each already was. 20 modules
 *  across the five business groups (owner, 2026-09-11: 当前功能域5个，内部
 *  的就20个了) plus 合同管理, newly reserved in 战果沉淀域; 智能副驾 / 配置
 *  管理 stay one module each - neither owns an object nor appears in
 *  FUNCTIONAL_DOMAINS, so there is no nav list to promote. */
export const GROUP_MODULES: Readonly<Record<string, readonly string[]>> = {
  armory: ["strategy", "segment", "solution", "catalog", "pricebook"],
  deployment: ["namedAccount", "planning", "forecastRule"],
  recon: ["campaign", "signal", "lead", "funnel"],
  position: ["attainment", "account", "pipeline", "quote", "winLossReview"],
  settlement: ["delivery", "collection", "renewal", "contract"],
  copilot: ["copilot"],
  admin: ["admin"],
};

/** Modules with no permission point of their own yet: new nav routes that
 *  currently read through another module's `.view` gate, or (合同管理) not
 *  built at all - see the file header. */
export const PLACEHOLDER_MODULES: ReadonlySet<string> = new Set([
  "namedAccount", "forecastRule", "funnel", "quote", "renewal", "contract",
]);

/** `(domain, page)` -> the 业务/模块/页面 it now renders under. Page "" is
 *  a domain's own module-level actions, landing on a synthesized page that
 *  reuses the module's name (`<module>.base`) - see the file header. */
interface Regroup {
  readonly group: string;
  readonly module: string;
  readonly page: string;
}
const REGROUP: Readonly<Record<string, Regroup>> = {
  "strategy/plan": { group: "armory", module: "strategy", page: "strategy.plan" },
  "strategy/segment": { group: "armory", module: "segment", page: "strategy.segment" },
  "catalog/product": { group: "armory", module: "catalog", page: "catalog.product" },
  "catalog/solution": { group: "armory", module: "solution", page: "catalog.solution" },
  "catalog/pricebook": { group: "armory", module: "pricebook", page: "catalog.pricebook" },

  "planning/territory": { group: "deployment", module: "planning", page: "planning.territory" },
  "planning/target": { group: "deployment", module: "planning", page: "planning.target" },
  // Crosses out of planning's own domain into 阵地经营域 - 承诺达成 reads as
  // the outcome check on the ground, not as part of how the target was set
  // (see FUNCTIONAL_DOMAINS' own "objective before the ground" ruling).
  "planning/attainment": { group: "position", module: "attainment", page: "planning.attainment" },

  "campaign/": { group: "recon", module: "campaign", page: "campaign.base" },
  "campaign/execution": { group: "recon", module: "campaign", page: "campaign.execution" },
  "signal/": { group: "recon", module: "signal", page: "signal.base" },
  "signal/feed": { group: "recon", module: "signal", page: "signal.feed" },
  "signal/lead": { group: "recon", module: "lead", page: "signal.lead" },

  "account/": { group: "position", module: "account", page: "account.base" },
  "account/contact": { group: "position", module: "account", page: "account.contact" },
  "account/interaction": { group: "position", module: "account", page: "account.interaction" },
  "account/commitment": { group: "position", module: "account", page: "account.commitment" },
  "account/graph": { group: "position", module: "account", page: "account.graph" },
  "pipeline/": { group: "position", module: "pipeline", page: "pipeline.base" },
  "pipeline/opportunity": { group: "position", module: "pipeline", page: "pipeline.opportunity" },
  "pipeline/discount": { group: "position", module: "pipeline", page: "pipeline.discount" },
  "pipeline/forecast": { group: "position", module: "pipeline", page: "pipeline.forecast" },
  "pipeline/winloss": { group: "position", module: "winLossReview", page: "pipeline.winloss" },

  "delivery/project": { group: "settlement", module: "delivery", page: "delivery.project" },
  "delivery/milestone": { group: "settlement", module: "delivery", page: "delivery.milestone" },
  "delivery/revenue": { group: "settlement", module: "collection", page: "delivery.revenue" },

  "copilot/session": { group: "copilot", module: "copilot", page: "copilot.session" },
  "copilot/": { group: "copilot", module: "copilot", page: "copilot.base" },
  "copilot/action": { group: "copilot", module: "copilot", page: "copilot.action" },
  "copilot/autopilot": { group: "copilot", module: "copilot", page: "copilot.autopilot" },
  "copilot/playbook": { group: "copilot", module: "copilot", page: "copilot.playbook" },

  "admin/member": { group: "admin", module: "admin", page: "admin.member" },
  "admin/adoption": { group: "admin", module: "admin", page: "admin.adoption" },
  "admin/role": { group: "admin", module: "admin", page: "admin.role" },
  "admin/org": { group: "admin", module: "admin", page: "admin.org" },
};

/** `pipeline.winloss.record` -> { module: "pipeline", page: "winloss" };
 *  `campaign.view` -> { module: "campaign", page: null }. */
export function splitActionId(id: string): { module: string; page: string | null } {
  const parts = id.split(".");
  return { module: parts[0]!, page: parts.length > 2 ? parts[1]! : null };
}

export function buildPermissionTree(): readonly PermissionNode[] {
  const ids = Object.keys(ACTIONS) as ActionId[];
  // group -> module -> page -> actions, in catalogue order throughout.
  const groups = new Map<string, Map<string, Map<string, ActionId[]>>>();
  for (const id of ids) {
    const { module: domain, page } = splitActionId(id);
    const r = REGROUP[`${domain}/${page ?? ""}`];
    if (!r) throw new Error(`permission-tree: no REGROUP entry for ${domain}/${page ?? ""} (${id})`);
    const modules = groups.get(r.group) ?? new Map();
    groups.set(r.group, modules);
    const pages = modules.get(r.module) ?? new Map<string, ActionId[]>();
    modules.set(r.module, pages);
    const list = pages.get(r.page) ?? [];
    pages.set(r.page, list);
    list.push(id);
  }
  const leaf = (id: ActionId): PermissionNode => ({
    key: id, name: id, level: "action", children: [], permission: ACTIONS[id].permission, action: id,
  });
  return GROUP_ORDER.map((g) => ({
    key: g,
    name: g,
    level: "domain",
    permission: null,
    action: null,
    children: GROUP_MODULES[g]!.map((moduleKey) => {
      const pages = groups.get(g)?.get(moduleKey);
      return {
        key: `${g}/${moduleKey}`,
        name: moduleKey,
        level: "module",
        permission: null,
        action: null,
        // A placeholder module holds no pages at all - see PLACEHOLDER_MODULES.
        children: pages
          ? [...pages.entries()].map(([page, actions]) => ({
              key: `${g}/${moduleKey}/${page}`,
              name: page,
              level: "page" as const,
              permission: null,
              action: null,
              children: actions.map(leaf),
            }))
          : [],
      };
    }),
  }));
}

/** The tree flattened to the rows a table shows: a node is visible when every
 *  ancestor is expanded. `depth` is what the indent reads. */
export interface PermissionRow {
  readonly node: PermissionNode;
  readonly depth: number;
  readonly expanded: boolean;
  /**
   * The row's position as its ancestors' sibling-ordinals, two digits each,
   * joined by "." - "05" for the fifth root, "05.01" for its first child
   * (owner, 2026-09-10: 参考平台治理平面的编号方式 - the sequence in the
   * shared "#" column). A SECOND, independent way to read the tree's shape
   * besides the indent: the indent says how deep, the path says where among
   * its siblings, at every level at once.
   */
  readonly path: string;
}

export function flattenTree(
  nodes: readonly PermissionNode[],
  expanded: ReadonlySet<string>,
  depth = 0,
  pathPrefix: readonly string[] = [],
): PermissionRow[] {
  const out: PermissionRow[] = [];
  nodes.forEach((node, i) => {
    const path = [...pathPrefix, String(i + 1).padStart(2, "0")];
    const open = expanded.has(node.key);
    out.push({ node, depth, expanded: open, path: path.join(".") });
    if (open && node.children.length > 0) out.push(...flattenTree(node.children, expanded, depth + 1, path));
  });
  return out;
}

/**
 * How many operations no role (among the ones given) may perform - a node
 * whose permission nobody holds. `heldPermissions` is the union of every
 * role's grants; the caller decides whose (owner, 2026-09-10: 参考平台治理
 * 平面"未绑定"的提示 - our analogue, since nothing here is ever disabled or
 * unbound from its definition: what CAN go to zero is who may act on it).
 */
export function unheldActionCount(
  tree: readonly PermissionNode[],
  // A plain string set, not ReadonlySet<PermCode>: the caller's source is a
  // role's stored grants (persisted as text), narrower than PermCode is not
  // guaranteed there and is not needed here - membership only ever reads a
  // PermCode against it, which a wider string set already answers correctly.
  heldPermissions: ReadonlySet<string>,
): number {
  let n = 0;
  const walk = (nodes: readonly PermissionNode[]) => {
    for (const node of nodes) {
      if (node.level === "action" && node.permission && !heldPermissions.has(node.permission)) n++;
      walk(node.children);
    }
  };
  walk(tree);
  return n;
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
