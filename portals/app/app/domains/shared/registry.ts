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
