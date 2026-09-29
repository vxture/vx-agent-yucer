import { test } from "node:test";
import assert from "node:assert/strict";
import {
  planProductType,
  planTypePlacement,
  planTypeRemoval,
  typeFamily,
  typeLabel,
  typesInOrder,
} from "./type-vocab";

const draft = (typeCode: string, typeNo: string, name: string) => ({ typeCode, typeNo, name, status: "active" as const });

test("trims and accepts a code, a two-digit number and a name", () => {
  const r = planProductType(draft(" software ", " 01 ", " 软件产品 "));
  assert.equal(r.ok && r.value.typeCode, "software");
  assert.equal(r.ok && r.value.typeNo, "01");
});

test("a level may carry no code (incr/0101); a blank name or a bad number refuses", () => {
  const r = planProductType(draft(" ", "01", "x"));
  assert.equal(r.ok && r.value.typeCode, null, "blank code means none, not an error");
  assert.equal(planProductType(draft("x", "01", " ")).ok, false);
  for (const no of ["1", "001", "ab", "1a", ""]) {
    const r = planProductType(draft("x", no, "x"));
    assert.equal(!r.ok && r.violations[0]!.code, "type_no_invalid", no);
  }
});

// --- two levels (incr/0100) ----------------------------------------------------

const T = [
  { id: "sw", typeCode: "software", typeNo: "01", name: "软件产品", parentId: null },
  { id: "sub", typeCode: "subscription", typeNo: "02", name: "订阅服务", parentId: null },
  { id: "basic", typeCode: "software-basic", typeNo: "01", name: "基础软件", parentId: "sw" },
  { id: "biz", typeCode: "software-business", typeNo: "02", name: "业务软件", parentId: "sw" },
];

const code = (r: ReturnType<typeof planTypePlacement>) => (!r.ok ? r.violations[0]!.code : "ok");

test("placement: the code is unique in the workspace; editing a row keeps its own; no code is never a clash", () => {
  assert.equal(code(planTypePlacement({ typeCode: null, typeNo: "09", parentId: null }, [...T, { id: "n", typeCode: null, typeNo: "08", parentId: null }])), "ok");
  assert.equal(code(planTypePlacement({ typeCode: "software", typeNo: "09", parentId: null }, T)), "type_code_taken");
  assert.equal(code(planTypePlacement({ id: "sw", typeCode: "software", typeNo: "01", parentId: null }, T)), "ok");
});

test("placement: the number is unique among siblings only - 01 once per level", () => {
  assert.equal(code(planTypePlacement({ typeCode: "x", typeNo: "01", parentId: null }, T)), "type_no_taken");
  assert.equal(code(planTypePlacement({ typeCode: "x", typeNo: "01", parentId: "sw" }, T)), "type_no_taken");
  // 01 under 订阅服务 is free: siblings, not the whole tree.
  assert.equal(code(planTypePlacement({ typeCode: "x", typeNo: "01", parentId: "sub" }, T)), "ok");
});

test("placement: two levels at most", () => {
  // A parent must be a 一级类.
  assert.equal(code(planTypePlacement({ typeCode: "x", typeNo: "01", parentId: "basic" }, T)), "type_parent_invalid");
  assert.equal(code(planTypePlacement({ typeCode: "x", typeNo: "01", parentId: "nope" }, T)), "type_parent_invalid");
  // A 一级类 with children cannot move under another.
  assert.equal(code(planTypePlacement({ id: "sw", typeCode: "software", typeNo: "05", parentId: "sub" }, T)), "type_has_children");
});

test("label: 01 / 软件产品 for a 一级类, 01-02 / 软件产品-业务软件 for a 二级类", () => {
  assert.deepEqual(typeLabel(T, "sub"), { no: "02", name: "订阅服务" });
  assert.deepEqual(typeLabel(T, "biz"), { no: "01-02", name: "软件产品-业务软件" });
  assert.equal(typeLabel(T, null), null);
  assert.equal(typeLabel(T, "gone"), null);
});

test("family: a 一级类 means itself and everything under it; a 二级类 means itself", () => {
  assert.deepEqual([...typeFamily(T, "sw")].sort(), ["basic", "biz", "sw"]);
  assert.deepEqual([...typeFamily(T, "basic")], ["basic"]);
});

test("reading order: by number, each 一级类 followed by its 二级类", () => {
  assert.deepEqual(typesInOrder([...T].reverse()).map((t) => t.id), ["sw", "basic", "biz", "sub"]);
});

test("a type deletes only when nothing carries it and nothing sits under it", () => {
  const carried = planTypeRemoval(3);
  assert.equal(!carried.ok && carried.violations[0]!.code, "type_in_use");
  const parent = planTypeRemoval(0, 2);
  assert.equal(!parent.ok && parent.violations[0]!.code, "type_has_children");
  assert.equal(planTypeRemoval(0).ok, true);
});
