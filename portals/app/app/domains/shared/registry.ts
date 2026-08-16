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
let pipelineMemo: PipelineStore | null = null;

export function getPipelineStore(): PipelineStore {
  if (pipelineOverride) return pipelineOverride;
  if (pipelineMemo) return pipelineMemo;
  pipelineMemo = prismaEnabled() ? new PrismaPipelineStore() : new InMemoryPipelineStore();
  return pipelineMemo;
}

export function setPipelineStore(next: PipelineStore | null): void {
  pipelineOverride = next;
  pipelineMemo = null;
}

let copilotOverride: CopilotStore | null = null;
let copilotMemo: CopilotStore | null = null;

export function getCopilotStore(): CopilotStore {
  if (copilotOverride) return copilotOverride;
  if (copilotMemo) return copilotMemo;
  copilotMemo = prismaEnabled() ? new PrismaCopilotStore() : new InMemoryCopilotStore();
  return copilotMemo;
}

export function setCopilotStore(next: CopilotStore | null): void {
  copilotOverride = next;
  copilotMemo = null;
}

let accountOverride: AccountStore | null = null;
let accountMemo: AccountStore | null = null;

/**
 * The evidence plane (ADR-006). Same domain as the account store, separate port
 * because it spans a different schema with a different write discipline.
 */
let fieldOverride: FieldStore | null = null;
let fieldMemo: FieldStore | null = null;

export function getFieldStore(): FieldStore {
  if (fieldOverride) return fieldOverride;
  if (fieldMemo) return fieldMemo;
  fieldMemo = prismaEnabled() ? new PrismaFieldStore() : new InMemoryFieldStore();
  return fieldMemo;
}

export function setFieldStore(next: FieldStore | null): void {
  fieldOverride = next;
  fieldMemo = null;
}

export function getAccountStore(): AccountStore {
  if (accountOverride) return accountOverride;
  if (accountMemo) return accountMemo;
  accountMemo = prismaEnabled() ? new PrismaAccountStore() : new InMemoryAccountStore();
  return accountMemo;
}

export function setAccountStore(next: AccountStore | null): void {
  accountOverride = next;
  accountMemo = null;
}

let deliveryOverride: DeliveryStore | null = null;
let deliveryMemo: DeliveryStore | null = null;

export function getDeliveryStore(): DeliveryStore {
  if (deliveryOverride) return deliveryOverride;
  if (!deliveryMemo) {
    deliveryMemo = prismaEnabled() ? new PrismaDeliveryStore() : new InMemoryDeliveryStore();
  }
  return deliveryMemo;
}

export function setDeliveryStore(next: DeliveryStore | null): void {
  deliveryOverride = next;
  deliveryMemo = null;
}

let planningOverride: PlanningStore | null = null;
let planningMemo: PlanningStore | null = null;

export function getPlanningStore(): PlanningStore {
  if (planningOverride) return planningOverride;
  if (!planningMemo) {
    planningMemo = prismaEnabled() ? new PrismaPlanningStore() : new InMemoryPlanningStore();
  }
  return planningMemo;
}

export function setPlanningStore(next: PlanningStore | null): void {
  planningOverride = next;
  planningMemo = null;
}

let strategyOverride: StrategyStore | null = null;
let strategyMemo: StrategyStore | null = null;

export function getStrategyStore(): StrategyStore {
  if (strategyOverride) return strategyOverride;
  if (!strategyMemo) {
    strategyMemo = prismaEnabled() ? new PrismaStrategyStore() : new InMemoryStrategyStore();
  }
  return strategyMemo;
}

export function setStrategyStore(next: StrategyStore | null): void {
  strategyOverride = next;
  strategyMemo = null;
}

let signalOverride: SignalStore | null = null;
let signalMemo: SignalStore | null = null;

export function getSignalStore(): SignalStore {
  if (signalOverride) return signalOverride;
  if (signalMemo) return signalMemo;
  signalMemo = prismaEnabled() ? new PrismaSignalStore() : new InMemorySignalStore();
  return signalMemo;
}

export function setSignalStore(next: SignalStore | null): void {
  signalOverride = next;
  signalMemo = null;
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
