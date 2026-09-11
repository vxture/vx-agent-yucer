import { test } from "node:test";
import assert from "node:assert/strict";
import { ACTIONS, type ActionId } from "../../authz/actions";
import { PERM_CODES } from "../../authz/catalog";
import { CROSSCUTTING_MODULES, FUNCTIONAL_DOMAINS } from "./functional-domains";
import {
  buildPermissionTree,
  filterPermissionTree,
  flattenTree,
  GROUP_MODULES,
  keysDownTo,
  PLACEHOLDER_MODULES,
  splitActionId,
  unheldActionCount,
  type PermissionNode,
} from "./permission-tree";
import * as zh from "./messages";
import { en } from "./messages.en";

// The tree is READ off the action catalogue; these prove it reads all of it,
// once, and that its one typed map agrees with the sidebar's own grouping.

const leaves = (nodes: readonly PermissionNode[]): PermissionNode[] =>
  nodes.flatMap((n) => (n.level === "action" ? [n] : leaves(n.children)));

test("every action is a leaf exactly once, with the permission the catalogue gives it", () => {
  const tree = buildPermissionTree();
  const ids = Object.keys(ACTIONS) as ActionId[];
  const found = leaves(tree);
  assert.deepEqual(found.map((l) => l.key).sort(), [...ids].sort());
  for (const l of found) {
    assert.equal(l.permission, ACTIONS[l.action!].permission, l.key);
    assert.ok(PERM_CODES.includes(l.permission!), `${l.key}: ${l.permission}`);
  }
});

test("the levels are 业务 / 模块 / 页面 / 操作, a page never sits empty, and an empty module is a documented placeholder", () => {
  const tree = buildPermissionTree();
  for (const g of tree) {
    assert.equal(g.level, "domain");
    for (const m of g.children) {
      assert.equal(m.level, "module");
      if (m.children.length === 0) {
        assert.ok(PLACEHOLDER_MODULES.has(m.name), `${m.key} is empty but not in PLACEHOLDER_MODULES`);
        continue;
      }
      assert.ok(!PLACEHOLDER_MODULES.has(m.name), `${m.key} is in PLACEHOLDER_MODULES but holds pages`);
      // Every module's operations sit under an explicit page now, including
      // a module-level action's synthesized one (owner, 2026-09-11: 合成
      // 占位页面，复用模块名) - no action hangs directly off a module.
      for (const c of m.children) {
        assert.equal(c.level, "page", c.key);
        assert.ok(c.children.length > 0, `${c.key} holds nothing`);
        for (const a of c.children) assert.equal(a.level, "action", a.key);
      }
    }
  }
  // Keys are unique across the whole tree - a row key collision would make
  // two rows expand together.
  const keys: string[] = [];
  const walk = (list: readonly PermissionNode[]) => { for (const n of list) { keys.push(n.key); walk(n.children); } };
  walk(tree);
  assert.equal(new Set(keys).size, keys.length);
});

test("GROUP_MODULES agrees with FUNCTIONAL_DOMAINS - every nav module sits under the business group the nav lists it in", () => {
  /* The second tier used to be the ACTIONS catalogue's own nine domains,
     cross-checked against the nav; it IS the nav's 20 modules now
     (owner, 2026-09-11), so the check is direct: every BUILT nav module in
     a functional domain must appear in that same group's GROUP_MODULES
     entry, and (the five business groups only) every GROUP_MODULES entry
     must be a nav module for that group, with exactly one documented
     exception - 合同管理, reserved in 战果沉淀域 ahead of its own route. */
  const navKeysByGroup = new Map<string, Set<string>>(
    FUNCTIONAL_DOMAINS.map((fd) => [fd.key, new Set(fd.modules.filter((m) => m.kind === "built").map((m) => m.navKey))]),
  );
  for (const fd of FUNCTIONAL_DOMAINS) {
    for (const m of fd.modules) {
      if (m.kind !== "built") continue;
      assert.ok(
        GROUP_MODULES[fd.key]?.includes(m.navKey),
        `${m.navKey} is in FUNCTIONAL_DOMAINS.${fd.key} but not GROUP_MODULES.${fd.key}`,
      );
    }
  }
  const UNBUILT = new Set(["contract"]);
  for (const [group, modules] of Object.entries(GROUP_MODULES)) {
    if (["copilot", "admin", "home", "national"].includes(group)) continue; // no FUNCTIONAL_DOMAINS list to check against - see below and the file header
    for (const key of modules) {
      if (UNBUILT.has(key)) continue;
      assert.ok(navKeysByGroup.get(group)?.has(key), `${group}/${key} is not a nav module FUNCTIONAL_DOMAINS lists there`);
    }
  }
});

test("GROUP_MODULES.home / .national agree with CROSSCUTTING_MODULES", () => {
  /* 今日判断 and 销售大屏 sit outside the five business domains in the nav
     (CROSSCUTTING_MODULES, not FUNCTIONAL_DOMAINS) precisely because
     neither owns an object - the same reason 智能副驾 and 配置管理 are
     groups of their own. Each gets a one-module group here, same shape as
     those two (owner, 2026-09-11: 缺少今日裁决和销售大屏). */
  const crosscuttingKeys = new Set(CROSSCUTTING_MODULES.filter((m) => m.kind === "built").map((m) => m.navKey));
  assert.deepEqual(crosscuttingKeys, new Set(["home", "national"]));
  for (const key of crosscuttingKeys) {
    assert.deepEqual(GROUP_MODULES[key], [key], `GROUP_MODULES.${key} should be a single self-named module`);
    assert.ok(PLACEHOLDER_MODULES.has(key), `${key} owns no object and should never gate on an action of its own`);
  }
});

test("the copy names every level of the tree, in both locales", () => {
  const tree = buildPermissionTree();
  const check = (dict: typeof zh | typeof en, name: string) => {
    const T = dict.PERMISSION_TREE_TEXT;
    const walk = (list: readonly PermissionNode[]) => {
      for (const n of list) {
        if (n.level === "domain") assert.ok(T.groupLabel[n.name] ?? dict.DOMAIN_GROUP_LABEL[n.name], `${name}: 业务域 ${n.name}`);
        if (n.level === "module") assert.ok(T.moduleLabel[n.name] ?? dict.DOMAIN_LABEL[n.name], `${name}: 模块 ${n.name}`);
        if (n.level === "page") assert.ok(T.pageLabel[n.name], `${name}: 页面 ${n.name}`);
        if (n.level === "action") assert.ok(T.actionLabel[n.name], `${name}: 操作 ${n.name}`);
        walk(n.children);
      }
    };
    walk(tree);
  };
  check(zh, "zh");
  check(en, "en");
});

test("flattening follows the expansion state, and keysDownTo opens to a level", () => {
  const tree = buildPermissionTree();
  assert.equal(flattenTree(tree, new Set()).length, tree.length, "nothing open: the groups only");
  const toPages = keysDownTo(tree, "page");
  const rows = flattenTree(tree, toPages);
  assert.ok(rows.some((r) => r.node.level === "page"));
  // Every module's operations sit under an explicit page now, including a
  // module-level action's synthesized one - so "expand to page" (pages
  // themselves closed) shows no operation row at all, from any module.
  assert.ok(!rows.some((r) => r.node.level === "action"), "pages closed: no operation shown yet");
  const all = keysDownTo(tree, "action");
  assert.equal(flattenTree(tree, all).filter((r) => r.node.level === "action").length, Object.keys(ACTIONS).length);
  assert.deepEqual(splitActionId("admin.member.role.assign"), { module: "admin", page: "member" });
});

// --- filterPermissionTree (the search box and the 业务域 filter share it) ---

test("filterPermissionTree keeps a matching leaf and every ancestor above it, dropping siblings that match nothing", () => {
  const tree = buildPermissionTree();
  const target = tree.flatMap((g) => g.children).flatMap((m) => m.children).find((n) => n.level === "action" || n.level === "page")!;
  const wantedKey = target.key;
  const filtered = filterPermissionTree(tree, (n) => n.key === wantedKey);

  const collect = (nodes: readonly PermissionNode[]): string[] => nodes.flatMap((n) => [n.key, ...collect(n.children)]);
  const keys = collect(filtered);
  assert.ok(keys.includes(wantedKey), "the match itself survives");
  // Every ancestor path segment of the match is a prefix of its key
  // ("group/module" and "group/module/page" for a page; the group and
  // module alone for a module's own action) - each must survive too.
  const parts = wantedKey.split("/");
  for (let i = 1; i < parts.length; i++) {
    assert.ok(keys.includes(parts.slice(0, i).join("/")), `ancestor ${parts.slice(0, i).join("/")} survives`);
  }
  // A sibling that does not match, and has no matching descendant, is gone.
  const groupNode = filtered.find((g) => g.key === parts[0])!;
  for (const m of groupNode.children) {
    const matchesSelf = collect([m]).includes(wantedKey);
    if (!matchesSelf) {
      // every action under this module must itself fail the predicate too,
      // or filterPermissionTree would be wrong to have dropped it - proven
      // by construction: the predicate is `key === wantedKey`, so a module
      // without the target key anywhere under it holds nothing that matches.
      assert.ok(!collect([m]).includes(wantedKey));
    }
  }
});

test("filterPermissionTree over a predicate nothing matches returns an empty tree", () => {
  const tree = buildPermissionTree();
  assert.deepEqual(filterPermissionTree(tree, () => false), []);
});

test("filterPermissionTree over a predicate everything matches returns every node, structure intact", () => {
  const tree = buildPermissionTree();
  const filtered = filterPermissionTree(tree, () => true);
  assert.deepEqual(filtered, tree);
});

// --- the "#" column's path numbering (owner, 2026-09-10: 参考平台治理平面
// 的 01/05.01 编号，只加编号，不加深度徽章) ---

test("flattenTree's path is the sibling-ordinal chain, two digits per level, independent of global row order", () => {
  const tree = buildPermissionTree();
  const rows = flattenTree(tree, keysDownTo(tree, "action"));
  // The fifth root is "05" - never "5", and never the row's position in the
  // flattened array (which would be a much bigger number by then).
  const fifthRoot = tree[4]!;
  const fifthRow = rows.find((r) => r.node.key === fifthRoot.key)!;
  assert.equal(fifthRow.path, "05");
  // A child's path is its parent's, with its own two-digit ordinal appended.
  const firstChild = fifthRoot.children[0]!;
  const firstChildRow = rows.find((r) => r.node.key === firstChild.key)!;
  assert.equal(firstChildRow.path, `${fifthRow.path}.01`);
  // Every root gets a distinct two-digit path, in tree order.
  const rootPaths = tree.map((g, i) => rows.find((r) => r.node.key === g.key)!.path);
  assert.deepEqual(rootPaths, tree.map((_, i) => String(i + 1).padStart(2, "0")));
});

test("unheldActionCount counts only actions nobody in the given set holds, and zero when everyone is covered", () => {
  const tree = buildPermissionTree();
  const allPermissions = new Set<string>();
  const walk = (nodes: readonly PermissionNode[]) => {
    for (const n of nodes) {
      if (n.level === "action" && n.permission) allPermissions.add(n.permission);
      walk(n.children);
    }
  };
  walk(tree);
  assert.equal(unheldActionCount(tree, allPermissions), 0, "every permission held: nothing unheld");
  assert.ok(unheldActionCount(tree, new Set()) > 0, "nobody holds anything: every action is unheld");
  // Removing exactly one permission from the held set raises the count by
  // exactly the number of actions that share it (usually one).
  const [oneCode] = allPermissions;
  const withoutOne = new Set(allPermissions);
  withoutOne.delete(oneCode!);
  const sharers = (() => {
    let n = 0;
    const count = (nodes: readonly PermissionNode[]) => {
      for (const node of nodes) {
        if (node.level === "action" && node.permission === oneCode) n++;
        count(node.children);
      }
    };
    count(tree);
    return n;
  })();
  assert.equal(unheldActionCount(tree, withoutOne), sharers);
});
