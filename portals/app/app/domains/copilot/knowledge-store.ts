import { randomUUID } from "node:crypto";
import type { TaskScope, TaskSource } from "./lib/task-contract";
import type { MemoryDependency, MemoryKind } from "./memory-store";

export interface BusinessKnowledge extends TaskScope {
  id: string;
  requestId: string;
  revision: number;
  title: string;
  text: string;
  kind: MemoryKind;
  state: "active" | "stopped";
  audience: "workspace" | "members";
  memberSubs: string[];
  sources: TaskSource[];
  reviewedDigest: string;
  createdAt: Date;
  updatedAt: Date;
}
export type NewKnowledge = Omit<
  BusinessKnowledge,
  "id" | "revision" | "state" | "createdAt" | "updatedAt"
>;
export type KnowledgeChange = Partial<
  Pick<
    BusinessKnowledge,
    "title" | "text" | "kind" | "state" | "audience" | "memberSubs"
  >
>;
export interface KnowledgeStore {
  list(workspaceId: string, offset?: number): Promise<BusinessKnowledge[]>;
  search(
    workspaceId: string,
    terms: string[],
    sources: TaskSource[],
  ): Promise<BusinessKnowledge[]>;
  get(workspaceId: string, id: string): Promise<BusinessKnowledge | null>;
  create(input: NewKnowledge): Promise<BusinessKnowledge>;
  change(
    workspaceId: string,
    id: string,
    revision: number,
    patch: KnowledgeChange,
  ): Promise<BusinessKnowledge | null>;
  dependencies(scope: TaskScope, taskId: string): Promise<MemoryDependency[]>;
  bind(
    scope: TaskScope,
    taskId: string,
    items: MemoryDependency[],
  ): Promise<boolean>;
}
const clone = <T>(v: T): T => structuredClone(v);
export class InMemoryKnowledgeStore implements KnowledgeStore {
  private readonly rows = new Map<string, BusinessKnowledge>();
  private readonly refs = new Map<string, MemoryDependency[]>();
  async get(workspaceId: string, id: string) {
    const r = this.rows.get(id);
    return r?.workspaceId === workspaceId ? clone(r) : null;
  }
  async list(workspaceId: string, offset = 0) {
    return clone(
      [...this.rows.values()]
        .filter((r) => r.workspaceId === workspaceId)
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
        .slice(offset, offset + 100),
    );
  }
  async search(workspaceId: string, terms: string[], sources: TaskSource[]) {
    return clone(
      [...this.rows.values()]
        .filter(
          (r) =>
            r.workspaceId === workspaceId &&
            r.state === "active" &&
            (terms.some((t) =>
              `${r.title} ${r.text}`.toLowerCase().includes(t),
            ) ||
              r.sources.some((s) =>
                sources.some((o) => o.kind === s.kind && o.id === s.id),
              )),
        )
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
        .slice(0, 100),
    );
  }
  async create(input: NewKnowledge) {
    const old = [...this.rows.values()].find(
      (r) =>
        r.workspaceId === input.workspaceId &&
        r.actorSub === input.actorSub &&
        r.requestId === input.requestId,
    );
    if (old) return clone(old);
    const r: BusinessKnowledge = {
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
    workspaceId: string,
    id: string,
    revision: number,
    patch: KnowledgeChange,
  ) {
    const r = this.rows.get(id);
    if (!r || r.workspaceId !== workspaceId || r.revision !== revision)
      return null;
    const next = {
      ...r,
      ...clone(patch),
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
    for (const i of items) {
      const r = this.rows.get(i.id);
      if (
        !r ||
        r.workspaceId !== scope.workspaceId ||
        r.revision !== i.revision ||
        r.state !== "active" ||
        old.some((o) => o.id === i.id && o.revision !== i.revision)
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
