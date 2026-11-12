import { test } from "node:test";
import assert from "node:assert/strict";
import { readPrerequisites, writePrerequisites } from "./plan-prerequisites";
import { emptyContent, canonical, validateContent } from "./plan-model";
import { comparePlanContents } from "./plan-state";

test("legacy assumptions survive unchanged, including whitespace and multiline evidence", () => {
  for (const text of [
    "",
    "  Board approval pending\nBudget confirmed\n",
    "@yucer/plan-prerequisites:v2\n{}",
    "@yucer/plan-prerequisites:v1\n{invalid}",
  ]) {
    assert.equal(writePrerequisites(readPrerequisites(text)), text);
  }
});

test("categorized prerequisites round trip without losing old assumptions or blank draft items", () => {
  const legacy = "Original premise\nDo not edit historical releases";
  const groups = readPrerequisites(legacy);
  groups.customers = ["Budget approved by June", ""];
  groups.products = ["New release available in Q2"];
  groups.people = ["Hire regional owner"];
  groups.services = ["Delivery capacity confirmed"];
  const encoded = writePrerequisites(groups);
  assert.deepEqual(readPrerequisites(encoded), groups);
  assert.equal(readPrerequisites(encoded).general[0], legacy);
});

test("future or malformed structured text remains readable and is never partially dropped", () => {
  for (const value of [
    null,
    [],
    { general: [] },
    { general: [], customers: [1], products: [], people: [], services: [] },
    {
      general: [],
      customers: [],
      products: [],
      people: [],
      services: [],
      extra: ["important"],
    },
  ]) {
    const text = "@yucer/plan-prerequisites:v1\n" + JSON.stringify(value);
    assert.deepEqual(readPrerequisites(text).general, [text]);
    assert.equal(writePrerequisites(readPrerequisites(text)), text);
  }
});

test("categorization is a versioned assumption edit, without modifying the original content", () => {
  const original = emptyContent(2026, [], "CNY");
  original.assumptions = "Original prerequisite";
  const snapshot = canonical(original);
  const groups = readPrerequisites(original.assumptions);
  groups.services.push("Two implementation teams available");
  const next = { ...original, assumptions: writePrerequisites(groups) };
  validateContent(next, false);
  assert.deepEqual(
    comparePlanContents(original, next).map((d) => d.section),
    ["assumptions"],
  );
  assert.equal(canonical(original), snapshot);
  assert.equal(original.assumptions, "Original prerequisite");
});
