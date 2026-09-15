import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { DEFAULT_CACHE_TTL_MS, fetchEntitlement, parseEntitlementEnvelope } from "./platform-client";

test("tolerates a missing/empty envelope (no-coverage defaults)", () => {
  const e = parseEntitlementEnvelope("ws", "p", {});
  assert.equal(e.tier, null);
  assert.equal(e.status, null);
  assert.equal(e.bundled, false);
  assert.deepEqual(e.limits, {});
  assert.deepEqual(e.quota_pools, []);
});

test("coerces known fields, drops non-number limits and metric-less pools", () => {
  const e = parseEntitlementEnvelope("ws", "p", {
    tier: "pro",
    bundled: true,
    status: "active",
    cancel_at_period_end: true,
    limits: { "member.max": 20, bad: "x" },
    quota_pools: [
      { metric: "ai.credit", limit: 100, remaining: 50, priority: 100 },
      { limit: 1 }, // no metric -> dropped
    ],
    future_field: 123, // unknown -> ignored
  });
  assert.equal(e.tier, "pro");
  assert.equal(e.bundled, true);
  assert.equal(e.cancel_at_period_end, true);
  assert.deepEqual(e.limits, { "member.max": 20 });
  assert.equal(e.quota_pools.length, 1);
  assert.equal(e.quota_pools[0].metric, "ai.credit");
});

test("keeps an unknown future status verbatim (forward tolerance)", () => {
  const e = parseEntitlementEnvelope("ws", "p", { status: "some_future_status" });
  assert.equal(e.status, "some_future_status");
});

// fetchEntitlement's Cache-Control handling, against a real HTTP server rather
// than a stubbed fetch - the thing under test is what a response header
// actually looks like on the wire, which a hand-written stub could only ever
// agree with itself about.

/** A throwaway platform entitlements endpoint on an ephemeral port. */
async function startPlatform(
  handler: (res: import("node:http").ServerResponse) => void,
): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = createServer((_req, res) => handler(res));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

test("fetchEntitlement reads ttlMs from the response's own Cache-Control max-age", async () => {
  const platform = await startPlatform((res) => {
    res.writeHead(200, { "content-type": "application/json", "cache-control": "private, max-age=30" });
    res.end(JSON.stringify({ tier: "pro", status: "active" }));
  });
  try {
    const { entitlement, ttlMs } = await fetchEntitlement(
      { baseUrl: platform.baseUrl, authToken: "tok", product: "yucer" },
      "ws_1",
    );
    assert.equal(entitlement.tier, "pro");
    assert.equal(ttlMs, 30_000, "30s from max-age=30, not the 45s default");
  } finally {
    await platform.close();
  }
});

test("fetchEntitlement falls back to the documented default when Cache-Control is missing or unreadable", async () => {
  for (const cacheControl of [undefined, "no-store", "private"]) {
    const platform = await startPlatform((res) => {
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (cacheControl) headers["cache-control"] = cacheControl;
      res.writeHead(200, headers);
      res.end(JSON.stringify({ tier: "free", status: "active" }));
    });
    try {
      const { ttlMs } = await fetchEntitlement(
        { baseUrl: platform.baseUrl, authToken: "tok", product: "yucer" },
        "ws_1",
      );
      assert.equal(ttlMs, DEFAULT_CACHE_TTL_MS, `for Cache-Control: ${cacheControl}`);
    } finally {
      await platform.close();
    }
  }
});
