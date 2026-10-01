import { test } from "node:test";
import assert from "node:assert/strict";
import { AtlasClient, type AtlasConfig } from "./client";
import { cachedRouteCatalog, describeRouteCapacity, fitToRoute, parseRouteCatalog, resetRouteCatalogCache, routesNotInUse } from "./routes";

const CATALOG = {
  endpoints: [
    { endpointCode: "chat/default", state: "active", contextWindow: 64000, maxOutputTokens: 1000, thinkingModes: ["on"] },
    { endpointCode: "chat/reasoning", state: "active", contextWindow: null, maxOutputTokens: null, thinkingModes: ["off", "on"] },
    { state: "active" },
  ],
  maxRequestBytes: 16777216,
};

test("the catalog reads each route's capacity; null is unknown, a nameless row is skipped", () => {
  const c = parseRouteCatalog(CATALOG);
  assert.equal(c.routes.size, 2);
  assert.equal(c.routes.get("chat/default")!.contextWindow, 64000);
  assert.equal(c.routes.get("chat/reasoning")!.contextWindow, null);
  assert.equal(c.maxRequestBytes, 16777216);
  assert.equal(parseRouteCatalog(null).routes.size, 0);
});

test("a call is fitted to its route: an unaccepted mode is dropped, the output ceiling respected", () => {
  const route = parseRouteCatalog(CATALOG).routes.get("chat/default")!;
  const fitted = fitToRoute({ thinking: "off" as const, maxTokens: 2500 }, route);
  assert.equal("thinking" in fitted, false, "off is not accepted here, so the route default applies");
  assert.equal(fitted.maxTokens, 1000);
  assert.deepEqual(fitToRoute({ thinking: "on" as const, maxTokens: 500 }, route), { thinking: "on", maxTokens: 500 });
  assert.deepEqual(fitToRoute({ thinking: "off" as const }, null), { thinking: "off" }, "unknown route: sent as asked");
});

test("the catalog is read once and shared; an unreadable one is not retried at once", async () => {
  resetRouteCatalogCache();
  let reads = 0;
  const read = async () => {
    reads += 1;
    return CATALOG;
  };
  await Promise.all([cachedRouteCatalog("http://a", read), cachedRouteCatalog("http://a", read)]);
  await cachedRouteCatalog("http://a", read);
  assert.equal(reads, 1);

  let fails = 0;
  const broken = async () => {
    fails += 1;
    throw new Error("down");
  };
  assert.equal(await cachedRouteCatalog("http://b", broken), null);
  assert.equal(await cachedRouteCatalog("http://b", broken), null);
  assert.equal(fails, 1);
  resetRouteCatalogCache();
});

test("a chat consults the catalog and sends what the route accepts", async () => {
  resetRouteCatalogCache();
  const cfg: AtlasConfig = { baseUrl: "http://atlas.routes", timeoutMs: 5000, maxRetries: 0, enabled: true, routeCatalog: true };
  const sent: Array<{ url: string; body: Record<string, unknown> }> = [];
  const client = new AtlasClient(cfg, {
    fetchImpl: async (url, init) => {
      sent.push({ url, body: init.body ? JSON.parse(String(init.body)) : {} });
      const body = url.endsWith("/v1/model-routes")
        ? CATALOG
        : { id: "c", modelCode: "m", message: { role: "assistant", content: "hi" }, usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }, latencyMs: 1 };
      return new Response(JSON.stringify(body), { status: 200 });
    },
    mintToken: async (req) => ({ accessToken: "t", expiresAt: 0, audience: req.audience, mode: req.mode }),
  });
  const ctx = { workspaceId: "w", tenantId: "t", taskId: "k" };
  await client.chat("dialogue", { messages: [] }, ctx);
  assert.deepEqual(sent.map((s) => new URL(s.url).pathname), ["/v1/model-routes", "/v1/chat"]);
  const chat = sent[1]!.body;
  assert.equal("thinking" in chat, false);
  assert.equal(chat.maxTokens, 1000);
  assert.equal((await client.routeFor("dialogue", ctx))?.contextWindow, 64000);
  resetRouteCatalogCache();
});

// --- rerank (A3) ---------------------------------------------------------------

test("rerank sends { id, text } candidates with workspaceId in the body, and reads { scores }", async () => {
  const sent: Array<{ url: string; body: Record<string, unknown> }> = [];
  const client = new AtlasClient(
    { baseUrl: "http://atlas.rerank", timeoutMs: 5000, maxRetries: 0, enabled: true },
    {
      fetchImpl: async (url, init) => {
        sent.push({ url, body: JSON.parse(String(init.body)) });
        // The shape read off a live call, 2026-09-30.
        return new Response(JSON.stringify({ modelCode: "rerank", scores: [{ id: "a", score: 1 }, { id: "b", score: 0.99709916 }] }), { status: 200 });
      },
      mintToken: async (req) => ({ accessToken: "t", expiresAt: 0, audience: req.audience, mode: req.mode }),
    },
  );
  const scores = await client.rerank(
    "budget",
    [{ id: "a", text: "The customer confirmed the budget." }, { id: "b", text: "Lunch." }],
    { workspaceId: "ws1", tenantId: "t1", taskId: "task-1", applicationId: "app-1" },
  );
  assert.deepEqual([...scores], [["a", 1], ["b", 0.99709916]]);
  assert.equal(new URL(sent[0]!.url).pathname, "/v1/rerank");
  assert.equal(sent[0]!.body.endpointCode, "rerank/default");
  assert.equal(sent[0]!.body.workspaceId, "ws1");
  assert.equal(sent[0]!.body.taskId, "task-1");
  assert.deepEqual(sent[0]!.body.candidates, [{ id: "a", text: "The customer confirmed the budget." }, { id: "b", text: "Lunch." }]);
});

test("rerank throws on a refusal and on an answer it cannot read - the caller decides what to do", async () => {
  const make = (status: number, body: unknown) =>
    new AtlasClient(
      { baseUrl: "http://atlas.rerank", timeoutMs: 5000, maxRetries: 0, enabled: true },
      {
        fetchImpl: async () => new Response(JSON.stringify(body), { status }),
        mintToken: async (req) => ({ accessToken: "t", expiresAt: 0, audience: req.audience, mode: req.mode }),
      },
    );
  const ctx = { workspaceId: "w", tenantId: "t", taskId: "k" };
  await assert.rejects(() => make(400, { code: "RERANK_CANDIDATES_INVALID", message: "x", retryable: false }).rerank("q", [], ctx), /RERANK_CANDIDATES_INVALID|x/);
  await assert.rejects(() => make(200, { results: [] }).rerank("q", [], ctx), (e: unknown) => (e as { code?: string }).code === "RERANK_UNREADABLE");
});

// --- Showing what the product has been granted ----------------------------------------


test("a route's capacity reads as window, output, thinking modes; unknown is ?, never unlimited", () => {
  const c = parseRouteCatalog({
    endpoints: [
      { endpointCode: "chat/extract", state: "active", contextWindow: 64000, maxOutputTokens: 4000, thinkingModes: ["off", "on"] },
      { endpointCode: "chat/vision", state: "inactive", contextWindow: null, maxOutputTokens: null },
    ],
  });
  assert.equal(describeRouteCapacity(c.routes.get("chat/extract")!), "window 64000, output 4000, thinking off/on");
  assert.equal(describeRouteCapacity(c.routes.get("chat/vision")!), "window ?, output ?, thinking ?, inactive");
});

test("the held routes no profile uses are listed by code, the used ones left out", () => {
  const c = parseRouteCatalog({
    endpoints: ["rerank/default", "chat/default", "chat/extract", "chat/deterministic"].map((endpointCode) => ({ endpointCode, state: "active" })),
  });
  assert.deepEqual(routesNotInUse(c, new Set(["chat/default"])).map((r) => r.endpointCode), ["chat/deterministic", "chat/extract", "rerank/default"]);
  assert.deepEqual(routesNotInUse(c, new Set(c.routes.keys())), []);
});
