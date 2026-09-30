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
