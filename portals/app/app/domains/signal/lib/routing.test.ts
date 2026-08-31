import { test } from "node:test";
import assert from "node:assert/strict";
import { coveringTerritories, routeLead } from "./routing";

const T = (id: string, name: string, owner: string | null, regions: string[], status = "active") => ({
  id,
  name,
  ownerSub: owner,
  regions,
  status,
});

const EAST = T("t_east", "East China", "rep_1", ["华东", "华中"]);
const SOUTH = T("t_south", "South China", "rep_2", ["华南"]);

test("territory decides WHO, and one covering territory needs no load at all", () => {
  const r = routeLead({ id: "l1", region: "华东" }, [EAST, SOUTH], new Map());
  assert.equal(r.kind, "assigned");
  assert.equal(r.kind === "assigned" && r.ownerSub, "rep_1");
  assert.match(r.kind === "assigned" ? r.basis : "", /East China/);
});

test("a territory covers a LIST of regions, not one", () => {
  // EAST holding both 华东 and 华中 is the ordinary case; a single-value
  // column would have forced a territory per region.
  const r = routeLead({ id: "l1", region: "华中" }, [EAST, SOUTH], new Map());
  assert.equal(r.kind === "assigned" && r.ownerSub, "rep_1");
});

test("load breaks a tie between owners who both cover the ground", () => {
  const alt = T("t_east2", "East China (partner)", "rep_3", ["华东"]);
  const load = new Map([["rep_1", 7], ["rep_3", 2]]);
  const r = routeLead({ id: "l1", region: "华东" }, [EAST, alt, SOUTH], load);
  assert.equal(r.kind === "assigned" && r.ownerSub, "rep_3", "the lighter load takes it");
  assert.match(r.kind === "assigned" ? r.basis : "", /fewest open leads \(2\)/);
});

test("load NEVER overrides territory", () => {
  // The whole point of the order. rep_2 is idle and rep_1 is buried, and the
  // 华东 lead still goes to rep_1 - a lead in hands that have never worked the
  // ground is worse than a slower queue in the right ones.
  const load = new Map([["rep_1", 99], ["rep_2", 0]]);
  const r = routeLead({ id: "l1", region: "华东" }, [EAST, SOUTH], load);
  assert.equal(r.kind === "assigned" && r.ownerSub, "rep_1");
});

test("ties are broken deterministically, so two identical runs agree", () => {
  const alt = T("t_east2", "A partner", "rep_3", ["华东"]);
  const load = new Map([["rep_1", 4], ["rep_3", 4]]);
  const a = routeLead({ id: "l1", region: "华东" }, [EAST, alt], load);
  const b = routeLead({ id: "l1", region: "华东" }, [alt, EAST], load);
  assert.equal(
    a.kind === "assigned" && a.ownerSub,
    b.kind === "assigned" && b.ownerSub,
    "input order must not change the answer",
  );
});

test("unroutable is an outcome with a reason, never a silent assignment", () => {
  assert.deepEqual(routeLead({ id: "l", region: null }, [EAST], new Map()), {
    kind: "unroutable",
    reason: "no_region",
  });
  assert.deepEqual(routeLead({ id: "l", region: "西北" }, [EAST], new Map()), {
    kind: "unroutable",
    reason: "no_territory",
  });
  assert.deepEqual(
    routeLead({ id: "l", region: "华东" }, [T("t", "Unowned", null, ["华东"])], new Map()),
    { kind: "unroutable", reason: "no_owner" },
  );
});

test("an empty region list covers NOTHING, not everything", () => {
  // The trap this shares with segment criteria: "matches everything" is how a
  // half-configured territory silently becomes the router's answer for every
  // lead in the workspace.
  const blank = T("t_blank", "Not set up yet", "rep_9", []);
  assert.deepEqual(coveringTerritories("华东", [blank]), []);
  assert.equal(routeLead({ id: "l", region: "华东" }, [blank], new Map()).kind, "unroutable");
});

test("a retired territory routes nothing, even where it still covers the region", () => {
  const gone = T("t_old", "Wound down", "rep_8", ["华东"], "retired");
  assert.equal(routeLead({ id: "l", region: "华东" }, [gone], new Map()).kind, "unroutable");
});

test("a territory written before 0017 covers nothing rather than throwing", () => {
  // Real historical rows have no regions column at all. A router that throws
  // on one stops working the moment it meets production data - and the safe
  // reading of "unknown ground" is "none", never "all".
  const legacy = { id: "t", name: "Pre-0017", ownerSub: "rep", regions: undefined as unknown as string[], status: "active" };
  assert.deepEqual(coveringTerritories("华东", [legacy]), []);
  assert.equal(routeLead({ id: "l", region: "华东" }, [legacy], new Map()).kind, "unroutable");
});
