import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { scopeAccountStore, scopePipelineStore, scopeSignalStore } from "./scoped-stores";
import { WHOLE_WORKSPACE, type DataScope } from "./scope";
import { InMemoryAccountStore, type AccountRecord } from "../domains/account/store";
import { InMemoryPipelineStore, type OpportunityRecord } from "../domains/pipeline/store";
import { InMemorySignalStore } from "../domains/signal/store";
import { money } from "../domains/shared/money";

const WS = "ws_1";
const MINE: DataScope = { kind: "own", sub: "usr_me", accountIds: ["acc_mine"] };

function deal(over: Partial<OpportunityRecord>): OpportunityRecord {
  return {
    id: "opp",
    workspaceId: WS,
    opportunityNo: "OPP-1",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    name: "Deal",
    accountId: "acc_theirs",
    planId: null,
    campaignId: null,
    sourceProjectId: null,
    territoryId: null,
    ownerSub: "usr_other",
    stage: "discover",
    forecastCategory: "pipeline",
    amount: money(1000),
    probability: 25,
    expectedCloseAt: null,
    closedAt: null,
    status: "open",
    currency: "CNY",
    ...over,
  };
}

function account(over: Partial<AccountRecord>): AccountRecord {
  return {
    id: "acc_theirs",
    workspaceId: WS,
    accountNo: "ACC-1",
    name: "Acme",
    industry: null,
    region: null,
    segmentCode: null,
    ownerSub: "usr_other",
    healthScore: null,
    status: "active",
    tier: "standard",
    ...over,
  } as AccountRecord;
}

// --- The wrapper actually narrows -------------------------------------------

test("a scoped member's list holds only what they may see", async () => {
  const inner = new InMemoryPipelineStore();
  inner.seed([
    deal({ id: "mine", ownerSub: "usr_me" }),
    deal({ id: "theirs", ownerSub: "usr_other" }),
    deal({ id: "on_my_account", ownerSub: "usr_other", accountId: "acc_mine" }),
    deal({ id: "unowned", ownerSub: null }),
  ]);
  const scoped = scopePipelineStore(inner, MINE);
  const rows = await scoped.listOpportunities(WS, { includeClosed: true });
  assert.deepEqual(rows.map((r) => r.id).sort(), ["mine", "on_my_account", "unowned"]);
});

test("reading by id answers null, not a refusal", async () => {
  // Every caller already turns null into not_found, which is the right answer:
  // distinguishing "does not exist" from "not yours" turns the scope into an
  // existence oracle - the same reasoning the cross-workspace reads give.
  const inner = new InMemoryPipelineStore();
  inner.seed([deal({ id: "theirs", ownerSub: "usr_other" })]);
  const scoped = scopePipelineStore(inner, MINE);
  assert.equal(await scoped.getOpportunity(WS, "theirs"), null);
  assert.notEqual(await inner.getOpportunity(WS, "theirs"), null, "and the row does exist");
});

test("an account is judged by its own id, not by a parent it does not have", async () => {
  const inner = new InMemoryAccountStore();
  inner.seed({
    accounts: [
      account({ id: "acc_mine", ownerSub: "usr_other" }),
      account({ id: "acc_theirs", ownerSub: "usr_other" }),
      account({ id: "acc_owned", ownerSub: "usr_me" }),
    ],
  });
  const scoped = scopeAccountStore(inner, MINE);
  const rows = await scoped.listAccounts(WS);
  assert.deepEqual(rows.map((a) => a.id).sort(), ["acc_mine", "acc_owned"]);
  assert.equal((await scoped.getAccount(WS, "acc_theirs")), null);
});

test("an unowned lead stays visible - the queue", async () => {
  // The owner's ruling of 2026-09-01: a lead nobody owns that nobody can see is
  // a lead nobody will ever claim.
  const inner = new InMemorySignalStore();
  await inner.createLead(WS, { companyName: "Unclaimed", ownerSub: null, score: 70 } as never);
  await inner.createLead(WS, { companyName: "Theirs", ownerSub: "usr_other", score: 70 } as never);
  const scoped = scopeSignalStore(inner, MINE);
  const rows = await scoped.listLeads(WS, {});
  assert.deepEqual(rows.map((l) => l.companyName), ["Unclaimed"]);
});

test("the default scope returns the store untouched, so it costs nothing", async () => {
  // Not merely equivalent - the SAME OBJECT. The wrapper is not applied at all
  // for an unscoped member, which is every member until an administrator says
  // otherwise.
  const inner = new InMemoryPipelineStore();
  assert.equal(scopePipelineStore(inner, WHOLE_WORKSPACE), inner);
  assert.equal(scopeAccountStore(new InMemoryAccountStore(), WHOLE_WORKSPACE) instanceof InMemoryAccountStore, true);
});

// --- The coverage is structural ---------------------------------------------

test("every port method is named in the wrapper - the compiler asks, this counts", () => {
  // TypeScript already refuses a wrapper missing a method, which is what makes
  // the coverage structural rather than remembered - it caught three methods
  // that were guessed at and three that were missed when this file was written.
  //
  // This test adds the half the compiler cannot see: that the wrapper's source
  // MENTIONS every method, so a future `...spread` shortcut - which would
  // satisfy the compiler while silently passing new methods through unscoped -
  // shows up as a missing name rather than as nothing.
  const src = readFileSync(new URL("./scoped-stores.ts", import.meta.url), "utf8");
  const ports: Array<[string, string]> = [
    ["PipelineStore", "../domains/pipeline/store.ts"],
    ["AccountStore", "../domains/account/store.ts"],
    ["SignalStore", "../domains/signal/store.ts"],
  ];

  for (const [name, file] of ports) {
    const port = readFileSync(new URL(file, import.meta.url), "utf8");
    const body = port.slice(port.indexOf(`export interface ${name} {`));
    const methods = [...body.slice(0, body.indexOf("\n}")).matchAll(/^ {2}([a-zA-Z]+)[(<]/gm)].map(
      (m) => m[1],
    );
    assert.ok(methods.length > 5, `parsed only ${methods.length} methods from ${name}`);
    for (const m of methods) {
      assert.ok(src.includes(`${m}:`) || src.includes(`${m}(`), `${name}.${m} is not named in the wrapper`);
    }
  }
});

// --- The pass-throughs actually reach the method they name -------------------

/**
 * An inner store that records what was called on it.
 *
 * A Proxy rather than a hand-written double because the point is to answer
 * "which inner method did the wrapper call", for EVERY method on the port,
 * without listing them here - a list here would rot the same way the wrapper
 * would, and then the test would stop asking about whatever was added last.
 */
function recordingStore(scopedReads: Readonly<Record<string, unknown>>) {
  const calls: Array<{ name: string; args: readonly unknown[] }> = [];
  const sentinels = new Map<string, object>();
  const proxy = new Proxy(
    {},
    {
      get(_t, prop: string) {
        return (...args: readonly unknown[]) => {
          calls.push({ name: prop, args });
          // The scoped reads must return something the wrapper can narrow; every
          // other method returns a unique object so the test can assert the
          // wrapper handed back exactly what the inner one produced.
          if (prop in scopedReads) return Promise.resolve(scopedReads[prop]);
          if (!sentinels.has(prop)) sentinels.set(prop, { passedThrough: prop });
          return Promise.resolve(sentinels.get(prop));
        };
      },
    },
  );
  return { proxy, calls, sentinelFor: (n: string) => sentinels.get(n) };
}

/** Method names declared on a port interface, read from its source. */
function portMethods(file: string, name: string): string[] {
  const port = readFileSync(new URL(file, import.meta.url), "utf8");
  const body = port.slice(port.indexOf(`export interface ${name} {`));
  return [...body.slice(0, body.indexOf("\n}")).matchAll(/^ {2}([a-zA-Z]+)[(<]/gm)].map((m) => m[1]);
}

const PORTS: Array<{
  name: string;
  file: string;
  wrap: (inner: never, scope: DataScope) => unknown;
  scopedReads: Record<string, unknown>;
}> = [
  {
    name: "PipelineStore",
    file: "../domains/pipeline/store.ts",
    wrap: scopePipelineStore as never,
    scopedReads: { listOpportunities: [], getOpportunity: null },
  },
  {
    name: "AccountStore",
    file: "../domains/account/store.ts",
    wrap: scopeAccountStore as never,
    scopedReads: { listAccounts: [], getAccount: null },
  },
  {
    name: "SignalStore",
    file: "../domains/signal/store.ts",
    wrap: scopeSignalStore as never,
    scopedReads: { listLeads: [], getLead: null },
  },
];

for (const port of PORTS) {
  test(`every ${port.name} method reaches the inner method of the SAME name`, async () => {
    // The half the structural test above cannot see. It proves each method is
    // MENTIONED; this proves each one is WIRED - a pass-through that forwarded
    // to the wrong inner method (listContacts calling listRelations, say) has
    // a compatible signature, satisfies the compiler, and is named correctly in
    // the source, so nothing else here would notice.
    const methods = portMethods(port.file, port.name);
    assert.ok(methods.length > 5, `parsed only ${methods.length} methods from ${port.name}`);

    for (const m of methods) {
      const { proxy, calls, sentinelFor } = recordingStore(port.scopedReads);
      const wrapped = port.wrap(proxy as never, MINE) as Record<
        string,
        (...a: readonly unknown[]) => Promise<unknown>
      >;
      assert.equal(typeof wrapped[m], "function", `${port.name}.${m} is missing from the wrapper`);

      const args = [WS, { marker: m }] as const;
      const returned = await wrapped[m](...args);

      assert.deepEqual(
        calls.map((c) => c.name),
        [m],
        `${port.name}.${m} called ${calls.map((c) => c.name).join("/") || "nothing"} on the inner store`,
      );
      assert.deepEqual(calls[0].args, args, `${port.name}.${m} did not forward its arguments verbatim`);

      if (!(m in port.scopedReads)) {
        assert.equal(
          returned,
          sentinelFor(m),
          `${port.name}.${m} did not return the inner store's own result`,
        );
      }
    }
  });
}

// --- getLead is a scoped read, not a pass-through ----------------------------

test("getLead answers null for a lead outside the member's book", async () => {
  // The sibling of getOpportunity, and the same reasoning: null rather than a
  // refusal, so the scope never becomes an existence oracle.
  const inner = new InMemorySignalStore();
  const theirs = await inner.createLead(WS, {
    companyName: "Theirs",
    accountId: "acc_theirs",
    signalId: null,
    campaignId: null,
    score: 10,
    ownerSub: "usr_other",
  });
  const mine = await inner.createLead(WS, {
    companyName: "Mine",
    accountId: "acc_mine",
    signalId: null,
    campaignId: null,
    score: 20,
    ownerSub: "usr_me",
  });

  const scoped = scopeSignalStore(inner, MINE);
  assert.equal(await scoped.getLead(WS, theirs.id), null);
  assert.equal((await scoped.getLead(WS, mine.id))?.id, mine.id);
});

test("getLead lets an unowned lead through - the queue, by id as well as by list", async () => {
  const inner = new InMemorySignalStore();
  const unowned = await inner.createLead(WS, {
    companyName: "Nobody's",
    accountId: null,
    signalId: null,
    campaignId: null,
    score: null,
  });
  const scoped = scopeSignalStore(inner, MINE);
  assert.equal((await scoped.getLead(WS, unowned.id))?.id, unowned.id);
});
