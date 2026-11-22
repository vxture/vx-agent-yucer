import { randomUUID } from "node:crypto";
import type { TaskScope } from "../copilot/lib/task-contract";
export interface TopicRecord extends TaskScope {
  id: string;
  judgementId: string;
  scope: "mine" | "all";
  basisVersion: string;
  accessVersion: string;
  revision: number;
  status: "open" | "processing" | "verified";
  taskId: string | null;
  verifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
export type TopicChange = Pick<
  TopicRecord,
  "basisVersion" | "accessVersion" | "status" | "taskId" | "verifiedAt"
>;
export interface TopicStore {
  list(owner: TaskScope): Promise<TopicRecord[]>;
  get(owner: TaskScope, id: string): Promise<TopicRecord | null>;
  ensure(
    input: TaskScope &
      Pick<
        TopicRecord,
        "judgementId" | "scope" | "basisVersion" | "accessVersion"
      >,
  ): Promise<TopicRecord>;
  change(
    owner: TaskScope,
    id: string,
    revision: number,
    patch: TopicChange,
  ): Promise<TopicRecord | null>;
}
const clone = <T>(v: T): T => structuredClone(v);
export class InMemoryTopicStore implements TopicStore {
  private readonly rows = new Map<string, TopicRecord>();
  async list(owner: TaskScope) {
    return clone(
      [...this.rows.values()].filter(
        (r) =>
          r.workspaceId === owner.workspaceId && r.actorSub === owner.actorSub,
      ),
    );
  }
  async get(owner: TaskScope, id: string) {
    const r = this.rows.get(id);
    return r?.workspaceId === owner.workspaceId && r.actorSub === owner.actorSub
      ? clone(r)
      : null;
  }
  async ensure(
    input: TaskScope &
      Pick<
        TopicRecord,
        "judgementId" | "scope" | "basisVersion" | "accessVersion"
      >,
  ) {
    const old = [...this.rows.values()].find(
      (r) =>
        r.workspaceId === input.workspaceId &&
        r.actorSub === input.actorSub &&
        r.judgementId === input.judgementId &&
        r.scope === input.scope,
    );
    if (old) return clone(old);
    const r: TopicRecord = {
      ...clone(input),
      id: randomUUID(),
      revision: 1,
      status: "open",
      taskId: null,
      verifiedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.rows.set(r.id, r);
    return clone(r);
  }
  async change(
    owner: TaskScope,
    id: string,
    revision: number,
    patch: TopicChange,
  ) {
    const r = this.rows.get(id);
    if (
      !r ||
      r.workspaceId !== owner.workspaceId ||
      r.actorSub !== owner.actorSub ||
      r.revision !== revision
    )
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
}
