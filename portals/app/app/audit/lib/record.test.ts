import { test } from "node:test";
import assert from "node:assert/strict";
import { recordAuditEvent, ACTOR_CONSOLE_SELF } from "./record";
import { InMemoryAuditStore } from "./store";

test("a record carries every X-3 field, including the actor console constant", async () => {
  const store = new InMemoryAuditStore();
  await recordAuditEvent(
    {
      workspaceId: "ws_1",
      actorId: "usr_admin",
      objectType: "member",
      objectId: "usr_target",
      action: "admin.member.role.assign",
      outcome: "success",
    },
    store,
  );
  assert.equal(store.rows.length, 1);
  assert.deepEqual(store.rows[0], {
    workspaceId: "ws_1",
    actorId: "usr_admin",
    actorConsole: ACTOR_CONSOLE_SELF,
    objectType: "member",
    objectId: "usr_target",
    action: "admin.member.role.assign",
    outcome: "success",
    taskId: null,
    costAmount: null,
    costUnit: null,
  });
});

test("a consumer-plane call carries taskId and cost", async () => {
  const store = new InMemoryAuditStore();
  await recordAuditEvent(
    {
      workspaceId: "ws_1",
      actorId: "usr_rep",
      objectType: "copilot_turn",
      objectId: "sess_1",
      action: "copilot.ask",
      outcome: "success",
      taskId: "sess_1:0",
      costAmount: 240,
      costUnit: "tokens",
    },
    store,
  );
  assert.equal(store.rows[0].taskId, "sess_1:0");
  assert.equal(store.rows[0].costAmount, 240);
  assert.equal(store.rows[0].costUnit, "tokens");
});

test("a cost with no unit is refused - it would be unreadable", async () => {
  const store = new InMemoryAuditStore();
  await assert.rejects(() =>
    recordAuditEvent(
      {
        workspaceId: "ws_1",
        actorId: "usr_rep",
        objectType: "copilot_turn",
        objectId: "sess_1",
        action: "copilot.ask",
        outcome: "success",
        costAmount: 240,
      },
      store,
    ),
  );
  assert.equal(store.rows.length, 0, "nothing was written");
});

test("a unit with no cost is refused - it would be a claim about nothing", async () => {
  const store = new InMemoryAuditStore();
  await assert.rejects(() =>
    recordAuditEvent(
      {
        workspaceId: "ws_1",
        actorId: "usr_rep",
        objectType: "copilot_turn",
        objectId: "sess_1",
        action: "copilot.ask",
        outcome: "success",
        costUnit: "tokens",
      },
      store,
    ),
  );
  assert.equal(store.rows.length, 0);
});

test("a zero-cost call is still a paired cost, not an absent one", async () => {
  // A capability call that happened to cost nothing is a fact worth keeping,
  // not the same as no cost having been reported at all.
  const store = new InMemoryAuditStore();
  await recordAuditEvent(
    {
      workspaceId: "ws_1",
      actorId: "usr_rep",
      objectType: "copilot_turn",
      objectId: "sess_1",
      action: "copilot.ask",
      outcome: "success",
      costAmount: 0,
      costUnit: "tokens",
    },
    store,
  );
  assert.equal(store.rows[0].costAmount, 0);
  assert.equal(store.rows[0].costUnit, "tokens");
});

test("outcome distinguishes denial from success - the point X-3 makes by name", async () => {
  const store = new InMemoryAuditStore();
  await recordAuditEvent(
    {
      workspaceId: "ws_1",
      actorId: "usr_rep",
      objectType: "copilot_turn",
      objectId: "new",
      action: "copilot.ask",
      outcome: "denied",
    },
    store,
  );
  assert.equal(store.rows[0].outcome, "denied");
});
