// Store factory for the domain layer.
//
// Same shape the contract surface already uses (provisioning, usage, authz): the
// Prisma implementation when DATABASE_URL is set, the in-memory one otherwise,
// and a test override. Importing a Prisma store here is safe on the offline path
// because lib/db.ts loads @prisma/client lazily.
//
// SERVER-ONLY, for the same reason authz/context.ts is: the Prisma adapters
// reach the pg driver, which cannot be bundled for the browser.

import { prismaEnabled } from "../../lib/db";
import { seedDemoWorkspace } from "./demo-seed";
import { InMemoryPipelineStore, type PipelineStore } from "../pipeline/store";
import { PrismaPipelineStore } from "../pipeline/prisma-store";
import { InMemoryCopilotStore, type CopilotStore } from "../copilot/store";
import { PrismaCopilotStore } from "../copilot/prisma-store";
import { InMemoryAccountStore, type AccountStore } from "../account/store";
import { InMemoryFieldStore, type FieldStore } from "../account/field-store";
import { PrismaAccountStore } from "../account/prisma-store";
import { PrismaFieldStore } from "../account/field-prisma-store";
import { InMemoryDeliveryStore, type DeliveryStore } from "../delivery/store";
import { PrismaDeliveryStore } from "../delivery/prisma-store";
import { InMemoryPlanningStore, type PlanningStore } from "../planning/store";
import { PrismaPlanningStore } from "../planning/prisma-store";
import { InMemoryStrategyStore, type StrategyStore } from "../strategy/store";
import { PrismaStrategyStore } from "../strategy/prisma-store";
import { InMemorySignalStore, type SignalStore } from "../signal/store";
import { PrismaSignalStore } from "../signal/prisma-store";

let pipelineOverride: PipelineStore | null = null;

/**
 * The memo table, on globalThis rather than in module scope.
 *
 * WHY IT CANNOT BE A MODULE VARIABLE. Next evaluates server actions and RSC
 * renders in SEPARATE module graphs, so a module-level singleton is
 * instantiated once per layer and each gets its own copy. That is silent and
 * it is the worst possible shape of bug for the in-memory stores: a write
 * through a server action reports success against one instance while the page
 * that renders next reads the other, so the product looks like it accepted
 * your input and then lost it.
 *
 * Found by driving a real click and tagging the instances - the action wrote to
 * `copilot-7ynho` and the feed read `copilot-60sq6`. It affected every write
 * path through a server action, not only the one being added: notes captured
 * through the agent panel were landing in a store nothing rendered from.
 *
 * The Prisma path never had the problem, because there the shared state is the
 * database rather than the object. This only ever mattered for the demo stores,
 * which is exactly where nobody would think to look.
 *
 * DEV NOTE, and it is the flip side of the fix: because these now survive on
 * globalThis, they also survive a hot reload. Adding a METHOD to a store class
 * therefore needs a server restart in dev - the old instance is still there and
 * will throw "is not a function". Production never sees it (fresh process), and
 * making the table self-invalidate would mean versioning it against a build id,
 * which is more machinery than a restart is worth.
 */
const MEMO = Symbol.for("yucer.domain-stores");
type MemoTable = Record<string, unknown>;
function memoTable(): MemoTable {
  const g = globalThis as unknown as Record<symbol, MemoTable | undefined>;
  if (!g[MEMO]) g[MEMO] = {};
  return g[MEMO];
}

export function getPipelineStore(): PipelineStore {
  if (pipelineOverride) return pipelineOverride;
  const memo = memoTable();
  if (memo.pipeline) return memo.pipeline as PipelineStore;
  memo.pipeline = prismaEnabled() ? new PrismaPipelineStore() : new InMemoryPipelineStore();
  return memo.pipeline as PipelineStore;
}

export function setPipelineStore(next: PipelineStore | null): void {
  pipelineOverride = next;
  memoTable().pipeline = undefined;
}

let copilotOverride: CopilotStore | null = null;

export function getCopilotStore(): CopilotStore {
  if (copilotOverride) return copilotOverride;
  const memo = memoTable();
  if (memo.copilot) return memo.copilot as CopilotStore;
  memo.copilot = prismaEnabled() ? new PrismaCopilotStore() : new InMemoryCopilotStore();
  return memo.copilot as CopilotStore;
}

export function setCopilotStore(next: CopilotStore | null): void {
  copilotOverride = next;
  memoTable().copilot = undefined;
}

let accountOverride: AccountStore | null = null;

/**
 * The evidence plane (ADR-006). Same domain as the account store, separate port
 * because it spans a different schema with a different write discipline.
 */
let fieldOverride: FieldStore | null = null;

export function getFieldStore(): FieldStore {
  if (fieldOverride) return fieldOverride;
  const memo = memoTable();
  if (memo.field) return memo.field as FieldStore;
  memo.field = prismaEnabled() ? new PrismaFieldStore() : new InMemoryFieldStore();
  return memo.field as FieldStore;
}

export function setFieldStore(next: FieldStore | null): void {
  fieldOverride = next;
  memoTable().field = undefined;
}

export function getAccountStore(): AccountStore {
  if (accountOverride) return accountOverride;
  const memo = memoTable();
  if (memo.account) return memo.account as AccountStore;
  memo.account = prismaEnabled() ? new PrismaAccountStore() : new InMemoryAccountStore();
  return memo.account as AccountStore;
}

export function setAccountStore(next: AccountStore | null): void {
  accountOverride = next;
  memoTable().account = undefined;
}

let deliveryOverride: DeliveryStore | null = null;

export function getDeliveryStore(): DeliveryStore {
  if (deliveryOverride) return deliveryOverride;
  const memo = memoTable();
  if (!memo.delivery) memo.delivery = prismaEnabled() ? new PrismaDeliveryStore() : new InMemoryDeliveryStore();
  return memo.delivery as DeliveryStore;
}

export function setDeliveryStore(next: DeliveryStore | null): void {
  deliveryOverride = next;
  memoTable().delivery = undefined;
}

let planningOverride: PlanningStore | null = null;

export function getPlanningStore(): PlanningStore {
  if (planningOverride) return planningOverride;
  const memo = memoTable();
  if (!memo.planning) memo.planning = prismaEnabled() ? new PrismaPlanningStore() : new InMemoryPlanningStore();
  return memo.planning as PlanningStore;
}

export function setPlanningStore(next: PlanningStore | null): void {
  planningOverride = next;
  memoTable().planning = undefined;
}

let strategyOverride: StrategyStore | null = null;

export function getStrategyStore(): StrategyStore {
  if (strategyOverride) return strategyOverride;
  const memo = memoTable();
  if (!memo.strategy) memo.strategy = prismaEnabled() ? new PrismaStrategyStore() : new InMemoryStrategyStore();
  return memo.strategy as StrategyStore;
}

export function setStrategyStore(next: StrategyStore | null): void {
  strategyOverride = next;
  memoTable().strategy = undefined;
}

let signalOverride: SignalStore | null = null;

export function getSignalStore(): SignalStore {
  if (signalOverride) return signalOverride;
  const memo = memoTable();
  if (memo.signal) return memo.signal as SignalStore;
  memo.signal = prismaEnabled() ? new PrismaSignalStore() : new InMemorySignalStore();
  return memo.signal as SignalStore;
}

export function setSignalStore(next: SignalStore | null): void {
  signalOverride = next;
  memoTable().signal = undefined;
}


// --- Demo data -------------------------------------------------------------
//
// Without a database every store starts empty and the product renders as eight
// empty tables, which shows neither the features nor the chain they exist to
// join up. This fills the in-memory stores once, on demand.
//
// It is guarded twice, because "demo data appeared in production" is discovered
// by a customer rather than by a test:
//
//   1. prismaEnabled() - a workspace with a real database is never seeded.
//   2. YUCER_DEMO_DATA must be explicitly "on". Absent means off.
//
// A third guard is structural: seedDemoWorkspace accepts the InMemory* classes
// by type, so handing it a Prisma store does not compile.

const seeded = new Set<string>();

export function demoDataEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.YUCER_DEMO_DATA === "on" && !prismaEnabled();
}

/**
 * Seed a workspace's in-memory stores, once. Safe to call on every request:
 * the second call for a workspace is a no-op, so a page render does not
 * multiply the fixtures.
 */
export function ensureDemoData(workspaceId: string): boolean {
  if (!demoDataEnabled()) return false;
  if (seeded.has(workspaceId)) return true;

  const stores = {
    strategy: getStrategyStore(),
    planning: getPlanningStore(),
    account: getAccountStore(),
    field: getFieldStore(),
    signal: getSignalStore(),
    pipeline: getPipelineStore(),
    delivery: getDeliveryStore(),
    copilot: getCopilotStore(),
  };

  // Belt and braces against a future refactor that makes a factory return a
  // Prisma store while DATABASE_URL is somehow unset: if any store is not the
  // in-memory implementation, seed nothing at all rather than seed partially.
  const allInMemory = Object.values(stores).every((s) =>
    s.constructor.name.startsWith("InMemory"),
  );
  if (!allInMemory) return false;

  seedDemoWorkspace(workspaceId, stores as Parameters<typeof seedDemoWorkspace>[1]);
  seeded.add(workspaceId);
  return true;
}

/** Tests: forget what has been seeded. */
export function resetDemoSeed(): void {
  seeded.clear();
}
