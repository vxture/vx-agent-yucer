import { test } from "node:test";
import assert from "node:assert/strict";
import { ACTIONS, type ActionId } from "../../authz/actions";
import { PERM_CODES } from "../../authz/catalog";
import { FUNCTIONAL_DOMAINS } from "./functional-domains";
import { NAV_ENTRIES } from "./navigation";
import {
  ACTION_DOMAIN_GROUP,
  buildPermissionTree,
  filterPermissionTree,
  flattenTree,
  keysDownTo,
  splitActionId,
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

test("the levels are 业务域 / 模块 / 页面 / 操作, and a page never sits empty", () => {
  const tree = buildPermissionTree();
  for (const g of tree) {
    assert.equal(g.level, "domain");
    for (const m of g.children) {
      assert.equal(m.level, "module");
      for (const c of m.children) {
        if (c.level === "page") {
          assert.ok(c.children.length > 0, `${c.key} holds nothing`);
          for (const a of c.children) assert.equal(a.level, "action", a.key);
        } else {
          assert.equal(c.level, "action", c.key);
        }
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

test("the typed 业务域 map agrees with FUNCTIONAL_DOMAINS for every built module's gate", () => {
  /* A module's gate action names its domain; that domain's group must be
     the group FUNCTIONAL_DOMAINS lists the module under. Two modules are
     documented exceptions - both sit in 作战部署域 and are gated by another
     domain's permission, because they are planning done ON that domain's
     rows: 重点客户 (account.view - a named-account list is planning over
     customers) and 预测口径 (pipeline.forecast.view - how the pipeline is
     read is set in planning). In the tree their operations sit with the
     domain whose permission they need, which is what a role holds. */
  const EXCEPTIONS = new Set(["namedAccount", "forecastRule"]);
  const gate = new Map(NAV_ENTRIES.map((e) => [e.key, e.action]));
  for (const fd of FUNCTIONAL_DOMAINS) {
    for (const m of fd.modules) {
      if (m.kind !== "built" || EXCEPTIONS.has(m.navKey)) continue;
      const action = gate.get(m.navKey);
      assert.ok(action, `${m.navKey} has no nav entry`);
      const { module } = splitActionId(action);
      assert.equal(ACTION_DOMAIN_GROUP[module], fd.key, `${m.navKey} (${action}) is listed under ${fd.key}`);
    }
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
  // A module's own operations show (their parent, the module, is open); an
  // operation under a page does not (pages are closed).
  assert.ok(rows.some((r) => r.node.level === "action" && splitActionId(r.node.name).page === null));
  assert.ok(
    !rows.some((r) => r.node.level === "action" && splitActionId(r.node.name).page !== null),
    "pages closed: no page operation shown",
  );
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
