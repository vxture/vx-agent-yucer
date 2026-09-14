import { test } from "node:test";
import assert from "node:assert/strict";
import { POST } from "./route";
import { POST as canonical } from "../../../provisioning/webhook/route";

// /api/webhooks/vxture is the delivery address the platform registered; the
// handler is /provisioning/webhook. The alias must BE that handler, and an
// unsigned delivery must be refused with the same envelope code (the check the
// ops record lists for the canonical path), before any body parsing.

test("the registered path re-exports the canonical webhook handler", () => {
  assert.equal(POST, canonical);
});

test("an unsigned delivery to the registered path is refused with the L1 envelope", async () => {
  const saved = { a: process.env.PROVISION_WEBHOOK_SECRET, b: process.env.PROVISION_WEBHOOK_SECRET_NEXT };
  process.env.PROVISION_WEBHOOK_SECRET = "test-secret";
  delete process.env.PROVISION_WEBHOOK_SECRET_NEXT;
  try {
    const res = await POST(
      new Request("https://yucer.vxture.com/api/webhooks/vxture", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: "d1", type: "subscription.changed", workspace_id: "w1", application: "yucer" }),
      }),
    );
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.code, "WEBHOOK_SIGNATURE_INVALID");
  } finally {
    if (saved.a === undefined) delete process.env.PROVISION_WEBHOOK_SECRET;
    else process.env.PROVISION_WEBHOOK_SECRET = saved.a;
    if (saved.b !== undefined) process.env.PROVISION_WEBHOOK_SECRET_NEXT = saved.b;
  }
});
