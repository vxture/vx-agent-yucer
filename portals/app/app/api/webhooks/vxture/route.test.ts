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
