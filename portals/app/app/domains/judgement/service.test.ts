import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_ENTITLEMENT, type Entitlement } from "../../entitlement/types";
import { permissionsForRoles, type RoleCode } from "../../authz/catalog";
import { unwrap } from "../shared/result";
import { InMemoryAccountStore, type AccountRecord } from "../account/store";
import { InMemoryFieldStore } from "../account/field-store";
import { InMemoryPipelineStore } from "../pipeline/store";
import { InMemoryCopilotStore } from "../copilot/store";
import {
  setAccountStore,
  setCopilotStore,
  setFieldStore,
  setPipelineStore,
} from "../shared/registry";
import { judgementFeed, type JudgementContext } from "./service";

// The service layer of the most expensive read in the product.
//
// `lib/judgement.ts` has always been tested - it is pure, it takes its facts as
// arguments, and every rule that fires is covered there. `service.ts` had
// NOTHING, and it is where the facts are assembled: the gate, the scope
// derivation, the per-account fan-out, the allies denominator, and the snooze
// filter. None of those are reachable from the rule tests, because the rule
// never sees a store, a permission or a member.
//
// Three of the four defects this file pins were shipped and found by hand:
//
//   - the scope default was hardcoded "mine", so the flagship screen rendered
//     empty for sales_leader, a role that owns no accounts BY DESIGN. An empty
//     result caused by a default nobody chose is indistinguishable from
//     "nothing is wrong", which is the one thing this screen must never say by
//     accident.
//   - the decision-chain coverage was computed and thrown away - only `.ok` was
//     read - so the shell had to recompute it to say who is on our side.
//   - the account IDS behind that coverage were thrown away too, keeping only a
//     count, which cannot mark a row (2026-08-31).
//
// FIXTURES OVER THE REAL IN-MEMORY STORES, not hand-written fakes. The stores
// are the ports the service actually talks to; a fake would let this file agree
// with an interface the product does not have.

const WS = "ws_1";
const ME = "usr_me";
const NOW = new Date("2026-08-31T00:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

function account(over: Partial<AccountRecord> = {}): AccountRecord {
  return {
    id: "acc_1",
    workspaceId: WS,
    accountNo: "ACC-0001",
    name: "华东零售集团",
    industry: "retail",
    region: "华东",
    segmentCode: null,
    ownerSub: ME,
    healthScore: 60,
    status: "active",
    tier: "standard",
    creditCode: null,
    website: null,
    employeeCount: null,
    parentId: null,
    ...over,
  };
}

/**
 * An economic buyer on file with NOBODY who can introduce them.
 *
 * That is exactly what makes `economicBuyerUnreachable` true: having the buyer
 * on file and being able to reach them are different facts, and only the second
 * advances a deal. Seeding contacts and no relation edges is the minimum that
 * makes the set under test non-empty - without it every assertion about it
 * holds vacuously, which is how the first version of this file passed a
 * mutation that removed the constraint entirely.
 */
function buyer(accountId: string, id: string) {
  return {
    id,
    workspaceId: WS,
    accountId,
    name: "王总",
    title: "CFO",
    department: null,
    decisionRole: "economic" as const,
    influence: 90,
    email: null,
    mobile: null,
    wechat: null,
    status: "active",
  };
}

/**
 * Every store the feed reads, wired into the registry for one test.
 *
 * Returns a disposer rather than relying on a global reset: these are module
 * singletons, so a test that left one installed would silently decide the next
 * test's answer.
 */
function install(seed: {
  accounts?: AccountRecord[];
  contacts?: Parameters<InMemoryAccountStore["seed"]>[0]["contacts"];
  interactions?: Parameters<InMemoryFieldStore["seed"]>[0]["interactions"];
  commitments?: Parameters<InMemoryFieldStore["seed"]>[0]["commitments"];
}) {
  const accountStore = new InMemoryAccountStore();
  const fieldStore = new InMemoryFieldStore();
  const pipelineStore = new InMemoryPipelineStore();
  const copilotStore = new InMemoryCopilotStore();

  accountStore.seed({ accounts: seed.accounts ?? [], contacts: seed.contacts ?? [] });
  fieldStore.seed({
    interactions: seed.interactions ?? [],
    commitments: seed.commitments ?? [],
  });

  setAccountStore(accountStore);
  setFieldStore(fieldStore);
  setPipelineStore(pipelineStore);
  setCopilotStore(copilotStore);

  return {
    accountStore,
    fieldStore,
    pipelineStore,
    copilotStore,
    dispose() {
      setAccountStore(null);
      setFieldStore(null);
      setPipelineStore(null);
      setCopilotStore(null);
    },
  };
}

/**
 * A member holding NOTHING.
 *
 * Needed because every role in the catalogue holds `account.read` - it is the
 * floor of the product - so no role can exercise the permission half of this
 * gate. Constructing the holder directly is the only way to ask "is the gate
 * there", and asking it is the point: without this, deleting the gate from the
 * service changes no test.
 */
function noPermissions(tier: Entitlement["tier"]): JudgementContext {
  return {
    workspaceId: WS,
    sub: ME,
    holder: { permissions: new Set() },
    entitlement: { ...EMPTY_ENTITLEMENT, workspace_id: WS, product: "yucer", tier },
  };
}

function ctx(role: RoleCode, tier: Entitlement["tier"], sub = ME): JudgementContext {
  return {
    workspaceId: WS,
    sub,
    holder: { permissions: new Set(permissionsForRoles([role])) },
    entitlement: { ...EMPTY_ENTITLEMENT, workspace_id: WS, product: "yucer", tier },
  };
}

// --- The gate ---------------------------------------------------------------

test("the feed is refused to a member who cannot read accounts", async () => {
  // Gated on account.view, the same permission the account LIST needs. Every
  // judgement here is a statement about accounts, and summarising is not a way
  // around a gate - the same shape as the nav-link-hiding mistake this repo
  // fixed once already.
  //
  // THE PERMISSION AXIS, ON A TIER THAT HAS THE FEATURE. The first version of
  // this test used `tier: null`, which refuses for an ENTITLEMENT reason before
  // the permission is ever consulted - so it passed with the gate physically
  // deleted from the service. It caught nothing, and it took a mis-restored
  // mutation to notice.
  //
  // No role can stand in either: every role in the catalogue holds
  // `account.read`. So the holder is built empty.
  //
  // WHAT THIS PROVES AND WHAT IT DOES NOT. It proves the feed refuses a member
  // without account.read. It does NOT prove the feed's own gate is what did the
  // refusing: `listAccounts` carries the same gate, so deleting the one in
  // service.ts leaves this test green - measured, not assumed. The gate is
  // defence in depth and a statement of intent, not the only line; it refuses
  // before the parallel reads rather than after them. A test cannot tell the
  // two apart through the public interface, and pretending otherwise would be
  // the kind of green run this file exists to stop.
  const h = install({ accounts: [account()] });
  try {
    const refused = await judgementFeed(noPermissions("business"));
    assert.equal(refused.ok, false, "no account.read must mean no feed");
    assert.equal(
      refused.ok ? "" : refused.violations[0].code,
      "permission_denied",
      "refused for the PERMISSION, not for a tier or a missing store",
    );

    // And the same fixture answers for a role that does hold it, so the
    // refusal above is about the member and not about the setup.
    assert.equal((await judgementFeed(ctx("sales_rep", "business"))).ok, true);
  } finally {
    h.dispose();
  }
});

// --- Scope, and the default nobody chose -------------------------------------

test("a member who owns accounts defaults to their own book", async () => {
  const h = install({
    accounts: [account({ id: "mine", ownerSub: ME }), account({ id: "theirs", accountNo: "ACC-0002", ownerSub: "usr_other" })],
  });
  try {
    const feed = unwrap(await judgementFeed(ctx("sales_rep", "business"), { now: NOW }));
    assert.equal(feed.scope, "mine");
    assert.equal(feed.scanned, 1);
  } finally {
    h.dispose();
  }
});

test("a member who owns NOTHING defaults to the team's book, not to empty", async () => {
  // THE DEFECT THIS PINS. sales_leader owns no accounts by design - they carry
  // the team's - and a hardcoded "mine" made the home screen render empty for
  // the whole role while the data sat one filter away.
  const h = install({
    accounts: [
      account({ id: "a", ownerSub: "usr_rep1" }),
      account({ id: "b", accountNo: "ACC-0002", ownerSub: "usr_rep2" }),
    ],
  });
  try {
    const feed = unwrap(await judgementFeed(ctx("sales_leader", "business"), { now: NOW }));
    assert.equal(feed.scope, "all");
    assert.equal(feed.scanned, 2, "an owner-less member must still see the team's accounts");
  } finally {
    h.dispose();
  }
});

test("an explicit scope wins over the derivation, in both directions", async () => {
  // The filter control has to mean what it says, or it is decoration.
  const h = install({
    accounts: [account({ id: "mine", ownerSub: ME }), account({ id: "theirs", accountNo: "ACC-0002", ownerSub: "usr_other" })],
  });
  try {
    const all = unwrap(await judgementFeed(ctx("sales_rep", "business"), { now: NOW, scope: "all" }));
    assert.equal(all.scope, "all");
    assert.equal(all.scanned, 2);

    const mine = unwrap(
      await judgementFeed(ctx("sales_leader", "business", "usr_nobody"), { now: NOW, scope: "mine" }),
    );
    assert.equal(mine.scope, "mine");
    assert.equal(mine.scanned, 0, "asking for mine when I own nothing answers nothing, honestly");
  } finally {
    h.dispose();
  }
});

test("scanned reports what was READ, so an empty feed is explicable", async () => {
  // "No judgements" and "no accounts to judge" look identical on screen and
  // mean opposite things. `scanned` is what tells them apart.
  const h = install({ accounts: [] });
  try {
    const feed = unwrap(await judgementFeed(ctx("sales_leader", "business"), { now: NOW }));
    assert.equal(feed.scanned, 0);
    assert.deepEqual(feed.judgements, []);
  } finally {
    h.dispose();
  }
});

// --- Allies: the denominator is what was READABLE ----------------------------

test("the allies denominator counts only accounts whose chain could be read", async () => {
  // A tier that cannot see decision chains must report NO coverage rather than
  // zero coverage: "0 coaches" would be a claim about the customers, when the
  // truth is a claim about the subscription. `account.graph` starts at PRO, so
  // a STARTER workspace leaves `accounts` at 0 and the feed still succeeds -
  // the home screen degrades, it does not refuse.
  const h = install({ accounts: [account(), account({ id: "acc_2", accountNo: "ACC-0002" })] });
  try {
    const feed = unwrap(await judgementFeed(ctx("sales_rep", "starter"), { now: NOW }));
    assert.equal(feed.allies.accounts, 0, "no readable chain means no denominator");
    assert.equal(feed.allies.unreachable, 0);
    assert.deepEqual(feed.unreachableAccountIds, []);
  } finally {
    h.dispose();
  }
});

test("unreachableAccountIds names the rows, and agrees with the count", async () => {
  // The ids exist so /pipeline and /account can MARK a row, and this asserts
  // on a NON-EMPTY set on purpose: the first version of this test seeded no
  // contacts, so the set was empty whatever the code did and every assertion
  // about it held vacuously. A mutation that removed the readability
  // constraint entirely left it green.
  const h = install({
    accounts: [account(), account({ id: "acc_2", accountNo: "ACC-0002" })],
    // acc_1 has a buyer nobody can introduce. acc_2 has no contacts at all.
    contacts: [buyer("acc_1", "ct_1")],
  });
  try {
    const feed = unwrap(await judgementFeed(ctx("sales_leader", "pro"), { now: NOW }));

    // BOTH, and that is what the rule actually says: `economicBuyerUnreachable`
    // means "we cannot reach an economic buyer", and you cannot reach one you
    // have not identified. Asserted as it behaves rather than as I first
    // assumed - the fixture is what corrected me.
    //
    // I raised the conflation as a question - acc_1 needs an introduction,
    // acc_2 needs somebody to find out who signs - and the owner ruled on
    // 2026-08-31 that the two are the same thing: the decision-maker has not
    // been reached, and one badge is right for both. Recorded here so the next
    // reader does not "fix" it back into two states.
    assert.deepEqual([...feed.unreachableAccountIds].sort(), ["acc_1", "acc_2"]);
    assert.equal(feed.allies.unreachable, 2);
    assert.equal(feed.allies.accounts, 2, "both chains were readable at this tier");
  } finally {
    h.dispose();
  }
});

test("a tier that cannot read the chain reports no ids, not an empty answer", async () => {
  // Same fixture, lower tier. The buyer is just as unreachable; the difference
  // is that nobody may look. Reporting [] here is correct only because the
  // COUNT is also 0 and `allies.accounts` is 0 - the three together say "not
  // established", where [] beside a non-zero denominator would say "reached".
  const h = install({
    accounts: [account()],
    contacts: [buyer("acc_1", "ct_1")],
  });
  try {
    const feed = unwrap(await judgementFeed(ctx("sales_rep", "starter"), { now: NOW }));
    assert.deepEqual(feed.unreachableAccountIds, []);
    assert.equal(feed.allies.accounts, 0);
  } finally {
    h.dispose();
  }
});

// --- Counts agree with the list ---------------------------------------------

test("counts are counted from the judgements returned, not from what was derived", async () => {
  // The snooze filter runs BETWEEN derivation and counting. Counting the
  // pre-filter list would print a number the list underneath cannot account
  // for, which is how a badge and its own panel start disagreeing.
  const h = install({
    accounts: [account({ tier: "strategic", healthScore: 20 })],
    commitments: [
      {
        id: "c1",
        workspaceId: WS,
        accountId: "acc_1",
        opportunityId: null,
        originInteractionId: null,
        direction: "they_owe",
        statement: "CFO 给出预算答复",
        ownerSub: null,
        counterpartContactId: null,
        dueAt: daysAgo(30),
        status: "open",
        closureEvidenceKind: null,
        closureEvidenceId: null,
        metAt: null,
        waivedBySub: null,
        waiveReason: null,
      },
    ],
    interactions: [
      {
        id: "i1",
        workspaceId: WS,
        accountId: "acc_1",
        opportunityId: null,
        projectId: null,
        channel: "call",
        direction: "outbound",
        occurredAt: daysAgo(60),
        actorSub: ME,
        subject: null,
        rawNote: "刘敏私下说采购倾向另一家",
        summary: null,
        captureMode: "manual",
        correctsInteractionId: null,
      },
    ],
  });
  try {
    const feed = unwrap(await judgementFeed(ctx("sales_leader", "pro"), { now: NOW }));
    const summed = Object.values(feed.counts).reduce((a, b) => a + b, 0);
    assert.equal(summed, feed.judgements.length);
  } finally {
    h.dispose();
  }
});

// --- Degradation, not refusal ------------------------------------------------

test("a member who cannot read deals still gets the account judgements", async () => {
  // The pipeline read is deliberately not checked for `.ok`: a judgement about
  // a stalled deal disappears, and every judgement that needs no deal survives.
  // Refusing the whole feed would take the home screen away over a capability
  // the reader was never sold.
  const h = install({ accounts: [account()] });
  try {
    const feed = await judgementFeed(ctx("viewer", "free"), { now: NOW });
    assert.equal(feed.ok, true, "a missing pipeline capability must not take the home screen away");
  } finally {
    h.dispose();
  }
});

// WHAT THIS FILE DOES NOT COVER, stated so nobody reads more into a green run
// than is there.
//
// The feed's own `account.view` gate is not observable from outside either:
// `listAccounts` carries the same gate and refuses with the same code, so
// removing the one in service.ts changes no test here. Verified by removing it.
// It stays because it refuses before the fan-out and says what the function
// requires - but nothing in this file is evidence that it is present.
//
// `unreachableAccountIds` is derived from `withChain` rather than from `inputs`,
// and swapping one for the other changes NOTHING observable - so no test can
// kill that mutation. It is an equivalent mutation, not a hole: readability is
// decided by the gate, which answers the same for every account in one request,
// so `withChain` is either all of `inputs` or empty. When it is empty every
// coverage is null and the filter yields [] either way.
//
// The reference to `withChain` stays because it says what the line means and
// would be the correct source the day readability becomes per-account. The
// denominator beside it - `allies.accounts` - IS load-bearing and IS covered:
// pointing it at `inputs` turns the starter-tier test red.
//
// Also uncovered here, deliberately: every rule that decides WHICH judgements
// fire. That is lib/judgement.ts's, it is pure, and it is tested there. This
// file is only about the assembly around it.
