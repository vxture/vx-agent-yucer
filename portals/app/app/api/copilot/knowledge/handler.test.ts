import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { knowledgeHttp } from "./handler";
import { permissionsForRoles } from "../../../authz/catalog";
import { EMPTY_ENTITLEMENT } from "../../../entitlement/types";
import { InMemoryKnowledgeStore } from "../../../domains/copilot/knowledge-store";
import { InMemoryTaskStore } from "../../../domains/copilot/task-store";
import { InMemoryCopilotStore } from "../../../domains/copilot/store";
import type { TaskContext } from "../../../domains/copilot/task-service";
import type { AppSession } from "../../../(app)/lib/session";
const request = (data?: unknown, path = "") =>
  new Request(
    `http://localhost/api/copilot/knowledge${path}`,
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
      knowledge: new InMemoryKnowledgeStore(),
      source: async () => null,
      refresh: async () => c,
    };
  const resolve = async () => ({ context: c, session: {} as AppSession });
  return { c, resolve };
}
test("HTTP knowledge routes block missing identity, cross-site mutations and oversized streamed bodies", async () => {
  for (const op of ["list", "members", "preview", "create", "change"] as const)
    assert.equal(
      (
        await knowledgeHttp(
          request(
            ["create", "change", "preview"].includes(op) ? {} : undefined,
          ),
          op,
          randomUUID(),
          async () => null,
        )
      ).status,
      403,
    );
  let calls = 0;
  const resolve = async () => {
    calls++;
    return null;
  };
  for (const op of ["create", "change", "preview"] as const) {
    assert.equal(
      (
        await knowledgeHttp(
          new Request("http://localhost/api/copilot/knowledge", {
            method: "POST",
            headers: { origin: "https://evil.example" },
            body: "{}",
          }),
          op,
          undefined,
          resolve,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await knowledgeHttp(
          new Request("http://localhost/api/copilot/knowledge", {
            method: "POST",
            body: "x".repeat(33000),
          }),
          op,
          undefined,
          resolve,
        )
      ).status,
      413,
    );
    assert.equal(
      (
        await knowledgeHttp(
          new Request("http://localhost/api/copilot/knowledge", {
            method: "POST",
            body: "bad",
          }),
          op,
          undefined,
          resolve,
        )
      ).status,
      400,
    );
  }
  assert.equal(calls, 0);
});
test("HTTP preview, confirmation, scope changes and conflict responses never expose unauthorized bodies", async () => {
  const f = fixture(),
    input = {
      title: "GIS offer",
      text: "Shared business positioning",
      kind: "decision",
      audience: "workspace",
      memberSubs: [],
      objects: [],
      businessOnly: true,
    };
  const p = await knowledgeHttp(
    request(input),
    "preview",
    undefined,
    f.resolve,
  );
  assert.equal(p.status, 200);
  assert.match(p.headers.get("cache-control")!, /no-store/);
  const data = {
      ...input,
      requestId: randomUUID(),
      reviewedDigest: (await p.json()).reviewedDigest,
    },
    created = await knowledgeHttp(
      request(data),
      "create",
      undefined,
      f.resolve,
    );
  assert.equal(created.status, 200);
  const r = await created.json();
  const list = await knowledgeHttp(request(), "list", undefined, f.resolve);
  assert.equal((await list.json()).items.length, 1);
  const wrong = { ...f.c, workspaceId: randomUUID() };
  wrong.entitlement = { ...wrong.entitlement, workspace_id: wrong.workspaceId };
  wrong.refresh = async () => wrong;
  const other = async () => ({ context: wrong, session: {} as AppSession });
  assert.equal(
    (
      await knowledgeHttp(
        request({ revision: 1, action: "stop" }),
        "change",
        r.id,
        other,
      )
    ).status,
    404,
  );
  assert.deepEqual(
    (await (await knowledgeHttp(request(), "list", undefined, other)).json())
      .items,
    [],
  );
  assert.equal(
    (
      await knowledgeHttp(
        request({ revision: 1, action: "stop" }),
        "change",
        r.id,
        f.resolve,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await knowledgeHttp(
        request({ revision: 1, action: "restore" }),
        "change",
        r.id,
        f.resolve,
      )
    ).status,
    409,
  );
  const forged = await knowledgeHttp(
    request({ ...data, taskId: randomUUID() }),
    "create",
    undefined,
    f.resolve,
  );
  assert.equal(forged.status, 400);
  f.c.refresh = async () => null;
  assert.equal(
    (await knowledgeHttp(request(), "list", undefined, f.resolve)).status,
    403,
  );
});
test("upstream roster or persistence failures use the product envelope without leaking request content", async () => {
  const f = fixture();
  f.c.knowledgeMembers = async () => {
    throw new Error("internal secret and private text");
  };
  const r = await knowledgeHttp(
    request(undefined, "/members?q=alice"),
    "members",
    undefined,
    f.resolve,
  );
  assert.equal(r.status, 503);
  assert.equal(JSON.stringify(await r.json()).includes("private text"), false);
});
