import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_ENTITLEMENT, type Entitlement } from "../../entitlement/types";
import { permissionsForRoles, type RoleCode } from "../../authz/catalog";
import { unwrap } from "../shared/result";
import { InMemoryAccountStore, type AccountRecord, type ContactRecord } from "./store";
import { decisionChain, linkContacts, listAccounts, recomputeHealth, type AccountContext } from "./service";

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
    ...over,
  };
}

function contact(id: string, role: ContactRecord["decisionRole"], over: Partial<ContactRecord> = {}): ContactRecord {
  return {
    id,
    workspaceId: WS,
    accountId: "acc_1",
    name: id,
    title: null,
    department: null,
    decisionRole: role,
    influence: 50,
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

  const starter = await decisionChain(ctx("sales_rep", "starter", store), "acc_1");
  assert.equal(starter.ok === false && starter.violations[0].code, "feature_not_in_tier");
  assert.ok((await decisionChain(ctx("sales_rep", "pro", store), "acc_1")).ok);
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
  for (const c of out.contributions) assert.ok(c.detail.length > 0);
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
    relations: [
      { workspaceId: WS, accountId: "acc_1", fromContactId: "coach", toContactId: "eb", relationType: "reports_to" },
    ],
  });
  const chain = unwrap(await decisionChain(ctx("sales_rep", "pro", store), "acc_1"));
  assert.deepEqual(chain.missing, []);
  assert.equal(chain.economicBuyerUnreachable, false);
});

test("an economic buyer on file but unreachable is reported as such", async () => {
  const store = new InMemoryAccountStore();
  store.seed({
    accounts: [account()],
    contacts: [contact("coach", "coach"), contact("eb", "economic"), contact("tech", "technical")],
  });
  const chain = unwrap(await decisionChain(ctx("sales_rep", "pro", store), "acc_1"));
  assert.equal(chain.economicBuyerUnreachable, true, "having one on file is not the same as reaching them");
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
