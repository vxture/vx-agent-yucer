import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { probeHttp, withTimeout } from "./status-probe";

test("no base URL is 'not configured', never probed", async () => {
  assert.equal(await probeHttp(undefined), null);
  assert.equal(await probeHttp(null), null);
  assert.equal(await probeHttp(""), null);
});

test("any HTTP answer proves reachability - a 404 service is still a service", async () => {
  const srv = createServer((_req, res) => {
    res.statusCode = 404;
    res.end();
  });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
  const { port } = srv.address() as { port: number };
  try {
    assert.equal(await probeHttp(`http://127.0.0.1:${port}`), true);
  } finally {
    srv.close();
  }
});

test("a connection failure reads unreachable", async () => {
  // Port 9 (discard) is reliably closed on CI runners and laptops alike.
  assert.equal(await probeHttp("http://127.0.0.1:9", 500), false);
});

test("a hung service falls to the timeout, not forever", async () => {
  const srv = createServer(() => {
    /* never respond */
  });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
  const { port } = srv.address() as { port: number };
  try {
    const t0 = Date.now();
    assert.equal(await probeHttp(`http://127.0.0.1:${port}`, 300), false);
    assert.ok(Date.now() - t0 < 2_000, "must resolve near the budget, not hang");
  } finally {
    srv.close();
  }
});

test("withTimeout clears the loser's timer and returns the winner", async () => {
  assert.equal(await withTimeout(Promise.resolve("fast"), 5_000, "slow"), "fast");
  assert.equal(await withTimeout(new Promise(() => {}), 50, "fallback"), "fallback");
});
