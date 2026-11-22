import type { AgentPrivateMemory, Prisma } from "@prisma/client";
import { getPrismaClient } from "../../lib/db";
import { assertWritable } from "../shared/column-locks";
import { lockKey } from "../shared/allocate";
import type { TaskScope } from "./lib/task-contract";
import type {
  MemoryStore,
  PrivateMemory,
  NewMemory,
  MemoryChange,
  MemoryDependency,
} from "./memory-store";

const row = (r: AgentPrivateMemory): PrivateMemory => ({
  ...r,
  kind: r.kind as PrivateMemory["kind"],
  state: r.state as PrivateMemory["state"],
  origin: r.origin as PrivateMemory["origin"],
  sources: r.sources as unknown as PrivateMemory["sources"],
  parents: r.parents as unknown as MemoryDependency[],
  knowledgeSources: r.knowledgeSources as unknown as MemoryDependency[],
});
const json = (v: unknown) => v as Prisma.InputJsonValue;
async function snapshot(tx: Prisma.TransactionClient, r: AgentPrivateMemory) {
  await tx.agentPrivateMemoryRevision.create({
    data: {
      memoryId: r.id,
      workspaceId: r.workspaceId,
      actorSub: r.actorSub,
      revision: r.revision,
      text: r.text,
      kind: r.kind,
      state: r.state,
    },
  });
}
export class PrismaMemoryStore implements MemoryStore {
  async list(scope: TaskScope, offset = 0) {
    const p = await getPrismaClient();
    return (
      await p.agentPrivateMemory.findMany({
        where: scope,
        orderBy: { updatedAt: "desc" },
        take: 500,
        skip: offset,
      })
    ).map(row);
  }
  async search(
    scope: TaskScope,
    terms: string[],
    sources: PrivateMemory["sources"],
  ) {
    const p = await getPrismaClient();
    const OR: Prisma.AgentPrivateMemoryWhereInput[] = [
      ...terms.map((t) => ({
        text: { contains: t, mode: "insensitive" as const },
      })),
      ...sources.map(({ kind, id, version }) => ({
        sources: { array_contains: [{ kind, id, version }] },
      })),
    ];
    if (!OR.length) return [];
    return (
      await p.agentPrivateMemory.findMany({
        where: { ...scope, state: "active", OR },
        orderBy: { updatedAt: "desc" },
        take: 100,
      })
    ).map(row);
  }
  async get(scope: TaskScope, id: string) {
    const p = await getPrismaClient(),
      r = await p.agentPrivateMemory.findFirst({ where: { ...scope, id } });
    return r ? row(r) : null;
  }
  async create(input: NewMemory) {
    const p = await getPrismaClient();
    return p.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey("private_memory")}::int, hashtext(${`${input.workspaceId}:${input.actorSub}:${input.requestId}`})::int)`;
      const old = await tx.agentPrivateMemory.findFirst({
        where: {
          workspaceId: input.workspaceId,
          actorSub: input.actorSub,
          requestId: input.requestId,
        },
      });
      if (old) return row(old);
      const r = await tx.agentPrivateMemory.create({
        data: {
          ...input,
          sources: json(input.sources),
          parents: json(input.parents),
          knowledgeSources: json(input.knowledgeSources ?? []),
        },
      });
      await snapshot(tx, r);
      return row(r);
    });
  }
  async change(
    scope: TaskScope,
    id: string,
    revision: number,
    patch: MemoryChange,
  ) {
    const p = await getPrismaClient();
    if (
      !assertWritable("yucer_agent.agent_private_memory", {
        text: patch.text,
        kind: patch.kind,
        state: patch.state,
        revision: revision + 1,
        updated_at: new Date(),
      }).ok
    )
      throw new Error("memory_column_denied");
    return p.$transaction(async (tx) => {
      const changed = await tx.agentPrivateMemory.updateMany({
        where: { ...scope, id, revision },
        data: { ...patch, revision: { increment: 1 }, updatedAt: new Date() },
      });
      if (!changed.count) return null;
      const r = await tx.agentPrivateMemory.findFirstOrThrow({
        where: { ...scope, id },
      });
      await snapshot(tx, r);
      return row(r);
    });
  }
  async dependencies(scope: TaskScope, taskId: string) {
    const p = await getPrismaClient();
    return (
      await p.agentTaskMemory.findMany({ where: { ...scope, taskId } })
    ).map((r) => ({ id: r.memoryId, revision: r.memoryRevision }));
  }
  async bind(scope: TaskScope, taskId: string, items: MemoryDependency[]) {
    const p = await getPrismaClient();
    return p.$transaction(async (tx) => {
      // Serialize task dependency closure across instances. Never replace an old
      // dependency with a new revision and thereby legalize stale transcripts.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey("task_memory")}::int, hashtext(${taskId})::int)`;
      const task = await tx.agentTask.findFirst({
        where: { ...scope, id: taskId },
      });
      if (!task) return false;
      const old = await tx.agentTaskMemory.findMany({
        where: { ...scope, taskId },
      });
      for (const item of items) {
        const r = await tx.agentPrivateMemory.findFirst({
          where: {
            ...scope,
            id: item.id,
            state: "active",
            revision: item.revision,
          },
        });
        if (
          !r ||
          old.some(
            (o) => o.memoryId === item.id && o.memoryRevision !== item.revision,
          )
        )
          return false;
      }
      await tx.agentTaskMemory.createMany({
        data: items.map((i) => ({
          ...scope,
          taskId,
          memoryId: i.id,
          memoryRevision: i.revision,
        })),
        skipDuplicates: true,
      });
      return true;
    });
  }
}
