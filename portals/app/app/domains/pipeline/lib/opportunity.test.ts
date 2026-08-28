import { test } from "node:test";
import assert from "node:assert/strict";
import { money } from "../../shared/money";
import { unwrap } from "../../shared/result";
import { planNewOpportunity, type NewOpportunityDraft } from "./opportunity";

const draft = (over: Partial<NewOpportunityDraft> = {}): NewOpportunityDraft => ({
  name: "Corridor deal",
  accountId: "acc_1",
  territoryId: null,
  ownerSub: null,
  amount: null,
  expectedCloseAt: null,
  ...over,
});

test("a deal needs a name and a customer", () => {
  assert.equal(
    planNewOpportunity(draft({ name: "  " })).ok === false &&
      (planNewOpportunity(draft({ name: "  " })) as { violations: { code: string }[] })
        .violations[0].code,
    "name_required",
  );
  const r = planNewOpportunity(draft({ accountId: "" }));
  assert.equal(r.ok === false && r.violations[0].code, "account_required");
});

test("a directly-created deal is SELF-SOURCED, decided by the rule and not left blank", () => {
  // The branch `resolveAttribution` has always had and nothing could reach:
  // its only caller was the lead conversion seam, which always passes a lead.
  const t = unwrap(planNewOpportunity(draft()));
  assert.equal(t.attribution.source, "self_sourced");
  assert.equal(t.attribution.campaignId, null);
  assert.equal(t.attribution.basis, "no lead");
});

test("the amount is optional, and negative is refused", () => {
  // A deal often exists before anyone knows what it is worth; a NEGATIVE one
  // never does.
  assert.ok(planNewOpportunity(draft({ amount: null })).ok);
  assert.ok(planNewOpportunity(draft({ amount: money(0) })).ok);
  const r = planNewOpportunity(draft({ amount: money(-1) }));
  assert.equal(r.ok === false && r.violations[0].code, "amount_negative");
});

test("the name is trimmed", () => {
  assert.equal(unwrap(planNewOpportunity(draft({ name: "  Corridor deal  " }))).name, "Corridor deal");
});
