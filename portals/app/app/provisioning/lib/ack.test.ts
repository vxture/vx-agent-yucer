import { test } from "node:test";
import assert from "node:assert/strict";
import { makeProvisioningAck, sendProvisioningAck } from "./ack";
import type { PlatformClientConfig } from "../../entitlement/platform-client";

const CFG: PlatformClientConfig = {
  baseUrl: "https://platform.internal",
  authToken: "tok_internal",
  product: "yucer",
};

test("makeProvisioningAck posts the documented shape and auth header", async () => {
  const captured: { url?: string; init?: RequestInit } = {};
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    captured.url = String(url);
    captured.init = init;
    return new Response(
      JSON.stringify({ workspace_id: "ws_1", product: "yucer", acked_at: "2026-09-17T00:00:00Z", replayed: false }),
      { status: 200 },
    );
  }) as typeof fetch;
  try {
    const ack = makeProvisioningAck(CFG);
    const result = await ack({ workspaceId: "ws_1", status: "ready", deliveryId: "evt_1" });

    assert.equal(result.status, 200);
    assert.equal(result.body?.replayed, false);
    assert.equal(captured.url, "https://platform.internal/provisioning/ack");
    assert.equal(captured.init?.method, "POST");
    assert.equal((captured.init?.headers as Record<string, string>)["x-vxture-internal-auth"], "tok_internal");
    const body = JSON.parse(captured.init?.body as string);
    assert.deepEqual(body, {
      workspace_id: "ws_1",
      product: "yucer",
      status: "ready",
      delivery_id: "evt_1",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a repeated delivery_id comes back replayed:true with the original acked_at", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({ workspace_id: "ws_1", product: "yucer", acked_at: "2026-09-01T00:00:00Z", replayed: true }),
      { status: 200 },
    )) as typeof fetch;
  try {
    const result = await makeProvisioningAck(CFG)({ workspaceId: "ws_1", status: "ready", deliveryId: "evt_1" });
    assert.equal(result.body?.replayed, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("sendProvisioningAck is a silent no-op when the platform is not configured", async () => {
  // No PLATFORM_API_URL / PLATFORM_INTERNAL_AUTH_TOKEN in this test process -
  // getPlatformClientConfig() returns null, same offline posture C2 and
  // C3-up's own callers already have.
  const result = await sendProvisioningAck({ workspaceId: "ws_1", status: "ready" });
  assert.equal(result, null);
});

test("sendProvisioningAck swallows a transport failure rather than throwing", async () => {
  const originalEnv = { ...process.env };
  process.env.PLATFORM_API_URL = "https://platform.internal";
  process.env.PLATFORM_INTERNAL_AUTH_TOKEN = "tok_internal";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error("ECONNREFUSED");
  }) as typeof fetch;
  try {
    const result = await sendProvisioningAck({ workspaceId: "ws_1", status: "ready" });
    assert.equal(result, null, "an ack failure must not throw - it must never fail the webhook that triggered it");
  } finally {
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
  }
});
