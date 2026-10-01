import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTurnMessages, estimateMessages, estimateTokens, fitTurnToWindow, type PromptContext } from "./prompt";
import { runTurn } from "./turn";
import { AtlasError } from "../atlas/errors";
import type { AtlasClient } from "../atlas/client";
import type { RunosClient } from "../runos/client";
import type { ChatMessage } from "../atlas/types";

const note = (i: number) => ({
  id: `n${i}`,
  channel: "visit",
  occurredAt: new Date(Date.UTC(2026, 8, 30 - i)),
  actorSub: "usr_a",
  rawNote: "客户确认了预算，下周复核技术方案。".repeat(20),
});

const PROMPT: PromptContext = {
  productName: "Yucer",
  permissions: [],
  features: [],
  evidence: { accountName: "Acme", notes: [0, 1, 2, 3, 4].map(note), omittedNotes: 3, promises: [], daysSinceContact: 1 },
};
const HISTORY: ChatMessage[] = [
  { role: "user", content: "上一次的问题".repeat(30) },
  { role: "assistant", content: "上一次的回答".repeat(30) },
];

test("the estimate is high on purpose: a CJK character is a token, three others are one", () => {
  assert.equal(estimateTokens("预算"), 2);
  assert.equal(estimateTokens("abcdef"), 2);
});

test("a turn that fits is left alone", () => {
  const r = fitTurnToWindow(PROMPT, HISTORY, "q", 1_000_000);
  assert.equal(r.trimmed, false);
  assert.equal(r.history.length, 2);
  assert.equal(r.ctx.evidence!.notes.length, 5);
});

test("history goes first, then the oldest notes - and every dropped note is counted", () => {
  const full = estimateMessages(buildTurnMessages(PROMPT, HISTORY, "q"));
  const withoutHistory = estimateMessages(buildTurnMessages(PROMPT, [], "q"));
  const onlyHistoryCut = fitTurnToWindow(PROMPT, HISTORY, "q", withoutHistory);
  assert.equal(onlyHistoryCut.history.length, 0);
  assert.equal(onlyHistoryCut.ctx.evidence!.notes.length, 5, "notes survive while history can pay");

  const tight = fitTurnToWindow(PROMPT, HISTORY, "q", Math.floor(full / 2));
  const kept = tight.ctx.evidence!.notes;
  assert.ok(kept.length < 5);
  assert.deepEqual(kept.map((n) => n.id), ["n0", "n1", "n2", "n3", "n4"].slice(0, kept.length), "the newest stay");
  assert.equal(tight.ctx.evidence!.omittedNotes, 3 + (5 - kept.length));
  assert.ok(estimateMessages(buildTurnMessages(tight.ctx, tight.history, "q")) <= Math.floor(full / 2));
});

function client(opts: { window?: number; failFirst?: boolean }) {
  const sizes: number[] = [];
  let first = true;
  const atlasClient = {
    async routeFor() {
      return opts.window ? { endpointCode: "chat/default", state: "active", contextWindow: opts.window, maxOutputTokens: null, thinkingModes: null } : null;
    },
    async chat(_p: string, req: { messages: ChatMessage[] }) {
      sizes.push(estimateMessages(req.messages));
      if (opts.failFirst && first) {
        first = false;
        throw new AtlasError({ code: "CONTEXT_LENGTH_EXCEEDED", status: 422, message: "too long", retryable: false });
      }
      return { id: "c", modelCode: "m", message: { role: "assistant", content: "ok" }, usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }, latencyMs: 1 };
    },
  } as unknown as AtlasClient;
  const runosClient = { async discover() { return []; } } as unknown as RunosClient;
  return { deps: { atlasClient, runosClient }, sizes };
}

const INPUT = {
  question: "q",
  history: HISTORY,
  prompt: PROMPT,
  atlas: { workspaceId: "ws", tenantId: "tn", taskId: "t" },
  runos: { workspaceId: "ws", tenantId: "tn", taskId: "t" },
};

test("a turn is fitted to the route's published window before it is sent", async () => {
  const full = estimateMessages(buildTurnMessages(PROMPT, HISTORY, "q"));
  const unknown = client({});
  await runTurn(INPUT, unknown.deps);
  assert.equal(unknown.sizes[0], full, "no window published: sent as built");

  const small = client({ window: 4000 });
  await runTurn(INPUT, small.deps);
  assert.ok(small.sizes[0]! < full);
});

test("context overflow before any tool round: halved once and asked again", async () => {
  const h = client({ failFirst: true });
  const r = await runTurn(INPUT, h.deps);
  assert.equal(r.answer, "ok");
  assert.equal(h.sizes.length, 2);
  assert.ok(h.sizes[1]! <= Math.floor(h.sizes[0]! / 2));
});

// --- Which notes show, when there are more than fit (rerank) ---------------------

const POOL_NOTES = Array.from({ length: 20 }, (_, i) => ({
  id: `n${i}`,
  channel: "visit",
  occurredAt: new Date(Date.UTC(2026, 8, 30 - i)),
  actorSub: "usr_a",
  rawNote: `note ${i}`,
}));
const withPool = (keep: number | undefined): PromptContext => ({
  productName: "Yucer",
  permissions: [],
  features: [],
  evidence: { accountName: "Acme", notes: POOL_NOTES, ...(keep === undefined ? {} : { keep }), omittedNotes: 5, promises: [], daysSinceContact: 1 },
});

function rankingClient(rerank: (() => Promise<ReadonlyMap<string, number>>) | undefined) {
  let prompt = "";
  const calls = { rerank: 0 };
  const atlasClient = {
    async routeFor() { return null; },
    ...(rerank ? { async rerank() { calls.rerank += 1; return rerank(); } } : {}),
    async chat(_p: string, req: { messages: ChatMessage[] }) {
      prompt = req.messages[0]!.content;
      return { id: "c", modelCode: "m", message: { role: "assistant", content: "ok" }, usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }, latencyMs: 1 };
    },
  } as unknown as AtlasClient;
  const runosClient = { async discover() { return []; } } as unknown as RunosClient;
  return { deps: { atlasClient, runosClient }, prompt: () => prompt, calls };
}
const shown = (prompt: string) => POOL_NOTES.filter((n) => prompt.includes(`[${n.id}]`)).map((n) => n.id);
const BASE_IN = { question: "what did they say about budget?", atlas: { workspaceId: "ws", tenantId: "tn", taskId: "t" }, runos: { workspaceId: "ws", tenantId: "tn", taskId: "t" } };

test("a pool is cut to what the question needs: the newest few, then the best ranked", async () => {
  // Only the oldest note is about the budget.
  const h = rankingClient(async () => new Map(POOL_NOTES.map((n) => [n.id, n.id === "n19" ? 1 : 0.1])));
  await runTurn({ ...BASE_IN, prompt: withPool(6) }, h.deps);
  assert.deepEqual(shown(h.prompt()), ["n0", "n1", "n2", "n3", "n19"].concat(["n4"]).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1))));
  assert.equal(h.calls.rerank, 1);
  // 20 candidates, 6 shown: 14 more omitted, on top of the 5 already left out.
  assert.match(h.prompt(), /19 older follow-ups exist and are not shown/);
});

test("rerank failing leaves the newest, exactly as before - the turn is not failed", async () => {
  const h = rankingClient(async () => { throw new Error("rerank is down"); });
  const r = await runTurn({ ...BASE_IN, prompt: withPool(6) }, h.deps);
  assert.equal(r.answer, "ok");
  assert.deepEqual(shown(h.prompt()), ["n0", "n1", "n2", "n3", "n4", "n5"]);
});

test("a client with no rerank at all behaves the same", async () => {
  const h = rankingClient(undefined);
  await runTurn({ ...BASE_IN, prompt: withPool(6) }, h.deps);
  assert.deepEqual(shown(h.prompt()), ["n0", "n1", "n2", "n3", "n4", "n5"]);
});

test("evidence that is not a pool is not reranked, and costs nothing", async () => {
  const h = rankingClient(async () => new Map());
  await runTurn({ ...BASE_IN, prompt: withPool(undefined) }, h.deps);
  assert.equal(h.calls.rerank, 0);
  const small = { ...withPool(30) };
  await runTurn({ ...BASE_IN, prompt: small }, h.deps);
  assert.equal(h.calls.rerank, 0, "20 notes fit inside keep 30");
});

test("a pool nobody chose from is never printed whole", async () => {
  const { renderEvidence } = await import("./prompt");
  const out = renderEvidence(withPool(6).evidence!);
  assert.equal((out.match(/\[n\d+\]/g) ?? []).length, 6);
  assert.match(out, /19 older follow-ups exist/);
});

test("the member's own words choose the notes, not a rehearsal's long frame", async () => {
  let query = "";
  const h = rankingClient(async () => new Map());
  (h.deps.atlasClient as unknown as { rerank: (q: string) => Promise<ReadonlyMap<string, number>> }).rerank = async (q) => {
    query = q;
    return new Map();
  };
  await runTurn({ ...BASE_IN, question: "FRAME ".repeat(200) + "the real question", evidenceQuery: "the real question", prompt: withPool(6) }, h.deps);
  assert.equal(query, "the real question");
});
