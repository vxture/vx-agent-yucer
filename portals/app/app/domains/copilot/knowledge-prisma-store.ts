import type { AgentBusinessKnowledge, Prisma } from "@prisma/client";
import { getPrismaClient } from "../../lib/db";
import { assertWritable } from "../shared/column-locks";
import { lockKey } from "../shared/allocate";
import type { TaskScope, TaskSource } from "./lib/task-contract";
import type { MemoryDependency } from "./memory-store";
import type {
  BusinessKnowledge,
  KnowledgeStore,
  KnowledgeChange,
  NewKnowledge,
} from "./knowledge-store";

const row = (r: AgentBusinessKnowledge): BusinessKnowledge => ({
  ...r,
  sources: r.sources as unknown as TaskSource[],
  kind: r.kind as BusinessKnowledge["kind"],
  state: r.state as BusinessKnowledge["state"],
  audience: r.audience as BusinessKnowledge["audience"],
});
async function snapshot(
  tx: Prisma.TransactionClient,
  r: AgentBusinessKnowledge,
) {
  await tx.agentBusinessKnowledgeRevision.create({
    data: {
      workspaceId: r.workspaceId,
      knowledgeId: r.id,
      revision: r.revision,
      title: r.title,
      text: r.text,
      kind: r.kind,
      state: r.state,
      audience: r.audience,
      memberSubs: r.memberSubs,
    },
  });
}
export class PrismaKnowledgeStore implements KnowledgeStore {
  async get(workspaceId: string, id: string) {
    const p = await getPrismaClient(),
      r = await p.agentBusinessKnowledge.findFirst({
        where: { workspaceId, id },
      });
    return r ? row(r) : null;
  }
  async list(workspaceId: string, offset = 0) {
    const p = await getPrismaClient();
    return (
      await p.agentBusinessKnowledge.findMany({
        where: { workspaceId },
        orderBy: { updatedAt: "desc" },
        take: 100,
        skip: offset,
      })
    ).map(row);
  }
  async search(workspaceId: string, terms: string[], sources: TaskSource[]) {
    const p = await getPrismaClient();
    const OR: Prisma.AgentBusinessKnowledgeWhereInput[] = [
      ...terms.flatMap((t) => [
        { title: { contains: t, mode: "insensitive" as const } },
        { text: { contains: t, mode: "insensitive" as const } },
      ]),
      ...sources.map(({ kind, id, version }) => ({
        sources: { array_contains: [{ kind, id, version }] },
      })),
    ];
    if (!OR.length) return [];
    return (
      await p.agentBusinessKnowledge.findMany({
        where: { workspaceId, state: "active", OR },
        orderBy: { updatedAt: "desc" },
        take: 100,
      })
    ).map(row);
  }
  async create(input: NewKnowledge) {
    const p = await getPrismaClient();
    const requestKey = `${input.workspaceId}:${input.actorSub}:${input.requestId}`;
    return p.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey("business_knowledge")}::int,hashtext(${requestKey})::int)`;
      const old = await tx.agentBusinessKnowledge.findFirst({
        where: {
          workspaceId: input.workspaceId,
          actorSub: input.actorSub,
          requestId: input.requestId,
        },
      });
      if (old) return row(old);
      const r = await tx.agentBusinessKnowledge.create({
        data: {
          ...input,
          sources: input.sources as unknown as Prisma.InputJsonValue,
        },
      });
      await snapshot(tx, r);
      return row(r);
    });
  }
  async change(
    workspaceId: string,
    id: string,
    revision: number,
    patch: KnowledgeChange,
  ) {
    const p = await getPrismaClient();
    if (
      !assertWritable("yucer_agent.agent_business_knowledge", {
        title: patch.title,
        text: patch.text,
        kind: patch.kind,
        state: patch.state,
        audience: patch.audience,
        member_subs: patch.memberSubs,
        revision: revision + 1,
        updated_at: new Date(),
      }).ok
    )
      throw new Error("knowledge_column_denied");
    return p.$transaction(async (tx) => {
      const changed = await tx.agentBusinessKnowledge.updateMany({
        where: { workspaceId, id, revision },
        data: { ...patch, revision: { increment: 1 }, updatedAt: new Date() },
      });
      if (!changed.count) return null;
      const r = await tx.agentBusinessKnowledge.findFirstOrThrow({
        where: { workspaceId, id },
      });
      await snapshot(tx, r);
      return row(r);
    });
  }
  async dependencies(scope: TaskScope, taskId: string) {
    const p = await getPrismaClient();
    return (
      await p.agentTaskKnowledge.findMany({ where: { ...scope, taskId } })
    ).map((r) => ({ id: r.knowledgeId, revision: r.knowledgeRevision }));
  }
  async bind(scope: TaskScope, taskId: string, items: MemoryDependency[]) {
    const p = await getPrismaClient();
    return p.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey("task_knowledge")}::int,hashtext(${taskId})::int)`;
      if (!(await tx.agentTask.findFirst({ where: { ...scope, id: taskId } })))
        return false;
      const old = await tx.agentTaskKnowledge.findMany({
        where: { ...scope, taskId },
      });
      for (const i of items) {
        const r = await tx.agentBusinessKnowledge.findFirst({
          where: {
            workspaceId: scope.workspaceId,
            id: i.id,
            revision: i.revision,
            state: "active",
          },
        });
        if (
          !r ||
          old.some(
            (o) => o.knowledgeId === i.id && o.knowledgeRevision !== i.revision,
          )
        )
          return false;
      }
      await tx.agentTaskKnowledge.createMany({
        data: items.map((i) => ({
          ...scope,
          taskId,
          knowledgeId: i.id,
          knowledgeRevision: i.revision,
        })),
        skipDuplicates: true,
      });
      return true;
    });
  }
}
