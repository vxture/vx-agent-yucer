import { test } from "node:test";
import assert from "node:assert/strict";
import { analysePrices, type PriceAdvice } from "./price-advice";
import type { PriceEntryRecord, ProductRecord } from "../store";

const WS = "ws_1";
const product = (id: string, name: string): ProductRecord => ({
  id,
  workspaceId: WS,
  productCode: id.toUpperCase(),
  name,
  typeId: null,
  unit: "套",
  statusId: "st_active",
  sortOrder: 1,
});
const price = (
  id: string,
  productId: string,
  listPrice: number,
  floorPrice: number,
): PriceEntryRecord => ({
  id,
  workspaceId: WS,
  productId,
  currency: "CNY",
  listPrice,
  floorPrice,
  effectiveAt: new Date("2026-01-01"),
  supersedesId: null,
});

const kinds = (out: PriceAdvice[]) => out.map((a) => `${a.kind}:${a.productId}`);

test("a sellable product with no price is the first thing said", () => {
  const out = analysePrices({
    products: [product("p1", "甲"), product("p2", "乙")],
    current: [price("e2", "p2", 1000, 800)],
    allPrices: [price("e2", "p2", 1000, 800)],
    signaturesByProduct: new Map(),
  });
  assert.deepEqual(kinds(out), ["unpriced:p1"]);
});

test("a floor far from the workspace's own median is flagged with the number to use", () => {
  // Three products at 80%, one at 40% - the odd one out, measured against the
  // others rather than against a median it is half of.
  const rows = [
    price("e1", "p1", 1000, 800),
    price("e2", "p2", 2000, 1600),
    price("e3", "p3", 500, 400),
    price("e4", "p4", 1000, 400),
  ];
  const out = analysePrices({
    products: [product("p4", "偏离品")],
    current: [rows[3]!],
    allPrices: rows,
    signaturesByProduct: new Map(),
  });
  assert.deepEqual(kinds(out), ["floor_outlier:p4"]);
  assert.equal(out[0]!.suggestedFloor, 800, "the median ratio applied to this list price");
  assert.equal(out[0]!.ratioPct, 80);
});

test("a floor in line with the workspace says nothing", () => {
  const rows = [
    price("e1", "p1", 1000, 800),
    price("e2", "p2", 2000, 1600),
    price("e3", "p3", 500, 400),
    price("e4", "p4", 1000, 780),
  ];
  const out = analysePrices({
    products: [product("p4", "正常品")],
    current: [rows[3]!],
    allPrices: rows,
    signaturesByProduct: new Map(),
  });
  assert.deepEqual(kinds(out), [], "no advice is the healthy answer, not an empty state to fill");
});

test("floor equal to list is raised as a stance to confirm, not an error", () => {
  const rows = [price("e1", "p1", 1000, 1000), price("e2", "p2", 900, 700)];
  const out = analysePrices({
    products: [product("p1", "不打折")],
    current: [rows[0]!],
    allPrices: rows,
    signaturesByProduct: new Map(),
  });
  assert.deepEqual(kinds(out), ["floor_equals_list:p1"]);
});

test("a floor signed around three times is the loudest thing about that product", () => {
  const rows = [price("e1", "p1", 1000, 900), price("e2", "p2", 1000, 500)];
  const out = analysePrices({
    products: [product("p1", "常破例")],
    current: [rows[0]!],
    allPrices: rows,
    signaturesByProduct: new Map([["p1", 3]]),
  });
  assert.deepEqual(kinds(out), ["floor_overridden:p1"]);
  assert.equal(out[0]!.signatures, 3);
  // Two is a negotiation and its follow-up; three is a price.
  const twice = analysePrices({
    products: [product("p1", "常破例")],
    current: [rows[0]!],
    allPrices: rows,
    signaturesByProduct: new Map([["p1", 2]]),
  });
  assert.equal(twice.every((a) => a.kind !== "floor_overridden"), true);
});

test("advice is ordered by what blocks selling", () => {
  const rows = [
    price("e1", "p1", 1000, 1000),
    price("e2", "p2", 1000, 300),
    price("e3", "p3", 1000, 800),
    price("e4", "p4", 1000, 820),
    price("e5", "p5", 1000, 780),
  ];
  const out = analysePrices({
    products: [
      product("p1", "不打折"),
      product("p2", "偏离"),
      product("p9", "没有价"),
      product("p3", "常破例"),
    ],
    current: [rows[0]!, rows[1]!, rows[2]!],
    allPrices: rows,
    signaturesByProduct: new Map([["p3", 4]]),
  });
  assert.deepEqual(kinds(out), [
    "unpriced:p9",
    "floor_overridden:p3",
    "floor_outlier:p2",
    "floor_equals_list:p1",
  ]);
});
