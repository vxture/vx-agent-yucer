import { createHash } from "node:crypto";
import { can } from "../../authz/decide";
import { recordAuditEvent } from "../../audit/lib/record";
import { fail, ok, violation, type RuleResult } from "../shared/result";
import {
  createPrivateTask,
  readPrivateTask,
  type TaskContext,
} from "../copilot/task-service";
import { UUID, type TaskScope } from "../copilot/lib/task-contract";
import type { TopicStore, TopicRecord } from "./topic-store";
import { judgementVersion, type TopicFeed } from "./topic-feed";
import type { Scope, Urgency } from "./lib/judgement";
export interface TopicContext extends TaskContext {
  topics: TopicStore;
  accessVersion: string;
  judgements: (
    scope?: Scope,
    includeSnoozed?: boolean,
  ) => Promise<RuleResult<TopicFeed>>;
  snooze: (id: string, urgency: Urgency) => Promise<RuleResult<unknown>>;
  refresh: () => Promise<TopicContext | null>;
}
class TopicRefusal extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
function demand(v: unknown, code: string): asserts v {
  if (!v) throw new TopicRefusal(code);
}
const owner = (c: Pick<TaskContext, "workspaceId" | "sub">): TaskScope => ({
  workspaceId: c.workspaceId,
  actorSub: c.sub,
});
async function fresh(c: TopicContext) {
  const n = await c.refresh();
  demand(
    n &&
      n.sub === c.sub &&
      n.workspaceId === c.workspaceId &&
      can(n.holder, n.entitlement, "copilot.ask", "data").allowed,
    "access_changed",
  );
  return n;
}
async function guarded<T>(
  c: TopicContext,
  operation: string,
  fn: () => Promise<T>,
): Promise<RuleResult<T>> {
  try {
    return ok(await fn());
  } catch (e) {
    if (!(e instanceof TopicRefusal)) throw e;
    await recordAuditEvent({
      workspaceId: c.workspaceId,
      actorId: c.sub,
      objectType: "xiaoyu_topic",
      objectId: "request",
      action: operation,
      outcome: "denied",
    });
    return fail(violation(e.code, "topic request refused"));
  }
}
const requestUuid = (v: string) => {
  const h = createHash("sha256").update(v).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
export async function listTopics(ctx: TopicContext, scope?: Scope) {
  return guarded(ctx, "list", async () => {
    let now = await fresh(ctx);
    const f = await now.judgements(scope);
    demand(f.ok, "topic_feed_unavailable");
    const rows = await now.topics.list(owner(now));
    now = await fresh(ctx);
    const checked = await now.judgements(f.value.scope);
    demand(checked.ok, "topic_feed_unavailable");
    const raw = await now.judgements(checked.value.scope, true);
    demand(raw.ok, "topic_feed_unavailable");
    const history = [];
    for (const r of rows.filter(
      (r) =>
        r.scope === checked.value.scope &&
        r.accessVersion === now.accessVersion &&
        !raw.value.judgements.some((j) => j.id === r.judgementId),
    )) {
      const task = r.taskId ? await now.store.load(owner(now), r.taskId) : null;
      const subjects =
        task?.references.filter((s) => s.kind !== "judgement") ?? [];
      if (!task || !subjects.length) continue;
      const readable = await Promise.all(subjects.map((s) => now.source(s)));
      if (readable.some((s) => !s)) continue;
      history.push({
        finding: {
          id: r.judgementId,
          subjectType: "account" as const,
          subjectId: subjects[0].id,
          subjectName: task.task.goal,
          source: "rule" as const,
          urgency: "watch" as const,
          claim: "",
          facts: [],
          tags: [],
          citations: [],
          analyses: [],
        },
        absent: true,
        topicId: r.id,
        status: r.status,
        taskId: r.taskId,
        revision: r.revision,
      });
    }
    const end = await fresh(ctx);
    demand(end.accessVersion === now.accessVersion, "access_changed");
    return {
      ...checked.value,
      observedAt: new Date().toISOString(),
      judgements: [
        ...checked.value.judgements.map((j) => {
          const r = rows.find(
              (r) => r.judgementId === j.id && r.scope === checked.value.scope,
            ),
            same =
              r?.basisVersion === judgementVersion(j) &&
              r.accessVersion === now.accessVersion;
          return {
            finding: j,
            topicId: r?.id ?? null,
            status: same ? r!.status : "open",
            taskId: same ? r!.taskId : null,
            revision: r?.revision ?? null,
            absent: false,
          };
        }),
        ...history,
      ],
    };
  });
}
export async function openTopic(ctx: TopicContext, input: unknown) {
  return guarded(ctx, "open", async () => {
    demand(
      input && typeof input === "object" && !Array.isArray(input),
      "invalid_topic_request",
    );
    const v = input as Record<string, unknown>;
    demand(
      Object.keys(v).every((k) => ["judgementId", "scope"].includes(k)) &&
        typeof v.judgementId === "string" &&
        v.judgementId.length <= 256 &&
        (v.scope === "mine" || v.scope === "all"),
      "invalid_topic_request",
    );
    let now = await fresh(ctx);
    const f = await now.judgements(v.scope, true);
    demand(f.ok, "topic_feed_unavailable");
    const j = f.value.judgements.find((j) => j.id === v.judgementId);
    demand(j, "topic_unavailable");
    const version = judgementVersion(j),
      r = await now.topics.ensure({
        ...owner(now),
        judgementId: j.id,
        scope: f.value.scope,
        basisVersion: version,
        accessVersion: now.accessVersion,
      });
    if (
      r.taskId &&
      r.basisVersion === version &&
      r.accessVersion === now.accessVersion
    ) {
      const existing = await readPrivateTask(now, r.taskId);
      if (existing.ok) return { topicId: r.id, taskId: r.taskId, reused: true };
    }
    const task = await createPrivateTask(now, {
      requestId: requestUuid(
        `${ctx.workspaceId}:${ctx.sub}:${r.id}:${version}:${now.accessVersion}:${r.revision}`,
      ),
      goal: j.claim.slice(0, 1000),
      targets: [
        { kind: "judgement", id: r.id },
        ...(UUID.test(j.subjectId)
          ? [
              {
                kind: j.subjectType === "team" ? "sales_target" : j.subjectType,
                id: j.subjectId,
              },
            ]
          : []),
      ],
    });
    demand(task.ok, task.ok ? "" : "topic_task_unavailable");
    now = await fresh(ctx);
    const live = await now.judgements(r.scope, true);
    demand(
      live.ok &&
        live.value.judgements.some(
          (x) => x.id === j.id && judgementVersion(x) === version,
        ),
      "source_changed",
    );
    const changed = await now.topics.change(owner(now), r.id, r.revision, {
      basisVersion: version,
      accessVersion: now.accessVersion,
      status: "open",
      taskId: task.value.id,
      verifiedAt: null,
    });
    if (!changed) {
      const current = await now.topics.get(owner(now), r.id);
      demand(
        current?.taskId === task.value.id && current.basisVersion === version,
        "topic_conflict",
      );
    }
    return { topicId: r.id, taskId: task.value.id, reused: false };
  });
}
export async function changeTopic(
  ctx: TopicContext,
  id: string,
  input: unknown,
) {
  return guarded(ctx, "change", async () => {
    demand(
      UUID.test(id) &&
        input &&
        typeof input === "object" &&
        !Array.isArray(input),
      "invalid_topic_request",
    );
    const v = input as Record<string, unknown>;
    demand(
      Object.keys(v).every((k) => ["revision", "action"].includes(k)) &&
        ["process", "verify", "snooze"].includes(String(v.action)),
      "invalid_topic_request",
    );
    let now = await fresh(ctx);
    const r = await now.topics.get(owner(now), id);
    demand(r, "not_found");
    demand(v.revision === r.revision, "topic_conflict");
    demand(r.accessVersion === now.accessVersion, "access_changed");
    const f = await now.judgements(r.scope, true);
    demand(f.ok, "topic_feed_unavailable");
    const j = f.value.judgements.find((j) => j.id === r.judgementId);
    if (v.action === "snooze") {
      demand(j, "topic_unavailable");
      const result = await now.snooze(j.id, j.urgency);
      demand(result.ok, "topic_unavailable");
      return { id, status: "snoozed", verified: false };
    }
    // Absence is only resolution if the subject is still authorized/readable.
    // A source permission loss is never evidence that the business issue is fixed.
    const task = r.taskId ? await now.store.load(owner(now), r.taskId) : null;
    const subjects =
      task?.references.filter((s) => s.kind !== "judgement") ?? [];
    if (!j) {
      demand(f.value.dataAvailable, "topic_verification_unavailable");
      demand(
        v.action === "verify" && subjects.length > 0,
        "topic_verification_unavailable",
      );
      for (const s of subjects)
        demand(await now.source(s), "source_unavailable");
    }
    demand(!j || judgementVersion(j) === r.basisVersion, "source_changed");
    now = await fresh(ctx);
    demand(r.accessVersion === now.accessVersion, "access_changed");
    const status =
      v.action === "process" ? "processing" : j ? "open" : "verified";
    demand(
      await now.topics.change(owner(now), id, r.revision, {
        basisVersion: j ? judgementVersion(j) : r.basisVersion,
        accessVersion: r.accessVersion,
        status,
        taskId: r.taskId,
        verifiedAt: status === "verified" ? new Date() : null,
      }),
      "topic_conflict",
    );
    await fresh(ctx);
    await recordAuditEvent({
      workspaceId: ctx.workspaceId,
      actorId: ctx.sub,
      objectType: "xiaoyu_topic",
      objectId: id,
      action: String(v.action),
      outcome: "success",
    });
    return { id, status, verified: status === "verified", stillPresent: !!j };
  });
}
export async function readTopicEvidence(
  ctx: Pick<
    TopicContext,
    "workspaceId" | "sub" | "topics" | "judgements" | "accessVersion"
  >,
  id: string,
) {
  const r = await ctx.topics.get(owner(ctx), id);
  if (!r) return null;
  const feed = await ctx.judgements(r.scope, true);
  if (!feed.ok) return null;
  const finding = feed.value.judgements.find((j) => j.id === r.judgementId);
  return finding
    ? {
        finding,
        version: createHash("sha256")
          .update(judgementVersion(finding) + ctx.accessVersion)
          .digest("hex"),
      }
    : null;
}
