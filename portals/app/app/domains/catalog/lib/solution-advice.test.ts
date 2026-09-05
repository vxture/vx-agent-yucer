import { test } from "node:test";
import assert from "node:assert/strict";
import { analyseSolutions } from "./solution-advice";
import type { ProductRecord, SolutionItemRecord, SolutionRecord } from "../store";

const WS = "ws_1";
const ON_SALE = "st_active";

const product = (id: string, name: string, statusId = ON_SALE): ProductRecord => ({
  id, workspaceId: WS, productCode: id.toUpperCase(), name,
  typeId: null, unit: "套", statusId, sortOrder: 1,
});
const solution = (id: string, name: string, over: Partial<SolutionRecord> = {}): SolutionRecord => ({
  id, workspaceId: WS, solutionCode: id.toUpperCase(), name,
  summary: null, scenario: "某种场景", status: "active", sortOrder: 1, ...over,
});
const item = (solutionId: string, productId: string): SolutionItemRecord => ({
  id: `${solutionId}-${productId}`, workspaceId: WS, solutionId, productId,
  quantity: 1, optional: false, note: null,
});
const kinds = (out: ReturnType<typeof analyseSolutions>) => out.map((a) => a.kind);

test("a bundle quoting a product that is no longer sold is the loudest thing", () => {
  const out = analyseSolutions({
    solutions: [{ solution: solution("s1", "方案一"), items: [item("s1", "p1")] }],
    products: [product("p1", "退役品", "st_retired")],
    onSaleStatusId: ON_SALE,
    prices: [{ productId: "p1" }],
  });
  assert.deepEqual(kinds(out), ["retired_product"]);
});

test("a bundle whose product has no price cannot be quoted from", () => {
  const out = analyseSolutions({
    solutions: [{ solution: solution("s1", "方案一"), items: [item("s1", "p1")] }],
    products: [product("p1", "无价品")],
    onSaleStatusId: ON_SALE,
    prices: [],
  });
  assert.deepEqual(kinds(out), ["unpriced_product"]);
});

test("a solution with no scenario is a bundle, and says so", () => {
  const out = analyseSolutions({
    solutions: [{ solution: solution("s1", "方案一", { scenario: null }), items: [item("s1", "p1")] }],
    products: [product("p1", "甲")],
    onSaleStatusId: ON_SALE,
    prices: [{ productId: "p1" }],
  });
  assert.deepEqual(kinds(out), ["no_scenario"]);
});

test("an on-sale product no solution sells is named - the other direction", () => {
  const out = analyseSolutions({
    solutions: [{ solution: solution("s1", "方案一"), items: [item("s1", "p1")] }],
    products: [product("p1", "在方案里"), product("p2", "没人卖")],
    onSaleStatusId: ON_SALE,
    prices: [{ productId: "p1" }, { productId: "p2" }],
  });
  assert.deepEqual(kinds(out), ["product_uncovered"]);
  assert.equal(out[0]!.productName, "没人卖");
});

test("a retired solution is left alone - it records how something used to be sold", () => {
  const out = analyseSolutions({
    solutions: [
      {
        solution: solution("s1", "旧方案", { status: "retired", scenario: null }),
        items: [item("s1", "p1")],
      },
    ],
    products: [product("p1", "退役品", "st_retired")],
    onSaleStatusId: ON_SALE,
    prices: [],
  });
  assert.deepEqual(kinds(out), [], "nothing to fix in a template nobody quotes from");
});

test("a healthy solution set says nothing at all", () => {
  const out = analyseSolutions({
    solutions: [{ solution: solution("s1", "方案一"), items: [item("s1", "p1")] }],
    products: [product("p1", "甲")],
    onSaleStatusId: ON_SALE,
    prices: [{ productId: "p1" }],
  });
  assert.deepEqual(out, []);
});
