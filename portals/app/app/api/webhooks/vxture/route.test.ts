import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { POST } from "./route";
import { InMemoryProvisioningStore, setProvisioningStore } from "../../../provisioning/lib/store";

// /api/webhooks/vxture (product_200 section 4, 080-rp section 4) is the
// standard delivery path the platform registered for yucer (X-4 step 2,
// 2026-09-14) and, since X-4 step 3, the ONLY implementation - there is no
// longer a separate /provisioning/webhook handler this route re-exports.

const SECRET = "test-secret";

function sign(secret: string, t: number, body: string): string {
  return `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`;
}

function withSecret<T>(fn: () => Promise<T>): Promise<T> {
  const saved = { a: process.env.PROVISION_WEBHOOK_SECRET, b: process.env.PROVISION_WEBHOOK_SECRET_NEXT };
  process.env.PROVISION_WEBHOOK_SECRET = SECRET;
  delete process.env.PROVISION_WEBHOOK_SECRET_NEXT;
  return fn().finally(() => {
    if (saved.a === undefined) delete process.env.PROVISION_WEBHOOK_SECRET;
    else process.env.PROVISION_WEBHOOK_SECRET = saved.a;
    if (saved.b !== undefined) process.env.PROVISION_WEBHOOK_SECRET_NEXT = saved.b;
  });
}

test("an unsigned delivery to the registered path is refused with the L1 envelope", async () => {
  await withSecret(async () => {
    const res = await POST(
      new Request("https://yucer.vxture.com/api/webhooks/vxture", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: "d1", type: "subscription_changed", workspace_id: "w1", application: "yucer" }),
      }),
    );
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.code, "WEBHOOK_SIGNATURE_INVALID");
  });
});

test("a correctly-signed delivery at the registered path is processed and acked 2xx", async () => {
  const store = new InMemoryProvisioningStore();
  setProvisioningStore(store);
  try {
    await withSecret(async () => {
      const raw = JSON.stringify({
        id: "d-registered-1",
        type: "tenant.provisioned",
        seq: 1,
        workspace_id: "w1",
        application: "yucer",
      });
      const t = Math.floor(Date.now() / 1000);
      const res = await POST(
        new Request("https://yucer.vxture.com/api/webhooks/vxture", {
          method: "POST",
          headers: { "content-type": "application/json", "x-vxture-signature": sign(SECRET, t, raw) },
          body: raw,
        }),
      );
      assert.equal(res.status, 200);
      assert.equal(await store.isDelivered("d-registered-1"), true);
    });
  } finally {
    setProvisioningStore(null);
  }
});

test("tenant.provisioned sends the C3 ack (delivery id as idempotency key) - route wiring, not just the handler or ack.ts in isolation", async () => {
  const store = new InMemoryProvisioningStore();
  setProvisioningStore(store);
  const savedEnv = { url: process.env.PLATFORM_API_URL, token: process.env.PLATFORM_INTERNAL_AUTH_TOKEN };
  process.env.PLATFORM_API_URL = "https://platform.internal";
  process.env.PLATFORM_INTERNAL_AUTH_TOKEN = "tok_internal";
  const originalFetch = globalThis.fetch;
  const acked: { url?: string; body?: Record<string, unknown> } = {};
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    acked.url = String(url);
    acked.body = JSON.parse(init.body as string);
    return new Response(JSON.stringify({ workspace_id: "w1", product: "yucer", acked_at: "now", replayed: false }), {
      status: 200,
    });
  }) as typeof fetch;
  try {
    await withSecret(async () => {
      const raw = JSON.stringify({
        id: "d-ack-1",
        type: "tenant.provisioned",
        seq: 1,
        workspace_id: "w1",
        application: "yucer",
      });
      const t = Math.floor(Date.now() / 1000);
      const res = await POST(
        new Request("https://yucer.vxture.com/api/webhooks/vxture", {
          method: "POST",
          headers: { "content-type": "application/json", "x-vxture-signature": sign(SECRET, t, raw) },
          body: raw,
        }),
      );
      assert.equal(res.status, 200);
    });
    assert.equal(acked.url, "https://platform.internal/provisioning/ack");
    // BRAND.productCode ("yucer"), not route.ts's own productCode() - that
    // reads OIDC_CLIENT_ID and decides which inbound events this route
    // accepts; the ack's `product` field comes from getPlatformClientConfig(),
    // which is not influenced by OIDC_CLIENT_ID at all. Two different "which
    // product" answers for two different questions.
    assert.deepEqual(acked.body, {
      workspace_id: "w1",
      product: "yucer",
      status: "ready",
      delivery_id: "d-ack-1",
    });
  } finally {
    globalThis.fetch = originalFetch;
    setProvisioningStore(null);
    if (savedEnv.url === undefined) delete process.env.PLATFORM_API_URL;
    else process.env.PLATFORM_API_URL = savedEnv.url;
    if (savedEnv.token === undefined) delete process.env.PLATFORM_INTERNAL_AUTH_TOKEN;
    else process.env.PLATFORM_INTERNAL_AUTH_TOKEN = savedEnv.token;
  }
});
