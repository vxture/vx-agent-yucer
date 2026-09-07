import { test } from "node:test";
import assert from "node:assert/strict";
import { routingStats, UNKNOWN_REGION, type RoutingStatRow } from "./routing-stats";

const row = (over: Partial<RoutingStatRow> = {}): RoutingStatRow => ({
  currentOwner: "usr_a",
  suggestedOwner: "usr_a",
  unroutableReason: null,
  region: "华东",
  ...over,
});

const count = (bs: readonly { key: string; count: number }[], k: string) =>
  bs.find((b) => b.key === k)?.count ?? 0;

// --- the three dispositions --------------------------------------------------

test("the three dispositions partition the set - every lead lands in exactly one", () => {
  const rows = [
    row(),
    row({ suggestedOwner: "usr_b" }),
    row({ currentOwner: null, suggestedOwner: "usr_b" }),
    row({ unroutableReason: "no_region", region: null, suggestedOwner: null }),
  ];
  const s = routingStats(rows);
  assert.equal(count(s.byDisposition, "settled"), 1);
  assert.equal(count(s.byDisposition, "pending"), 2, "an unowned lead is waiting, not settled");
  assert.equal(count(s.byDisposition, "blocked"), 1);
  assert.equal(
    s.byDisposition.reduce((n, b) => n + b.count, 0),
    s.total,
    "the cells must add up to the list, or the strip is describing another page",
  );
});

test("all three cells are present even at zero - the strip keeps its shape", () => {
  const s = routingStats([row()]);
  assert.deepEqual(
    s.byDisposition.map((b) => b.key),
    ["settled", "pending", "blocked"],
  );
  assert.equal(count(s.byDisposition, "blocked"), 0);
});

test("an empty page is three zeros, not an empty strip", () => {
  const s = routingStats([]);
  assert.equal(s.byDisposition.length, 3);
  assert.equal(s.total, 0);
});

test("a blocked lead is never counted as pending, whatever it currently has", () => {
  // It cannot be applied, so counting it as work waiting would put a number on
  // the apply column that no button can act on.
  const s = routingStats([row({ unroutableReason: "no_owner", suggestedOwner: null })]);
  assert.equal(s.pending, 0);
  assert.equal(s.blocked, 1);
});

// --- the reasons are three different people's jobs ---------------------------

test("blocked splits by reason, commonest first", () => {
  const s = routingStats([
    row({ unroutableReason: "no_territory", suggestedOwner: null }),
    row({ unroutableReason: "no_territory", suggestedOwner: null }),
    row({ unroutableReason: "no_region", region: null, suggestedOwner: null }),
  ]);
  assert.deepEqual(
    s.byReason.map((b) => b.key),
    ["no_territory", "no_region"],
  );
});

test("no blocked leads means no reasons - not three zeros nobody has to fix", () => {
  assert.deepEqual(routingStats([row()]).byReason, []);
});

// --- load: the other half of the rule ----------------------------------------

test("load shows what each person holds now and what applying would leave them", () => {
  const s = routingStats([
    row({ currentOwner: "usr_a", suggestedOwner: "usr_a" }),
    row({ currentOwner: "usr_a", suggestedOwner: "usr_b" }),
    row({ currentOwner: null, suggestedOwner: "usr_b" }),
  ]);
  const a = s.byOwner.find((o) => o.sub === "usr_a")!;
  const b = s.byOwner.find((o) => o.sub === "usr_b")!;
  assert.deepEqual([a.now, a.after], [2, 1]);
  assert.deepEqual([b.now, b.after], [0, 2], "an unowned lead adds to the receiver and to nobody");
});

test("a blocked lead stays on its holder in BOTH columns", () => {
  // It does not move, so dropping it from `after` would draw the territory
  // map's hole as somebody's workload going down.
  const s = routingStats([
    row({ currentOwner: "usr_a", unroutableReason: "no_territory", suggestedOwner: null }),
  ]);
  const a = s.byOwner.find((o) => o.sub === "usr_a")!;
  assert.deepEqual([a.now, a.after], [1, 1]);
});

test("load is ordered by the outcome, heaviest first", () => {
  const s = routingStats([
    row({ currentOwner: "usr_light", suggestedOwner: "usr_light" }),
    row({ currentOwner: "usr_heavy", suggestedOwner: "usr_heavy" }),
    row({ currentOwner: "usr_heavy", suggestedOwner: "usr_heavy" }),
  ]);
  assert.deepEqual(
    s.byOwner.map((o) => o.sub),
    ["usr_heavy", "usr_light"],
  );
});

test("nobody with no leads at either end appears at all", () => {
  const s = routingStats([row({ currentOwner: null, suggestedOwner: null, unroutableReason: "no_region", region: null })]);
  assert.deepEqual(s.byOwner, []);
});

// --- regions -----------------------------------------------------------------

test("a lead with no region gets its own named bucket, not silence", () => {
  // The region is the router's own input; a lead without one is the case the
  // map cannot see, and dropping it would make the map look complete.
  const s = routingStats([
    row({ region: null, unroutableReason: "no_region", suggestedOwner: null }),
    row({ region: "华东" }),
  ]);
  assert.equal(count(s.byRegion, UNKNOWN_REGION), 1);
  assert.equal(count(s.byRegion, "华东"), 1);
});
