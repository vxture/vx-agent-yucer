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
import { InMemoryPipelineStore, type PipelineStore } from "../pipeline/store";
import { PrismaPipelineStore } from "../pipeline/prisma-store";
import { InMemoryCopilotStore, type CopilotStore } from "../copilot/store";
import { PrismaCopilotStore } from "../copilot/prisma-store";
import { InMemoryAccountStore, type AccountStore } from "../account/store";
import { PrismaAccountStore } from "../account/prisma-store";
import { InMemoryDeliveryStore, type DeliveryStore } from "../delivery/store";
import { InMemoryPlanningStore, type PlanningStore } from "../planning/store";
import { InMemoryStrategyStore, type StrategyStore } from "../strategy/store";

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

// D7 / D2 / D1+D3 have their ports and in-memory implementations; the Prisma
// adapters follow the pattern already set by pipeline/account and are the
// remaining work in batch 2c. Until then these resolve to the in-memory store
// even with DATABASE_URL set, which is stated here rather than silently true.

let deliveryOverride: DeliveryStore | null = null;
let deliveryMemo: DeliveryStore | null = null;

export function getDeliveryStore(): DeliveryStore {
  if (deliveryOverride) return deliveryOverride;
  if (!deliveryMemo) deliveryMemo = new InMemoryDeliveryStore();
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
  if (!planningMemo) planningMemo = new InMemoryPlanningStore();
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
  if (!strategyMemo) strategyMemo = new InMemoryStrategyStore();
  return strategyMemo;
}

export function setStrategyStore(next: StrategyStore | null): void {
  strategyOverride = next;
  strategyMemo = null;
}
