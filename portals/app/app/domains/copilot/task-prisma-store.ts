import type { AgentTask, AgentTaskTurn, Prisma } from "@prisma/client";
import { getPrismaClient } from "../../lib/db";
import { lockKey } from "../shared/allocate";
import { assertWritable } from "../shared/column-locks";
import type { TaskObject, TaskScope, TaskState } from "./lib/task-contract";
import {
  taskCreationFingerprint,
  type TaskBundle,
  type TaskMutation,
  type TaskRecord,
  type TaskReference,
  type TaskStore,
  type TaskTurn,
} from "./task-store";

const scoped = (s: TaskScope, taskId: string) => ({ ...s, taskId });
const taskRow = (r: AgentTask): TaskRecord => ({
  ...r,
  status: r.status as TaskState,
  page: r.page as TaskObject | null,
});
const turnRow = (r: AgentTaskTurn): TaskTurn => ({
  ...r,
  status: r.status as TaskTurn["status"],
});
function writable(table: string, patch: Record<string, unknown>): void {
  const result = assertWritable(table, patch);
  if (!result.ok) throw new Error("task_column_not_writable");
}
const taskTable = "yucer_agent.agent_task";
const turnTable = "yucer_agent.agent_task_turn";

async function checkpoint(
  tx: Prisma.TransactionClient,
  scope: TaskScope,
  task: AgentTask,
): Promise<void> {
  const last = await tx.agentMessage.findFirst({
    where: { workspaceId: scope.workspaceId, sessionId: task.sessionId },
    orderBy: { seq: "desc" },
  });
  await tx.agentTaskCheckpoint.create({
    data: {
      ...scoped(scope, task.id),
      ruleVersion: task.ruleVersion,
      taskRevision: task.revision,
      lastSeq: last?.seq ?? 0n,
    },
  });
}

export class PrismaTaskStore implements TaskStore {
  async create(
    scope: TaskScope,
    goal: string,
    ruleVersion: string,
    references: Omit<TaskReference, "referenceId">[],
    requestId: string,
  ): Promise<TaskRecord> {
    const p = await getPrismaClient();
    return p.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey("agent_task_create")}::int, hashtext(${`${scope.workspaceId}:${scope.actorSub}:${requestId}`})::int)`;
      const previous = await tx.agentTask.findFirst({
        where: { ...scope, requestId },
      });
      if (previous) return taskRow(previous);
      const session = await tx.agentSession.create({
        data: {
          workspaceId: scope.workspaceId,
          actorSub: scope.actorSub,
          kind: "task",
        },
      });
      const task = await tx.agentTask.create({
        data: {
          ...scope,
          sessionId: session.id,
          requestId,
          requestHash: taskCreationFingerprint(goal, references),
          goal,
          ruleVersion,
        },
      });
      for (const r of references)
        await tx.agentTaskReference.create({
          data: {
            ...scoped(scope, task.id),
            objectKind: r.kind,
            objectId: r.id,
            sourceVersion: r.version,
            role: r.role,
          },
        });
      await checkpoint(tx, scope, task);
      return taskRow(task);
    });
  }
  async list(scope: TaskScope): Promise<TaskRecord[]> {
    const p = await getPrismaClient();
    return (
      await p.agentTask.findMany({
        where: scope,
        orderBy: { updatedAt: "desc" },
        take: 50,
      })
    ).map(taskRow);
  }
  async search(scope: TaskScope, query: string): Promise<TaskRecord[]> {
    const p=await getPrismaClient();
    // Match all owner tasks, not just the recent navigation window. Select
    // identity only; source checks still precede loading any matching text.
    const tasks=await p.agentTask.findMany({where:scope,orderBy:{updatedAt:"desc"}});
    const matches=await p.agentMessage.findMany({where:{workspaceId:scope.workspaceId,sessionId:{in:tasks.map(t=>t.sessionId)},content:{contains:query,mode:"insensitive"}},distinct:["sessionId"],select:{sessionId:true},take:50});
    const ids=new Set(matches.map(m=>m.sessionId));
    return tasks.filter(t=>ids.has(t.sessionId)).map(taskRow);
  }
  async load(
    scope: TaskScope,
    id: string,
    content = false,
  ): Promise<TaskBundle | null> {
    const p = await getPrismaClient();
    // Repeatable read gives the service one revision for references and content.
    return p.$transaction(
      async (tx) => {
        const task = await tx.agentTask.findFirst({ where: { ...scope, id } });
        if (!task) return null;
        const where = scoped(scope, id);
        const references = await tx.agentTaskReference.findMany({
          where,
          orderBy: { createdAt: "asc" },
        });
        const check = await tx.agentTaskCheckpoint.findFirst({
          where,
          orderBy: { taskRevision: "desc" },
        });
        const turns = await tx.agentTaskTurn.findMany({
          where,
          orderBy: { createdAt: "asc" },
        });
        const legacy = await tx.agentTaskSession.findMany({ where });
        const drafts = content
          ? await tx.agentTaskDraft.findMany({
              where,
              orderBy: { revision: "desc" },
            })
          : [];
        const seen = new Set<string>();
        const latestDrafts = drafts.filter((d) => {
          if (seen.has(d.draftKey)) return false;
          seen.add(d.draftKey);
          return true;
        });
        const messages = content
          ? await tx.agentMessage.findMany({
              where: {
                workspaceId: scope.workspaceId,
                sessionId: task.sessionId,
              },
              orderBy: { seq: "asc" },
            })
          : [];
        return {
          task: taskRow(task),
          references: references.map((r) => ({
            referenceId: r.id,
            kind: r.objectKind as TaskReference["kind"],
            id: r.objectId,
            version: r.sourceVersion,
            role: r.role as TaskReference["role"],
          })),
          checkpoint: check
            ? {
                id: check.id,
                ruleVersion: check.ruleVersion,
                taskRevision: check.taskRevision,
                lastSeq: Number(check.lastSeq),
                createdAt: check.createdAt,
              }
            : null,
          drafts: latestDrafts.map((d) => ({
            id: d.id,
            key: d.draftKey,
            contractVersion: "private-notes/1" as const,
            revision: d.revision,
            text: (d.content as { text: string }).text,
            createdAt: d.createdAt,
          })),
          messages: messages.map((m) => ({
            id: m.id,
            seq: Number(m.seq),
            role: m.role as "user" | "assistant",
            content: m.content,
            createdAt: m.createdAt,
          })),
          turns: turns.map(turnRow),
          legacy: legacy.map((l) => ({
            sessionId: l.sessionId,
            historyPolicy: "excluded" as const,
          })),
        };
      },
      { isolationLevel: "RepeatableRead" },
    );
  }
  async mutate(
    scope: TaskScope,
    id: string,
    revision: number,
    patch: TaskMutation,
  ): Promise<boolean> {
    const p = await getPrismaClient();
    return p
      .$transaction(async (tx) => {
        // A CAS obtains the row lock before checking dependent turns or appending.
        writable(taskTable, {
          rule_version: patch.ruleVersion,
          revision: revision + 1,
          updated_at: new Date(),
          ...(patch.page !== undefined ? { page: patch.page } : {}),
          ...(patch.status ? { status: patch.status } : {}),
        });
        const changed = await tx.agentTask.updateMany({
          where: { ...scope, id, revision },
          data: {
            ruleVersion: patch.ruleVersion,
            revision: { increment: 1 },
            updatedAt: new Date(),
            ...(patch.status ? { status: patch.status } : {}),
            ...(patch.page !== undefined
              ? {
                  page:
                    patch.page === null
                      ? (await import("@prisma/client")).Prisma.DbNull
                      : (patch.page as unknown as Prisma.InputJsonValue),
                }
              : {}),
          },
        });
        if (!changed.count) return false;
        if (
          await tx.agentTaskTurn.count({
            where: { ...scoped(scope, id), status: "running" },
          })
        )
          throw new TaskWriteConflict();
        const where = scoped(scope, id);
        for (const r of patch.references ?? [])
          await tx.agentTaskReference.createMany({
            data: [
              {
                ...where,
                objectKind: r.kind,
                objectId: r.id,
                sourceVersion: r.version,
                role: r.role,
              },
            ],
            skipDuplicates: true,
          });
        if (patch.legacySessionId)
          await tx.agentTaskSession.createMany({
            data: [{ ...where, sessionId: patch.legacySessionId }],
            skipDuplicates: true,
          });
        if (patch.draft)
          await tx.agentTaskDraft.create({
            data: {
              ...where,
              draftKey: patch.draft.key,
              contractVersion: "private-notes/1",
              revision: revision + 1,
              content: { text: patch.draft.text },
            },
          });
        const task = await tx.agentTask.findFirstOrThrow({
          where: { ...scope, id },
        });
        await checkpoint(tx, scope, task);
        return true;
      })
      .catch((e) => {
        if (e instanceof TaskWriteConflict) return false;
        throw e;
      });
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
    const p = await getPrismaClient();
    return p
      .$transaction(async (tx) => {
        writable(taskTable, {
          rule_version: ruleVersion,
          revision: revision + 1,
          updated_at: new Date(),
        });
        const moved = await tx.agentTask.updateMany({
          where: { ...scope, id, revision, status: "active" },
          data: {
            ruleVersion,
            revision: { increment: 1 },
            updatedAt: new Date(),
          },
        });
        if (!moved.count) return null;
        if (
          await tx.agentTaskTurn.count({
            where: {
              ...scoped(scope, id),
              OR: [{ status: "running" }, { requestId }],
            },
          })
        )
          throw new TaskWriteConflict();
        const task = await tx.agentTask.findFirstOrThrow({
          where: { ...scope, id },
        });
        const last = await tx.agentMessage.findFirst({
          where: { workspaceId: scope.workspaceId, sessionId: task.sessionId },
          orderBy: { seq: "desc" },
        });
        const msg = await tx.agentMessage.create({
          data: {
            workspaceId: scope.workspaceId,
            sessionId: task.sessionId,
            seq: (last?.seq ?? 0n) + 1n,
            role: "user",
            content: question,
          },
        });
        return turnRow(
          await tx.agentTaskTurn.create({
            data: {
              ...scoped(scope, id),
              sessionId: task.sessionId,
              requestId,
              questionHash,
              ruleVersion,
              userMessageId: msg.id,
            },
          }),
        );
      })
      .catch((e) => {
        if (e instanceof TaskWriteConflict) return null;
        throw e;
      });
  }
  async finishTurn(
    scope: TaskScope,
    id: string,
    turnId: string,
    result:
      | { answer: string; tokens: number }
      | { errorCode: string; interrupted?: boolean },
  ): Promise<boolean> {
    const p = await getPrismaClient();
    return p
      .$transaction(async (tx) => {
        writable(taskTable, { revision: 1, updated_at: new Date() });
        const task = await tx.agentTask.updateMany({
          where: { ...scope, id },
          data: { revision: { increment: 1 }, updatedAt: new Date() },
        });
        if (!task.count) return false;
        const row = await tx.agentTask.findFirstOrThrow({
          where: { ...scope, id },
        });
        const turn = await tx.agentTaskTurn.findFirst({
          where: { ...scoped(scope, id), id: turnId, status: "running" },
        });
        if (!turn) throw new TaskWriteConflict();
        let assistantMessageId: string | null = null;
        if ("answer" in result) {
          const last = await tx.agentMessage.findFirst({
            where: { workspaceId: scope.workspaceId, sessionId: row.sessionId },
            orderBy: { seq: "desc" },
          });
          const msg = await tx.agentMessage.create({
            data: {
              workspaceId: scope.workspaceId,
              sessionId: row.sessionId,
              seq: (last?.seq ?? 0n) + 1n,
              role: "assistant",
              content: result.answer,
              tokenCount: result.tokens,
            },
          });
          assistantMessageId = msg.id;
        }
        writable(turnTable, {
          status: "finished",
          assistant_message_id: assistantMessageId,
          error_key: null,
          finished_at: new Date(),
        });
        await tx.agentTaskTurn.updateMany({
          where: { ...scoped(scope, id), id: turnId, status: "running" },
          data: {
            status:
              "answer" in result
                ? "succeeded"
                : result.interrupted
                  ? "interrupted"
                  : "failed",
            assistantMessageId,
            errorCode: "errorCode" in result ? result.errorCode : null,
            finishedAt: new Date(),
          },
        });
        await checkpoint(tx, scope, row);
        return true;
      })
      .catch((e) => {
        if (e instanceof TaskWriteConflict) return false;
        throw e;
      });
  }
}
class TaskWriteConflict extends Error {}
