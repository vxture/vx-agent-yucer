import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_ENTITLEMENT, type Entitlement } from "../../entitlement/types";
import { permissionsForRoles, type RoleCode } from "../../authz/catalog";
import { unwrap } from "../shared/result";
import { InMemoryAccountStore, type AccountRecord, type ContactRecord } from "./store";
import { InMemoryPipelineStore, type OpportunityRecord } from "../pipeline/store";
import { InMemoryPlanningStore, type TerritoryRecord } from "../planning/store";
import { InMemoryStrategyStore, type SegmentRecord } from "../strategy/store";
import { money } from "../shared/money";
import {
  decisionChainsByOpportunity,
  setBuyingRole,
  linkContacts,
  listAccounts,
  reassignAccount,
  recomputeHealth,
  upsertContact,
  workspaceCompleteness,
  type AccountContext,
} from "./service";

const WS = "ws_1";
const NOW = new Date("2026-08-15T00:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

function account(over: Partial<AccountRecord> = {}): AccountRecord {
  return {
    id: "acc_1",
    workspaceId: WS,
    accountNo: "ACC-1",
    name: "Acme",
    industry: null,
    region: null,
    segmentCode: null,
    ownerSub: "usr_rep",
    healthScore: null,
    status: "active",
    tier: "standard" as const,
    creditCode: null,
    website: null,
    employeeCount: null,
    parentId: null,
    ...over,
  };
}

function contact(id: string, _role: string, over: Partial<ContactRecord> = {}): ContactRecord {
  return {
    id,
    workspaceId: WS,
    accountId: "acc_1",
    name: id,
    title: null,
    department: null,
    email: null,
    mobile: null,
    wechat: null,
    status: "active",
    ...over,
  };
}

function ctx(role: RoleCode, tier: Entitlement["tier"], store = new InMemoryAccountStore()): AccountContext {
  return {
    workspaceId: WS,
    sub: "usr_me",
    holder: { permissions: new Set(permissionsForRoles([role])) },
    entitlement: { ...EMPTY_ENTITLEMENT, workspace_id: WS, product: "yucer", tier },
    store,
  };
}

// --- Gates ------------------------------------------------------------------

test("listing accounts is gated", async () => {
  const store = new InMemoryAccountStore();
  store.seed({ accounts: [account()] });
  assert.equal(unwrap(await listAccounts(ctx("viewer", "free", store))).length, 1);
  assert.equal((await listAccounts(ctx("viewer", null, store))).ok, false);
});

test("the relationship graph is a pro-tier capability, not a baseline read", async () => {
  // A starter workspace sees contacts; the map is what the tier sells.
  const store = new InMemoryAccountStore();
  store.seed({ accounts: [account()], contacts: [contact("c1", "economic")] });

  const starter = await decisionChainsByOpportunity(ctx("sales_rep", "starter", store), "acc_1", DEAL);
  assert.equal(starter.ok === false && starter.violations[0].code, "feature_not_in_tier");
  assert.ok((await decisionChainsByOpportunity(ctx("sales_rep", "pro", store), "acc_1", DEAL)).ok);
});

test("recomputing health needs write permission, because it writes a column", async () => {
  const store = new InMemoryAccountStore();
  store.seed({ accounts: [account()] });
  const r = await recomputeHealth(ctx("viewer", "pro", store), "acc_1");
  assert.equal(r.ok === false && r.violations[0].code, "permission_denied");
});

test("an account in another workspace is not found", async () => {
  const store = new InMemoryAccountStore();
  store.seed({ accounts: [account({ workspaceId: "ws_other" })] });
  const r = await recomputeHealth(ctx("sales_rep", "pro", store), "acc_1");
  assert.equal(r.ok === false && r.violations[0].code, "not_found");
});

// --- Health -----------------------------------------------------------------

test("health is recomputed from source and written back", async () => {
  const store = new InMemoryAccountStore();
  store.seed({
    accounts: [account({ healthScore: 99 })],
    healthInputs: {
      [`${WS}|acc_1`]: {
        openOpportunities: [{ stage: "negotiate" }],
        lastInteractionAt: daysAgo(2),
        projectHealth: ["green"],
        overdueRevenueCount: 0,
      },
    },
  });

  const out = unwrap(await recomputeHealth(ctx("sales_rep", "pro", store), "acc_1", { now: NOW }));
  assert.equal(out.persisted, true);
  const stored = await store.getAccount(WS, "acc_1");
  assert.equal(stored?.healthScore, out.score);
  // The stale 99 was replaced, not blended into.
  assert.notEqual(stored?.healthScore, 99);
});

test("the recompute never reads the stored score, so a wrong value cannot compound", async () => {
  const store = new InMemoryAccountStore();
  const inputs = {
    [`${WS}|acc_1`]: {
      openOpportunities: [],
      lastInteractionAt: daysAgo(1),
      projectHealth: [] as never[],
      overdueRevenueCount: 0,
    },
  };
  store.seed({ accounts: [account({ healthScore: 0 })], healthInputs: inputs });
  const first = unwrap(await recomputeHealth(ctx("sales_rep", "pro", store), "acc_1", { now: NOW }));

  const store2 = new InMemoryAccountStore();
  store2.seed({ accounts: [account({ healthScore: 100 })], healthInputs: inputs });
  const second = unwrap(await recomputeHealth(ctx("sales_rep", "pro", store2), "acc_1", { now: NOW }));

  assert.equal(first.score, second.score, "same inputs must give the same score regardless of what was stored");
});

test("the outcome explains itself, so a red account can be argued with", async () => {
  const store = new InMemoryAccountStore();
  store.seed({
    accounts: [account()],
    healthInputs: {
      [`${WS}|acc_1`]: {
        openOpportunities: [],
        lastInteractionAt: daysAgo(200),
        projectHealth: ["red"],
        overdueRevenueCount: 2,
      },
    },
  });
  const out = unwrap(await recomputeHealth(ctx("sales_rep", "pro", store), "acc_1", { now: NOW }));
  assert.ok(out.contributions.length >= 3);
  assert.notEqual(out.primaryConcern, null);
  for (const c of out.contributions) assert.ok(c.reason.code.length > 0);
});

test("persist:false computes without writing - for a preview", async () => {
  const store = new InMemoryAccountStore();
  store.seed({ accounts: [account({ healthScore: 50 })] });
  const out = unwrap(await recomputeHealth(ctx("sales_rep", "pro", store), "acc_1", { now: NOW, persist: false }));
  assert.equal(out.persisted, false);
  assert.equal((await store.getAccount(WS, "acc_1"))?.healthScore, 50);
});

test("accounts list sickest-first, so the list surfaces what needs attention", async () => {
  const store = new InMemoryAccountStore();
  store.seed({
    accounts: [
      account({ id: "healthy", healthScore: 90 }),
      account({ id: "sick", healthScore: 20 }),
      account({ id: "unscored", healthScore: null }),
    ],
  });
  const rows = unwrap(await listAccounts(ctx("sales_rep", "pro", store)));
  assert.deepEqual(rows.map((r) => r.id), ["sick", "healthy", "unscored"]);
});

// --- Decision chain and the append-only graph -------------------------------

test("the chain reports coverage, blockers and reachability", async () => {
  const store = new InMemoryAccountStore();
  store.seed({
    accounts: [account()],
    contacts: [contact("coach", "coach"), contact("eb", "economic"), contact("tech", "technical")],
    // THE ROLES ARE ON THE DEAL now - incr/0027. Seeding them on the people
    // would leave every deal with an empty chain, which is what makes this
    // test a check on the wiring and not only on the walk.
    opportunityContacts: [oc("coach", "coach"), oc("eb", "economic"), oc("tech", "technical")],
    relations: [
      { workspaceId: WS, accountId: "acc_1", fromContactId: "coach", toContactId: "eb", relationType: "reports_to" },
    ],
  });
  const chains = unwrap(await decisionChainsByOpportunity(ctx("sales_rep", "pro", store), "acc_1", DEAL));
  assert.equal(chains.length, 1);
  assert.deepEqual(chains[0]!.coverage.missing, []);
  assert.equal(chains[0]!.coverage.economicBuyerUnreachable, false);
});

test("an economic buyer on file but unreachable is reported as such", async () => {
  const store = new InMemoryAccountStore();
  store.seed({
    accounts: [account()],
    contacts: [contact("coach", "coach"), contact("eb", "economic"), contact("tech", "technical")],
    opportunityContacts: [oc("coach", "coach"), oc("eb", "economic"), oc("tech", "technical")],
  });
  const chains = unwrap(await decisionChainsByOpportunity(ctx("sales_rep", "pro", store), "acc_1", DEAL));
  assert.equal(
    chains[0]!.coverage.economicBuyerUnreachable,
    true,
    "having one on file is not the same as reaching them",
  );
});

test("linking is append-only and idempotent on the same edge", async () => {
  const store = new InMemoryAccountStore();
  store.seed({ accounts: [account()], contacts: [contact("a", "coach"), contact("b", "economic")] });
  const c = ctx("sales_rep", "pro", store);
  const edge = { fromContactId: "a", toContactId: "b", relationType: "reports_to" as const };

  await linkContacts(c, edge);
  await linkContacts(c, edge);
  assert.equal((await store.listRelations(WS, "acc_1")).length, 1, "uidx_account_relation_edge: one edge");
});

test("a self-relation is refused by name, not by a constraint error", async () => {
  const store = new InMemoryAccountStore();
  store.seed({ accounts: [account()], contacts: [contact("a", "coach")] });
  const r = await linkContacts(ctx("sales_rep", "pro", store), {
    fromContactId: "a",
    toContactId: "a",
    relationType: "peer_of",
  });
  assert.equal(r.ok === false && r.violations[0].code, "self_relation");
});

test("linking needs the graph write permission and the graph tier", async () => {
  const store = new InMemoryAccountStore();
  store.seed({ accounts: [account()], contacts: [contact("a", "coach"), contact("b", "economic")] });
  const edge = { fromContactId: "a", toContactId: "b", relationType: "reports_to" as const };

  const viewer = await linkContacts(ctx("viewer", "pro", store), edge);
  assert.equal(viewer.ok === false && viewer.violations[0].code, "permission_denied");

  const lowTier = await linkContacts(ctx("sales_rep", "starter", store), edge);
  assert.equal(lowTier.ok === false && lowTier.violations[0].code, "feature_not_in_tier");
});

// --- Contacts, which nothing could create until now (TD-016) ----------------

/** A stated buying role on a deal - incr/0027, the only place a role lives. */
const oc = (personId: string, buyingRole: string, opportunityId = "opp_1") => ({
  id: `oc_${personId}`,
  workspaceId: WS,
  opportunityId,
  personId,
  buyingRole: buyingRole as never,
  influence: 50,
  isPrimary: false,
});
const DEAL = [{ id: "opp_1", name: "Deal one" }];

const contactDraft = {
  id: null,
  name: "Zhang Gong",
  title: "QA Director",
  department: "Quality",
  decisionRole: "technical" as const,
  influence: 60,
  email: null,
  mobile: null,
  wechat: null,
  status: "active" as const,
};

test("a viewer may read an account and may not add a contact", () => {
  // viewer holds account.read and not account.write, which is the pair that
  // pins the gate to the WRITE action rather than to any account access.
  return upsertContact(ctx("viewer", "free"), "acc_1", contactDraft).then((r) => {
    assert.equal(r.ok === false && r.violations[0]!.code, "permission_denied");
  });
});

test("a role stated on a deal is immediately what that deal's chain reads", async () => {
  // TWO ACTS NOW, and the split is the batch. Creating the person says who
  // works at this customer; stating the role says what they are to THIS
  // purchase. Before incr/0027 the first act did both, which is why every deal
  // at a customer shared one committee.
  const store = new InMemoryAccountStore();
  store.seed({ accounts: [account()] });
  const c = ctx("sales_rep", "pro", store);
  const made = unwrap(await upsertContact(c, "acc_1", contactDraft));

  // Created, but not yet anything to this deal - and the chain says so.
  const before = unwrap(await decisionChainsByOpportunity(c, "acc_1", DEAL));
  assert.ok(!before[0]!.coverage.covered.includes("economic"), "creating a person states no role");

  unwrap(await setBuyingRole(c, "opp_1", made!.id, "economic", 80));

  const chain = unwrap(await decisionChainsByOpportunity(c, "acc_1", DEAL))[0]!.coverage;
  assert.ok(chain.covered.includes("economic"), "the role is covered the moment it is recorded");
});

test("editing by id changes that row rather than making a second person", async () => {
  const store = new InMemoryAccountStore();
  const c = ctx("sales_rep", "pro", store);
  const made = unwrap(await upsertContact(c, "acc_1", contactDraft));
  const again = unwrap(
    await upsertContact(c, "acc_1", { ...contactDraft, id: made.id, title: "VP Quality" }),
  );
  assert.equal(again.id, made.id);
  assert.equal(again.title, "VP Quality");
  assert.equal((await store.listContacts(WS, "acc_1")).length, 1);
});

test("two people at one customer may share a name", async () => {
  // Why the identity is the id and not the name: matching on a name would
  // merge colleagues, and "Zhang" is not a unique person.
  const store = new InMemoryAccountStore();
  const c = ctx("sales_rep", "pro", store);
  unwrap(await upsertContact(c, "acc_1", contactDraft));
  unwrap(await upsertContact(c, "acc_1", contactDraft));
  assert.equal((await store.listContacts(WS, "acc_1")).length, 2);
});

test("an id from ANOTHER account is not found, and does not move the person", async () => {
  // The predicate carries the account as well as the workspace. Without it an
  // edit would silently move a contact between customers - and every judgement
  // rule in D4 reads deals through the account they hang off.
  const store = new InMemoryAccountStore();
  const c = ctx("sales_rep", "pro", store);
  const made = unwrap(await upsertContact(c, "acc_1", contactDraft));

  const r = await upsertContact(c, "acc_2", { ...contactDraft, id: made.id });
  assert.equal(r.ok === false && r.violations[0]!.code, "not_found");
  assert.equal((await store.listContacts(WS, "acc_1")).length, 1, "still on the first customer");
  assert.equal((await store.listContacts(WS, "acc_2")).length, 0);
});


// --- Reassignment (2026-09-01) ----------------------------------------------

test("an account can change hands, and it needs the permission that edits it", async () => {
  // Whose account this is IS the record, not a lighter fact about it - so the
  // gate is account.upsert rather than something weaker invented for handover.
  // A weaker gate would let somebody hand out a book they could not touch.
  const store = new InMemoryAccountStore();
  store.seed({ accounts: [account({ ownerSub: "usr_leaver" })] });

  const denied = await reassignAccount(ctx("viewer", "pro", store), "acc_1", "usr_new");
  assert.equal(denied.ok === false && denied.violations[0].code, "permission_denied");

  unwrap(await reassignAccount(ctx("sales_leader", "pro", store), "acc_1", "usr_new"));
  assert.equal((await store.getAccount(WS, "acc_1"))?.ownerSub, "usr_new");
});

test("reassigning to nobody is refused rather than clearing the owner", async () => {
  // An empty string would blank owner_sub, which is not a handover - it is
  // making the account invisible to every owner-scoped list at once.
  const store = new InMemoryAccountStore();
  store.seed({ accounts: [account({ ownerSub: "usr_leaver" })] });
  const r = await reassignAccount(ctx("sales_leader", "pro", store), "acc_1", "   ");
  assert.equal(r.ok === false && r.violations[0].code, "owner_required");
  assert.equal((await store.getAccount(WS, "acc_1"))?.ownerSub, "usr_leaver");
});

test("an account in another workspace cannot be handed over", async () => {
  const store = new InMemoryAccountStore();
  store.seed({ accounts: [account({ workspaceId: "ws_other" })] });
  const r = await reassignAccount(ctx("sales_leader", "pro", store), "acc_1", "usr_new");
  assert.equal(r.ok === false && r.violations[0].code, "not_found");
});

// --- workspaceCompleteness ---------------------------------------------------

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
    sourceProjectId: null,
    territoryId: "t_east",
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

function territory(over: Partial<TerritoryRecord> = {}): TerritoryRecord {
  return {
    id: "t_east",
    workspaceId: WS,
    territoryCode: "T-EAST",
    name: "East",
    parentId: null,
    ownerSub: null,
    regions: ["East China"],
    status: "active",
    ...over,
  };
}

function segment(over: Partial<SegmentRecord> = {}): SegmentRecord {
  return {
    id: "seg_1",
    workspaceId: WS,
    segmentCode: "SMB",
    name: "SMB",
    planId: null,
    priority: 1,
    status: "active",
    criteria: { industries: ["Manufacturing"], regions: [] },
    ...over,
  };
}

function batchCtx(
  role: RoleCode,
  tier: Entitlement["tier"],
  stores: {
    account?: InMemoryAccountStore;
    pipeline?: InMemoryPipelineStore;
    planning?: InMemoryPlanningStore;
    strategy?: InMemoryStrategyStore;
  } = {},
) {
  return {
    workspaceId: WS,
    sub: "usr_me",
    holder: { permissions: new Set(permissionsForRoles([role])) },
    entitlement: { ...EMPTY_ENTITLEMENT, workspace_id: WS, product: "yucer", tier },
    store: stores.account ?? new InMemoryAccountStore(),
    pipeline: stores.pipeline ?? new InMemoryPipelineStore(),
    planning: stores.planning ?? new InMemoryPlanningStore(),
    strategy: stores.strategy ?? new InMemoryStrategyStore(),
  };
}

test("workspaceCompleteness finds derivable gaps across every account, not just one", async () => {
  const accountStore = new InMemoryAccountStore();
  accountStore.seed({
    accounts: [
      account({ id: "acc_1", name: "Acme", region: null }),
      account({ id: "acc_2", name: "Beta", region: null }),
    ],
  });
  const pipeline = new InMemoryPipelineStore();
  pipeline.seed([
    opp({ id: "opp_1", accountId: "acc_1", territoryId: "t_east" }),
    opp({ id: "opp_2", accountId: "acc_2", territoryId: "t_east" }),
  ]);
  const planning = new InMemoryPlanningStore();
  planning.seed({ territories: [territory()] });

  const r = unwrap(
    await workspaceCompleteness(
      batchCtx("sales_leader", "pro", { account: accountStore, pipeline, planning }),
    ),
  );

  assert.equal(r.length, 2);
  assert.deepEqual(r.map((row) => row.accountId).sort(), ["acc_1", "acc_2"]);
  assert.ok(r.every((row) => row.gap.field === "region" && row.gap.suggestion === "East China"));
});

test("workspaceCompleteness never includes a gap only the model can answer", async () => {
  // industry has no suggestion in accountGaps() - fillable() already drops it,
  // but this pins the batch reader's contract: nothing here should ever need
  // a forModel check downstream.
  const accountStore = new InMemoryAccountStore();
  accountStore.seed({ accounts: [account({ id: "acc_1", industry: null, region: "East China" })] });
  const planning = new InMemoryPlanningStore();
  planning.seed({ territories: [territory()] });

  const r = unwrap(
    await workspaceCompleteness(batchCtx("sales_leader", "pro", { account: accountStore, planning })),
  );
  assert.ok(r.every((row) => !row.gap.forModel));
  assert.equal(
    r.some((row) => row.gap.field === "industry"),
    false,
  );
});

test("segment is derivable once industry and region are already on the record", async () => {
  const accountStore = new InMemoryAccountStore();
  accountStore.seed({
    accounts: [account({ id: "acc_1", industry: "Manufacturing", region: "East China", segmentCode: null })],
  });
  const planning = new InMemoryPlanningStore();
  planning.seed({ territories: [territory()] });
  const strategy = new InMemoryStrategyStore();
  strategy.seed({ segments: [segment()] });

  const r = unwrap(
    await workspaceCompleteness(
      batchCtx("sales_leader", "pro", { account: accountStore, planning, strategy }),
    ),
  );
  const seg = r.find((row) => row.gap.field === "segmentCode");
  assert.ok(seg);
  assert.equal(seg?.gap.suggestion, "SMB");
});

test("an unsubscribed workspace cannot run the batch", async () => {
  const r = await workspaceCompleteness(batchCtx("sales_leader", null));
  assert.equal(r.ok, false);
});

test("an account with nothing missing contributes no rows", async () => {
  const accountStore = new InMemoryAccountStore();
  accountStore.seed({
    accounts: [
      account({
        id: "acc_1",
        region: "East China",
        industry: "Manufacturing",
        segmentCode: "SMB",
        ownerSub: "usr_rep",
      }),
    ],
  });
  const r = unwrap(await workspaceCompleteness(batchCtx("sales_leader", "pro", { account: accountStore })));
  assert.deepEqual(r, []);
});

// --- setBuyingRole: the validation that used to live on planContact ---------
//
// These two moved here with incr/0027 rather than being dropped. The values
// they guard are CHECK constraints in the database
// (chk_opportunity_contact_role, chk_opportunity_contact_influence), so an
// invalid one would be refused by Postgres with a constraint name; refusing it
// here means the caller hears which field and why.

test("setBuyingRole refuses a role the database would refuse", async () => {
  const store = new InMemoryAccountStore();
  store.seed({ accounts: [account()], contacts: [contact("c1", "unknown")] });
  const r = await setBuyingRole(ctx("sales_rep", "pro", store), "opp_1", "c1", "champion" as never, null);
  assert.equal(r.ok === false && r.violations[0]!.code, "unknown_decision_role");
});

test("setBuyingRole keeps influence 0-100 and whole, and null meaning null", async () => {
  const store = new InMemoryAccountStore();
  store.seed({ accounts: [account()], contacts: [contact("c1", "unknown")] });
  const c = ctx("sales_rep", "pro", store);
  for (const bad of [-1, 101, 50.5]) {
    const r = await setBuyingRole(c, "opp_1", "c1", "economic", bad);
    assert.equal(r.ok === false && r.violations[0]!.code, "influence_range", `${bad} must be refused`);
  }
  // Null is "no judgement on this deal" and is always allowed - the same
  // distinction the attainment rules keep for an unset quota.
  assert.ok((await setBuyingRole(c, "opp_1", "c1", "economic", null)).ok);
});

test("stating a role twice on one deal replaces rather than duplicates", async () => {
  // uidx_opportunity_contact_pair in the database; the in-memory store must
  // agree, or a test suite that never touches Postgres would pass on data the
  // real thing refuses.
  const store = new InMemoryAccountStore();
  store.seed({ accounts: [account()], contacts: [contact("c1", "unknown")] });
  const c = ctx("sales_rep", "pro", store);
  unwrap(await setBuyingRole(c, "opp_1", "c1", "technical", 40));
  unwrap(await setBuyingRole(c, "opp_1", "c1", "economic", 90));

  const rows = await store.listOpportunityContacts(WS, "opp_1");
  assert.equal(rows.length, 1, "one person, one deal, one answer");
  assert.equal(rows[0]!.buyingRole, "economic");
  assert.equal(rows[0]!.influence, 90);
});
