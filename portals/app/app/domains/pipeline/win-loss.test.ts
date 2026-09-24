import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_ENTITLEMENT, type Entitlement } from "../../entitlement/types";
import { permissionsForRoles, type RoleCode } from "../../authz/catalog";
import { money } from "../shared/money";
import { unwrap } from "../shared/result";
import { InMemoryPipelineStore, type OpportunityRecord } from "./store";
import {
  abandonOpportunity,
  advanceStage,
  dealExit,
  winLossReviewOf,
  listPendingReviews,
  listWinLossReasons,
  recordWinLossReview,
  type PipelineContext,
} from "./service";

const WS = "ws_1";

function opp(over: Partial<OpportunityRecord> = {}): OpportunityRecord {
  return {
    id: "opp_1",
    workspaceId: WS,
    requirement: "POS replacement",
    opportunityNo: "OPP-1",
  createdAt: new Date("2026-01-01T00:00:00Z"),
    name: "Deal",
    accountId: "acc_1",
    planId: null,
    campaignId: null,
    sourceProjectId: null,
    contractTypeId: null,
    businessFormId: null,
    territoryId: null,
    ownerSub: "usr_rep",
    stage: "negotiate",
    forecastCategory: "commit",
    amount: money(100_000),
    probability: 90,
    expectedCloseAt: null,
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

// --- The loop that was open ------------------------------------------------

test("closing a deal reports that a review is required", async () => {
  // planStageChange has always produced this flag; nothing consumed it, so the
  // learning loop the spec mandates was silently open.
  const store = new InMemoryPipelineStore();
  store.seed([opp()]);
  const out = unwrap(await advanceStage(ctx("sales_rep", "business", store), "opp_1", { to: "won" }));
  assert.equal(out.reviewRequired, true);
});

/** The uuid of a shipped reason, resolved the way a caller resolves it: the
 *  vocabulary is rows since 0039, so a test cannot name one by literal. */
async function reasonId(c: Parameters<typeof recordWinLossReview>[0], code: string) {
  const list = unwrap(await listWinLossReasons(c));
  const row = list.find((r) => r.reasonCode === code);
  if (!row) throw new Error(`no such reason: ${code}`);
  return row.id;
}

test("re-closing an already-reviewed deal does NOT demand a second review", async () => {
  // The bug this covers: advanceStage did not load the review state, so
  // hasWinLossReview was undefined, requiresWinLossReview was always true, and
  // a second insert would have hit uidx_win_loss_review_opp.
  const store = new InMemoryPipelineStore();
  store.seed([opp()]);
  const c = ctx("sales_leader", "business", store);

  await advanceStage(c, "opp_1", { to: "won" });
  unwrap(await recordWinLossReview(c, "opp_1", { primaryReasonId: await reasonId(c, "fit"), lessons: "Strong champion." }));

  await advanceStage(c, "opp_1", { to: "negotiate", reopen: true, reason: "contract renegotiated" });
  const second = unwrap(await advanceStage(c, "opp_1", { to: "won" }));

  assert.equal(second.reviewRequired, false, "the existing review still stands");
});

test("closing does not BLOCK on the review", async () => {
  // Blocking would push people to leave deals open instead, and an open deal
  // that is really lost is worse for every number than a closed one missing its
  // post-mortem.
  const store = new InMemoryPipelineStore();
  store.seed([opp()]);
  const out = await advanceStage(ctx("sales_rep", "business", store), "opp_1", {
    to: "lost",
    exitReason: { code: "no_decision" },
  });
  assert.equal(out.ok, true);
  assert.equal((await store.getOpportunity(WS, "opp_1"))?.status, "lost");
});

// --- The debt is visible ----------------------------------------------------

test("unreviewed closed deals are listable - that is what makes MUST enforceable", async () => {
  const store = new InMemoryPipelineStore();
  store.seed([
    opp({ id: "won_unreviewed", status: "won", stage: "won", closedAt: new Date() }),
    opp({ id: "lost_unreviewed", status: "lost", stage: "lost", closedAt: new Date() }),
    opp({ id: "still_open" }),
  ]);
  const c = ctx("sales_leader", "business", store);

  const pending = unwrap(await listPendingReviews(c));
  assert.deepEqual(pending.map((o) => o.id).sort(), ["lost_unreviewed", "won_unreviewed"]);

  unwrap(await recordWinLossReview(c, "won_unreviewed", { primaryReasonId: await reasonId(c, "price") }));
  const after = unwrap(await listPendingReviews(c));
  assert.deepEqual(after.map((o) => o.id), ["lost_unreviewed"]);
});

// --- The outcome cannot be asserted by the caller --------------------------

test("the outcome is derived from the deal, never taken from the request", async () => {
  // A review claiming "won" on a lost deal would corrupt the one dataset the
  // learning loop reads.
  const store = new InMemoryPipelineStore();
  store.seed([opp({ status: "lost", stage: "lost", closedAt: new Date() })]);
  const c = ctx("sales_leader", "business", store);
  const review = unwrap(
    await recordWinLossReview(c, "opp_1", {
      primaryReasonId: await reasonId(c, "competitor"),
      competitor: "Acme Corp",
    }),
  );
  assert.equal(review.outcome, "lost");
});

test("the reviewer is the session subject", async () => {
  const store = new InMemoryPipelineStore();
  store.seed([opp({ status: "won", stage: "won", closedAt: new Date() })]);
  const c = ctx("sales_leader", "business", store);
  const review = unwrap(
    await recordWinLossReview(c, "opp_1", { primaryReasonId: await reasonId(c, "fit") }),
  );
  assert.equal(review.reviewerSub, "usr_me");
});

test("an open deal has no outcome to review", async () => {
  const store = new InMemoryPipelineStore();
  store.seed([opp()]);
  const c = ctx("sales_leader", "business", store);
  const r = await recordWinLossReview(c, "opp_1", {
    primaryReasonId: await reasonId(c, "fit"),
  });
  assert.equal(r.ok === false && r.violations[0].code, "not_closed");
});

test("a review is revised, not duplicated", async () => {
  const store = new InMemoryPipelineStore();
  store.seed([opp({ status: "lost", stage: "lost", closedAt: new Date() })]);
  const c = ctx("sales_leader", "business", store);

  const first = unwrap(await recordWinLossReview(c, "opp_1", { primaryReasonId: await reasonId(c, "price") }));
  const second = unwrap(
    await recordWinLossReview(c, "opp_1", { primaryReasonId: await reasonId(c, "competitor"), competitor: "Acme" }),
  );

  assert.equal(first.id, second.id, "one review per opportunity");
  assert.equal(
    (await store.getWinLossReview(WS, "opp_1"))?.primaryReasonId,
    await reasonId(c, "competitor"),
  );
});

// --- Gates ------------------------------------------------------------------

test("win/loss is a business-tier capability", async () => {
  const store = new InMemoryPipelineStore();
  store.seed([opp({ status: "won", stage: "won", closedAt: new Date() })]);
  // The tier gate refuses before any reason is looked up, so the id is one a
  // business-tier context resolved - the point is the refusal, not the row.
  const r = await recordWinLossReview(ctx("sales_leader", "pro", store), "opp_1", {
    primaryReasonId: await reasonId(ctx("sales_leader", "business", store), "fit"),
  });
  assert.equal(r.ok === false && r.violations[0].code, "feature_not_in_tier");
});

test("recording needs pipeline.write; reading needs only pipeline.read", async () => {
  const store = new InMemoryPipelineStore();
  store.seed([opp({ status: "won", stage: "won", closedAt: new Date() })]);

  assert.ok(unwrap(await listPendingReviews(ctx("viewer", "business", store))).length === 1);
  // The id comes from a context that MAY read the vocabulary; the refusal
  // under test is the write, not the lookup.
  const fit = await reasonId(ctx("sales_leader", "business", store), "fit");
  const r = await recordWinLossReview(ctx("viewer", "business", store), "opp_1", { primaryReasonId: fit });
  assert.equal(r.ok === false && r.violations[0].code, "permission_denied");
});

test("a review never crosses a workspace boundary", async () => {
  const store = new InMemoryPipelineStore();
  store.seed([opp({ workspaceId: "ws_other", status: "won", stage: "won", closedAt: new Date() })]);
  const c = ctx("sales_leader", "business", store);
  const r = await recordWinLossReview(c, "opp_1", {
    primaryReasonId: await reasonId(c, "fit"),
  });
  assert.equal(r.ok === false && r.violations[0].code, "not_found");
});

// --- 丢单与放弃写退出原因 (YC-065 R6) ------------------------------------------

test("losing writes the exit reason with the stage change", async () => {
  const store = new InMemoryPipelineStore();
  store.seed([opp()]);
  const c = ctx("sales_rep", "business", store);
  const refused = await advanceStage(c, "opp_1", { to: "lost" });
  assert.equal(refused.ok === false && refused.violations[0]!.code, "exit_reason_required");
  assert.equal((await store.getOpportunity(WS, "opp_1"))?.status, "open", "nothing written without a reason");
  unwrap(await advanceStage(c, "opp_1", { to: "lost", exitReason: { code: "lost_to_competitor", note: "友商价格低 15%" } }));
  const exit = unwrap(await dealExit(c, "opp_1"));
  assert.equal(exit?.outcome, "lost");
  assert.equal(exit?.reasonCode, "lost_to_competitor");
  assert.equal(exit?.decidedBySub, "usr_me", "the session is the decider");
});

test("abandoning keeps the stage, closes the deal and records why; a second attempt is refused", async () => {
  const store = new InMemoryPipelineStore();
  store.seed([opp()]);
  const c = ctx("sales_rep", "business", store);
  unwrap(await abandonOpportunity(c, "opp_1", { reasonCode: "timing" }));
  const after = await store.getOpportunity(WS, "opp_1");
  assert.equal(after?.status, "abandoned");
  assert.equal(after?.stage, "negotiate", "where we gave up is kept");
  assert.equal(after?.forecastCategory, "closed");
  assert.ok(after?.closedAt instanceof Date);
  assert.equal(unwrap(await dealExit(c, "opp_1"))?.outcome, "abandoned");
  const again = await abandonOpportunity(c, "opp_1", { reasonCode: "timing" });
  assert.equal(again.ok === false && again.violations[0]!.code, "not_open");
});

test("abandoning needs pipeline write - a read-only member is refused", async () => {
  const store = new InMemoryPipelineStore();
  store.seed([opp()]);
  const r = await abandonOpportunity(ctx("executive", "business", store), "opp_1", { reasonCode: "timing" });
  assert.equal(r.ok, false);
  assert.equal((await store.getOpportunity(WS, "opp_1"))?.status, "open");
});

// --- 复盘覆盖放弃 (YC-065 R7) ---------------------------------------------------

test("an abandoned deal can be reviewed with a 'not won' reason, and it is listed as owed until then", async () => {
  const store = new InMemoryPipelineStore();
  store.seed([opp()]);
  const c = ctx("sales_rep", "business", store);
  unwrap(await abandonOpportunity(c, "opp_1", { reasonCode: "no_budget" }));
  assert.deepEqual(unwrap(await listPendingReviews(c)).map((o) => o.id), ["opp_1"], "owed like a loss");
  const reasons = unwrap(await listWinLossReasons(c));
  const lossReason = reasons.find((r) => r.forLost && !r.forWon)!;
  const winOnly = reasons.find((r) => r.forWon && !r.forLost);
  if (winOnly) {
    const wrong = await recordWinLossReview(c, "opp_1", { primaryReasonId: winOnly.id, competitor: null, lessons: null });
    assert.equal(wrong.ok === false && wrong.violations[0]!.code, "reason_wrong_outcome");
  }
  const saved = unwrap(await recordWinLossReview(c, "opp_1", { primaryReasonId: lossReason.id, competitor: null, lessons: "预算冻结前没锁定" }));
  assert.equal(saved.outcome, "abandoned");
  assert.equal(unwrap(await winLossReviewOf(c, "opp_1"))?.lessons, "预算冻结前没锁定");
  assert.deepEqual(unwrap(await listPendingReviews(c)), []);
});

test("an open deal still has nothing to review", async () => {
  const store = new InMemoryPipelineStore();
  store.seed([opp()]);
  const r = await recordWinLossReview(ctx("sales_rep", "business", store), "opp_1", { primaryReasonId: null, competitor: null, lessons: null });
  assert.equal(r.ok === false && r.violations[0]!.code, "not_closed");
});

test("the new reads and the abandon are gated, and a missing deal is named", async () => {
  const store = new InMemoryPipelineStore();
  store.seed([opp()]);
  // Below business: the review read is a paid step.
  assert.equal((await winLossReviewOf(ctx("sales_rep", "pro", store), "opp_1")).ok, false);
  // No product access at all: even the exit reason is refused.
  assert.equal((await dealExit(ctx("sales_rep", null, store), "opp_1")).ok, false);
  const missing = await abandonOpportunity(ctx("sales_rep", "business", store), "nope", { reasonCode: "timing" });
  assert.equal(missing.ok === false && missing.violations[0]!.code, "not_found");
  const bad = await abandonOpportunity(ctx("sales_rep", "business", store), "opp_1", { reasonCode: "lost_to_competitor" });
  assert.equal(bad.ok === false && bad.violations[0]!.code, "exit_reason_invalid");
});
