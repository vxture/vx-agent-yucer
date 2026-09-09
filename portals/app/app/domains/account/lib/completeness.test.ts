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
  province: "北京市",
  segmentCode: "ENTERPRISE",
  ownerSub: "usr_a",
};

const DIVISION_OF = { 北京市: "华北", 江苏省: "华东", 广东省: "华南" };

const gapsOf = (
  over: Partial<CompletableAccount>,
  deals: Array<{ territoryId: string | null; ownerSub: string | null }> = [],
) => accountGaps({ ...full, ...over }, deals, TERRITORIES, SEGMENTS, DIVISION_OF);

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
  // province: null so the TERRITORY route is the one under test - with a
  // province present the region is answered exactly and never reaches here.
  const gaps = gapsOf({ region: null, province: null }, [{ territoryId: "t_east", ownerSub: "usr_a" }]);
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
  const gaps = gapsOf(
    { region: null, province: null, industry: null, segmentCode: null, ownerSub: null }, []);
  assert.deepEqual(
    forModel(gaps).map((g) => g.field).sort(),
    // province joins industry and region: where a company is registered is a
    // fact about the world, which is the model plane's case exactly.
    ["industry", "province", "region"],
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

// --- 省份, and the 大区 it settles ------------------------------------------

test("a customer with no province is a gap the model can answer", () => {
  /* incr/0035 added the column and the situation screen colours a map by it,
     but nothing in the product could write one - so a workspace that was not
     seeded had every province grey for ever and no page said why. */
  const gaps = gapsOf({ province: null });
  const province = gaps.find((g) => g.field === "province")!;
  assert.ok(province, "a missing province must be reported");
  assert.equal(province.suggestion, null, "these rows cannot know where a company is registered");
  assert.equal(province.forModel, true);
});

test("the province settles the 大区 exactly, without needing a territory", () => {
  // The territory route needs a covering territory naming exactly one region.
  // The province route needs only the workspace's own division table, which
  // places every province - so it answers where the territory route cannot.
  const gaps = gapsOf({ region: null, province: "江苏省" }, []);
  const region = gaps.find((g) => g.field === "region")!;
  assert.equal(region.suggestion, "华东");
  assert.equal(region.basis, "江苏省 sits in 华东");
  assert.equal(region.forModel, false, "the data answered - there is nothing to ask");
});

test("a province the workspace has not placed does not invent a 大区", () => {
  // A tenant may edit its divisions, so a province can genuinely sit in none.
  // Falling through to the territory route is right; inventing one is not.
  const gaps = gapsOf({ region: null, province: "西藏自治区" }, []);
  const region = gaps.find((g) => g.field === "region")!;
  assert.notEqual(region.suggestion, "西藏自治区");
  assert.equal(region.suggestion, null);
});

test("province comes before region, because region is derived from it", () => {
  // The order returned is the filling order: each suggestion is computed
  // against what the previous one settled.
  const fields = gapsOf({ province: null, region: null }, []).map((g) => g.field);
  assert.ok(fields.indexOf("province") < fields.indexOf("region"));
});
