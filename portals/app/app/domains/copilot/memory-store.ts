import { randomUUID } from "node:crypto";
import type { TaskScope, TaskSource } from "./lib/task-contract";

export const MEMORY_KINDS = [
  "fact",
  "decision",
  "inference",
  "hypothesis",
] as const;
export type MemoryKind = (typeof MEMORY_KINDS)[number];
export interface MemoryDependency {
  id: string;
  revision: number;
}
export interface PrivateMemory extends TaskScope {
  id: string;
  requestId: string;
  revision: number;
  text: string;
  kind: MemoryKind;
  state: "active" | "stopped";
  origin: "user" | "model";
  taskId: string | null;
  messageIds: string[];
  sources: TaskSource[];
  parents: MemoryDependency[];
  knowledgeSources?: MemoryDependency[];
  createdAt: Date;
  updatedAt: Date;
}
export type NewMemory = Omit<
  PrivateMemory,
  "id" | "revision" | "state" | "createdAt" | "updatedAt"
>;
export interface MemoryChange {
  text?: string;
  kind?: MemoryKind;
  state?: PrivateMemory["state"];
}
export interface MemoryStore {
  list(scope: TaskScope, offset?: number): Promise<PrivateMemory[]>;
  search(
    scope: TaskScope,
    terms: string[],
    sources: TaskSource[],
  ): Promise<PrivateMemory[]>;
  get(scope: TaskScope, id: string): Promise<PrivateMemory | null>;
  create(input: NewMemory): Promise<PrivateMemory>;
  change(
    scope: TaskScope,
    id: string,
    revision: number,
    patch: MemoryChange,
  ): Promise<PrivateMemory | null>;
  dependencies(scope: TaskScope, taskId: string): Promise<MemoryDependency[]>;
  bind(
    scope: TaskScope,
    taskId: string,
    items: MemoryDependency[],
  ): Promise<boolean>;
}
const clone = <T>(value: T): T => structuredClone(value);
export class InMemoryMemoryStore implements MemoryStore {
  private rows = new Map<string, PrivateMemory>();
  private refs = new Map<string, MemoryDependency[]>();
  async get(scope: TaskScope, id: string) {
    const r = this.rows.get(id);
    return r &&
      r.workspaceId === scope.workspaceId &&
      r.actorSub === scope.actorSub
      ? clone(r)
      : null;
  }
  async list(scope: TaskScope, offset = 0) {
    return clone(
      [...this.rows.values()]
        .filter(
          (r) =>
            r.workspaceId === scope.workspaceId &&
            r.actorSub === scope.actorSub,
        )
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
        .slice(offset, offset + 500),
    );
  }
  async search(scope: TaskScope, terms: string[], sources: TaskSource[]) {
    return clone(
      [...this.rows.values()]
        .filter(
          (r) =>
            r.workspaceId === scope.workspaceId &&
            r.actorSub === scope.actorSub &&
            r.state === "active" &&
            (terms.some((t) => r.text.toLocaleLowerCase().includes(t)) ||
              r.sources.some((s) =>
                sources.some((o) => o.kind === s.kind && o.id === s.id),
              )),
        )
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
        .slice(0, 100),
    );
  }
  async create(input: NewMemory) {
    const old = [...this.rows.values()].find(
      (r) =>
        r.workspaceId === input.workspaceId &&
        r.actorSub === input.actorSub &&
        r.requestId === input.requestId,
    );
    if (old) return clone(old);
    const r: PrivateMemory = {
      ...clone(input),
      id: randomUUID(),
      revision: 1,
      state: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.rows.set(r.id, r);
    return clone(r);
  }
  async change(
    scope: TaskScope,
    id: string,
    revision: number,
    patch: MemoryChange,
  ) {
    const r = this.rows.get(id);
    if (
      !r ||
      r.workspaceId !== scope.workspaceId ||
      r.actorSub !== scope.actorSub ||
      r.revision !== revision
    )
      return null;
    const next = {
      ...r,
      ...patch,
      revision: revision + 1,
      updatedAt: new Date(),
    };
    this.rows.set(id, next);
    return clone(next);
  }
  async dependencies(scope: TaskScope, taskId: string) {
    return clone(
      this.refs.get(`${scope.workspaceId}:${scope.actorSub}:${taskId}`) ?? [],
    );
  }
  async bind(scope: TaskScope, taskId: string, items: MemoryDependency[]) {
    const key = `${scope.workspaceId}:${scope.actorSub}:${taskId}`,
      old = this.refs.get(key) ?? [];
    for (const item of items) {
      const r = this.rows.get(item.id);
      if (
        !r ||
        r.workspaceId !== scope.workspaceId ||
        r.actorSub !== scope.actorSub ||
        r.revision !== item.revision ||
        r.state !== "active" ||
        old.some((o) => o.id === item.id && o.revision !== item.revision)
      )
        return false;
    }
    this.refs.set(
      key,
      clone([...old, ...items.filter((i) => !old.some((o) => o.id === i.id))]),
    );
    return true;
  }
}
