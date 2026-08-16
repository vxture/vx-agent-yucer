import { test } from "node:test";
import assert from "node:assert/strict";
import { AtlasClient, parseSse, type AtlasConfig, type AtlasContext } from "./client";
import type { StreamFrame } from "./types";

// What happens to the upstream call when we stop reading it.
//
// This file exists because the failure it covers is INVISIBLE in every other
// check: releaseLock() unlocks the reader and leaves the HTTP body open, so
// abandoning a stream type-checks, passes every functional test, and quietly
// keeps a metered generation running to completion against the workspace. The
// only way to catch it is to assert on the cancellation itself.

const CFG: AtlasConfig = { baseUrl: "http://atlas.test", timeoutMs: 50, maxRetries: 0, enabled: true };
const CTX: AtlasContext = {
  workspaceId: "11111111-1111-1111-1111-111111111111",
  tenantId: "22222222-2222-2222-2222-222222222222",
};

/** A stream that records whether anyone cancelled it. */
function trackedStream(chunks: string[], opts: { silentAfter?: boolean } = {}) {
  const state = { cancelled: false, pulled: 0 };
  const enc = new TextEncoder();
  let i = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(c) {
      state.pulled += 1;
      if (i < chunks.length) {
        c.enqueue(enc.encode(chunks[i++]));
        return;
      }
      // silentAfter models the dangerous case: headers arrived, some frames
      // arrived, and then the far side simply stops without closing.
      if (!opts.silentAfter) c.close();
    },
    cancel() {
      state.cancelled = true;
    },
  });
  return { stream, state };
}

const frame = (delta: string) => `data:{"type":"text","delta":"${delta}"}\n`;

// --- Abandonment -----------------------------------------------------------

test("abandoning the stream cancels the body instead of merely unlocking it", async () => {
  // The billing case. A member reads one sentence and navigates away; if the
  // body is only unlocked, Atlas is never told and meters the whole completion.
  const { stream, state } = trackedStream([frame("a"), frame("b"), frame("c")]);
  const controller = new AbortController();

  for await (const f of parseSse(stream, { controller })) {
    assert.equal(f.type, "text");
    break; // the consumer leaves after one frame
  }

  assert.equal(state.cancelled, true, "the response body was left open");
  assert.equal(controller.signal.aborted, true, "the upstream fetch was never aborted");
});

test("an explicit return() on the generator cancels too", async () => {
  // This is the path the API route takes on browser disconnect: it calls
  // events.return(undefined) from the stream's cancel().
  const { stream, state } = trackedStream([frame("a"), frame("b")]);
  const controller = new AbortController();
  const gen = parseSse(stream, { controller });

  await gen.next();
  await gen.return(undefined);

  assert.equal(state.cancelled, true);
  assert.equal(controller.signal.aborted, true);
});

test("a thrown error frame leaves no request in flight", async () => {
  // Note what is NOT asserted here: the source's cancel(). This producer closes
  // the stream on its way out, and cancelling an already-closed stream is
  // correctly a no-op. The invariant that survives either ordering is the abort
  // - nothing is still running upstream.
  const { stream } = trackedStream(['data:{"type":"error","code":"quota_exhausted","message":"no"}\n']);
  let signal: AbortSignal | undefined;
  const client = new AtlasClient(CFG, {
    fetchImpl: async (_url, init) => {
      signal = init.signal as AbortSignal;
      return new Response(stream, { status: 200 });
    },
    mintToken: async (req) => ({
      accessToken: "tok",
      expiresAt: 0,
      audience: req.audience,
      mode: req.mode,
    }),
  });

  await assert.rejects(async () => {
    for await (const _f of client.chatStream("chat", { messages: [] }, CTX)) {
      // the error frame throws before anything is yielded
    }
  });
  assert.equal(signal?.aborted, true, "an error frame must not leak the connection");
});

test("completing on the done sentinel also releases the upstream call", async () => {
  // The happy path leaks just as expensively as the abandoned one if nothing
  // ends the request: the sentinel returns early, so bytes may still be coming.
  const { stream } = trackedStream([frame("a"), "data: [DONE]\n"]);
  const controller = new AbortController();

  const seen: StreamFrame[] = [];
  for await (const f of parseSse(stream, { controller })) seen.push(f);

  assert.equal(seen.length, 1);
  assert.equal(controller.signal.aborted, true);
});

// --- The idle deadline -----------------------------------------------------

test("a stream that greets us and goes silent is aborted, not left hanging", async () => {
  // request() clears its timer when the response resolves, which for a stream is
  // when the HEADERS arrive. Without a separate idle deadline, timeoutMs bounds
  // the connect phase and nothing about the body.
  const { stream } = trackedStream([frame("a")], { silentAfter: true });
  const controller = new AbortController();

  const frames: StreamFrame[] = [];
  await assert.rejects(
    async () => {
      for await (const f of parseSse(stream, { controller, idleMs: 30 })) frames.push(f);
    },
    (e: Error & { code?: string }) => {
      // A timeout must READ as a timeout. Cancelling the reader surfaces as a
      // clean `done`, and passing that through would hand the consumer a
      // truncated answer dressed up as a complete one.
      assert.equal(e.code, "STREAM_IDLE_TIMEOUT");
      return true;
    },
  );
  assert.equal(controller.signal.aborted, true);
  assert.equal(frames.length, 1, "the frames that did arrive were still delivered");
});

test("the idle deadline does not need a controller to unblock a silent stream", async () => {
  // Aborting only unblocks a pending read when the stream is a fetch body wired
  // to that same signal. Cancelling the reader is what makes the deadline work
  // for any stream - without it, a caller passing a plain stream hangs forever.
  const { stream } = trackedStream([frame("a")], { silentAfter: true });
  await assert.rejects(
    async () => {
      for await (const _f of parseSse(stream, { idleMs: 30 })) {
        // one frame, then silence
      }
    },
    (e: Error & { code?: string }) => e.code === "STREAM_IDLE_TIMEOUT",
  );
});

test("the idle deadline is re-armed per frame, so a long answer is not killed", async () => {
  // The deadline is about SILENCE. A single overall budget would cut off exactly
  // the long, useful answers - the ones worth waiting for.
  const enc = new TextEncoder();
  let sent = 0;
  const stream = new ReadableStream<Uint8Array>({
    async pull(c) {
      if (sent >= 6) {
        c.close();
        return;
      }
      sent += 1;
      // Each gap is under the budget; the total is comfortably over it.
      await new Promise((r) => setTimeout(r, 15));
      c.enqueue(enc.encode(frame(`t${sent}`)));
    },
  });

  const controller = new AbortController();
  const frames: StreamFrame[] = [];
  for await (const f of parseSse(stream, { controller, idleMs: 40 })) frames.push(f);

  assert.equal(frames.length, 6, "a steadily-producing stream ran to completion");
});

test("no options at all still parses and terminates", async () => {
  // parseSse is used directly in tests and by any caller that owns its own
  // deadline; the options must stay optional.
  const { stream } = trackedStream([frame("a")]);
  const frames: StreamFrame[] = [];
  for await (const f of parseSse(stream)) frames.push(f);
  assert.equal(frames.length, 1);
});

// --- The client wiring -----------------------------------------------------

test("chatStream aborts the fetch it started when the consumer walks away", async () => {
  const { stream, state } = trackedStream([frame("a"), frame("b"), frame("c")]);
  let signal: AbortSignal | undefined;

  const client = new AtlasClient(CFG, {
    fetchImpl: async (_url, init) => {
      signal = init.signal as AbortSignal;
      return new Response(stream, { status: 200 });
    },
    mintToken: async (req) => ({
      accessToken: "tok",
      expiresAt: 0,
      audience: req.audience,
      mode: req.mode,
    }),
  });

  for await (const _f of client.chatStream("chat", { messages: [] }, CTX)) {
    break;
  }

  assert.equal(state.cancelled, true, "the body was cancelled");
  assert.equal(signal?.aborted, true, "the fetch signal was aborted");
});

test("a non-streaming call bounds the BODY, not just the headers", async () => {
  // The response resolves when the headers arrive. Clearing the deadline there
  // would leave the body read unbounded, so a server that greets us and then
  // dribbles forever hangs the call - the failure mode that looks like "the
  // copilot is thinking" and never ends.
  // Modelled the way a real fetch behaves: the signal is wired to the BODY, so
  // aborting errors an in-progress read. That coupling is what the fix relies
  // on, so the fake has to honour it or the test would prove nothing.
  const stall = (signal: AbortSignal) =>
    new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode('{"id":"call_1"'));
        signal.addEventListener("abort", () => c.error(new Error("aborted")));
        // and otherwise nothing, ever
      },
    });

  const client = new AtlasClient(
    { ...CFG, timeoutMs: 30 },
    {
      fetchImpl: async (_url, init) =>
        new Response(stall(init.signal as AbortSignal), { status: 200 }),
      mintToken: async (req) => ({
        accessToken: "tok",
        expiresAt: 0,
        audience: req.audience,
        mode: req.mode,
      }),
      sleep: async () => {},
    },
  );

  // The deadline fires and aborts; what matters is that it TERMINATES.
  await assert.rejects(async () => {
    await client.models(CTX);
  });
});

test("a non-200 streaming response does not leave a request in flight", async () => {
  let signal: AbortSignal | undefined;
  const client = new AtlasClient(CFG, {
    fetchImpl: async (_url, init) => {
      signal = init.signal as AbortSignal;
      return new Response(JSON.stringify({ error: { code: "forbidden" } }), { status: 403 });
    },
    mintToken: async (req) => ({
      accessToken: "tok",
      expiresAt: 0,
      audience: req.audience,
      mode: req.mode,
    }),
  });

  await assert.rejects(async () => {
    for await (const _f of client.chatStream("chat", { messages: [] }, CTX)) {
      // never reached
    }
  });
  assert.equal(signal?.aborted, true, "the refused call was abandoned, not left open");
});
