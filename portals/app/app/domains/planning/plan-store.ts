import { randomUUID } from "node:crypto";
import type { SalesPlan } from "./plan-model";

export interface SalesPlanStore {
  list(workspaceId: string): Promise<SalesPlan[]>;
  read(workspaceId: string, year: number): Promise<SalesPlan | null>;
  transact<T>(
    workspaceId: string,
    year: number,
    run: (plan: SalesPlan) => T | Promise<T>,
  ): Promise<T>;
  adopted(workspaceId: string, targetId: string): Promise<boolean>;
}
export class InMemorySalesPlanStore implements SalesPlanStore {
  private plans = new Map<string, SalesPlan>();
  private queues = new Map<string, Promise<void>>();
  async list(workspaceId: string) {
    return structuredClone(
      [...this.plans.values()].filter((p) => p.workspaceId === workspaceId),
    );
  }
  async read(workspaceId: string, year: number) {
    return structuredClone(this.plans.get(`${workspaceId}|${year}`) ?? null);
  }
  async adopted(workspaceId: string, targetId: string) {
    return [...this.plans.values()].some(
      (p) =>
        p.workspaceId === workspaceId &&
        p.legacy.some((l) => l.targetId === targetId),
    );
  }
  async transact<T>(
    workspaceId: string,
    year: number,
    run: (plan: SalesPlan) => T | Promise<T>,
  ): Promise<T> {
    const key = `${workspaceId}|${year}`;
    const previous = this.queues.get(key) ?? Promise.resolve();
    let release!: () => void;
    const queue = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.queues.set(key, queue);
    await previous;
    try {
      const plan = structuredClone(
        this.plans.get(key) ?? {
          id: randomUUID(),
          workspaceId,
          year,
          revisions: [],
          events: [],
          legacy: [],
        },
      );
      const result = await run(plan);
      this.plans.set(key, structuredClone(plan));
      return structuredClone(result);
    } finally {
      release();
      if (this.queues.get(key) === queue) this.queues.delete(key);
    }
  }
}
