import { test } from "node:test";
import assert from "node:assert/strict";
import { accountGaps, fillable, forModel, type CompletableAccount } from "./completeness";
import type { RoutingTerritory } from "../../signal/lib/routing";

const TERRITORIES: RoutingTerritory[] = [
  { id: "t_east", name: "East", ownerSub: "usr_e", regions: ["华东", "华中"], status: "active" },
  { id: "t_north", name: "North", ownerSub: "usr_n", regions: ["华北"], status: "active" },
];

const SEGMENTS = [
  { code: "ENTERPRISE", industries: ["制造", "通信"], regions: [] },
  { code: "MIDMARKET", industries: ["零售"], regions: [] },
];

const full: CompletableAccount = {
  id: "acc_1",
  name: "Acme",
  industry: "制造",
  region: "华北",
  segmentCode: "ENTERPRISE",
  ownerSub: "usr_a",
};

const gapsOf = (over: Partial<CompletableAccount>, deals: Array<{ territoryId: string | null; ownerSub: string | null }> = []) =>
  accountGaps({ ...full, ...over }, deals, TERRITORIES, SEGMENTS);

// --- A complete record has nothing to say ------------------------------------

test("a filled-in customer on covered ground produces no gaps", () => {
  assert.deepEqual(gapsOf({}), []);
});

// --- The half the data answers for free --------------------------------------

test("a region is derived from where the customer's deals are filed", () => {
  // FREE, INSTANT AND CERTAIN. Asking a model for this would be a defect: it
  // would pay Atlas, and wait, to be told something a join already knows -
  // with less certainty.
  const gaps = gapsOf({ region: null }, [{ territoryId: "t_north", ownerSub: "usr_a" }]);
  const region = gaps.find((g) => g.field === "region")!;
  assert.equal(region.suggestion, "华北");
  assert.equal(region.forModel, false, "the data answered, so no turn is worth spending");
  assert.match(region.basis!, /华北/);
});

test("an ambiguous territory refuses to choose, and hands the question up", () => {
  // t_east covers 华东 AND 华中. Picking the first would be a coin toss written
  // into a customer record - so this becomes the model's question instead.
  const gaps = gapsOf({ region: null }, [{ territoryId: "t_east", ownerSub: "usr_a" }]);
  const region = gaps.find((g) => g.field === "region")!;
  assert.equal(region.suggestion, null);
  assert.equal(region.forModel, true);
});

test("a segment is matched on criteria an administrator wrote, never guessed", () => {
  const gaps = gapsOf({ segmentCode: null });
  const seg = gaps.find((g) => g.field === "segmentCode")!;
  assert.equal(seg.suggestion, "ENTERPRISE");
  assert.equal(seg.forModel, false, "asking a model would override a rule this company owns");
});

test("an owner is taken from whoever already holds the deals, if it is one person", () => {
  const one = gapsOf({ ownerSub: null }, [
    { territoryId: "t_north", ownerSub: "usr_x" },
    { territoryId: "t_north", ownerSub: "usr_x" },
  ]);
  assert.equal(one.find((g) => g.field === "ownerSub")!.suggestion, "usr_x");

  // Two owners is a decision, and this rule does not make decisions.
  const two = gapsOf({ ownerSub: null }, [
    { territoryId: "t_north", ownerSub: "usr_x" },
    { territoryId: "t_north", ownerSub: "usr_y" },
  ]);
  assert.equal(two.find((g) => g.field === "ownerSub")!.suggestion, null);
});

// --- The half the model answers ----------------------------------------------

test("an industry is the model's question, because a schema cannot know it", () => {
  // THE CASE THE MODEL PLANE EXISTS FOR, and the reason it is not simply left
  // blank: it is a fact about the world that somebody would otherwise look up
  // by hand on first entry.
  const gaps = gapsOf({ industry: null, segmentCode: null });
  const industry = gaps.find((g) => g.field === "industry")!;
  assert.equal(industry.suggestion, null);
  assert.equal(industry.forModel, true);
});

test("a customer with no deals at all is the first-entry case", () => {
  // Nothing in the workspace places them yet - which is exactly when the model
  // is worth asking, and exactly when a person is otherwise typing from memory.
  const gaps = gapsOf({ region: null, industry: null, segmentCode: null, ownerSub: null }, []);
  assert.deepEqual(
    forModel(gaps).map((g) => g.field).sort(),
    ["industry", "region"],
  );
});

test("what nobody could know is not asked of the model either", () => {
  // Which territory ought to cover 东北 is a decision about how this company
  // organises its sales. Asking would get a confident answer to a question the
  // model cannot have.
  const gaps = gapsOf({ region: "东北" });
  const unplaced = gaps.find((g) => g.field === "regionUnplaced")!;
  assert.equal(unplaced.forModel, false);
  assert.equal(unplaced.suggestion, null);
  assert.match(unplaced.basis!, /东北/);
});

test("未分区 is reported even though every field is filled in", () => {
  // Not a missing value - the record is complete and no territory claims the
  // ground it names. Reported because of what it silently does: an unplaced
  // customer is visible to every territory member.
  const gaps = gapsOf({ region: "东北" });
  assert.deepEqual(gaps.map((g) => g.field), ["regionUnplaced"]);
});

// --- The two halves are separable --------------------------------------------

test("the free half and the paid half are counted separately", () => {
  // So a caller can take everything the data knows without spending a turn, and
  // so the expensive half is an explicit decision rather than something that
  // happens because a page rendered.
  const gaps = gapsOf({ region: null, industry: null, segmentCode: null, ownerSub: null }, [
    { territoryId: "t_north", ownerSub: "usr_x" },
  ]);
  assert.deepEqual(fillable(gaps).map((g) => g.field).sort(), ["ownerSub", "region"]);
  assert.deepEqual(forModel(gaps).map((g) => g.field), ["industry"]);
});

test("gaps come back in filling order, because the segment reads the region", () => {
  // Filling them in the order returned means each suggestion is computed
  // against what the previous one settled.
  const gaps = gapsOf({ region: null, industry: null, segmentCode: null, ownerSub: null }, []);
  assert.deepEqual(gaps.map((g) => g.field), ["region", "industry", "segmentCode", "ownerSub"]);
});
