import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  DEFAULT_ORG_KINDS,
  ORG_KIND_CODE_SHAPE,
  ORG_TEMPLATES,
  ORG_UNIT_CODE_SHAPE,
  defaultOrgTemplate,
  effectiveTerritoryIds,
  planOrgUnit,
  reaches,
  subtreeIds,
  type KnownOrgUnit,
  type OrgUnitDraft,
} from "./org";

/* The shipped organisation exists in TWO places and they must agree exactly:
 * incr/0051, which every real database is seeded from, and org.ts, which the
 * in-memory store the demo runs on is seeded from. The SQL is the authority;
 * these tests read it.
 */

const ROOT = join(import.meta.dirname, "..", "..", "..", "..", "..", "..");
const SQL = readFileSync(join(ROOT, "deploy/database/ddl/incr/0051_org_structure.sql"), "utf8");

test("the five kinds match the ones the SQL seeds, in order", () => {
  const block = SQL.slice(SQL.indexOf("CROSS JOIN (VALUES"), SQL.indexOf("AS v(code, name, ord)"));
  const rows = [...block.matchAll(/\('([a-z_]+)',\s*'([^']+)',\s*(\d+)\)/g)].map((m) => ({ code: m[1]!, name: m[2]! }));
  assert.equal(rows.length, 5, "总部 事业部 大区 分公司 团队");
  assert.deepEqual(rows, [...DEFAULT_ORG_KINDS]);
  for (const k of rows) assert.match(k.code, ORG_KIND_CODE_SHAPE);
});

test("the three templates match the ones the SQL seeds, unit for unit", () => {
  const head = SQL.slice(SQL.indexOf("INSERT INTO yucer_ref.org_template ("), SQL.indexOf("ON CONFLICT (template_key)"));
  const templates = [...head.matchAll(/\('([a-z_]+)',\s*'([^']+)',\s*'([^']+)',\s*(true|false),\s*(\d+)\)/g)].map((m) => ({
    key: m[1]!, name: m[2]!, description: m[3]!, isDefault: m[4] === "true", sortOrder: Number(m[5]),
  }));
  assert.equal(templates.length, 3, "集团型 / 中规模 / 小规模");
  assert.deepEqual(templates.map((t) => t.sortOrder), [1, 2, 3]);
  assert.deepEqual(
    templates.map(({ key, name, description, isDefault }) => ({ key, name, description, isDefault })),
    ORG_TEMPLATES.map(({ key, name, description, isDefault }) => ({ key, name, description, isDefault })),
  );

  // The unit block is written twice (insert, then link); the first is enough.
  const start = SQL.indexOf("INSERT INTO yucer_ref.org_template_unit");
  const block = SQL.slice(start, SQL.indexOf("AS v(template_key, code, parent_code, kind, name, ord)", start));
  const units = [...block.matchAll(/\('([a-z_]+)',\s*'([a-z0-9_]+)',\s*(NULL|'[a-z0-9_]+'),\s*'([a-z]+)',\s*'([^']+)',\s*(\d+)\)/g)].map((m) => ({
    template: m[1]!, code: m[2]!, parent: m[3] === "NULL" ? null : m[3]!.slice(1, -1), kind: m[4]!, name: m[5]!, ord: Number(m[6]),
  }));
  assert.equal(units.length, 21 + 15 + 4);
  for (const t of ORG_TEMPLATES) {
    const mine = units.filter((u) => u.template === t.key);
    assert.deepEqual(mine.map((u) => u.ord), mine.map((_, i) => i + 1), `${t.key}: dense order`);
    assert.deepEqual(
      mine.map(({ code, parent, kind, name }) => ({ code, parent, kind, name })),
      [...t.units],
      `${t.key}: units`,
    );
  }
});

test("every template is a tree in tree order, in the shipped kinds, with valid codes", () => {
  const kinds = new Set(DEFAULT_ORG_KINDS.map((k) => k.code));
  for (const t of ORG_TEMPLATES) {
    const seen = new Set<string>();
    let roots = 0;
    for (const u of t.units) {
      assert.match(u.code, ORG_UNIT_CODE_SHAPE, `${t.key}/${u.code}`);
      assert.ok(!seen.has(u.code), `${t.key}/${u.code} twice`);
      assert.ok(kinds.has(u.kind), `${t.key}/${u.code}: kind ${u.kind}`);
      if (u.parent === null) roots += 1;
      else assert.ok(seen.has(u.parent), `${t.key}/${u.code}: parent ${u.parent} must precede it`);
      seen.add(u.code);
    }
    assert.equal(roots, 1, `${t.key}: one root`);
  }
});

test("the default is 中规模全国公司: 总部 -> 大区 -> 团队, seven regions", () => {
  const d = defaultOrgTemplate();
  assert.equal(d.key, "national_medium");
  assert.equal(ORG_TEMPLATES.filter((t) => t.isDefault).length, 1);
  const regions = d.units.filter((u) => u.kind === "region");
  assert.equal(regions.length, 7);
  assert.deepEqual(new Set(d.units.map((u) => u.kind)), new Set(["headquarters", "region", "team"]));
  // Three levels: every team hangs on a region, every region on the hq.
  const byCode = new Map(d.units.map((u) => [u.code, u]));
  for (const u of d.units) {
    if (u.kind === "team") assert.equal(byCode.get(u.parent!)?.kind, "region");
    if (u.kind === "region") assert.equal(byCode.get(u.parent!)?.kind, "headquarters");
  }
});

// --- planOrgUnit --------------------------------------------------------------

const KINDS = new Set(["k_hq", "k_team"]);
const existing: KnownOrgUnit[] = [
  { id: "u1", unitCode: "hq", parentId: null },
  { id: "u2", unitCode: "north", parentId: "u1" },
  { id: "u3", unitCode: "north_team1", parentId: "u2" },
];
const draft: OrgUnitDraft = { unitCode: "south", name: "华南大区", parentId: "u1", kindId: "k_team", leaderSub: null };

test("a valid unit passes, trimmed", () => {
  const r = planOrgUnit({ ...draft, unitCode: " south ", name: " 华南大区 ", leaderSub: "  " }, existing, KINDS);
  assert.ok(r.ok);
  assert.deepEqual(r.value, { ...draft, leaderSub: null });
});

test("the code is required and shaped; the name is required; the kind is the workspace's", () => {
  const code = (input: Partial<typeof draft>) => {
    const r = planOrgUnit({ ...draft, ...input }, existing, KINDS);
    return r.ok ? "ok" : r.violations[0]!.code;
  };
  assert.equal(code({ unitCode: "" }), "code_required");
  assert.equal(code({ unitCode: "South" }), "code_shape");
  assert.equal(code({ unitCode: "1south" }), "code_shape");
  assert.equal(code({ name: " " }), "name_required");
  assert.equal(code({ kindId: "k_nope" }), "kind_unknown");
});

test("the parent must exist and may not close a cycle", () => {
  const code = (input: Partial<typeof draft>) => {
    const r = planOrgUnit({ ...draft, ...input }, existing, KINDS);
    return r.ok ? "ok" : r.violations[0]!.code;
  };
  assert.equal(code({ parentId: "u9" }), "parent_not_found");
  // Editing `north` (u2): under itself, or under its own child.
  assert.equal(code({ unitCode: "north", parentId: "u2" }), "parent_cycle");
  assert.equal(code({ unitCode: "north", parentId: "u3" }), "parent_cycle");
  // Under the root is fine; so is moving the root under nothing.
  assert.equal(code({ unitCode: "north", parentId: "u1" }), "ok");
  assert.equal(code({ unitCode: "hq", parentId: null }), "ok");
});

test("reaches walks up; subtreeIds walks down, in tree order", () => {
  assert.equal(reaches(existing, "u3", "u1"), true);
  assert.equal(reaches(existing, "u1", "u3"), false);
  assert.deepEqual(subtreeIds(existing, "u1"), ["u1", "u2", "u3"]);
  assert.deepEqual(subtreeIds(existing, "u2"), ["u2", "u3"]);
  assert.deepEqual(subtreeIds(existing, "u3"), ["u3"]);
});

test("effectiveTerritoryIds: a unit's own subtree wins; a bare leaf inherits the nearest ancestor's", () => {
  // u1 (hq) -> u2 (north, 大区, holds t1) -> u3 (north_team1, leaf, nothing
  // of its own).
  const territories = [{ id: "t1", unitIds: ["u2"] }];
  // u2 works its own territory directly - not inherited.
  assert.deepEqual(effectiveTerritoryIds(existing, territories, "u2"), { territoryIds: ["t1"], inheritedFrom: null });
  // u3 has nothing of its own subtree (itself, no children) - it inherits u2's.
  assert.deepEqual(effectiveTerritoryIds(existing, territories, "u3"), { territoryIds: ["t1"], inheritedFrom: "u2" });
  // u1's own SUBTREE aggregate already reaches t1 through u2 - its own, not inherited.
  assert.deepEqual(effectiveTerritoryIds(existing, territories, "u1"), { territoryIds: ["t1"], inheritedFrom: null });
});

test("effectiveTerritoryIds walks past an empty ancestor to a further one, and gives up at the root", () => {
  // u1 (hq) -> u2 (north, holds t1); u1 -> u5 (a second, territory-less
  // branch) -> u6 (leaf under it). u5's own subtree is empty, so it walks
  // past itself to u1, whose subtree DOES reach t1 through u2.
  const withBranch: KnownOrgUnit[] = [
    ...existing,
    { id: "u5", unitCode: "south", parentId: "u1" },
    { id: "u6", unitCode: "south_team1", parentId: "u5" },
  ];
  const territories = [{ id: "t1", unitIds: ["u2"] }];
  assert.deepEqual(effectiveTerritoryIds(withBranch, territories, "u5"), { territoryIds: ["t1"], inheritedFrom: "u1" });
  assert.deepEqual(effectiveTerritoryIds(withBranch, territories, "u6"), { territoryIds: ["t1"], inheritedFrom: "u1" });
  // A unit with nothing anywhere in its own subtree OR its ancestor chain -
  // genuinely unauthorized, the one state inheritance must not paper over.
  const isolated: KnownOrgUnit[] = [...existing, { id: "u4", unitCode: "orphan", parentId: null }];
  assert.deepEqual(effectiveTerritoryIds(isolated, territories, "u4"), { territoryIds: [], inheritedFrom: null });
});
