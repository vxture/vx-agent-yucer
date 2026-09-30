import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_STAGE_DEFINITIONS,
  isStageOrderSound,
  normalizeStageOrder,
  planStageRemoval,
  stageRoles,
} from "./stage-vocab";

const row = (id: string, sortOrder: number, isTerminal = false, isWon = false) => ({ id, sortOrder, isTerminal, isWon });

test("the line has a start, process stages and ends - derived from the order and the flags", () => {
  const roles = stageRoles(DEFAULT_STAGE_DEFINITIONS);
  assert.deepEqual(roles, ["start", "process", "process", "process", "process", "won", "lost"]);
});

test("the start is the FIRST open stage by order, not the first row given", () => {
  const rows = [row("b", 2), row("a", 1), row("won", 9, true, true)];
  assert.deepEqual(stageRoles(rows), ["process", "start", "won"]);
});

test("a catalog with no open stage has no start", () => {
  assert.deepEqual(stageRoles([row("won", 1, true, true), row("lost", 2, true)]), ["won", "lost"]);
});

test("sound means every end comes after every process stage; ties are not sound", () => {
  assert.equal(isStageOrderSound([row("a", 1), row("b", 2), row("won", 3, true, true)]), true);
  // A stage appended after 丢单 - the state the old append-at-tail produced.
  assert.equal(isStageOrderSound([row("a", 1), row("won", 2, true, true), row("new", 3)]), false);
  // An end moved into the middle.
  assert.equal(isStageOrderSound([row("a", 1), row("won", 2, true, true), row("b", 3), row("lost", 4, true)]), false);
  // The DDL default of 0 on every row says nothing about order.
  assert.equal(isStageOrderSound([row("a", 0), row("won", 0, true, true)]), false);
  assert.equal(isStageOrderSound([row("a", 1), row("b", 2)]), true, "no ends: nothing to be out of order with");
});

test("normalising puts the ends last and keeps each group's own order", () => {
  const order = normalizeStageOrder([row("a", 1), row("won", 2, true, true), row("new", 3), row("lost", 4, true), row("b", 0)]);
  assert.deepEqual(order.map((o) => o.id), ["b", "a", "new", "won", "lost"]);
  assert.deepEqual(order.map((o) => o.sortOrder), [1, 2, 3, 4, 5]);
  assert.equal(isStageOrderSound([row("b", 1), row("a", 2), row("new", 3), row("won", 4, true, true), row("lost", 5, true)]), true);
});

test("the last process stage cannot be removed - a pipeline needs its start", () => {
  const catalog = [
    { code: "a", name: "A", sortOrder: 1, defaultProbability: 10, isWon: false, isTerminal: false },
    { code: "won", name: "W", sortOrder: 2, defaultProbability: 100, isWon: true, isTerminal: true },
    { code: "lost", name: "L", sortOrder: 3, defaultProbability: 0, isWon: false, isTerminal: true },
  ];
  const r = planStageRemoval(0, catalog[0]!, catalog);
  assert.equal(!r.ok && r.violations[0]!.code, "last_open_stage");
  // With a second process stage it may go.
  const two = [{ ...catalog[0]! }, { code: "b", name: "B", sortOrder: 2, defaultProbability: 20, isWon: false, isTerminal: false }, catalog[1]!, catalog[2]!];
  assert.equal(planStageRemoval(0, two[0]!, two).ok, true);
});
