import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_ENTITLEMENT, type Entitlement } from "../../entitlement/types";
import { permissionsForRoles, type RoleCode } from "../../authz/catalog";
import { money } from "../shared/money";
import { unwrap, type RuleResult } from "../shared/result";
import { InMemoryDeliveryStore, type ContractRecord, type ProjectRecord } from "./store";
import {
  listContracts,
  listRenewals,
  recordRenewalOutcome,
  renewalDraft,
  renewContract,
  type DeliveryContext,
} from "./service";
import type { ContractDraft } from "./lib/contract";

// L4 batch two (§9.1): the renewal window is anchored on the contract, with
// the project's own end date as the fallback. BOTH PATHS ARE TESTED
// SEPARATELY, as the batch record requires - a fallback that is only
// "supposed to still work" is not a fallback.

const WS = "ws_1";
const NOW = new Date("2026-09-22T00:00:00Z");
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000);
const firstCode = (r: RuleResult<unknown>) => (r.ok ? null : r.violations[0].code);

function ctx(store: InMemoryDeliveryStore, role: RoleCode = "delivery_manager", tier: Entitlement["tier"] = "business"): DeliveryContext {
  return {
    workspaceId: WS,
    sub: "usr_me",
    holder: { permissions: new Set(permissionsForRoles([role])) },
    entitlement: { ...EMPTY_ENTITLEMENT, workspace_id: WS, product: "yucer", tier },
    store,
  };
}

function project(over: Partial<ProjectRecord> = {}): ProjectRecord {
  return {
    id: "prj_1", workspaceId: WS, projectNo: "PRJ-1", name: "Subscription", opportunityId: null,
    accountId: "acc_1", managerSub: null, contractAmount: money(100_000), health: "green",
    status: "active", currency: "CNY", endsAt: days(200), engagementType: "subscription",
    contractId: null, ...over,
  };
}

function contract(over: Partial<ContractRecord> = {}): ContractRecord {
  return {
    id: "ct_1", workspaceId: WS, contractNo: "HT-1", name: "c", accountId: "acc_1", opportunityId: null,
    totalAmount: 100_000, currency: "CNY", termStart: days(-300), termEnd: days(65), noticeDays: 30,
    status: "active", renewedFromContractId: null, renewedBy: null, signedAt: null, lines: [], events: [],
    ...over,
  };
}

function successor(over: Partial<ContractDraft> = {}): ContractDraft {
  return {
    contractNo: "HT-2", name: "c", accountId: "ignored", opportunityId: null, totalAmount: 100_000,
    currency: "CNY", termStart: days(66), termEnd: days(430), noticeDays: 30, status: "active", signedAt: null,
    ...over,
  };
}

test("contract path: the window is judged at term_end minus notice_days", async () => {
  const store = new InMemoryDeliveryStore();
  // Project says 200 days out (not due); the contract's notice deadline is 35.
  store.seed({ projects: [project({ contractId: "ct_1" })], contracts: [contract()] });
  const [row] = unwrap(await listRenewals(ctx(store), new Set(), { now: NOW, windowDays: 90 }));
  assert.equal(row.anchor?.contractNo, "HT-1");
  assert.equal(row.daysToEnd, 35);
  assert.equal(row.verdict.kind, "due");
});

test("project path: no contract attached keeps the project's own end date", async () => {
  const store = new InMemoryDeliveryStore();
  store.seed({ projects: [project()], contracts: [contract()] });
  const [row] = unwrap(await listRenewals(ctx(store), new Set(), { now: NOW, windowDays: 90 }));
  assert.equal(row.anchor, null);
  assert.equal(row.daysToEnd, 200);
  assert.equal(row.verdict.kind, "not_due");
});

test("fallback: a terminated contract hands the date back to the project", async () => {
  const store = new InMemoryDeliveryStore();
  store.seed({ projects: [project({ contractId: "ct_1" })], contracts: [contract({ status: "terminated" })] });
  const [row] = unwrap(await listRenewals(ctx(store), new Set(), { now: NOW, windowDays: 90 }));
  assert.equal(row.anchor, null);
  assert.equal(row.daysToEnd, 200);
});

test("fallback: a contract read that THROWS degrades to project dates, it does not fail the queue", async () => {
  const store = new InMemoryDeliveryStore();
  store.seed({ projects: [project({ contractId: "ct_1", endsAt: days(20) })], contracts: [contract()] });
  store.listContracts = async () => {
    throw new Error("contract table unreachable");
  };
  const rows = unwrap(await listRenewals(ctx(store), new Set(), { now: NOW, windowDays: 90 }));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].anchor, null);
  assert.equal(rows[0].daysToEnd, 20);
  assert.equal(rows[0].verdict.kind, "due");
  // And the draft re-derivation survives the same failure.
  assert.ok((await renewalDraft(ctx(store), "prj_1", { now: NOW, windowDays: 90 })).ok);
});

test("the anchor follows the lineage to the newest contract in force", async () => {
  const store = new InMemoryDeliveryStore();
  store.seed({
    projects: [project({ contractId: "ct_1" })],
    contracts: [
      contract({ termEnd: days(-10) }),
      contract({ id: "ct_2", contractNo: "HT-2", renewedFromContractId: "ct_1", termStart: days(-9), termEnd: days(355) }),
    ],
  });
  const [row] = unwrap(await listRenewals(ctx(store), new Set(), { now: NOW, windowDays: 90 }));
  assert.equal(row.anchor?.contractNo, "HT-2");
  assert.equal(row.daysToEnd, 325);
});

test("a draft successor means the renewal is already in hand", async () => {
  const store = new InMemoryDeliveryStore();
  store.seed({
    projects: [project({ contractId: "ct_1" })],
    contracts: [
      contract(),
      contract({ id: "ct_2", contractNo: "HT-2", renewedFromContractId: "ct_1", status: "draft", termStart: null, termEnd: null }),
    ],
  });
  const [row] = unwrap(await listRenewals(ctx(store), new Set(), { now: NOW, windowDays: 90 }));
  assert.equal(row.anchor?.contractNo, "HT-1");
  assert.deepEqual(row.verdict, { kind: "not_due", reason: "already_renewed" });
  assert.equal(firstCode(await renewalDraft(ctx(store), "prj_1", { now: NOW, windowDays: 90 })), "renewal_not_due");
});

test("renewContract writes the lineage and the renewed event; a second renewal is refused", async () => {
  const store = new InMemoryDeliveryStore();
  store.seed({ contracts: [contract()] });
  const created = unwrap(await renewContract(ctx(store), "ct_1", successor()));
  assert.equal(created.renewedFromContractId, "ct_1");
  assert.equal(created.accountId, "acc_1"); // taken from the original, not the form

  const [original] = unwrap(await listContracts(ctx(store))).filter((c) => c.id === "ct_1");
  assert.equal(original.renewedBy, created.id);
  assert.deepEqual(
    original.events.map((e) => [e.eventType, e.successorContractId, e.actorSub]),
    [["renewed", created.id, "usr_me"]],
  );
  assert.equal(firstCode(await renewContract(ctx(store), "ct_1", successor({ contractNo: "HT-3" }))), "already_renewed");
});

test("only an active contract renews, and not before it started", async () => {
  const store = new InMemoryDeliveryStore();
  store.seed({ contracts: [contract({ status: "terminated" }), contract({ id: "ct_9", contractNo: "HT-9" })] });
  assert.equal(firstCode(await renewContract(ctx(store), "ct_1", successor())), "contract_not_renewable");
  assert.equal(
    firstCode(await renewContract(ctx(store), "ct_9", successor({ termStart: days(-400) }))),
    "renewal_before_original",
  );
  assert.equal(firstCode(await renewContract(ctx(store), "ct_9", successor({ contractNo: "HT-9" }))), "contract_no_taken");
});

test("a race the read cannot see is still refused, by the unique index", async () => {
  const store = new InMemoryDeliveryStore();
  store.seed({ contracts: [contract()] });
  unwrap(await renewContract(ctx(store), "ct_1", successor()));
  // The second click's PRE-READ is stale ("not renewed"); the index refuses
  // the insert, and the service's re-read (fresh) says why.
  const realGet = store.getContract.bind(store);
  let stale = 1;
  store.getContract = async (ws, id) => {
    const c = await realGet(ws, id);
    return c && stale-- > 0 ? { ...c, renewedBy: null } : c;
  };
  assert.equal(firstCode(await renewContract(ctx(store), "ct_1", successor({ contractNo: "HT-3" }))), "already_renewed");
});

test("outcomes: lost and downgraded need a reason; a draft has none to record", async () => {
  const store = new InMemoryDeliveryStore();
  store.seed({ contracts: [contract(), contract({ id: "ct_d", contractNo: "HT-D", status: "draft" })] });
  assert.equal(firstCode(await recordRenewalOutcome(ctx(store), "ct_1", { eventType: "lost", reason: " " })), "reason_required");
  assert.equal(firstCode(await recordRenewalOutcome(ctx(store), "ct_1", { eventType: "expired", reason: "x" })), "unknown_event_type");
  assert.equal(firstCode(await recordRenewalOutcome(ctx(store), "ct_d", { eventType: "lost", reason: "x" })), "contract_not_renewable");
  const ev = unwrap(await recordRenewalOutcome(ctx(store), "ct_1", { eventType: "lost", reason: "budget cut" }));
  assert.equal(ev.eventType, "lost");
  assert.equal(ev.successorContractId, null);
});

test("a viewer cannot renew; renew rides delivery.project, so starter is enough", async () => {
  const store = new InMemoryDeliveryStore();
  store.seed({ contracts: [contract()] });
  assert.equal(firstCode(await renewContract(ctx(store, "viewer"), "ct_1", successor())), "permission_denied");
  assert.ok((await renewContract(ctx(store, "delivery_manager", "starter"), "ct_1", successor())).ok);
});
