import { test } from "node:test";
import assert from "node:assert/strict";
import { unwrap } from "../../shared/result";
import {
  assertNoFrozenLeadKeys,
  assertNoFrozenOpportunityKeys,
  planConversion,
  resolveAttribution,
  type LeadFacts,
  type SignalFacts,
} from "./attribution";

const lead = (over: Partial<LeadFacts & { status: string; accountId: string | null }> = {}) => ({
  id: "lead_1",
  campaignId: null,
  signalId: null,
  status: "qualified",
  accountId: "acc_1",
  ...over,
});

const signal = (over: Partial<SignalFacts> = {}): SignalFacts => ({
  id: "sig_1",
  source: "web",
  sourceRef: "https://example.test/news/1",
  ...over,
});

// --- The priority chain -----------------------------------------------------

test("the lead's own campaign wins", () => {
  const a = resolveAttribution({ lead: lead({ campaignId: "camp_1" }) });
  assert.equal(a.source, "campaign");
  assert.equal(a.campaignId, "camp_1");
});

test("a campaign-sourced signal supplies the campaign when the lead has none", () => {
  // Signals carry no campaign_id column: the evidence records where it came
  // from, and for campaign-sourced evidence that reference IS the campaign.
  const a = resolveAttribution({
    lead: lead({ signalId: "sig_1" }),
    signal: signal({ source: "campaign", sourceRef: "camp_7" }),
  });
  assert.equal(a.source, "signal_campaign");
  assert.equal(a.campaignId, "camp_7");
});

test("the lead's campaign outranks the signal's", () => {
  const a = resolveAttribution({
    lead: lead({ campaignId: "camp_1" }),
    signal: signal({ source: "campaign", sourceRef: "camp_7" }),
  });
  assert.equal(a.campaignId, "camp_1");
});

test("a non-campaign signal does not attribute to a campaign", () => {
  for (const src of ["web", "news", "crm", "manual", "partner"]) {
    const a = resolveAttribution({ lead: lead(), signal: signal({ source: src, sourceRef: "camp_7" }) });
    assert.equal(a.source, "self_sourced", src);
    assert.equal(a.campaignId, null);
  }
});

test("a campaign signal with no reference falls through to self-sourced", () => {
  const a = resolveAttribution({ lead: lead(), signal: signal({ source: "campaign", sourceRef: null }) });
  assert.equal(a.source, "self_sourced");
});

test("no lead and no signal is self-sourced, not an error", () => {
  const a = resolveAttribution({});
  assert.equal(a.source, "self_sourced");
  assert.equal(a.campaignId, null);
});

test("the basis explains which input decided it", () => {
  assert.match(resolveAttribution({ lead: lead({ campaignId: "c" }) }).basis, /lead lead_1 campaign/);
  assert.match(
    resolveAttribution({ lead: lead(), signal: signal({ source: "campaign", sourceRef: "c" }) }).basis,
    /signal sig_1 source_ref/,
  );
});

// --- Conversion, the seam of the chain --------------------------------------

test("conversion copies the campaign onto the opportunity", () => {
  const plan = unwrap(planConversion({ lead: lead({ campaignId: "camp_1" }) }));
  assert.equal(plan.opportunity.campaignId, "camp_1");
  assert.equal(plan.opportunity.accountId, "acc_1");
  assert.equal(plan.lead.status, "converted");
});

test("only a qualified lead converts", () => {
  for (const status of ["new", "working", "converted", "disqualified"]) {
    const r = planConversion({ lead: lead({ status }) });
    assert.equal(r.ok, false, status);
    assert.equal(r.ok === false && r.violations[0].code, "lead_not_qualified");
  }
});

test("converting needs an account, because an opportunity cannot exist without one", () => {
  const r = planConversion({ lead: lead({ accountId: null }) });
  assert.equal(r.ok === false && r.violations[0].code, "account_required");

  // An explicitly supplied account satisfies it.
  assert.ok(planConversion({ lead: lead({ accountId: null }), accountId: "acc_9" }).ok);
});

test("an explicit account overrides the lead's matched one", () => {
  const plan = unwrap(planConversion({ lead: lead({ accountId: "acc_1" }), accountId: "acc_2" }));
  assert.equal(plan.opportunity.accountId, "acc_2");
});

test("convertedOpportunityId is left null - the row does not exist yet", () => {
  const plan = unwrap(planConversion({ lead: lead() }));
  assert.equal(plan.lead.convertedOpportunityId, null);
});

test("the plan reports the attribution it computed, so it can be shown and logged", () => {
  const plan = unwrap(
    planConversion({ lead: lead({ signalId: "sig_1" }), signal: signal({ source: "campaign", sourceRef: "camp_7" }) }),
  );
  assert.equal(plan.attribution.source, "signal_campaign");
  assert.equal(plan.opportunity.campaignId, "camp_7");
});

// --- Immutability -----------------------------------------------------------

test("a patch touching a frozen opportunity key is refused before it reaches the driver", () => {
  // The column locks would reject it too, but as `permission denied` from the
  // driver, a long way from the code that caused it.
  for (const key of ["accountId", "campaignId", "account_id", "campaign_id"]) {
    const r = assertNoFrozenOpportunityKeys({ [key]: "x" });
    assert.equal(r.ok, false, key);
    assert.equal(r.ok === false && r.violations[0].code, "attribution_immutable");
    assert.match(r.ok === false ? r.violations[0].message : "", /db-init/);
  }
});

test("a patch touching a frozen lead key is refused", () => {
  for (const key of ["signalId", "campaignId", "signal_id", "campaign_id"]) {
    assert.equal(assertNoFrozenLeadKeys({ [key]: "x" }).ok, false, key);
  }
});

test("a patch of writable columns passes", () => {
  assert.ok(assertNoFrozenOpportunityKeys({ name: "n", amount: 1, ownerSub: "u", territoryId: "t" }).ok);
  assert.ok(assertNoFrozenLeadKeys({ companyName: "n", score: 50, status: "working" }).ok);
});

test("every frozen key present is reported, not only the first", () => {
  const r = assertNoFrozenOpportunityKeys({ accountId: "a", campaignId: "c" });
  assert.equal(r.ok === false && r.violations.length, 2);
});

test("planning keys stay writable - ownership moves, provenance does not", () => {
  // opportunity.plan_id / territory_id / owner_sub reflect current ownership and
  // are deliberately NOT frozen, unlike the attribution keys.
  assert.ok(assertNoFrozenOpportunityKeys({ planId: "p", territoryId: "t", ownerSub: "u" }).ok);
});
