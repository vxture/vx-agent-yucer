import { test } from "node:test";
import assert from "node:assert/strict";
import { PlatformEntitlementResolver } from "./platform-resolver";
import { makeEntitlement } from "./resolver";
import type { PlatformClientConfig } from "./platform-client";
import type { Entitlement } from "./types";

// What a platform outage does to access.
//
// This resolver is the only place a network failure becomes an authorization
// answer, so the interesting cases are all failures. The rule it must hold:
// stale-on-error keeps a working workspace working, and a COLD failure falls
// closed to no coverage. Falling open would hand out the product for free every
// time the platform blinked - and it would look identical to a healthy day in
// every log.

const CFG: PlatformClientConfig = {
  baseUrl: "https://platform.internal",
  authToken: "tok",
  product: "yucer",
};

const WS = "ws_1";

function ent(over: Partial<Entitlement> = {}): Entitlement {
  return makeEntitlement(WS, "yucer", { tier: "pro", status: "active", ...over });
}

/** A platform that answers, or fails, on command. */
function platform(script: Array<Entitlement | Error>) {
  let i = 0;
  const calls: string[] = [];
  const fetchImpl = async (_cfg: PlatformClientConfig, workspaceId: string): Promise<Entitlement> => {
    calls.push(workspaceId);
    const step = script[Math.min(i, script.length - 1)];
    i += 1;
    if (step instanceof Error) throw step;
    return step;
  };
  return { fetchImpl, calls };
}

const at = (ms: number) => () => ms;

// --- The failure path ------------------------------------------------------

test("a cold-cache outage falls CLOSED, not open", async () => {
  // The whole reason to read this file. An outage must never be indistinguishable
  // from a paid subscription.
  const { fetchImpl } = platform([new Error("platform down")]);
  const r = new PlatformEntitlementResolver(CFG, { fetchImpl, now: at(1_000) });

  const result = await r.resolve(WS);
  assert.equal(result.tier, null, "no tier means no product access");
  assert.equal(result.status, null);
  assert.equal(result.workspace_id, WS, "the answer is still scoped to the workspace that asked");
  assert.equal(result.product, "yucer");
});

test("stale-on-error returns the last good value rather than refusing", async () => {
  let clock = 1_000;
  const { fetchImpl } = platform([ent({ tier: "business" }), new Error("down")]);
  const r = new PlatformEntitlementResolver(CFG, { fetchImpl, now: () => clock });

  assert.equal((await r.resolve(WS)).tier, "business");
  clock += 46_000; // past the 45s TTL
  const after = await r.resolve(WS);
  assert.equal(after.tier, "business", "the last good answer, not a refusal");
});

test("a failure is not cached, so recovery is immediate", async () => {
  // Caching the fail-closed default would extend a momentary outage into 45
  // seconds of lockout for everyone.
  let clock = 1_000;
  const { fetchImpl, calls } = platform([new Error("down"), ent()]);
  const r = new PlatformEntitlementResolver(CFG, { fetchImpl, now: () => clock });

  assert.equal((await r.resolve(WS)).tier, null);
  const recovered = await r.resolve(WS);
  assert.equal(recovered.tier, "pro", "the very next call gets the real answer");
  assert.equal(calls.length, 2);
});

// --- The cache -------------------------------------------------------------

test("a good answer is cached for the TTL", async () => {
  let clock = 1_000;
  const { fetchImpl, calls } = platform([ent()]);
  const r = new PlatformEntitlementResolver(CFG, { fetchImpl, now: () => clock });

  await r.resolve(WS);
  clock += 44_000;
  await r.resolve(WS);
  assert.equal(calls.length, 1, "entitlement is read on every gated render; 45s of cache is the point");

  clock += 2_000; // now past 45s
  await r.resolve(WS);
  assert.equal(calls.length, 2);
});

test("two workspaces never share a cached entitlement", async () => {
  // A cache keyed loosely here would sell one workspace another's tier.
  const answers = new Map([
    ["ws_a", makeEntitlement("ws_a", "yucer", { tier: "enterprise", status: "active" })],
    ["ws_b", makeEntitlement("ws_b", "yucer", { tier: null, status: null })],
  ]);
  const fetchImpl = async (_c: PlatformClientConfig, id: string) => answers.get(id)!;
  const r = new PlatformEntitlementResolver(CFG, { fetchImpl, now: at(1_000) });

  assert.equal((await r.resolve("ws_a")).tier, "enterprise");
  assert.equal((await r.resolve("ws_b")).tier, null);
  assert.equal((await r.resolve("ws_a")).tier, "enterprise", "and neither overwrote the other");
});

test("invalidate drops the entry, which is what the C3 webhook relies on", async () => {
  // A subscription_changed webhook that did not actually evict would leave a
  // downgraded workspace on its old tier for the rest of the TTL.
  const { fetchImpl, calls } = platform([ent({ tier: "pro" }), ent({ tier: null, status: "cancelled" })]);
  const r = new PlatformEntitlementResolver(CFG, { fetchImpl, now: at(1_000) });

  assert.equal((await r.resolve(WS)).tier, "pro");
  r.invalidate(WS);
  assert.equal((await r.resolve(WS)).tier, null, "the change took effect immediately");
  assert.equal(calls.length, 2);
});

test("invalidating one workspace leaves the others cached", async () => {
  // A webhook names one workspace. Clearing the whole map would put every other
  // workspace back on the platform for its next render, turning one
  // subscription change into a fleet-wide thundering herd.
  const fetched: string[] = [];
  const r = new PlatformEntitlementResolver(CFG, {
    fetchImpl: async (_c, id) => {
      fetched.push(id);
      return makeEntitlement(id, "yucer", { tier: "pro", status: "active" });
    },
    now: at(1_000),
  });

  await r.resolve("ws_a");
  await r.resolve("ws_b");
  assert.deepEqual(fetched, ["ws_a", "ws_b"]);

  r.invalidate("ws_a");
  await r.resolve("ws_a");
  await r.resolve("ws_b");

  assert.deepEqual(fetched, ["ws_a", "ws_b", "ws_a"], "only the named workspace re-fetched");
});

test("a cancelled subscription is a real answer and is cached like one", async () => {
  // tier: null from the PLATFORM and tier: null from an OUTAGE are the same
  // shape. They are not the same event, but they must produce the same access
  // decision - no coverage - so the gate never has to tell them apart.
  const { fetchImpl } = platform([ent({ tier: null, status: "cancelled" })]);
  const r = new PlatformEntitlementResolver(CFG, { fetchImpl, now: at(1_000) });

  const result = await r.resolve(WS);
  assert.equal(result.tier, null);
  assert.equal(result.status, "cancelled", "the reason survives even though the decision matches");
});
