import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_ENTITLEMENT, type Entitlement } from "../../entitlement/types";
import { permissionsForRoles, type RoleCode } from "../../authz/catalog";
import { unwrap } from "../shared/result";
import { InMemoryAccountStore, type ContactRecord } from "./store";
import { analyzeChain, isRelationType, RELATION_TYPES } from "./lib/health";
import { linkContacts, type AccountContext } from "./service";

// Recording a path to the buyer.
//
// linkContacts had no caller anywhere in the product: the decision chain told a
// rep "there is an economic buyer and nobody can reach them" and offered nothing
// that could change that answer. These tests are written against the PROPERTY
// that matters - the verdict flips - rather than against "the write succeeded",
// because a stored edge that the chain analysis does not read would satisfy the
// second and none of the first.

const WS = "ws_1";
const ACC = "acc_1";

function contact(id: string, decisionRole: ContactRecord["decisionRole"]): ContactRecord {
  return {
    id,
    workspaceId: WS,
    accountId: ACC,
    name: id,
    title: null,
    department: null,
    decisionRole,
    influence: 50,
    status: "active",
  };
}

function ctx(role: RoleCode, tier: Entitlement["tier"], store: InMemoryAccountStore): AccountContext {
  return {
    workspaceId: WS,
    sub: "usr_me",
    holder: { permissions: new Set(permissionsForRoles([role])) },
    entitlement: { ...EMPTY_ENTITLEMENT, workspace_id: WS, product: "yucer", tier },
    store,
  };
}

/** A buyer and a coach on file, with no edge between them. */
function unreachableAccount(): InMemoryAccountStore {
  const store = new InMemoryAccountStore();
  store.seed({
    accounts: [
      {
        id: ACC,
        workspaceId: WS,
        accountNo: "ACC-0001",
        name: "Customer",
        industry: null,
        region: null,
        segmentCode: null,
        ownerSub: null,
        healthScore: null,
        status: "active",
      },
    ],
    contacts: [contact("ct_buyer", "economic"), contact("ct_coach", "coach"), contact("ct_tech", "technical")],
  });
  return store;
}

async function chainOf(store: InMemoryAccountStore) {
  const [contacts, relations] = await Promise.all([
    store.listContacts(WS, ACC),
    store.listRelations(WS, ACC),
  ]);
  return analyzeChain(contacts, relations);
}

// --- The verdict actually changes ------------------------------------------

test("recording a path turns an unreachable buyer into a reachable one", async () => {
  // The whole point of the surface. Before: a buyer on file and no way to be
  // introduced. After: a coach with a route.
  const store = unreachableAccount();
  assert.equal((await chainOf(store)).economicBuyerUnreachable, true, "the starting state");

  unwrap(
    await linkContacts(ctx("sales_rep", "pro", store), {
      fromContactId: "ct_coach",
      toContactId: "ct_buyer",
      relationType: "reports_to",
    }),
  );

  assert.equal((await chainOf(store)).economicBuyerUnreachable, false, "the verdict flipped");
});

test("a new edge is visible to the analysis that reads it", async () => {
  // An edge stored under a key the chain query does not look at would still
  // "save successfully" and change nothing a user can see.
  const store = unreachableAccount();
  unwrap(
    await linkContacts(ctx("sales_rep", "pro", store), {
      fromContactId: "ct_tech",
      toContactId: "ct_buyer",
      relationType: "reports_to",
    }),
  );
  const relations = await store.listRelations(WS, ACC);
  assert.equal(relations.length, 1);
  assert.deepEqual(relations[0], {
    fromContactId: "ct_tech",
    toContactId: "ct_buyer",
    relationType: "reports_to",
  });
});

test("an opposed edge does not create a route", async () => {
  // The traversal skips opposed_to. A blocker who reports to the buyer is not a
  // path to them, and counting it would report reachable on exactly the
  // accounts where it is least true.
  const store = unreachableAccount();
  unwrap(
    await linkContacts(ctx("sales_rep", "pro", store), {
      fromContactId: "ct_coach",
      toContactId: "ct_buyer",
      relationType: "opposed_to",
    }),
  );
  assert.equal((await chainOf(store)).economicBuyerUnreachable, true);
});

// --- The rules around the write --------------------------------------------

test("a contact cannot be related to itself", async () => {
  // chk_account_relation_self would reject it; refusing here names the reason
  // instead of surfacing a constraint violation.
  const store = unreachableAccount();
  const r = await linkContacts(ctx("sales_rep", "pro", store), {
    fromContactId: "ct_coach",
    toContactId: "ct_coach",
    relationType: "peer_of",
  });
  assert.equal(r.ok === false && r.violations[0].code, "self_relation");
  assert.equal((await store.listRelations(WS, ACC)).length, 0);
});

test("the graph is a pro capability, and the gate says so", async () => {
  const store = unreachableAccount();
  const r = await linkContacts(ctx("sales_rep", "free", store), {
    fromContactId: "ct_coach",
    toContactId: "ct_buyer",
    relationType: "reports_to",
  });
  assert.equal(r.ok, false);
  assert.equal((await store.listRelations(WS, ACC)).length, 0, "nothing was written");
});

test("a member without account.write cannot record a relationship", async () => {
  const store = unreachableAccount();
  const r = await linkContacts(ctx("viewer", "enterprise", store), {
    fromContactId: "ct_coach",
    toContactId: "ct_buyer",
    relationType: "reports_to",
  });
  assert.equal(r.ok === false && r.violations[0].code, "permission_denied");
});

test("the same edge twice is one edge", async () => {
  // Append-only with a unique index: recording what is already recorded is a
  // no-op rather than a duplicate or an error.
  const store = unreachableAccount();
  const c = ctx("sales_rep", "pro", store);
  const edge = { fromContactId: "ct_coach", toContactId: "ct_buyer", relationType: "reports_to" } as const;
  unwrap(await linkContacts(c, { ...edge }));
  unwrap(await linkContacts(c, { ...edge }));
  assert.equal((await store.listRelations(WS, ACC)).length, 1);
});

test("direction is preserved, because it is the whole meaning", async () => {
  // "A reports to B" and "B reports to A" are different facts about who to
  // approach. Storing them as one undirected edge would make the chain useless.
  const store = unreachableAccount();
  const c = ctx("sales_rep", "pro", store);
  unwrap(
    await linkContacts(c, {
      fromContactId: "ct_coach",
      toContactId: "ct_buyer",
      relationType: "reports_to",
    }),
  );
  unwrap(
    await linkContacts(c, {
      fromContactId: "ct_buyer",
      toContactId: "ct_coach",
      relationType: "reports_to",
    }),
  );
  assert.equal((await store.listRelations(WS, ACC)).length, 2);
});

test("an edge never crosses a workspace boundary", async () => {
  const store = unreachableAccount();
  const other = { ...ctx("sales_rep", "pro", store), workspaceId: "ws_other" };
  unwrap(
    await linkContacts(other, {
      fromContactId: "ct_coach",
      toContactId: "ct_buyer",
      relationType: "reports_to",
    }),
  );
  assert.equal((await store.listRelations(WS, ACC)).length, 0, "written into the other workspace only");
});

// --- The catalog the surface offers ----------------------------------------

test("the relation types mirror the database CHECK exactly", async () => {
  // The surface offers these and nothing else; a value outside the set is
  // refused by chk_account_relation_type, so offering one would be offering a
  // guaranteed failure.
  assert.deepEqual(
    [...RELATION_TYPES],
    ["reports_to", "peer_of", "allied_with", "opposed_to", "referred_by"],
  );
  for (const t of RELATION_TYPES) assert.equal(isRelationType(t), true);
  assert.equal(isRelationType("friends_with"), false);
});
