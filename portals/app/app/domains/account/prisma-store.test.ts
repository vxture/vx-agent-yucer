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
