import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { memoryHttp } from "./handler";
import { permissionsForRoles } from "../../../authz/catalog";
import { EMPTY_ENTITLEMENT } from "../../../entitlement/types";
import { InMemoryMemoryStore } from "../../../domains/copilot/memory-store";
import { InMemoryTaskStore } from "../../../domains/copilot/task-store";
import { InMemoryCopilotStore } from "../../../domains/copilot/store";
import type { TaskContext } from "../../../domains/copilot/task-service";
import type { AppSession } from "../../../(app)/lib/session";
const request = (path = "", data?: unknown) =>
  new Request(
    `http://localhost/api/copilot/memory${path}`,
    data === undefined
      ? undefined
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        },
  );
function fixture() {
  const workspaceId = randomUUID(),
    c: TaskContext = {
      workspaceId,
      sub: "alice",
      holder: { permissions: new Set(permissionsForRoles(["sales_rep"])) },
      entitlement: {
        ...EMPTY_ENTITLEMENT,
        workspace_id: workspaceId,
        product: "yucer",
        tier: "pro",
      },
      store: new InMemoryTaskStore(),
      sessions: new InMemoryCopilotStore(),
      memory: new InMemoryMemoryStore(),
      source: async () => null,
      refresh: async () => c,
    };
  return {
    c,
    resolve: async () => ({
      context: c,
      session: {
        user: { activeOrg: null },
        accessToken: async () => null,
      } as unknown as AppSession,
    }),
  };
}
test("HTTP gates reject unauthorized actions, CSRF and unbounded bodies before service access", async () => {
  for (const op of [
    "list",
    "history",
    "create",
    "change",
    "capture",
  ] as const) {
    const r = await memoryHttp(
      request("", op === "create" || op === "change" ? {} : undefined),
      op,
      randomUUID(),
      async () => null,
    );
    assert.equal(r.status, 403);
    assert.equal(JSON.stringify(await r.json()).includes("alice"), false);
  }
  let calls = 0;
  const resolve = async () => {
    calls++;
    return null;
  };
  const cross = new Request("http://localhost/api/copilot/memory", {
    method: "POST",
    headers: { origin: "https://evil.example" },
    body: "{}",
  });
  assert.equal(
    (await memoryHttp(cross, "create", undefined, resolve)).status,
    403,
  );
  const large = new Request("http://localhost/api/copilot/memory", {
    method: "POST",
    body: "x".repeat(33000),
  });
  assert.equal(
    (await memoryHttp(large, "create", undefined, resolve)).status,
    413,
  );
  const bad = new Request("http://localhost/api/copilot/memory", {
    method: "POST",
    body: "not-json",
  });
  assert.equal(
    (await memoryHttp(bad, "create", undefined, resolve)).status,
    400,
  );
  assert.equal(calls, 0);
});
test("HTTP creation, private listing, CAS correction and stopping use the actual domain services", async () => {
  const f = fixture(),
    created = await memoryHttp(
      request("", {
        requestId: randomUUID(),
        text: "private decision",
        kind: "decision",
      }),
      "create",
      undefined,
      f.resolve,
    );
  assert.equal(created.status, 200);
  assert.equal(created.headers.get("cache-control"), "private, no-store");
  const m = await created.json();
  const listed = await memoryHttp(request(), "list", undefined, f.resolve);
  assert.equal((await listed.json()).items[0].id, m.id);
  assert.equal(
    (await memoryHttp(request("?offset=-1"), "list", undefined, f.resolve))
      .status,
    400,
  );
  assert.equal(
    (
      await memoryHttp(
        request("", {
          action: "correct",
          revision: 1,
          text: "corrected",
          kind: "decision",
        }),
        "change",
        m.id,
        f.resolve,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await memoryHttp(
        request("", { action: "stop", revision: 1 }),
        "change",
        m.id,
        f.resolve,
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await memoryHttp(
        request("", { action: "stop", revision: 2 }),
        "change",
        m.id,
        f.resolve,
      )
    ).status,
    200,
  );
  assert.equal(
    (await memoryHttp(request("?q=private"), "history", undefined, f.resolve))
      .status,
    200,
  );
  assert.equal(
    (await memoryHttp(request("", {}), "change", "bad-id", f.resolve)).status,
    404,
  );
  f.c.refresh = async () => null;
  assert.equal(
    (await memoryHttp(request(), "list", undefined, f.resolve)).status,
    403,
  );
});
test("HTTP extraction requires tenant context and never leaks provider errors", async () => {
  const f = fixture();
  assert.equal(
    (await memoryHttp(request(), "capture", randomUUID(), f.resolve)).status,
    400,
  );
  assert.equal(
    (
      await memoryHttp(request(), "list", undefined, async () => {
        throw new Error("secret");
      })
    ).status,
    503,
  );
  const response = await memoryHttp(
    request(),
    "capture",
    randomUUID(),
    f.resolve,
    async () => {
      throw new Error("secret-token");
    },
  );
  assert.equal(response.status, 503);
  assert.equal((await response.text()).includes("secret-token"), false);
});
