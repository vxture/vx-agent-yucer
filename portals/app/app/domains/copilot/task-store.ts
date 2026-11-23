import { createHash, randomUUID } from "node:crypto";
import type { TaskArtifacts } from "./lib/task-artifacts";
import type {
  TaskObject,
  TaskScope,
  TaskSource,
  TaskState,
} from "./lib/task-contract";

export interface TaskRecord extends TaskScope {
  id: string;
  sessionId: string;
  requestHash: string;
  goal: string;
  status: TaskState;
  ruleVersion: string;
  revision: number;
  page: TaskObject | null;
  createdAt: Date;
  updatedAt: Date;
}
export interface TaskReference extends TaskSource {
  referenceId: string;
  role: "target" | "context" | "legacy";
}
export interface TaskDraft {
  id: string;
  key: string;
  contractVersion: "private-notes/1" | "business-form/1";
  revision: number;
  text: string;
  createdAt: Date;
}
export interface TaskCheckpoint {
  id: string;
  ruleVersion: string;
  taskRevision: number;
  lastSeq: number;
  createdAt: Date;
}
export interface TaskMessage {
  id: string;
  seq: number;
  role: "user" | "assistant";
  content: string;
  createdAt: Date;
}
export interface TaskTurn {
  artifacts?: TaskArtifacts;
  id: string;
  requestId: string;
  questionHash: string;
  ruleVersion: string;
  status: "running" | "succeeded" | "failed" | "interrupted";
  userMessageId: string;
  assistantMessageId: string | null;
  errorCode: string | null;
}
export interface LegacyReference {
  sessionId: string;
  historyPolicy: "excluded";
}
export interface TaskBundle {
  task: TaskRecord;
  references: TaskReference[];
  drafts: TaskDraft[];
  checkpoint: TaskCheckpoint | null;
  messages: TaskMessage[];
  turns: TaskTurn[];
  legacy: LegacyReference[];
}
export interface TaskMutation {
  ruleVersion: string;
  status?: TaskState;
  page?: TaskObject | null;
  references?: Omit<TaskReference, "referenceId">[];
  draft?: { key: string; text: string; contractVersion?: "private-notes/1" | "business-form/1" };
  legacySessionId?: string;
}
export interface TaskStore {
  create(
    scope: TaskScope,
    goal: string,
    ruleVersion: string,
    references: Omit<TaskReference, "referenceId">[],
    requestId: string,
  ): Promise<TaskRecord>;
  list(scope: TaskScope): Promise<TaskRecord[]>;
  search(scope: TaskScope, query: string): Promise<TaskRecord[]>;
  load(
    scope: TaskScope,
    taskId: string,
    content?: boolean,
  ): Promise<TaskBundle | null>;
  // All mutations use optimistic revisions. The caller holds the task's
  // session lease across model work. Revisions prevent stale tab overwrites.
  mutate(
    scope: TaskScope,
    taskId: string,
    revision: number,
    patch: TaskMutation,
  ): Promise<boolean>;
  beginTurn(
    scope: TaskScope,
    taskId: string,
    revision: number,
    requestId: string,
    question: string,
    questionHash: string,
    ruleVersion: string,
  ): Promise<TaskTurn | null>;
  finishTurn(
    scope: TaskScope,
    taskId: string,
    turnId: string,
    result:
      | { answer: string; tokens: number; artifacts?: TaskArtifacts; references?: Omit<TaskReference,"referenceId">[]; forms?: {key:string;text:string}[] }
      | { errorCode: string; interrupted?: boolean; artifacts?: TaskArtifacts },
  ): Promise<boolean>;
}

// Identity only: live source versions are checked separately on every replay.
export function taskCreationFingerprint(
  goal: string,
  refs: readonly TaskSource[],
): string {
  const targets = [...new Set(refs.map((r) => `${r.kind}:${r.id}`))].sort(
    (left, right) => left.localeCompare(right, "en"),
  );
  return createHash("sha256")
    .update(JSON.stringify({ goal, targets }))
    .digest("hex");
}
const copy = <T>(value: T): T => structuredClone(value);
export class InMemoryTaskStore implements TaskStore {
  private bundles = new Map<string, TaskBundle>();
  private requests = new Map<string, string>();
  private owned(scope: TaskScope, id: string): TaskBundle | null {
    const b = this.bundles.get(id);
    return b &&
      b.task.workspaceId === scope.workspaceId &&
      b.task.actorSub === scope.actorSub
      ? b
      : null;
  }
  async create(
    scope: TaskScope,
    goal: string,
    ruleVersion: string,
    references: Omit<TaskReference, "referenceId">[],
    requestId: string,
  ): Promise<TaskRecord> {
    const key = `${scope.workspaceId}:${scope.actorSub}:${requestId}`;
    const old = this.requests.get(key);
    if (old) return copy(this.bundles.get(old)!.task);
    const task: TaskRecord = {
      ...scope,
      id: randomUUID(),
      sessionId: randomUUID(),
      goal,
      requestHash: taskCreationFingerprint(goal, references),
      status: "active",
      ruleVersion,
      revision: 1,
      page: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.bundles.set(task.id, {
      task,
      references: references.map((r) => ({
        ...copy(r),
        referenceId: randomUUID(),
      })),
      drafts: [],
      checkpoint: {
        id: randomUUID(),
        ruleVersion,
        taskRevision: 1,
        lastSeq: 0,
        createdAt: task.createdAt,
      },
      messages: [],
      turns: [],
      legacy: [],
    });
    this.requests.set(key, task.id);
    return copy(task);
  }
  async list(scope: TaskScope): Promise<TaskRecord[]> {
    return copy(
      [...this.bundles.values()]
        .filter((b) => this.owned(scope, b.task.id))
        .map((b) => b.task)
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
        .slice(0, 50),
    );
  }
  async load(
    scope: TaskScope,
    id: string,
    content = false,
  ): Promise<TaskBundle | null> {
    const b = copy(this.owned(scope, id));
    return b && !content ? { ...b, drafts: [], messages: [] } : b;
  }
  async search(scope: TaskScope, query: string): Promise<TaskRecord[]> {
    const q=query.toLocaleLowerCase();
    return copy([...this.bundles.values()].filter(b=>this.owned(scope,b.task.id)&&b.messages.some(m=>m.content.toLocaleLowerCase().includes(q))).sort((a,b)=>b.task.updatedAt.getTime()-a.task.updatedAt.getTime()).slice(0,50).map(b=>b.task));
  }
  async mutate(
    scope: TaskScope,
    id: string,
    revision: number,
    patch: TaskMutation,
  ): Promise<boolean> {
    const b = this.owned(scope, id);
    if (
      !b ||
      b.task.revision !== revision ||
      b.turns.some((t) => t.status === "running")
    )
      return false;
    b.task.ruleVersion = patch.ruleVersion;
    if (patch.status) b.task.status = patch.status;
    if (patch.page !== undefined) b.task.page = copy(patch.page);
    for (const r of patch.references ?? [])
      if (
        !b.references.some(
          (old) =>
            old.kind === r.kind && old.id === r.id && old.role === r.role,
        )
      )
        b.references.push({ ...copy(r), referenceId: randomUUID() });
    if (
      patch.legacySessionId &&
      !b.legacy.some((l) => l.sessionId === patch.legacySessionId)
    )
      b.legacy.push({
        sessionId: patch.legacySessionId,
        historyPolicy: "excluded",
      });
    b.task.revision++;
    b.task.updatedAt = new Date();
    if (patch.draft)
      b.drafts = [
        ...b.drafts.filter((d) => d.key !== patch.draft!.key),
        {
          id: randomUUID(),
          key: patch.draft.key,
          contractVersion: patch.draft.contractVersion ?? "private-notes/1",
          revision: b.task.revision,
          text: patch.draft.text,
          createdAt: new Date(),
        },
      ];
    b.checkpoint = {
      id: randomUUID(),
      ruleVersion: patch.ruleVersion,
      taskRevision: b.task.revision,
      lastSeq: b.messages.length,
      createdAt: new Date(),
    };
    return true;
  }
  async beginTurn(
    scope: TaskScope,
    id: string,
    revision: number,
    requestId: string,
    question: string,
    questionHash: string,
    ruleVersion: string,
  ): Promise<TaskTurn | null> {
    const b = this.owned(scope, id);
    if (
      !b ||
      b.task.revision !== revision ||
      b.task.status !== "active" ||
      b.turns.some((t) => t.status === "running" || t.requestId === requestId)
    )
      return null;
    const msg: TaskMessage = {
      id: randomUUID(),
      seq: b.messages.length + 1,
      role: "user",
      content: question,
      createdAt: new Date(),
    };
    const turn: TaskTurn = {
      id: randomUUID(),
      requestId,
      questionHash,
      ruleVersion,
      status: "running",
      userMessageId: msg.id,
      assistantMessageId: null,
      errorCode: null,
    };
    b.messages.push(msg);
    b.turns.push(turn);
    b.task.ruleVersion = ruleVersion;
    b.task.revision++;
    b.task.updatedAt = new Date();
    return copy(turn);
  }
  async finishTurn(
    scope: TaskScope,
    id: string,
    turnId: string,
    result:
      | { answer: string; tokens: number; artifacts?: TaskArtifacts; references?: Omit<TaskReference,"referenceId">[]; forms?: {key:string;text:string}[] }
      | { errorCode: string; interrupted?: boolean; artifacts?: TaskArtifacts },
  ): Promise<boolean> {
    const b = this.owned(scope, id),
      turn = b?.turns.find((t) => t.id === turnId && t.status === "running");
    if (!b || !turn) return false;
    if ("answer" in result) {
      for(const ref of result.references??[]) {
        const old=b.references.find(r=>r.kind===ref.kind&&r.id===ref.id&&r.role===ref.role);
        if(old&&old.version!==ref.version)throw Error("source_changed");
      }
      for(const ref of result.references??[]) {
        if(!b.references.some(r=>r.kind===ref.kind&&r.id===ref.id&&r.role===ref.role))b.references.push({...copy(ref),referenceId:randomUUID()});
      }
      for(const form of result.forms??[])b.drafts=[...b.drafts.filter(d=>d.key!==form.key),{id:randomUUID(),key:form.key,text:form.text,contractVersion:"business-form/1",revision:b.task.revision+1,createdAt:new Date()}];
    }
    if ("answer" in result) {
      const msg: TaskMessage = {
        id: randomUUID(),
        seq: b.messages.length + 1,
        role: "assistant",
        content: result.answer,
        createdAt: new Date(),
      };
      b.messages.push(msg);
      turn.artifacts = result.artifacts ? copy(result.artifacts) : undefined;
      turn.assistantMessageId = msg.id;
      turn.status = "succeeded";
    } else {
      turn.status = result.interrupted ? "interrupted" : "failed";
      turn.errorCode = result.errorCode;
      turn.artifacts = result.artifacts ? copy(result.artifacts) : undefined;
    }
    b.task.revision++;
    b.task.updatedAt = new Date();
    b.checkpoint = {
      id: randomUUID(),
      ruleVersion: turn.ruleVersion,
      taskRevision: b.task.revision,
      lastSeq: b.messages.length,
      createdAt: new Date(),
    };
    return true;
  }
}
