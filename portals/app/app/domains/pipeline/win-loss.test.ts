import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_ENTITLEMENT, type Entitlement } from "../../entitlement/types";
import { permissionsForRoles, type RoleCode } from "../../authz/catalog";
import { money } from "../shared/money";
import { unwrap } from "../shared/result";
import { InMemoryPipelineStore, type OpportunityRecord } from "./store";
import {
  advanceStage,
  listPendingReviews,
  recordWinLossReview,
  type PipelineContext,
} from "./service";

const WS = "ws_1";

function opp(over: Partial<OpportunityRecord> = {}): OpportunityRecord {
  return {
    id: "opp_1",
    workspaceId: WS,
    opportunityNo: "OPP-1",
  createdAt: new Date("2026-01-01T00:00:00Z"),
    name: "Deal",
    accountId: "acc_1",
    planId: null,
    campaignId: null,
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

test("re-closing an already-reviewed deal does NOT demand a second review", async () => {
  // The bug this covers: advanceStage did not load the review state, so
  // hasWinLossReview was undefined, requiresWinLossReview was always true, and
  // a second insert would have hit uidx_win_loss_review_opp.
  const store = new InMemoryPipelineStore();
  store.seed([opp()]);
  const c = ctx("sales_leader", "business", store);

  await advanceStage(c, "opp_1", { to: "won" });
  unwrap(await recordWinLossReview(c, "opp_1", { primaryReason: "fit", lessons: "Strong champion." }));

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
  const out = await advanceStage(ctx("sales_rep", "business", store), "opp_1", { to: "lost" });
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

  unwrap(await recordWinLossReview(c, "won_unreviewed", { primaryReason: "price" }));
  const after = unwrap(await listPendingReviews(c));
  assert.deepEqual(after.map((o) => o.id), ["lost_unreviewed"]);
});

// --- The outcome cannot be asserted by the caller --------------------------

test("the outcome is derived from the deal, never taken from the request", async () => {
  // A review claiming "won" on a lost deal would corrupt the one dataset the
  // learning loop reads.
  const store = new InMemoryPipelineStore();
  store.seed([opp({ status: "lost", stage: "lost", closedAt: new Date() })]);
  const review = unwrap(
    await recordWinLossReview(ctx("sales_leader", "business", store), "opp_1", {
      primaryReason: "competitor",
      competitor: "Acme Corp",
    }),
  );
  assert.equal(review.outcome, "lost");
});

test("the reviewer is the session subject", async () => {
  const store = new InMemoryPipelineStore();
  store.seed([opp({ status: "won", stage: "won", closedAt: new Date() })]);
  const review = unwrap(
    await recordWinLossReview(ctx("sales_leader", "business", store), "opp_1", { primaryReason: "fit" }),
  );
  assert.equal(review.reviewerSub, "usr_me");
});

test("an open deal has no outcome to review", async () => {
  const store = new InMemoryPipelineStore();
  store.seed([opp()]);
  const r = await recordWinLossReview(ctx("sales_leader", "business", store), "opp_1", {
    primaryReason: "fit",
  });
  assert.equal(r.ok === false && r.violations[0].code, "not_closed");
});

test("a review is revised, not duplicated", async () => {
  const store = new InMemoryPipelineStore();
  store.seed([opp({ status: "lost", stage: "lost", closedAt: new Date() })]);
  const c = ctx("sales_leader", "business", store);

  const first = unwrap(await recordWinLossReview(c, "opp_1", { primaryReason: "price" }));
  const second = unwrap(
    await recordWinLossReview(c, "opp_1", { primaryReason: "competitor", competitor: "Acme" }),
  );

  assert.equal(first.id, second.id, "one review per opportunity");
  assert.equal((await store.getWinLossReview(WS, "opp_1"))?.primaryReason, "competitor");
});

// --- Gates ------------------------------------------------------------------

test("win/loss is a business-tier capability", async () => {
  const store = new InMemoryPipelineStore();
  store.seed([opp({ status: "won", stage: "won", closedAt: new Date() })]);
  const r = await recordWinLossReview(ctx("sales_leader", "pro", store), "opp_1", { primaryReason: "fit" });
  assert.equal(r.ok === false && r.violations[0].code, "feature_not_in_tier");
});

test("recording needs pipeline.write; reading needs only pipeline.read", async () => {
  const store = new InMemoryPipelineStore();
  store.seed([opp({ status: "won", stage: "won", closedAt: new Date() })]);

  assert.ok(unwrap(await listPendingReviews(ctx("viewer", "business", store))).length === 1);
  const r = await recordWinLossReview(ctx("viewer", "business", store), "opp_1", { primaryReason: "fit" });
  assert.equal(r.ok === false && r.violations[0].code, "permission_denied");
});

test("a review never crosses a workspace boundary", async () => {
  const store = new InMemoryPipelineStore();
  store.seed([opp({ workspaceId: "ws_other", status: "won", stage: "won", closedAt: new Date() })]);
  const r = await recordWinLossReview(ctx("sales_leader", "business", store), "opp_1", {
    primaryReason: "fit",
  });
  assert.equal(r.ok === false && r.violations[0].code, "not_found");
});
