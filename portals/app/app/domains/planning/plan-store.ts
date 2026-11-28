import { sameActionResult, type PlanActionResult } from "./action-result";
import { randomUUID } from "node:crypto";
import type { SalesPlan } from "./plan-model";

export interface SalesPlanStore {
  actionResults(
    workspaceId: string,
    revisionId: string,
  ): Promise<PlanActionResult[]>;
  list(workspaceId: string): Promise<SalesPlan[]>;
  read(workspaceId: string, year: number): Promise<SalesPlan | null>;
  transact<T>(
    workspaceId: string,
    year: number,
    run: (plan: SalesPlan,
      write: {
        appendActionResult(row: PlanActionResult): Promise<PlanActionResult>;
      },
    ) => T | Promise<T>,
  ): Promise<T>;
  adopted(workspaceId: string, targetId: string): Promise<boolean>;
}
export class InMemorySalesPlanStore implements SalesPlanStore {
  private results = new Map<string, PlanActionResult[]>();
  async actionResults(ws: string, revisionId: string) {
    const rows = this.results.get(ws) ?? [];
    return [
      ...new Map(
        rows
          .filter((r) => r.revisionId === revisionId)
          .map((r) => [r.actionKey, r]),
      ).values(),
    ];
  }
  private plans = new Map<string, SalesPlan>();
  private queues = new Map<string, Promise<void>>();
  seed(plans: readonly SalesPlan[]): void {
    for (const plan of plans) {
      const key = plan.workspaceId + "|" + plan.year;
      if (!this.plans.has(key)) this.plans.set(key, structuredClone(plan));
    }
  }
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
    run: (plan: SalesPlan,
      write: {
        appendActionResult(row: PlanActionResult): Promise<PlanActionResult>;
      },
    ) => T | Promise<T>,
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
      const staged: PlanActionResult[] = [];
      const result = await run(plan, {
        appendActionResult: async (row) => {
          const existing = [
            ...(this.results.get(workspaceId) ?? []),
            ...staged,
          ].find((r) => r.requestKey === row.requestKey);
          if (existing) {
            if (!sameActionResult(existing, row))
              throw new Error("request_conflict");
      return structuredClone(existing);
          }
          staged.push(structuredClone(row));
          return structuredClone(row);
        },
      });
      this.results.set(workspaceId, [
        ...(this.results.get(workspaceId) ?? []),
        ...staged,
      ]);
      this.plans.set(key, structuredClone(plan));
      return structuredClone(result);
    } finally {
      release();
      if (this.queues.get(key) === queue) this.queues.delete(key);
    }
  }
}
