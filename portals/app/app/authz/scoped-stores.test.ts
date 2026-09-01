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
