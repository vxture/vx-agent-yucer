import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_ENTITLEMENT, type Entitlement } from "../../entitlement/types";
import { permissionsForRoles, type RoleCode } from "../../authz/catalog";
import { money } from "../shared/money";
import { unwrap } from "../shared/result";
import { InMemoryPipelineStore, type OpportunityRecord } from "./store";
import {
  competitionOf,
  recordCompetitor,
  recordWinLossReview,
  removeDecisionCriterion,
  saveDecisionCriterion,
  type PipelineContext,
} from "./service";

// 竞争位置 (incr/0094) - the service half, against the in-memory store.

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
    stage: "discover",
    forecastCategory: "pipeline",
    amount: money(100_000),
    probability: 25,
    expectedCloseAt: null,
    closedAt: null,
    status: "open",
    currency: "CNY",
    ...over,
  };
}

function ctx(role: RoleCode, tier: Entitlement["tier"], store: InMemoryPipelineStore): PipelineContext {
  return {
    workspaceId: WS,
    sub: "usr_me",
    holder: { permissions: new Set(permissionsForRoles([role])) },
    entitlement: { ...EMPTY_ENTITLEMENT, workspace_id: WS, product: "yucer", tier },
    store,
  } as PipelineContext;
}

function seeded() {
  const store = new InMemoryPipelineStore();
  store.seed([opp()]);
  return store;
}

test("a rival typed by name joins the workspace list once, then is matched - by alias too", async () => {
  const store = seeded();
  const c = ctx("sales_rep", "business", store);
  const first = unwrap(await recordCompetitor(c, "opp_1", { competitorName: "友商甲" }, new Set()));
  assert.equal(first.recorded, true);
  // The same rival by the same name, differently spaced: matched, and no new version.
  const again = unwrap(await recordCompetitor(c, "opp_1", { competitorName: " 友商甲 " }, new Set()));
  assert.deepEqual(again, { recorded: false, competitorId: first.competitorId });
  assert.equal((await store.listCompetitors(WS)).length, 1);

  const view = unwrap(await competitionOf(c, "opp_1"));
  assert.deepEqual(view.field.rivals.map((r) => r.competitorId), [first.competitorId]);
  assert.equal(view.field.unknown, false);
});

test("a rival drops out as a NEW version; 'only us' then holds", async () => {
  const store = seeded();
  const c = ctx("sales_rep", "business", store);
  const { competitorId } = unwrap(await recordCompetitor(c, "opp_1", { competitorName: "友商乙", isIncumbent: true }, new Set()));
  unwrap(await recordCompetitor(c, "opp_1", { competitorId, isIncumbent: true, present: false }, new Set()));
  unwrap(await recordCompetitor(c, "opp_1", { competitorId: null }, new Set()));
  const view = unwrap(await competitionOf(c, "opp_1"));
  assert.equal(view.entries.length, 3, "three versions, nothing overwritten");
  assert.deepEqual(view.field.out, [competitorId]);
  assert.equal(view.field.onlyUs, true);
});

test("a citation must be a follow-up on this deal", async () => {
  const store = seeded();
  const r = await recordCompetitor(ctx("sales_rep", "business", store), "opp_1", { competitorName: "友商丙", interactionId: "int_other" }, new Set(["int_mine"]));
  assert.equal(r.ok === false && r.violations[0]!.code, "evidence_citation_foreign");
});

test("criteria: add, edit in place, remove - and a reader who may not write is refused", async () => {
  const store = seeded();
  const c = ctx("sales_rep", "business", store);
  const { id } = unwrap(await saveDecisionCriterion(c, "opp_1", { statement: "支持私有化部署", shapedBy: "rfp" }));
  unwrap(await saveDecisionCriterion(c, "opp_1", { id, statement: "支持私有化部署", shapedBy: "rfp", fit: "partial", fitNote: "二期" }));
  let view = unwrap(await competitionOf(c, "opp_1"));
  assert.deepEqual(view.criteria.map((x) => [x.statement, x.shapedBy, x.fit, x.fitNote]), [["支持私有化部署", "rfp", "partial", "二期"]]);
  unwrap(await removeDecisionCriterion(c, "opp_1", id));
  view = unwrap(await competitionOf(c, "opp_1"));
  assert.equal(view.criteria.length, 0);

  const viewer = ctx("viewer", "business", store);
  assert.equal((await saveDecisionCriterion(viewer, "opp_1", { statement: "x" })).ok, false);
  assert.equal((await recordCompetitor(viewer, "opp_1", { competitorName: "友商丁" }, new Set())).ok, false);
  assert.equal((await competitionOf(viewer, "opp_1")).ok, true, "reading rides pipeline.view");
});

test("an unknown deal is not_found, not a silent write", async () => {
  const store = seeded();
  const r = await recordCompetitor(ctx("sales_rep", "business", store), "opp_nope", { competitorName: "友商甲" }, new Set());
  assert.equal(r.ok === false && r.violations[0]!.code, "not_found");
});

test("a review's typed rival lands on the workspace's row - matched, or added - and counts toward the win rate", async () => {
  const store = new InMemoryPipelineStore();
  // Five lost deals, one open deal the rival is on.
  const lost = [1, 2, 3, 4, 5].map((i) => opp({ id: `opp_l${i}`, status: "lost", stage: "lost", closedAt: new Date() }));
  store.seed([opp(), ...lost]);
  const c = ctx("sales_director", "business", store);
  unwrap(await recordCompetitor(c, "opp_1", { competitorName: "Acme Corp" }, new Set()));

  // Spelled differently on the first review: still the same row.
  unwrap(await recordWinLossReview(c, "opp_l1", { primaryReasonId: null, competitor: "  acme   corp " }));
  const rivals = await store.listCompetitors(WS);
  assert.equal(rivals.length, 1);
  const review = await store.getWinLossReview(WS, "opp_l1");
  assert.equal(review?.competitorId, rivals[0]!.id);
  assert.equal(review?.competitor, null, "the free-text column is history, no longer written");

  // A name nobody recorded yet joins the list.
  unwrap(await recordWinLossReview(c, "opp_l2", { primaryReasonId: null, competitor: "Globex" }));
  assert.deepEqual((await store.listCompetitors(WS)).map((r) => r.name).sort(), ["Acme Corp", "Globex"]);

  // No rival typed: none recorded.
  unwrap(await recordWinLossReview(c, "opp_l3", { primaryReasonId: null, competitor: "" }));
  assert.equal((await store.getWinLossReview(WS, "opp_l3"))?.competitorId, null);

  // Five decided reviews against Acme give the deal page a rate: 0 of 5.
  for (const id of ["opp_l3", "opp_l4", "opp_l5"]) {
    unwrap(await recordWinLossReview(c, id, { primaryReasonId: null, competitor: "ACME CORP" }));
  }
  const view = unwrap(await competitionOf(c, "opp_1"));
  assert.deepEqual(view.winRates.get(rivals[0]!.id), { won: 0, decided: 4, rate: null });
  unwrap(await recordWinLossReview(c, "opp_l2", { primaryReasonId: null, competitor: "acme corp" }));
  const after = unwrap(await competitionOf(c, "opp_1"));
  assert.deepEqual(after.winRates.get(rivals[0]!.id), { won: 0, decided: 5, rate: 0 });
});
