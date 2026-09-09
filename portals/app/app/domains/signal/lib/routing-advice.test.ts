import { test } from "node:test";
import assert from "node:assert/strict";
import { analyseRouting } from "./routing-advice";
import type { RoutingStatRow } from "./routing-stats";

const row = (over: Partial<RoutingStatRow> = {}): RoutingStatRow => ({
  currentOwner: "usr_a",
  suggestedOwner: "usr_a",
  unroutableReason: null,
  region: "华东",
  ...over,
});

const blocked = (reason: string, owner: string | null = null): RoutingStatRow =>
  row({ unroutableReason: reason, suggestedOwner: null, currentOwner: owner, region: null });

const kinds = (rows: readonly RoutingStatRow[]) => analyseRouting(rows).map((a) => a.kind);

test("a queue that is entirely settled says nothing", () => {
  assert.deepEqual(analyseRouting([row(), row()]), []);
});

test("leads waiting on an apply are reported with their count", () => {
  const found = analyseRouting([row({ suggestedOwner: "usr_b" }), row()]);
  assert.equal(found[0].kind, "pending_assignments");
  assert.equal(found[0].count, 1);
});

// --- the map's holes ---------------------------------------------------------

test("each blocking reason is its own finding - they are three different jobs", () => {
  const found = kinds([
    blocked("no_region"),
    blocked("no_territory"),
    blocked("no_owner"),
  ]);
  assert.deepEqual(found, ["no_region", "no_territory", "no_owner"]);
});

test("the holes are ordered by how early they break the rule, not by size", () => {
  // Five ownerless would top a count-ordered list; no_region still comes
  // first, because a lead with no region never reaches the map at all.
  const found = kinds([
    blocked("no_owner"),
    blocked("no_owner"),
    blocked("no_owner"),
    blocked("no_owner"),
    blocked("no_owner"),
    blocked("no_region"),
  ]);
  assert.deepEqual(found, ["no_region", "no_owner"]);
});

test("a reason nobody hit is not reported", () => {
  assert.deepEqual(kinds([blocked("no_region")]), ["no_region"]);
});

// --- the load reading --------------------------------------------------------

const held = (sub: string, n: number) =>
  Array.from({ length: n }, () => row({ currentOwner: sub, suggestedOwner: sub }));

test("one person left carrying most of the queue is named, with their share", () => {
  const found = analyseRouting([...held("usr_a", 5), ...held("usr_b", 1)]);
  const load = found.find((a) => a.kind === "load_imbalance")!;
  assert.equal(load.sub, "usr_a");
  assert.equal(load.count, 5);
  assert.equal(load.share, 83);
});

test("it reads where the page would LEAVE things, not where it found them", () => {
  // usr_a holds everything now and the page already proposes to spread it.
  // Reporting the current pile-up would send somebody to solve a solved
  // problem.
  const rows = [
    ...Array.from({ length: 3 }, () => row({ currentOwner: "usr_a", suggestedOwner: "usr_b" })),
    ...Array.from({ length: 3 }, () => row({ currentOwner: "usr_a", suggestedOwner: "usr_a" })),
  ];
  assert.ok(!kinds(rows).includes("load_imbalance"));
});

test("one owner alone is not an imbalance - a sole territory owner holds all of it", () => {
  assert.ok(!kinds(held("usr_a", 9)).includes("load_imbalance"));
});

test("too few leads to judge stays quiet", () => {
  // 2 of 3 is 67% and would clear the threshold; three leads is not evidence
  // of how a queue distributes.
  assert.ok(!kinds([...held("usr_a", 2), ...held("usr_b", 1)]).includes("load_imbalance"));
});

test("an even split is not reported", () => {
  assert.ok(!kinds([...held("usr_a", 3), ...held("usr_b", 3)]).includes("load_imbalance"));
});

test("blocked leads count toward the load they are actually sitting on", () => {
  // They do not move, so they are part of what that person is carrying.
  const found = analyseRouting([
    ...Array.from({ length: 4 }, () => blocked("no_territory", "usr_a")),
    ...held("usr_b", 1),
  ]);
  const load = found.find((a) => a.kind === "load_imbalance")!;
  assert.equal(load.sub, "usr_a");
  assert.equal(load.count, 4);
});
