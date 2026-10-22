/**
 * Reconciliation paging, restart, failures and concurrent webhook regressions.
 * @package @yucer/app
 * @layer Application
 * @category test
 * @author AI-Generated
 * @date 2026-10-22
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { pollProvisioning } from "./poll";
import { handleProvisioning } from "./handler";
import { InMemoryProvisioningStore } from "./store";
const A = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222";
const item = (workspace_id = A, seq = 1, state = "provisioned") => ({ workspace_id, tenant_id: B, seq, state, updated_at: "2026-10-22T00:00:00Z" });
const config = { baseUrl: "https://platform.internal", product: "yucer", accessToken: async (ws: string | null) => { assert.equal(ws, null); return "reader-ticket"; } };

test("full paging always restarts at page one; seq deduplicates and missing relations do not delete", async () => {
  const store = new InMemoryProvisioningStore();
  const handler = { store, product: "yucer" };
  const urls: string[] = [];
  const fetchImpl: typeof fetch = async (url, init) => {
    urls.push(String(url));
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer reader-ticket");
    assert.equal(new Headers(init?.headers).has("x-vxture-internal-auth"), false);
    return Response.json(new URL(String(url)).searchParams.has("cursor") ? { items: [item(B, 2, "deprovisioned")], nextCursor: null } : { items: [item()], nextCursor: "page-2" });
  };
  assert.deepEqual(await pollProvisioning({ config, handler, fetchImpl }), { pages: 2, scanned: 2, applied: 2 });
  assert.equal((await pollProvisioning({ config, handler, fetchImpl })).applied, 0);
  assert.equal(new URL(urls[2]).searchParams.has("cursor"), false);
  await pollProvisioning({ config, handler, fetchImpl: async () => Response.json({ items: [], nextCursor: null }) });
  assert.equal(await store.getLastSeq(A, "yucer"), 1);
  assert.equal(await store.getLastSeq(B, "yucer"), 2);
});

test("partial scan failure retries from beginning and catches the previously missed relation", async () => {
  const store = new InMemoryProvisioningStore(); const handler = { store, product: "yucer" }; let fail = true;
  const fetchImpl: typeof fetch = async (url) => {
    if (new URL(String(url)).searchParams.has("cursor")) {
      if (fail) return new Response("", { status: 503 });
      return Response.json({ items: [item(B, 2)], nextCursor: null });
    }
    return Response.json({ items: [item()], nextCursor: "next" });
  };
  await assert.rejects(pollProvisioning({ config, handler, fetchImpl }), /503/);
  fail = false;
  assert.equal((await pollProvisioning({ config, handler, fetchImpl })).applied, 1);
});

test("pending does not complete or archive a relation, and malformed pages fail loudly", async () => {
  const handler = { store: new InMemoryProvisioningStore(), product: "yucer" };
  assert.equal((await pollProvisioning({ config, handler, fetchImpl: async () => Response.json({ items: [item(A, 0, "pending")], nextCursor: null }) })).applied, 0);
  assert.equal(await handler.store.getLastSeq(A, "yucer"), -1);
  for (const page of [{ items: [] }, { items: [item(A, -1)], nextCursor: null }, { items: [item("bad")], nextCursor: null }, { items: [item(A, 1, "unknown")], nextCursor: null }]) {
    await assert.rejects(pollProvisioning({ config, handler, fetchImpl: async () => Response.json(page) }), /Invalid/);
  }
  await assert.rejects(pollProvisioning({ config, handler, fetchImpl: async () => Response.json({ items: [], nextCursor: "loop" }) }), /Repeated/);
});

test("concurrent webhook and polling transitions cannot regress seq or state", async () => {
  const store = new InMemoryProvisioningStore(); const states: string[] = [];
  const original = store.upsertInstance.bind(store);
  store.upsertInstance = async (w, p, status) => { await new Promise((r) => setImmediate(r)); states.push(status); await original(w, p, status); };
  const handler = { store, product: "yucer" };
  await Promise.all([
    handleProvisioning({ id: "new-webhook", type: "tenant.deprovisioned", seq: 9, workspace_id: A, application: "yucer" }, handler),
    pollProvisioning({ config, handler, fetchImpl: async () => Response.json({ items: [item(A, 3)], nextCursor: null }) }),
  ]);
  assert.equal(await store.getLastSeq(A, "yucer"), 9);
  assert.deepEqual(states, ["deprovisioned"]);
});
