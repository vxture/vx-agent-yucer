/**
 * Real HTTP channel wiring and malformed/lost receipt replay regression.
 * @package @yucer/app
 * @layer Application
 * @category test
 * @author AI-Generated
 * @date 2026-10-22
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { mintChannelToken, resetChannelTokens } from "./channel-token";
import { fetchEntitlement } from "../entitlement/platform-client";
import { makePlatformConsume, flushUsage } from "../usage/lib/flush";
import { InMemoryUsageStore } from "../usage/lib/store";
import { makeProvisioningAck } from "../provisioning/lib/ack";
import { pollProvisioning } from "../provisioning/lib/poll";
import { InMemoryProvisioningStore } from "../provisioning/lib/store";

test("real HTTP uses scoped Bearer for C2/C3/ack and a separate reader; malformed receipt retries same key", async () => {
  resetChannelTokens(); let mint = 0, reports = 0; const keys: string[] = [];
  const ws = "11111111-1111-4111-8111-111111111111";
  const server = createServer(async (req, res) => {
    try {
      let raw = ""; for await (const part of req) raw += part;
      res.setHeader("content-type", "application/json");
      if (req.url === "/oidc/token") {
        mint++; const p = new URLSearchParams(raw);
        const reader = p.get("scope") === "provisioning:read";
        assert.equal(p.get("workspace_id"), reader ? null : ws);
        res.end(JSON.stringify({ access_token: reader ? "reader" : "workspace", token_type: "Bearer", expires_in: 300 })); return;
      }
      assert.equal(req.headers["x-vxture-internal-auth"], undefined);
      assert.equal(req.headers.authorization, req.url?.startsWith("/platform/provisioning") ? "Bearer reader" : "Bearer workspace");
      if (req.url?.startsWith("/platform/entitlements")) {
        res.setHeader("cache-control", "private, max-age=45"); res.end(JSON.stringify({ tier: "pro" }));
      } else if (req.url === "/usage/consume") {
        reports++; const body = JSON.parse(raw); keys.push(body.idempotency_key);
        assert.equal(body.intent, "report"); assert.equal(body.workspace_id, ws);
        res.end(reports === 1 ? "broken-json" : JSON.stringify({ event_id: "original-receipt", replayed: true }));
      } else if (req.url === "/provisioning/ack") res.end(JSON.stringify({ replayed: false }));
      else if (req.url?.startsWith("/platform/provisioning")) res.end(JSON.stringify({ items: [], nextCursor: null }));
      else { res.statusCode = 404; res.end("{}"); }
    } catch (e) { res.statusCode = 500; res.end(JSON.stringify({ testFailure: String(e) })); }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const config = { tokenUrl: baseUrl + "/oidc/token", clientId: "yucer", clientSecret: "test-secret", productCode: "yucer", enabled: true };
  const cfg = { baseUrl, product: "yucer", accessToken: (w: string | null) => mintChannelToken(w, { config }) };
  try {
    assert.equal((await fetchEntitlement(cfg, ws)).ttlMs, 45_000);
    const store = new InMemoryUsageStore(); await store.record({ workspaceId: ws, metric: "yucer.copilot.turns", amount: 1, idempotencyKey: "same-business-key" });
    const consume = makePlatformConsume(cfg);
    assert.equal((await flushUsage({ store, consume })).retried, 1);
    assert.equal((await store.unflushed(10)).length, 1);
    assert.equal((await flushUsage({ store, consume })).flushed, 1);
    assert.equal((await store.unflushed(10)).length, 0);
    assert.deepEqual(keys, ["same-business-key", "same-business-key"]);
    assert.equal((await makeProvisioningAck(cfg)({ workspaceId: ws, status: "ready" })).status, 200);
    assert.equal((await pollProvisioning({ config: cfg, handler: { store: new InMemoryProvisioningStore(), product: "yucer" } })).pages, 1);
    assert.equal(mint, 2);
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});
