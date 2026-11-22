import type { AgentJudgementTopic } from "@prisma/client";
import { getPrismaClient } from "../../lib/db";
import { assertWritable } from "../shared/column-locks";
import type { TaskScope } from "../copilot/lib/task-contract";
import type { TopicRecord, TopicChange, TopicStore } from "./topic-store";
const row = (r: AgentJudgementTopic): TopicRecord => ({
  ...r,
  scope: r.scope as TopicRecord["scope"],
  status: r.status as TopicRecord["status"],
});
export class PrismaTopicStore implements TopicStore {
  async list(owner: TaskScope) {
    const p = await getPrismaClient();
    return (
      await p.agentJudgementTopic.findMany({
        where: owner,
        orderBy: { updatedAt: "desc" },
      })
    ).map(row);
  }
  async get(owner: TaskScope, id: string) {
    const p = await getPrismaClient(),
      r = await p.agentJudgementTopic.findFirst({ where: { ...owner, id } });
    return r ? row(r) : null;
  }
  async ensure(
    input: TaskScope &
      Pick<
        TopicRecord,
        "judgementId" | "scope" | "basisVersion" | "accessVersion"
      >,
  ) {
    const p = await getPrismaClient();
    const key = {
      workspaceId: input.workspaceId,
      actorSub: input.actorSub,
      judgementId: input.judgementId,
      scope: input.scope,
    };
    const existing = await p.agentJudgementTopic.findFirst({ where: key });
    if (existing) return row(existing);
    try {
      return row(await p.agentJudgementTopic.create({ data: input }));
    } catch (error) {
      if (
        !error ||
        typeof error !== "object" ||
        !("code" in error) ||
        error.code !== "P2002"
      )
        throw error;
      return row(await p.agentJudgementTopic.findFirstOrThrow({ where: key }));
    }
  }

  async change(
    owner: TaskScope,
    id: string,
    revision: number,
    patch: TopicChange,
  ) {
    const p = await getPrismaClient();
    if (
      !assertWritable("yucer_agent.agent_judgement_topic", {
        basis_version: patch.basisVersion,
        access_version: patch.accessVersion,
        status: patch.status,
        task_id: patch.taskId,
        verified_at: patch.verifiedAt,
        revision: revision + 1,
        updated_at: new Date(),
      }).ok
    )
      throw new Error("topic_column_denied");
    return p.$transaction(async (tx) => {
      const changed = await tx.agentJudgementTopic.updateMany({
        where: { ...owner, id, revision },
        data: { ...patch, revision: { increment: 1 }, updatedAt: new Date() },
      });
      if (!changed.count) return null;
      return row(
        await tx.agentJudgementTopic.findFirstOrThrow({
          where: { ...owner, id },
        }),
      );
    });
  }
}
