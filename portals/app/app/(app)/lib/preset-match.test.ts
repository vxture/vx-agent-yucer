import { test } from "node:test";
import assert from "node:assert/strict";
import { matchPreset } from "./preset-match";

// The owner's case, as a fixture: both national carves ship CHINA-EAST.
const five = { key: "five", from: "五分法", code: "CHINA-EAST", name: "东部", members: ["山东省", "江苏省", "上海市", "浙江省", "福建省", "台湾省"] };
const seven = { key: "seven", from: "七分法", code: "CHINA-EAST", name: "华东", members: ["上海市", "江苏省", "浙江省", "安徽省", "福建省", "江西省", "山东省", "台湾省"] };
const north = { key: "five", from: "五分法", code: "CHINA-NORTH", name: "北部", members: ["北京市"] };
const PRESETS = [five, seven, north];

test("a code held by two carves is never resolved alone - it asks, with the name match pre-checked", () => {
  // 2026-09-09: code-only matching took the first CHINA-EAST and removed
  // two provinces from a 七分法 华东 that had never been 五分法's. Now both
  // carves are offered, and the one whose name matches is only PREFERRED.
  const m = matchPreset(PRESETS, "CHINA-EAST", "华东");
  assert.equal(m.kind, "ambiguous");
  assert.deepEqual(m.kind === "ambiguous" && m.candidates.map((c) => c.key), ["five", "seven"]);
  assert.equal(m.kind === "ambiguous" && m.preferred?.key, "seven");
  const f = matchPreset(PRESETS, "CHINA-EAST", "东部");
  assert.equal(f.kind === "ambiguous" && f.preferred?.key, "five");
  // A renamed region: still both, nothing pre-checked.
  const r = matchPreset(PRESETS, "CHINA-EAST", "东部大区");
  assert.equal(r.kind === "ambiguous" && r.preferred, null);
});

test("a code in exactly one carve matches regardless of the name", () => {
  const m = matchPreset(PRESETS, "CHINA-NORTH", "我的北方");
  assert.equal(m.kind === "one" && m.preset.key, "five");
});

test("a code in no carve has nothing to reset to", () => {
  assert.deepEqual(matchPreset(PRESETS, "CHINA-XINJIANG", "新疆基地"), { kind: "none" });
});
