import { test } from "node:test";
import assert from "node:assert/strict";
import type { PrismaClient } from "@prisma/client";
import { PrismaAccountStore } from "./prisma-store";

// The Prisma adapter's OWN logic, with a fake client.
//
// The five Prisma adapters in this repo had no tests at all - not unit, and not
// db either, since adapters.db.test.ts drives raw `pg` rather than the stores.
// The coverage gate caught it on the first PR that added adapter code, which is
// the gate doing exactly what TD-015 was opened to make possible.
//
// What is under test is not Prisma. It is the three decisions this file makes
// before and after Prisma: the column-lock guard, the predicate that decides
// WHICH row an edit may touch, and the mapping of a row into a domain record.

const WS = "ws_1";
const draft = {
  id: null as string | null,
  name: "Zhang Gong",
  title: "QA Director",
  department: "Quality",
  decisionRole: "technical" as const,
  influence: 60,
  status: "active" as const,
};

/** A recording stub for one Prisma delegate. */
function delegate(result: unknown, calls: unknown[]) {
  return async (args: unknown) => {
    calls.push(args);
    return result;
  };
}

function fake(over: Record<string, unknown> = {}) {
  const calls: { create: unknown[]; updateMany: unknown[]; findFirst: unknown[] } = {
    create: [],
    updateMany: [],
    findFirst: [],
  };
  const row = {
    id: "con_1",
    workspaceId: WS,
    accountId: "acc_1",
    name: "Zhang Gong",
    title: "QA Director",
    department: "Quality",
    decisionRole: "technical",
    influence: 60,
    status: "active",
  };
  const client = {
    contact: {
      create: async (args: unknown) => {
        calls.create.push(args);
        return row;
      },
      updateMany: async (args: unknown) => {
        calls.updateMany.push(args);
        return { count: (over.updateCount as number) ?? 1 };
      },
      findFirst: async (args: unknown) => {
        calls.findFirst.push(args);
        return row;
      },
    },
  };
  return { calls, client: async () => client as unknown as PrismaClient };
}

test("creating passes no id and maps the row back into a domain record", async () => {
  const { calls, client } = fake();
  const store = new PrismaAccountStore(client);
  const made = await store.upsertContact(WS, "acc_1", draft);

  assert.equal(calls.create.length, 1);
  assert.equal(calls.updateMany.length, 0, "an absent id must not become an update of something");
  assert.equal(made?.id, "con_1");
  assert.equal(made?.accountId, "acc_1");
  assert.equal(made?.influence, 60);
});

test("editing scopes the predicate to the workspace AND the account", async () => {
  // The predicate that stops an edit moving a person between customers. With
  // only the id, an id from another account would silently rewrite that row -
  // and every judgement rule in D4 reads deals through the account they hang
  // off, so the person would leave one customer's chain and appear in another.
  const { calls, client } = fake();
  const store = new PrismaAccountStore(client);
  await store.upsertContact(WS, "acc_1", { ...draft, id: "con_1" });

  const where = (calls.updateMany[0] as { where: Record<string, unknown> }).where;
  assert.equal(where.id, "con_1");
  assert.equal(where.workspaceId, WS);
  assert.equal(where.accountId, "acc_1");
  assert.equal(where.deletedAt, null, "and a soft-deleted contact is not revived by an edit");
});

test("an edit that matches nothing returns null rather than creating a row", async () => {
  // count === 0 is the "not found" the service turns into a violation. Falling
  // through to create would move the person instead of refusing.
  const { calls, client } = fake({ updateCount: 0 });
  const store = new PrismaAccountStore(client);
  const r = await store.upsertContact(WS, "acc_9", { ...draft, id: "con_1" });

  assert.equal(r, null);
  assert.equal(calls.create.length, 0);
});

test("the column-lock guard runs before the write, not after", async () => {
  // assertWritable is checked against yucer_core.contact's writable set. If a
  // locked column ever reaches this data object the write must not happen at
  // all - a rejected UPDATE at the database is a 500 with a constraint name,
  // and the whole point of the mirror is to fail earlier and say which column.
  const { calls, client } = fake();
  const store = new PrismaAccountStore(client);
  await store.upsertContact(WS, "acc_1", draft);

  const data = (calls.create[0] as { data: Record<string, unknown> }).data;
  for (const locked of ["accountId", "createdAt", "id"]) {
    assert.equal(locked in data && locked !== "accountId", false, `${locked} must not be written`);
  }
  assert.ok("updatedAt" in data, "and the writable stamp is");
});


// --- The rest of the adapter -------------------------------------------------
//
// Written after the coverage gate pointed at this file twice. The second time
// was self-inflicted and worth recording: making the client injectable touched
// every method, so the WHOLE adapter became "new code" and the ratio got worse
// before it got better. The lines were always untested; the refactor only made
// the gate count them.

function spy() {
  const calls: Record<string, unknown[]> = {};
  const at = (k: string) => (calls[k] ??= []);
  return { calls, at };
}

test("listAccounts orders the sickest first and leaves unscored accounts last", async () => {
  // Postgres sorts NULLs last on ASC, which is the behaviour this relies on:
  // an unscored account is not the most urgent one. If the orderBy ever flips
  // to desc, the page would open on the healthiest customers.
  const { calls, at } = spy();
  const client = async () =>
    ({
      account: { findMany: delegate([], at("findMany")) },
    }) as never;
  await new PrismaAccountStore(client).listAccounts(WS, { status: "active", limit: 5 });

  const args = calls.findMany![0] as { where: Record<string, unknown>; orderBy: unknown; take: number };
  assert.equal(args.where.workspaceId, WS);
  assert.equal(args.where.deletedAt, null, "soft-deleted accounts never appear");
  assert.equal(args.where.status, "active");
  assert.equal(args.take, 5);
  assert.deepEqual(args.orderBy, [{ healthScore: "asc" }, { name: "asc" }]);
});

test("an absent filter adds no predicate at all", async () => {
  // `...(filter.x ? {x} : {})` and not `x: filter.x` - an undefined in a Prisma
  // where clause is a different query from an absent key.
  const { calls, at } = spy();
  const client = async () => ({ account: { findMany: delegate([], at("findMany")) } }) as never;
  await new PrismaAccountStore(client).listAccounts(WS);

  const where = (calls.findMany![0] as { where: Record<string, unknown> }).where;
  assert.deepEqual(Object.keys(where).sort(), ["deletedAt", "workspaceId"]);
});

test("getAccount returns null rather than a half-built record", async () => {
  const client = async () => ({ account: { findFirst: async () => null } }) as never;
  assert.equal(await new PrismaAccountStore(client).getAccount(WS, "acc_1"), null);
});

test("updateAccount throws on a locked column instead of letting Postgres refuse it", async () => {
  // The mirror exists to fail earlier and name the column. Reaching the
  // database would produce a constraint name and a 500.
  const client = async () => ({ account: { updateMany: async () => ({ count: 1 }) } }) as never;
  await assert.rejects(
    () => new PrismaAccountStore(client).updateAccount(WS, "acc_1", { accountNo: "ACC-2" } as never),
    /locked/,
  );
});

test("updateAccount reports whether anything matched", async () => {
  const hit = async () => ({ account: { updateMany: async () => ({ count: 1 }) } }) as never;
  const miss = async () => ({ account: { updateMany: async () => ({ count: 0 }) } }) as never;
  assert.equal(await new PrismaAccountStore(hit).updateAccount(WS, "acc_1", { name: "X" }), true);
  assert.equal(await new PrismaAccountStore(miss).updateAccount(WS, "acc_1", { name: "X" }), false);
});

test("a duplicate relation is swallowed, because the same edge twice is one edge", async () => {
  // uidx_account_relation_edge. There is no UPDATE grant on that table, so
  // there is nothing else this could do - and the desired end state is already
  // reached, which is not an error to report upward.
  const client = async () =>
    ({
      accountRelation: {
        create: async () => {
          throw new Error("unique constraint");
        },
      },
    }) as never;
  await new PrismaAccountStore(client).addRelation(WS, {
    fromContactId: "c1",
    toContactId: "c2",
    relationType: "reports_to",
  });
});

test("listRelations keeps an edge with only ONE endpoint on this account", async () => {
  // A referral or a shared board member crosses accounts and is real. An AND
  // over both endpoints would drop it.
  const { calls, at } = spy();
  const client = async () =>
    ({
      contact: { findMany: async () => [{ id: "c1" }] },
      accountRelation: { findMany: delegate([], at("relFind")) },
    }) as never;
  await new PrismaAccountStore(client).listRelations(WS, "acc_1");

  const where = (calls.relFind![0] as { where: { OR: unknown[] } }).where;
  assert.equal(where.OR.length, 2, "either endpoint, not both");
});

test("listRelations short-circuits when the account has no contacts", async () => {
  // Without this, `in: []` asks the database for every relation and filters to
  // none - a full scan to learn what an empty array already said.
  const { calls, at } = spy();
  const client = async () =>
    ({
      contact: { findMany: async () => [] },
      accountRelation: { findMany: delegate([], at("relFind")) },
    }) as never;
  assert.deepEqual(await new PrismaAccountStore(client).listRelations(WS, "acc_1"), []);
  assert.equal(calls.relFind!.length, 0, "and never asks the database");
});

test("healthInputs counts overdue revenue only when there are projects to count it on", async () => {
  const { calls, at } = spy();
  const client = async () =>
    ({
      opportunity: { findMany: async () => [] },
      project: { findMany: async () => [] },
      interaction: { findFirst: async () => null },
      revenueSchedule: { count: delegate(0, at("count")) },
    }) as never;
  const out = await new PrismaAccountStore(client).healthInputs(WS, "acc_1");

  assert.equal(calls.count!.length, 0, "no projects means no query");
  assert.equal(out.overdueRevenueCount, 0);
  assert.equal(out.lastInteractionAt, null, "never contacted, not contacted at epoch");
});

test("healthInputs reads last contact from a real interaction, not a stage move", async () => {
  // ADR-006. It used to be the most recent stage movement, which reported three
  // calls and a site visit as NO CONTACT unless somebody also dragged a card.
  const when = new Date("2026-08-01T00:00:00Z");
  const client = async () =>
    ({
      opportunity: {
        findMany: async () => [
          { id: "o1", stage: "propose", amount: "1000", status: "open" },
          { id: "o2", stage: "won", amount: null, status: "won" },
        ],
      },
      project: { findMany: async () => [{ id: "p1", health: "green" }] },
      interaction: { findFirst: async () => ({ occurredAt: when }) },
      revenueSchedule: { count: async () => 2 },
    }) as never;
  const out = await new PrismaAccountStore(client).healthInputs(WS, "acc_1");

  assert.equal(out.lastInteractionAt, when);
  assert.equal(out.openOpportunities.length, 1, "only the open one drives the pipeline factor");
  assert.equal(out.openOpportunities[0]!.amount, 1000);
  assert.deepEqual(out.projectHealth, ["green"]);
  assert.equal(out.overdueRevenueCount, 2);
});
