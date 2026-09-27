import { test } from "node:test";
import assert from "node:assert/strict";
import { filterAccounts, healthBand } from "./account-list-filter";

const rows = [
  { id: "a1", name: "华东零售集团", accountNo: "ACC-0001", industry: "零售", healthScore: 27 },
  { id: "a2", name: "长江物流", accountNo: "ACC-0002", industry: "物流", healthScore: 82 },
  { id: "a3", name: "西部能源装备", accountNo: "ACC-0003", industry: null, healthScore: null },
];
const levels = new Map([
  ["a1", { name: "战略级" }],
  ["a2", { name: "普通级" }],
]);
const none = { query: "", level: "", health: "" } as const;

test("healthBand uses the 70 / 40 lines, and no score is its own band", () => {
  assert.deepEqual([healthBand(70), healthBand(69), healthBand(40), healthBand(39), healthBand(null)], ["good", "warn", "warn", "bad", "unscored"]);
});

test("filterAccounts: query over name / number / industry, level, health - combined", () => {
  assert.equal(filterAccounts(rows, none).length, 3);
  assert.deepEqual(filterAccounts(rows, { ...none, query: "acc-0002" }).map((r) => r.id), ["a2"]);
  assert.deepEqual(filterAccounts(rows, { ...none, query: "零售" }).map((r) => r.id), ["a1"]);
  assert.deepEqual(filterAccounts(rows, { ...none, level: "战略级" }, levels).map((r) => r.id), ["a1"]);
  assert.deepEqual(filterAccounts(rows, { ...none, health: "unscored" }).map((r) => r.id), ["a3"]);
  assert.deepEqual(filterAccounts(rows, { ...none, level: "普通级", health: "bad" }, levels), []);
});
