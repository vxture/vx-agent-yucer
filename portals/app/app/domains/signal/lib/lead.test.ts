import { test } from "node:test";
import assert from "node:assert/strict";
import { unwrap } from "../../shared/result";
import { planLeadAdvance, type AdvancingLead } from "./lead";

const lead = (over: Partial<AdvancingLead> = {}): AdvancingLead => ({
  id: "lead_1",
  status: "working",
  ownerSub: "usr_a",
  ...over,
});

test("a converted lead is final", () => {
  // One piece of demand, one opportunity. Moving it again would double-count.
  const r = planLeadAdvance(lead({ status: "converted" }), "working");
  assert.equal(r.ok === false && r.violations[0].code, "lead_converted");
});

// --- the join between 线索分派 and 商机智探 ------------------------------------

test("a lead nobody owns cannot be qualified", () => {
  const r = planLeadAdvance(lead({ ownerSub: null }), "qualified");
  // Its own code, NOT the domain's existing `owner_required` - that one means
  // "the assign call named nobody", which is the opposite subject.
  assert.equal(r.ok === false && r.violations[0].code, "lead_unowned");
  assert.equal(r.ok === false && r.violations[0].field, "ownerSub");
});

test("an owned lead qualifies", () => {
  assert.equal(unwrap(planLeadAdvance(lead(), "qualified")).status, "qualified");
});

test("working an unowned lead is fine - somebody picked it up", () => {
  // The gate is on the JUDGEMENT, not on touching the lead at all. Blocking
  // this would mean nobody could look at a lead before the paperwork caught up.
  assert.ok(planLeadAdvance(lead({ status: "new", ownerSub: null }), "working").ok);
});

test("disqualifying an unowned lead is fine - junk needs no owner", () => {
  // "This is not real" is a conclusion that needs nobody's name on it, and
  // refusing it would trap rubbish in the queue until someone was assigned to
  // throw it away.
  assert.ok(planLeadAdvance(lead({ ownerSub: null }), "disqualified").ok);
});

test("the owner check runs on the DESTINATION, not on where it came from", () => {
  // An owned lead moving backwards is unaffected; an unowned one is stopped
  // only at the one step that asserts something.
  assert.ok(planLeadAdvance(lead({ status: "qualified", ownerSub: null }), "working").ok);
});
