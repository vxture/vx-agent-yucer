import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getAccountStore,
  getCopilotStore,
  getDeliveryStore,
  getPipelineStore,
  getPlanningStore,
  getSignalStore,
  getStrategyStore,
  setAccountStore,
  setCopilotStore,
  setDeliveryStore,
  setPipelineStore,
  setPlanningStore,
  setSignalStore,
  setStrategyStore,
} from "./registry";
import { InMemoryAccountStore } from "../account/store";
import { InMemoryCopilotStore } from "../copilot/store";
import { InMemoryDeliveryStore } from "../delivery/store";
import { InMemoryPipelineStore } from "../pipeline/store";
import { InMemoryPlanningStore } from "../planning/store";
import { InMemorySignalStore } from "../signal/store";
import { InMemoryStrategyStore } from "../strategy/store";

// The registry decides which implementation every domain runs against. Two
// properties matter and neither is obvious from reading it:
//
//   - with no DATABASE_URL, every domain must fall back to memory. A domain
//     that reached for Prisma anyway would fail at import time on the offline
//     path, which is how the demo surfaces and the tests run.
//   - the override must actually take effect, or every service test would be
//     silently exercising a shared singleton instead of its own fixture.

const FACTORIES = [
  ["pipeline", getPipelineStore, setPipelineStore, InMemoryPipelineStore],
  ["copilot", getCopilotStore, setCopilotStore, InMemoryCopilotStore],
  ["account", getAccountStore, setAccountStore, InMemoryAccountStore],
  ["delivery", getDeliveryStore, setDeliveryStore, InMemoryDeliveryStore],
  ["planning", getPlanningStore, setPlanningStore, InMemoryPlanningStore],
  ["strategy", getStrategyStore, setStrategyStore, InMemoryStrategyStore],
  ["signal", getSignalStore, setSignalStore, InMemorySignalStore],
] as const;

test("all seven domain stores fall back to memory with no DATABASE_URL", () => {
  const saved = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  try {
    for (const [name, get, set] of FACTORIES) {
      set(null);
      const store = get();
      assert.ok(store, `${name} resolved to nothing`);
      assert.ok(
        store.constructor.name.startsWith("InMemory"),
        `${name} resolved to ${store.constructor.name} without a database`,
      );
    }
  } finally {
    if (saved !== undefined) process.env.DATABASE_URL = saved;
    for (const [, , set] of FACTORIES) set(null);
  }
});

test("each factory memoizes, so one request does not build several clients", () => {
  for (const [name, get, set] of FACTORIES) {
    set(null);
    assert.equal(get(), get(), `${name} returned a different instance on the second call`);
  }
  for (const [, , set] of FACTORIES) set(null);
});

test("an override wins, and clearing it restores the default", () => {
  // Without this, every service test would be exercising a shared singleton
  // instead of its own fixture, and cross-test pollution would look like flake.
  for (const [name, get, set, Ctor] of FACTORIES) {
    const injected = new Ctor();
    set(injected as never);
    assert.equal(get(), injected, `${name} ignored its override`);
    set(null);
    assert.notEqual(get(), injected, `${name} kept the override after it was cleared`);
  }
  for (const [, , set] of FACTORIES) set(null);
});

test("memory planning reads the latest submitted D6 snapshot for the exact workspace and scope", async () => {
  const saved = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  setPlanningStore(null);
  const pipeline = new InMemoryPipelineStore();
  setPipelineStore(pipeline);
  try {
    const planning = getPlanningStore();
    const scope = { period: "2026Q4", scopeType: "workspace", territoryId: null, ownerSub: null, metric: "revenue" } as const;
    assert.equal(await planning.publishedTotalsFor("ws", scope), null);
    const row = (at: string, closed: number, extra = {}) => ({
      ...scope, ...extra, currency: "CNY", snapshotAt: new Date(at), submittedBySub: "manager",
      commitAmount: { amount: 50, currency: "CNY" }, bestCaseAmount: { amount: 20, currency: "CNY" },
      pipelineAmount: { amount: 10, currency: "CNY" }, closedAmount: { amount: closed, currency: "CNY" },
      newLogoCount: 2, callAmount: null, callNote: null,
    });
    await pipeline.appendForecastSnapshot("ws", row("2026-11-02", 200));
    await pipeline.appendForecastSnapshot("ws", row("2026-11-01", 100));
    await pipeline.appendForecastSnapshot("other", row("2026-11-03", 999));
    await pipeline.appendForecastSnapshot("ws", row("2026-11-03", 300, { scopeType: "owner", ownerSub: "rep" }));
    await pipeline.appendForecastSnapshot("ws", row("2026-11-04", 400, { period: "2026Q3" }));
    assert.equal((await planning.publishedTotalsFor("ws", scope))?.closedAmount.amount, 200);
    assert.equal((await planning.publishedTotalsFor("ws", { ...scope, scopeType: "owner", ownerSub: "rep" }))?.closedAmount.amount, 300);
    assert.equal(await planning.publishedTotalsFor("ws", { ...scope, scopeType: "territory", territoryId: "east" }), null);
    await pipeline.appendForecastSnapshot("ws", row("2026-11-05", 500));
    assert.equal((await planning.publishedTotalsFor("ws", scope))?.closedAmount.amount, 500);
  } finally {
    if (saved !== undefined) process.env.DATABASE_URL = saved;
    setPlanningStore(null);
    setPipelineStore(null);
  }
});
