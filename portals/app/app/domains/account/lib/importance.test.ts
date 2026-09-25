import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { accountLevelOf, medalOf, opportunityLevelOf, priorityOf, type ImportanceLevel, type PriorityRule } from "./importance";
import { DEFAULT_IMPORTANCE_LEVELS, DEFAULT_PRIORITY_MATRIX } from "./importance-vocab";

const levels: ImportanceLevel[] = DEFAULT_IMPORTANCE_LEVELS.map((l, i) => ({ ...l, id: `lv${i}`, sortOrder: l.rank }));
const byCode = (c: string) => levels.find((l) => l.levelCode === c)!;
const rules: PriorityRule[] = DEFAULT_PRIORITY_MATRIX.map(([a, o, p]) => ({
  accountLevelId: byCode(a).id,
  opportunityLevelId: byCode(o).id,
  priority: p,
}));

test("the nine cells of R11", () => {
  const p = (a: string, o: string) => priorityOf(byCode(a), byCode(o), rules);
  assert.deepEqual([p("strategic", "core"), p("strategic", "major"), p("strategic", "normal")], [1, 2, 4]);
  assert.deepEqual([p("key", "core"), p("key", "major"), p("key", "normal")], [2, 3, 5]);
  assert.deepEqual([p("standard", "core"), p("standard", "major"), p("standard", "normal")], [3, 5, 6]);
});

test("a missing cell is null - never guessed from its neighbours", () => {
  const fourth: ImportanceLevel = { ...byCode("normal"), id: "lv_extra", levelCode: "minor", rank: 4, isDefault: false };
  assert.equal(priorityOf(byCode("strategic"), fourth, rules), null);
  assert.equal(priorityOf(null, byCode("core"), rules), null);
});

test("levels resolve from the row id, else the legacy code / the axis default", () => {
  assert.equal(accountLevelOf({ tierLevelId: byCode("key").id, tier: "standard" }, levels)?.levelCode, "key");
  assert.equal(accountLevelOf({ tierLevelId: null, tier: "strategic" }, levels)?.levelCode, "strategic");
  assert.equal(opportunityLevelOf({ importanceLevelId: null }, levels)?.levelCode, "normal");
  assert.equal(opportunityLevelOf({ importanceLevelId: byCode("core").id }, levels)?.levelCode, "core");
});

test("medals follow rank, not name", () => {
  assert.deepEqual([1, 2, 3, 4].map(medalOf), ["gold", "silver", "bronze", "bronze"]);
});

test("the code seed and incr/0090's seed are the same rows", () => {
  const sql = readFileSync(join(process.cwd(), "..", "..", "deploy/database/ddl/incr/0090_importance_and_priority.sql"), "utf8");
  const lv = [...sql.matchAll(/\('(account|opportunity)',\s*'(\w+)',\s*'([^']+)',\s*'([^']+)',\s*(\d),\s*(TRUE|FALSE)\)/g)].map((m) => [
    m[1], m[2], m[3], m[4], Number(m[5]), m[6] === "TRUE",
  ]);
  assert.deepEqual(lv, DEFAULT_IMPORTANCE_LEVELS.map((l) => [l.subject, l.levelCode, l.name, l.description, l.rank, l.isDefault]));
  const mx = [...sql.matchAll(/\('(\w+)',\s*'(core|major|normal)',\s*(\d)\)/g)].map((m) => [m[1], m[2], Number(m[3])]);
  assert.deepEqual(mx, DEFAULT_PRIORITY_MATRIX.map((r) => [...r]));
});
