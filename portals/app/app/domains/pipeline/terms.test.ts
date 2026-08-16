import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_ENTITLEMENT, type Entitlement } from "../../entitlement/types";
import { permissionsForRoles, type RoleCode } from "../../authz/catalog";
import { money } from "../shared/money";
import { unwrap } from "../shared/result";
import { InMemoryPipelineStore, type OpportunityRecord } from "./store";
import { advanceStage, stageHistory, updateCommercialTerms, type PipelineContext } from "./service";
import { DEFAULT_PROBABILITY } from "./lib/stage";
import { rollUp } from "./lib/forecast";

// Repricing a deal, and reading how it got where it is.
//
// These two service functions exist because the rules behind them were
// unreachable from any surface: planProbabilityOverride had no caller at all,
// so "a human override wins and the machine keeps its hands off" could only
// ever be half-demonstrated - the machine declining to overwrite a value that
// nothing in the product could produce.

const WS = "ws_1";

function opp(over: Partial<OpportunityRecord> = {}): OpportunityRecord {
  return {
    id: "opp_1",
    workspaceId: WS,
    opportunityNo: "OPP-1",
    name: "Deal",
    accountId: "acc_1",
    planId: null,
    campaignId: "camp_1",
    territoryId: "t_1",
    ownerSub: "usr_rep",
    stage: "discover",
    forecastCategory: "commit",
    amount: money(100_000),
    probability: DEFAULT_PROBABILITY.discover,
    expectedCloseAt: new Date("2026-09-30T00:00:00Z"),
    closedAt: null,
    status: "open",
    currency: "CNY",
    ...over,
  };
}

function ctx(role: RoleCode, tier: Entitlement["tier"], store = new InMemoryPipelineStore()): PipelineContext {
  return {
    workspaceId: WS,
    sub: "usr_me",
    holder: { permissions: new Set(permissionsForRoles([role])) },
    entitlement: { ...EMPTY_ENTITLEMENT, workspace_id: WS, product: "yucer", tier },
    store,
  };
}

function stored(store: InMemoryPipelineStore, id = "opp_1") {
  return store.getOpportunity(WS, id);
}

// --- Both gates, in order --------------------------------------------------

test("an unentitled workspace is refused before any rule runs", async () => {
  const store = new InMemoryPipelineStore();
  store.seed([opp()]);
  const r = await updateCommercialTerms(ctx("sales_rep", null, store), "opp_1", { probability: 65 });
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.violations[0].code, "no_data_access");
  assert.equal((await stored(store))?.probability, DEFAULT_PROBABILITY.discover, "nothing was written");
});

test("a member without pipeline.write cannot reprice", async () => {
  const store = new InMemoryPipelineStore();
  store.seed([opp()]);
  const r = await updateCommercialTerms(ctx("sales_ops", "enterprise", store), "opp_1", {
    amount: money(1),
  });
  assert.equal(r.ok, false);
  assert.equal((await stored(store))?.amount?.amount, 100_000, "nothing was written");
});

test("an opportunity in another workspace is not found rather than forbidden", async () => {
  // Same collapse the read path makes: distinguishing the two turns the refusal
  // into an oracle for which ids exist elsewhere.
  const store = new InMemoryPipelineStore();
  store.seed([opp({ workspaceId: "ws_other" })]);
  const r = await updateCommercialTerms(ctx("sales_rep", "pro", store), "opp_1", { probability: 40 });
  assert.equal(r.ok === false && r.violations[0].code, "not_found");
});

// --- Pricing and committing are different capabilities ---------------------

test("the rep who owns the deal may price it but not move its forecast bucket", async () => {
  // authz/catalog.ts gives sales_rep pipeline.write WITHOUT pipeline.forecast,
  // commented "owns the deal, not the forecast commitment", and
  // 50-role-permission-catalog.md assigns adjusting the category to
  // pipeline.forecast. Folding both under the editing gate handed a rep the
  // commit number the product sells separately.
  const store = new InMemoryPipelineStore();
  store.seed([opp()]);
  const c = ctx("sales_rep", "pro", store);

  unwrap(await updateCommercialTerms(c, "opp_1", { amount: money(250_000) }));
  assert.equal((await stored(store))?.amount?.amount, 250_000, "pricing is theirs");

  const r = await updateCommercialTerms(c, "opp_1", { forecastCategory: "best_case" });
  assert.equal(r.ok, false, "the bucket is not");
  assert.equal((await stored(store))?.forecastCategory, "commit", "and nothing moved");
});

test("the forecast bucket is a pro capability, not a free one", async () => {
  // pipeline.manage is in the FREE tier; pipeline.forecast starts at pro. A
  // free workspace could otherwise write the number rollUp() sums into commit.
  const store = new InMemoryPipelineStore();
  store.seed([opp()]);
  const r = await updateCommercialTerms(ctx("sales_leader", "free", store), "opp_1", {
    forecastCategory: "best_case",
  });
  assert.equal(r.ok, false);
  assert.equal((await stored(store))?.forecastCategory, "commit");
});

test("a price change and a bucket change are judged independently", async () => {
  // A member who may do one and not the other gets a refusal for the half they
  // may not, rather than the whole call succeeding or failing together.
  const store = new InMemoryPipelineStore();
  store.seed([opp()]);
  const r = await updateCommercialTerms(ctx("sales_rep", "pro", store), "opp_1", {
    amount: money(1),
    forecastCategory: "best_case",
  });
  assert.equal(r.ok, false, "the bucket half is refused");
  assert.equal((await stored(store))?.amount?.amount, 100_000, "so neither half lands");
});

// --- The override rule, now reachable --------------------------------------

test("a human win rate survives a later stage move", async () => {
  // The point of the whole override design. Before this service function
  // existed, nothing in the product could set the value being protected.
  const store = new InMemoryPipelineStore();
  store.seed([opp()]);
  const c = ctx("sales_rep", "pro", store);

  unwrap(await updateCommercialTerms(c, "opp_1", { probability: 65 }));
  assert.equal((await stored(store))?.probability, 65);

  unwrap(await advanceStage(c, "opp_1", { to: "validate" }));
  assert.equal(
    (await stored(store))?.probability,
    65,
    "the stage machine must not overwrite a number a human committed to",
  );
  assert.notEqual(DEFAULT_PROBABILITY.validate, 65, "the test would be vacuous if these matched");
});

test("a win rate left alone still follows the stage", async () => {
  const store = new InMemoryPipelineStore();
  store.seed([opp()]);
  unwrap(await advanceStage(ctx("sales_rep", "pro", store), "opp_1", { to: "validate" }));
  assert.equal((await stored(store))?.probability, DEFAULT_PROBABILITY.validate);
});

test("a closed deal's win rate is fixed and cannot be repriced", async () => {
  const store = new InMemoryPipelineStore();
  store.seed([opp({ stage: "won", status: "won", probability: 100, forecastCategory: "closed", closedAt: new Date() })]);
  const r = await updateCommercialTerms(ctx("sales_rep", "pro", store), "opp_1", { probability: 50 });
  assert.equal(r.ok === false && r.violations[0].code, "terminal_probability_fixed");
  assert.equal((await stored(store))?.probability, 100);
});

test("a win rate outside 0-100 is refused by the rule, not by the form", async () => {
  const store = new InMemoryPipelineStore();
  store.seed([opp()]);
  for (const bad of [-1, 101, 3.5]) {
    const r = await updateCommercialTerms(ctx("sales_rep", "pro", store), "opp_1", { probability: bad });
    assert.equal(r.ok === false && r.violations[0].code, "probability_range", `${bad} was accepted`);
  }
});

// --- Forecast category and stage stay in agreement -------------------------

test("an open deal cannot be forecast as closed through the pricing path", async () => {
  // The same rule the category control enforces. If this path skipped it, the
  // pricing form would be the way around planCategoryChange.
  // sales_leader holds pipeline.write AND pipeline.forecast; sales_rep does not
  // hold the latter, which the gate tests below cover.
  const store = new InMemoryPipelineStore();
  store.seed([opp()]);
  const r = await updateCommercialTerms(ctx("sales_leader", "pro", store), "opp_1", {
    forecastCategory: "closed",
  });
  assert.equal(r.ok === false && r.violations[0].code, "closed_requires_terminal_stage");
});

test("a closed deal cannot be forecast back into an open bucket", async () => {
  const store = new InMemoryPipelineStore();
  store.seed([opp({ stage: "lost", status: "lost", probability: 0, forecastCategory: "closed", closedAt: new Date() })]);
  const r = await updateCommercialTerms(ctx("sales_leader", "pro", store), "opp_1", {
    forecastCategory: "commit",
  });
  assert.equal(r.ok === false && r.violations[0].code, "terminal_requires_closed");
});

// --- Money and the shape of a patch ----------------------------------------

test("a negative amount is refused", async () => {
  const store = new InMemoryPipelineStore();
  store.seed([opp()]);
  const r = await updateCommercialTerms(ctx("sales_rep", "pro", store), "opp_1", {
    amount: money(-1),
  });
  assert.equal(r.ok === false && r.violations[0].code, "amount_negative");
});

test("clearing the amount is a real change, not a no-op", async () => {
  // "Unpriced" is a state a deal can legitimately be in. If null read as
  // "absent", the value could never be cleared once set.
  const store = new InMemoryPipelineStore();
  store.seed([opp()]);
  unwrap(await updateCommercialTerms(ctx("sales_rep", "pro", store), "opp_1", { amount: null }));
  assert.equal((await stored(store))?.amount, null);
});

test("an empty patch is refused rather than reported as saved", async () => {
  const store = new InMemoryPipelineStore();
  store.seed([opp()]);
  const r = await updateCommercialTerms(ctx("sales_rep", "pro", store), "opp_1", {});
  assert.equal(r.ok === false && r.violations[0].code, "empty_patch");
});

test("changing one field leaves the others alone", async () => {
  const store = new InMemoryPipelineStore();
  store.seed([opp()]);
  unwrap(await updateCommercialTerms(ctx("sales_rep", "pro", store), "opp_1", { amount: money(250_000) }));
  const row = await stored(store);
  assert.equal(row?.amount?.amount, 250_000);
  assert.equal(row?.probability, DEFAULT_PROBABILITY.discover, "the win rate was not touched");
  assert.deepEqual(row?.expectedCloseAt, new Date("2026-09-30T00:00:00Z"), "the close date was not touched");
});

test("every violation is reported, not just the first", async () => {
  const store = new InMemoryPipelineStore();
  store.seed([opp()]);
  const r = await updateCommercialTerms(ctx("sales_leader", "pro", store), "opp_1", {
    amount: money(-5),
    probability: 200,
    forecastCategory: "closed",
  });
  assert.equal(r.ok, false);
  const codes = r.ok === false ? r.violations.map((v) => v.code).sort() : [];
  assert.deepEqual(codes, ["amount_negative", "closed_requires_terminal_stage", "probability_range"]);
});

test("the stage triple cannot be reached through the pricing path", async () => {
  // The port's patch type has no stage/status/closedAt, so a caller cannot use
  // this as the shortcut past applyStageChange and its journal. Asserted at
  // runtime too: a stray key must not land in the row.
  const store = new InMemoryPipelineStore();
  store.seed([opp()]);
  const smuggled = { amount: money(1), stage: "won", status: "won" } as unknown as Parameters<
    typeof updateCommercialTerms
  >[2];
  await updateCommercialTerms(ctx("sales_rep", "pro", store), "opp_1", smuggled);
  const row = await stored(store);
  assert.equal(row?.stage, "discover", "stage moved without a journal entry");
  assert.equal(row?.status, "open");
  assert.equal((await stageHistory(ctx("sales_rep", "pro", store), "opp_1")).ok, true);
});

// --- Reading the journal ---------------------------------------------------

test("the journal is readable with pipeline.read alone", async () => {
  // Leadership and finance read stage history and never move deals. Gating the
  // history on the write permission would hide the audit trail from exactly the
  // people who audit.
  const store = new InMemoryPipelineStore();
  store.seed([opp()]);
  unwrap(await advanceStage(ctx("sales_rep", "pro", store), "opp_1", { to: "validate" }));

  const events = unwrap(await stageHistory(ctx("sales_ops", "pro", store), "opp_1"));
  assert.equal(events.length, 1);
  assert.equal(events[0].fromStage, "discover");
  assert.equal(events[0].toStage, "validate");
});

test("the journal is ordered oldest first", async () => {
  const store = new InMemoryPipelineStore();
  store.seed([opp()]);
  const c = ctx("sales_rep", "pro", store);
  unwrap(await advanceStage(c, "opp_1", { to: "validate" }));
  unwrap(await advanceStage(c, "opp_1", { to: "propose" }));

  const events = unwrap(await stageHistory(c, "opp_1"));
  assert.deepEqual(
    events.map((e) => e.toStage),
    ["validate", "propose"],
  );
});

test("the journal of an opportunity in another workspace is not found", async () => {
  const store = new InMemoryPipelineStore();
  store.seed([opp({ workspaceId: "ws_other" })]);
  const r = await stageHistory(ctx("sales_rep", "pro", store), "opp_1");
  assert.equal(r.ok === false && r.violations[0].code, "not_found");
});

test("an unentitled workspace cannot read the journal", async () => {
  const store = new InMemoryPipelineStore();
  store.seed([opp()]);
  const r = await stageHistory(ctx("sales_rep", null, store), "opp_1");
  assert.equal(r.ok, false);
});

// --- The round trip a sales team actually performs -------------------------

test("convert-shaped deal: price it, move it, close it", async () => {
  // A deal born at qualify with no amount - which is exactly what the
  // conversion seam produces - reaching a closed, priced, journalled outcome.
  // Before the pricing and stage surfaces existed there was no path from the
  // first state to the second.
  const store = new InMemoryPipelineStore();
  store.seed([opp({ stage: "qualify", probability: DEFAULT_PROBABILITY.qualify, amount: null, forecastCategory: "pipeline" })]);
  const c = ctx("sales_rep", "pro", store);

  unwrap(
    await updateCommercialTerms(c, "opp_1", {
      amount: money(880_000),
      expectedCloseAt: new Date("2026-12-01T00:00:00Z"),
    }),
  );
  for (const to of ["discover", "validate", "propose", "negotiate"] as const) {
    unwrap(await advanceStage(c, "opp_1", { to }));
  }
  const closed = unwrap(await advanceStage(c, "opp_1", { to: "won" }));

  const row = await stored(store);
  assert.equal(row?.status, "won");
  assert.equal(row?.probability, 100, "a won deal is 100% whatever anyone typed earlier");
  assert.ok(row?.closedAt, "closing stamps closed_at - without it the deal is invisible to period reports");
  assert.equal(row?.amount?.amount, 880_000);
  assert.equal(closed.reviewRequired, true, "and the post-mortem debt is raised");

  const events = unwrap(await stageHistory(c, "opp_1"));
  assert.equal(events.length, 5, "every move journalled, none skipped");
  assert.equal(events[0].fromStage, "qualify");
  assert.equal(events[events.length - 1].toStage, "won");

  // The assertion this test was missing, and the reason a won deal used to keep
  // reporting itself as pipeline: closing must move the forecast bucket too.
  assert.equal(row?.forecastCategory, "closed");
  const totals = rollUp([row!], "CNY");
  assert.ok(totals.ok);
  assert.equal(totals.value.closedAmount.amount, 880_000, "won revenue lands in closed");
  assert.equal(totals.value.commitAmount.amount, 0, "and not in the commitment still to come");
});

test("a deal closed through the product is immediately editable again", async () => {
  // The state the old behaviour produced was one planCategoryChange rejected in
  // BOTH directions, so no later edit could repair it: the deal was stuck.
  const store = new InMemoryPipelineStore();
  store.seed([opp({ stage: "negotiate", probability: 90, forecastCategory: "commit" })]);
  const c = ctx("sales_leader", "pro", store);

  unwrap(await advanceStage(c, "opp_1", { to: "won" }));
  unwrap(await updateCommercialTerms(c, "opp_1", { amount: money(123_000) }));
  assert.equal((await stored(store))?.amount?.amount, 123_000);
});
