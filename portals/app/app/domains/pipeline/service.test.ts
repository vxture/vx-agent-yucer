import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_ENTITLEMENT, type Entitlement } from "../../entitlement/types";
import { permissionsForRoles, type RoleCode } from "../../authz/catalog";
import { money } from "../shared/money";
import { unwrap } from "../shared/result";
import { InMemoryPipelineStore, type OpportunityRecord } from "./store";
import { InMemoryCatalogStore } from "../catalog/store";
import { approvalFor } from "../catalog/lib/pricing";
import {
  advanceStage,
  listPipeline,
  approveLineDiscount,
  createOpportunity,
  listRenewedProjectIds,
  previewCategories,
  updateCommercialTerms,
  replaceOpportunityLines,
  submitForecast,
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
    campaignId: "camp_1",
    sourceProjectId: null,
    territoryId: "t_1",
    ownerSub: "usr_rep",
    stage: "discover",
    forecastCategory: "commit",
    amount: money(100_000),
    probability: 25,
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

// --- The gate runs before the rule -----------------------------------------

test("an unentitled workspace is told about the tier, not about the stage machine", async () => {
  // A member who may not touch the pipeline should learn that, not learn that
  // their transition was invalid.
  const store = new InMemoryPipelineStore();
  store.seed([opp()]);
  const r = await advanceStage(ctx("sales_rep", null, store), "opp_1", { to: "validate" });
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.violations[0].code, "no_data_access");
});

test("a member without pipeline.write cannot advance a stage", async () => {
  const store = new InMemoryPipelineStore();
  store.seed([opp()]);
  const r = await advanceStage(ctx("sales_ops", "enterprise", store), "opp_1", { to: "validate" });
  assert.equal(r.ok === false && r.violations[0].code, "permission_denied");
});

test("listing is gated too", async () => {
  const store = new InMemoryPipelineStore();
  store.seed([opp()]);
  assert.equal(unwrap(await listPipeline(ctx("viewer", "free", store))).length, 1);
  assert.equal((await listPipeline(ctx("viewer", null, store))).ok, false);
});

// --- Workspace isolation ----------------------------------------------------

test("an opportunity in another workspace is not found, not forbidden", async () => {
  // Distinguishing the two would turn a 404 into an existence oracle.
  const store = new InMemoryPipelineStore();
  store.seed([opp({ workspaceId: "ws_other" })]);
  const r = await advanceStage(ctx("sales_rep", "pro", store), "opp_1", { to: "validate" });
  assert.equal(r.ok === false && r.violations[0].code, "not_found");
});

test("listing never crosses a workspace boundary", async () => {
  const store = new InMemoryPipelineStore();
  store.seed([opp({ id: "mine" }), opp({ id: "theirs", workspaceId: "ws_other" })]);
  const rows = unwrap(await listPipeline(ctx("sales_rep", "pro", store)));
  assert.deepEqual(rows.map((r) => r.id), ["mine"]);
});

// --- Stage change: patch and journal together ------------------------------

test("advancing writes the patch and the journal event as one act", async () => {
  const store = new InMemoryPipelineStore();
  store.seed([opp()]);
  const c = ctx("sales_rep", "pro", store);

  const r = unwrap(await advanceStage(c, "opp_1", { to: "validate" }));
  assert.equal(r.stage, "validate");

  const row = await store.getOpportunity(WS, "opp_1");
  assert.equal(row?.stage, "validate");
  assert.equal(row?.probability, 50, "stage default follows when nobody overrode it");

  const events = await store.listStageEvents(WS, "opp_1");
  assert.equal(events.length, 1);
  assert.equal(events[0].fromStage, "discover");
  assert.equal(events[0].toStage, "validate");
});

test("the actor is the session subject, never the caller's choice", async () => {
  const store = new InMemoryPipelineStore();
  store.seed([opp()]);
  await advanceStage(ctx("sales_rep", "pro", store), "opp_1", { to: "validate" });
  const events = await store.listStageEvents(WS, "opp_1");
  assert.equal(events[0].actorSub, "usr_me");
});

test("an illegal transition is refused after the gate passes", async () => {
  const store = new InMemoryPipelineStore();
  store.seed([opp({ stage: "won", status: "won", probability: 100, closedAt: new Date() })]);
  const r = await advanceStage(ctx("sales_rep", "pro", store), "opp_1", { to: "negotiate" });
  assert.equal(r.ok === false && r.violations[0].code, "terminal_stage");
  // Nothing was journalled for a refused change.
  assert.equal((await store.listStageEvents(WS, "opp_1")).length, 0);
});

test("winning sets stage, status and closed_at together", async () => {
  const store = new InMemoryPipelineStore();
  store.seed([opp({ stage: "negotiate", probability: 90 })]);
  await advanceStage(ctx("sales_rep", "pro", store), "opp_1", { to: "won" });
  const row = await store.getOpportunity(WS, "opp_1");
  assert.equal(row?.status, "won");
  assert.ok(row?.closedAt instanceof Date);
  assert.equal(row?.probability, 100);
});

// --- Forecast ---------------------------------------------------------------

test("submitting a forecast needs the dedicated forecast permission", async () => {
  const store = new InMemoryPipelineStore();
  store.seed([opp()]);
  const scope = { scopeType: "workspace" as const, territoryId: null, ownerSub: null };

  // A rep may advance deals but not commit a number upward.
  const rep = await submitForecast(ctx("sales_rep", "pro", store), { period: "2026Q3", scope });
  assert.equal(rep.ok === false && rep.violations[0].code, "permission_denied");

  const opsResult = unwrap(await submitForecast(ctx("sales_ops", "pro", store), { period: "2026Q3", scope }));
  assert.equal(opsResult.commitAmount.amount, 100_000);
});

test("a snapshot includes closed deals, because attainment is measured from them", async () => {
  const store = new InMemoryPipelineStore();
  store.seed([
    opp({ id: "open", forecastCategory: "commit", amount: money(100) }),
    opp({
      id: "won",
      stage: "won",
      status: "won",
      forecastCategory: "closed",
      amount: money(900),
      closedAt: new Date(),
    }),
  ]);
  const snap = unwrap(
    await submitForecast(ctx("sales_ops", "pro", store), {
      period: "2026Q3",
      scope: { scopeType: "workspace", territoryId: null, ownerSub: null },
    }),
  );
  assert.equal(snap.commitAmount.amount, 100);
  assert.equal(snap.closedAmount.amount, 900);
});

test("snapshots accumulate rather than replace - that is the whole point", async () => {
  const store = new InMemoryPipelineStore();
  store.seed([opp()]);
  const c = ctx("sales_ops", "pro", store);
  const scope = { scopeType: "workspace" as const, territoryId: null, ownerSub: null };

  await submitForecast(c, { period: "2026Q3", scope, snapshotAt: new Date("2026-07-01T00:00:00Z") });
  await submitForecast(c, { period: "2026Q3", scope, snapshotAt: new Date("2026-08-01T00:00:00Z") });

  const history = await store.listForecastSnapshots(WS, { period: "2026Q3" });
  assert.equal(history.length, 2, "forecast accuracy needs every historical snapshot");
});

// --- opportunity lines (batch 6b-3, ADR-014 section 2) ----------------------
//
// The claim under test is one sentence from ADR-014: WHEN LINES EXIST, THE
// LINES ARE AUTHORITATIVE and the header equals their sum. It cannot be a DDL
// constraint - it spans a header and many rows - so it is only true if this
// service keeps it true, which makes these the tests that hold the rule up.

function catalogWith(floor: number | null): InMemoryCatalogStore {
  const store = new InMemoryCatalogStore();
  store.seed({
    products: [
      { id: "p1", workspaceId: WS, productCode: "P-1", name: "POS", category: null, unit: "seat", status: "active" },
      { id: "p2", workspaceId: WS, productCode: "P-2", name: "Rollout", category: null, unit: "day", status: "active" },
    ],
    prices:
      floor === null
        ? []
        : [
            {
              id: "e1",
              workspaceId: WS,
              productId: "p1",
              currency: "CNY",
              listPrice: 1000,
              floorPrice: floor,
              effectiveAt: new Date("2026-01-01"),
            },
          ],
  });
  return store;
}

function lineCtx(role: RoleCode, tier: Entitlement["tier"], floor: number | null = 800) {
  const store = new InMemoryPipelineStore();
  store.seed([opp()]);
  // `deals` keeps the CONCRETE store alongside the context, so a second context
  // on the same data (a quoter and an approver, which is the normal case for
  // this feature) can be built without re-seeding and drifting apart.
  return { ...ctx(role, tier, store), catalog: catalogWith(floor), deals: store };
}

test("the header becomes the sum of the lines - ADR-014 section 2", async () => {
  const c = lineCtx("sales_rep", "free");
  const r = unwrap(
    await replaceOpportunityLines(c, "opp_1", [
      { productId: "p1", quantity: 10, unitPrice: 900 },
      { productId: "p2", quantity: 2, unitPrice: 5000 },
    ]),
  );
  assert.equal(r.amount, 19_000);

  // The header, not just the return value. A function that reported a total it
  // had not written would pass a test on its own output and leave the two
  // numbers drifting, which is exactly the accounting this rule exists to stop.
  const after = await c.store.getOpportunity(WS, "opp_1");
  assert.equal(after?.amount?.amount, 19_000);
});

test("needsApproval is computed from the floor, never taken from the caller", async () => {
  const c = lineCtx("sales_rep", "free", 800);
  // 900 is above the 800 floor; 700 is below it.
  const ok1 = unwrap(await replaceOpportunityLines(c, "opp_1", [{ productId: "p1", quantity: 1, unitPrice: 900 }]));
  assert.equal(ok1.needsApproval, 0);

  const flagged = unwrap(await replaceOpportunityLines(c, "opp_1", [{ productId: "p1", quantity: 1, unitPrice: 700 }]));
  assert.equal(flagged.needsApproval, 1);
});

test("an unpriced product is not a discount", async () => {
  // "Below floor" and "has no floor" are different states. Flagging an unpriced
  // product would send every new product to approval on its first quote.
  const c = lineCtx("sales_rep", "free", null);
  const r = unwrap(await replaceOpportunityLines(c, "opp_1", [{ productId: "p1", quantity: 1, unitPrice: 1 }]));
  assert.equal(r.needsApproval, 0);
});

test("replacing with no lines leaves the header alone", async () => {
  const c = lineCtx("sales_rep", "free");
  unwrap(await replaceOpportunityLines(c, "opp_1", [{ productId: "p1", quantity: 10, unitPrice: 900 }]));
  const r = unwrap(await replaceOpportunityLines(c, "opp_1", []));
  assert.equal(r.lines, 0);

  // NOT zeroed. Removing every line returns the deal to the legacy shape where
  // the header stands on its own, and `reconciles` calls that legal - so
  // writing 0 here would invent a number nobody asked for.
  const after = await c.store.getOpportunity(WS, "opp_1");
  assert.equal(after?.amount?.amount, 9_000);
});

test("a closed deal cannot be repriced", async () => {
  const store = new InMemoryPipelineStore();
  store.seed([opp({ closedAt: new Date("2026-07-01"), status: "won", stage: "won" })]);
  const c = { ...ctx("sales_rep", "free", store), catalog: catalogWith(800) };
  const r = await replaceOpportunityLines(c, "opp_1", [{ productId: "p1", quantity: 1, unitPrice: 1 }]);
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.violations[0]!.code, "terminal_stage");
});

test("a zero quantity is refused before anything is written", async () => {
  const c = lineCtx("sales_rep", "free");
  const r = await replaceOpportunityLines(c, "opp_1", [{ productId: "p1", quantity: 0, unitPrice: 900 }]);
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.violations[0]!.code, "quantity_positive");
  // Nothing partial: the header is untouched.
  const after = await c.store.getOpportunity(WS, "opp_1");
  assert.equal(after?.amount?.amount, 100_000);
});

// --- Signing off a below-floor price (ADR-019) ------------------------------
//
// The whole point of these: before incr/0012 the floor could raise a flag that
// nothing could ever lower, so "pending approval" was a permanent property of a
// deal rather than a step in a process.

test("a rep who can quote below the floor cannot sign off their own discount", async () => {
  // The separation IS the feature. If pipeline.write carried the signature,
  // the floor would constrain nobody.
  const c = lineCtx("sales_rep", "free", 800);
  unwrap(await replaceOpportunityLines(c, "opp_1", [{ productId: "p1", quantity: 1, unitPrice: 700 }]));
  const r = await approveLineDiscount(c, { opportunityId: "opp_1", productId: "p1", reason: "strategic" });
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.violations[0]!.code, "permission_denied");
});

test("a leader signs off, and the flagged line reads as approved afterwards", async () => {
  const quoting = lineCtx("sales_rep", "free", 800);
  unwrap(await replaceOpportunityLines(quoting, "opp_1", [{ productId: "p1", quantity: 2, unitPrice: 700 }]));

  const signing = { ...ctx("sales_leader", "free", quoting.deals), catalog: quoting.catalog };
  const appr = unwrap(
    await approveLineDiscount(signing, { opportunityId: "opp_1", productId: "p1", reason: "multi-year" }),
  );

  // The price and the floor come off the line and the price book, not off the
  // caller: an approver signs what is there.
  assert.equal(appr.unitPrice, 700);
  assert.equal(appr.floorPrice, 800);
  assert.equal(appr.approvedBySub, "usr_me");

  const lines = await quoting.catalog.listLines(WS, "opp_1");
  assert.equal(approvalFor(lines[0]!, await quoting.catalog.listApprovals(WS, "opp_1")) !== null, true);
});

test("a signature survives an edit to a DIFFERENT line on the same deal", async () => {
  // This is why the approval is keyed by price and not held on the line: lines
  // are rewritten wholesale, so an id-matched signature would evaporate here.
  const c = lineCtx("sales_rep", "free", 800);
  unwrap(
    await replaceOpportunityLines(c, "opp_1", [
      { productId: "p1", quantity: 1, unitPrice: 700 },
      { productId: "p2", quantity: 1, unitPrice: 500 },
    ]),
  );
  const signing = { ...ctx("sales_leader", "free", c.deals), catalog: c.catalog };
  unwrap(await approveLineDiscount(signing, { opportunityId: "opp_1", productId: "p1", reason: "multi-year" }));

  // p2's quantity changes; p1 is untouched.
  unwrap(
    await replaceOpportunityLines(c, "opp_1", [
      { productId: "p1", quantity: 1, unitPrice: 700 },
      { productId: "p2", quantity: 9, unitPrice: 500 },
    ]),
  );

  const lines = await c.catalog.listLines(WS, "opp_1");
  const approvals = await c.catalog.listApprovals(WS, "opp_1");
  const p1 = lines.find((l) => l.productId === "p1")!;
  assert.equal(approvalFor(p1, approvals) !== null, true);
});

test("re-quoting LOWER voids the signature, and re-quoting back UP restores it", async () => {
  const c = lineCtx("sales_rep", "free", 800);
  unwrap(await replaceOpportunityLines(c, "opp_1", [{ productId: "p1", quantity: 1, unitPrice: 700 }]));
  const signing = { ...ctx("sales_leader", "free", c.deals), catalog: c.catalog };
  unwrap(await approveLineDiscount(signing, { opportunityId: "opp_1", productId: "p1", reason: "multi-year" }));

  // Nobody signed off 600.
  unwrap(await replaceOpportunityLines(c, "opp_1", [{ productId: "p1", quantity: 1, unitPrice: 600 }]));
  let approvals = await c.catalog.listApprovals(WS, "opp_1");
  let line = (await c.catalog.listLines(WS, "opp_1"))[0]!;
  assert.equal(approvalFor(line, approvals), null);

  // 700 was signed off, and still is.
  unwrap(await replaceOpportunityLines(c, "opp_1", [{ productId: "p1", quantity: 1, unitPrice: 700 }]));
  approvals = await c.catalog.listApprovals(WS, "opp_1");
  line = (await c.catalog.listLines(WS, "opp_1"))[0]!;
  assert.equal(approvalFor(line, approvals) !== null, true);
});

test("a line at or above its floor has nothing to approve", async () => {
  const c = lineCtx("sales_rep", "free", 800);
  unwrap(await replaceOpportunityLines(c, "opp_1", [{ productId: "p1", quantity: 1, unitPrice: 900 }]));
  const signing = { ...ctx("sales_leader", "free", c.deals), catalog: c.catalog };
  const r = await approveLineDiscount(signing, { opportunityId: "opp_1", productId: "p1", reason: "why not" });
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.violations[0]!.code, "not_below_floor");
});

test("an approval without a stated reason is refused", async () => {
  const c = lineCtx("sales_rep", "free", 800);
  unwrap(await replaceOpportunityLines(c, "opp_1", [{ productId: "p1", quantity: 1, unitPrice: 700 }]));
  const signing = { ...ctx("sales_leader", "free", c.deals), catalog: c.catalog };
  const r = await approveLineDiscount(signing, { opportunityId: "opp_1", productId: "p1", reason: "   " });
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.violations[0]!.code, "reason_required");
});

test("the same price is not signed twice", async () => {
  const c = lineCtx("sales_rep", "free", 800);
  unwrap(await replaceOpportunityLines(c, "opp_1", [{ productId: "p1", quantity: 1, unitPrice: 700 }]));
  const signing = { ...ctx("sales_leader", "free", c.deals), catalog: c.catalog };
  unwrap(await approveLineDiscount(signing, { opportunityId: "opp_1", productId: "p1", reason: "multi-year" }));
  const again = await approveLineDiscount(signing, { opportunityId: "opp_1", productId: "p1", reason: "again" });
  assert.equal(again.ok, false);
  assert.equal(again.ok === false && again.violations[0]!.code, "already_approved");
});

test("a closed deal's prices cannot be signed off after the fact", async () => {
  const c = lineCtx("sales_rep", "free", 800);
  unwrap(await replaceOpportunityLines(c, "opp_1", [{ productId: "p1", quantity: 1, unitPrice: 700 }]));
  await c.store.updateCommercialTerms(WS, "opp_1", {});
  const closedStore = new InMemoryPipelineStore();
  closedStore.seed([opp({ closedAt: new Date("2026-07-01"), status: "won", stage: "won" })]);
  const signing = { ...ctx("sales_leader", "free", closedStore), catalog: c.catalog };
  const r = await approveLineDiscount(signing, { opportunityId: "opp_1", productId: "p1", reason: "late" });
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.violations[0]!.code, "terminal_stage");
});

test("the floor is copied in, so a later price change cannot rewrite what was authorised", async () => {
  const c = lineCtx("sales_rep", "free", 800);
  unwrap(await replaceOpportunityLines(c, "opp_1", [{ productId: "p1", quantity: 1, unitPrice: 700 }]));
  const signing = { ...ctx("sales_leader", "free", c.deals), catalog: c.catalog };
  const appr = unwrap(
    await approveLineDiscount(signing, { opportunityId: "opp_1", productId: "p1", reason: "multi-year" }),
  );
  await c.catalog.appendPrice(WS, {
    productId: "p1",
    currency: "CNY",
    listPrice: 1000,
    floorPrice: 200,
    effectiveAt: new Date("2026-06-01"),
  });
  const stored = (await c.catalog.listApprovals(WS, "opp_1"))[0]!;
  assert.equal(stored.floorPrice, 800);
  assert.equal(appr.floorPrice, 800);
});

// --- Creating a deal directly (TD-016) --------------------------------------

test("a viewer may read the pipeline and may not create a deal", async () => {
  // The pair that pins the gate to the WRITE action: viewer holds pipeline.read
  // and not pipeline.write, so a guard mistakenly checking the read action
  // would let this through.
  const c = ctx("viewer", "free");
  const r = await createOpportunity(c, {
    name: "Corridor deal",
    accountId: "acc_1",
    territoryId: null,
    ownerSub: null,
    amount: null,
    expectedCloseAt: null,
  });
  assert.equal(r.ok === false && r.violations[0]!.code, "permission_denied");
});

test("a deal created directly carries no campaign, and the creator owns it", async () => {
  const store = new InMemoryPipelineStore();
  const c = ctx("sales_rep", "free", store);
  const made = unwrap(
    await createOpportunity(c, {
      name: "Corridor deal",
      accountId: "acc_1",
      territoryId: null,
      ownerSub: null,
      amount: money(500_000),
      expectedCloseAt: null,
    }),
  );
  // campaign_id has no UPDATE grant, so what is written here is what the
  // traceability join reports forever.
  assert.equal(made.campaignId, null);
  assert.equal(made.planId, null);
  assert.equal(made.ownerSub, "usr_me", "whoever created it owns it until reassigned");
  assert.equal(made.stage, "qualify", "and the stage machine owns every move after this");
  assert.equal(made.status, "open");
});

test("an explicit owner survives, rather than being overwritten by the creator", async () => {
  const c = ctx("sales_leader", "free", new InMemoryPipelineStore());
  const made = unwrap(
    await createOpportunity(c, {
      name: "Handed over",
      accountId: "acc_1",
      territoryId: null,
      ownerSub: "usr_rep",
      amount: null,
      expectedCloseAt: null,
    }),
  );
  assert.equal(made.ownerSub, "usr_rep");
});

test("a created deal is immediately in the pipeline it was created into", async () => {
  // The thing a create form is actually for. A verb that returns a record but
  // does not put it where the page reads from is the defect this batch exists
  // to stop.
  const store = new InMemoryPipelineStore();
  const c = ctx("sales_rep", "free", store);
  unwrap(
    await createOpportunity(c, {
      name: "Corridor deal",
      accountId: "acc_1",
      territoryId: null,
      ownerSub: null,
      amount: null,
      expectedCloseAt: null,
    }),
  );
  const listed = unwrap(await listPipeline(c, {}));
  assert.equal(listed.length, 1);
  assert.equal(listed[0]!.name, "Corridor deal");
});

// --- The renewal leg --------------------------------------------------------

test("a renewal is attributed to the project, not to a rep who found it", async () => {
  // self_sourced would credit new business for revenue the existing book
  // produced. Same reassignment of credit the frozen columns exist to prevent,
  // only done at creation where nobody would see it.
  const store = new InMemoryPipelineStore();
  const created = unwrap(
    await createOpportunity(ctx("sales_rep", "business", store), {
      name: "Renewal of the platform term",
      accountId: "acc_1",
      territoryId: null,
      ownerSub: null,
      amount: money(880_000),
      expectedCloseAt: null,
      sourceProjectId: "prj_6",
    }),
  );
  assert.equal(created.sourceProjectId, "prj_6");
  // No campaign. Inheriting the first term's campaign would let it keep
  // earning credit for every renewal the customer ever signs.
  assert.equal(created.campaignId, null);
});

test("an ordinary deal carries no source project", async () => {
  const store = new InMemoryPipelineStore();
  const created = unwrap(
    await createOpportunity(ctx("sales_rep", "business", store), {
      name: "Corridor deal",
      accountId: "acc_1",
      territoryId: null,
      ownerSub: null,
      amount: null,
      expectedCloseAt: null,
    }),
  );
  assert.equal(created.sourceProjectId, null);
});

test("the renewed-project set names every project with a deal open off it", async () => {
  const store = new InMemoryPipelineStore();
  const c = ctx("sales_rep", "business", store);
  for (const projectId of ["prj_6", "prj_6", "prj_9"]) {
    unwrap(
      await createOpportunity(c, {
        name: `Renewal ${projectId}`,
        accountId: "acc_1",
        territoryId: null,
        ownerSub: null,
        amount: null,
        expectedCloseAt: null,
        sourceProjectId: projectId,
      }),
    );
  }
  const ids = unwrap(await listRenewedProjectIds(c));
  // A SET, so a project renewed twice is named once - the renewal page asks
  // "has this been renewed", not "how often".
  assert.deepEqual([...ids].sort(), ["prj_6", "prj_9"]);
});

test("the renewed-project set is refused to a workspace with no entitlement", async () => {
  // Same gate as listing deals, because it discloses the same thing: that a
  // deal exists. `pipeline.manage` reaches down to the free tier, so an
  // unentitled workspace is what refusal looks like here.
  const store = new InMemoryPipelineStore();
  const result = await listRenewedProjectIds(ctx("viewer", null, store));
  assert.equal(result.ok, false);
});

// --- The forecast rule's read side -----------------------------------------

test("the preview offers a verdict per open deal and excludes the closed", async () => {
  const store = new InMemoryPipelineStore();
  store.seed([
    opp({ id: "opp_open", stage: "negotiate", forecastCategory: "commit" }),
    opp({ id: "opp_won", stage: "won", status: "won", forecastCategory: "closed" }),
  ]);
  const rows = unwrap(await previewCategories(ctx("sales_rep", "business", store)));
  // listOpportunities excludes terminal deals unless asked, so the settled
  // rows never reach the page to bury the ones worth reading.
  assert.deepEqual(rows.map((r) => r.opportunity.id), ["opp_open"]);
  assert.equal(rows[0].verdict.kind, "suggested");
});

test("disagreements sort above agreements", async () => {
  const store = new InMemoryPipelineStore();
  store.seed([
    // Probability pinned rather than left to the shared fixture, which carries
    // 25 - that lands in `pipeline` and would make BOTH rows disagree, so the
    // test would pass or fail on the sort's tie-break instead of on the sort.
    opp({ id: "opp_agrees", stage: "negotiate", probability: 90, forecastCategory: "commit" }),
    // No close date caps it at pipeline while the rep has it at commit.
    opp({
      id: "opp_disagrees",
      stage: "negotiate",
      probability: 90,
      forecastCategory: "commit",
      expectedCloseAt: null,
    }),
  ]);
  const rows = unwrap(await previewCategories(ctx("sales_rep", "business", store)));
  assert.deepEqual(rows.map((r) => r.opportunity.id), ["opp_disagrees", "opp_agrees"]);
});

test("dwell comes from the journal, and a deal with no journal is not stalled", async () => {
  const store = new InMemoryPipelineStore();
  store.seed(
    [opp({ id: "opp_moved", stage: "negotiate", probability: 90, forecastCategory: "commit" }),
     opp({ id: "opp_silent", stage: "negotiate", probability: 90, forecastCategory: "commit" })],
    {
      events: [
        {
          id: "evt_1",
          opportunityId: "opp_moved",
          fromStage: "propose",
          toStage: "negotiate",
          reason: null,
          actorSub: "usr_rep",
          occurredAt: new Date("2026-01-01T00:00:00Z"),
        },
      ],
    },
  );
  const rows = unwrap(
    await previewCategories(ctx("sales_rep", "business", store), {
      now: new Date("2026-08-31T00:00:00Z"),
    }),
  );
  const moved = rows.find((r) => r.opportunity.id === "opp_moved")!;
  const silent = rows.find((r) => r.opportunity.id === "opp_silent")!;

  assert.equal(moved.daysAtStage, 242);
  assert.equal(moved.verdict.kind === "suggested" && moved.verdict.category, "best_case");

  // UNKNOWN IS NOT "A LONG TIME". Defaulting an empty journal to the deal's
  // creation date would downgrade every deal older than the journal itself.
  assert.equal(silent.daysAtStage, null);
  assert.equal(silent.verdict.kind === "suggested" && silent.verdict.category, "commit");
});

test("a rep sees the disagreement and cannot apply it", async () => {
  // THE PERMISSION AXIS. Both calls are on the pro tier, so the entitlement is
  // not what separates them: the catalog gives sales_rep `pipeline.read` (which
  // `pipeline.forecast.view` needs) but not `pipeline.forecast` (which
  // categorize needs). Seeing it is the point; making it go away quietly is not.
  const store = new InMemoryPipelineStore();
  store.seed([
    opp({ stage: "negotiate", probability: 90, forecastCategory: "commit", expectedCloseAt: null }),
  ]);
  const rep = ctx("sales_rep", "pro", store);

  const seen = unwrap(await previewCategories(rep));
  assert.equal(seen[0].verdict.kind === "suggested" && seen[0].verdict.agrees, false);

  const applied = await updateCommercialTerms(rep, "opp_1", { forecastCategory: "pipeline" });
  assert.equal(applied.ok, false);
});

test("a free-tier workspace cannot read the forecast rule at all", async () => {
  // THE TIER AXIS, which is a different question from who may act. The page is
  // built entirely on `pipeline.forecast`, a pro capability - gating it on the
  // free-tier `pipeline.view` would have handed the whole output of a paid
  // feature to a workspace that never bought it.
  const store = new InMemoryPipelineStore();
  store.seed([opp({ stage: "negotiate", probability: 90, forecastCategory: "commit" })]);
  assert.equal((await previewCategories(ctx("sales_leader", "free", store))).ok, false);
  assert.equal((await previewCategories(ctx("sales_leader", "pro", store))).ok, true);
});

test("the preview is refused to a workspace with no entitlement", async () => {
  const store = new InMemoryPipelineStore();
  const result = await previewCategories(ctx("viewer", null, store));
  assert.equal(result.ok, false);
});
