import { createHash } from "node:crypto";
import { can } from "../../authz/decide";
import { recordAuditEvent } from "../../audit/lib/record";
import { fail, ok, violation, type RuleResult } from "../shared/result";
import type { TaskContext } from "./task-service";
import type { TaskBundle } from "./task-store";
import {
  UUID,
  isTaskObject,
  type TaskScope,
  type TaskSource,
} from "./lib/task-contract";
import {
  MEMORY_KINDS,
  type MemoryDependency,
  type MemoryKind,
} from "./memory-store";
import type {
  BusinessKnowledge,
  KnowledgeChange,
  NewKnowledge,
} from "./knowledge-store";

export class KnowledgeRefusal extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
function demand(v: unknown, code: string): asserts v {
  if (!v) throw new KnowledgeRefusal(code);
}
const scope = (c: TaskContext): TaskScope => ({
  workspaceId: c.workspaceId,
  actorSub: c.sub,
});
const digest = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
async function fresh(c: TaskContext) {
  const n = await c.refresh();
  demand(
    n &&
      n.sub === c.sub &&
      n.workspaceId === c.workspaceId &&
      n.knowledge &&
      n.entitlement.workspace_id === c.workspaceId &&
      can(n.holder, n.entitlement, "copilot.ask", "data").allowed,
    "access_changed",
  );
  return n as TaskContext & {
    knowledge: NonNullable<TaskContext["knowledge"]>;
  };
}
async function guarded<T>(
  ctx: TaskContext,
  operation: string,
  fn: () => Promise<T>,
): Promise<RuleResult<T>> {
  try {
    return ok(await fn());
  } catch (e) {
    await recordAuditEvent({
      workspaceId: ctx.workspaceId,
      actorId: ctx.sub,
      objectType: "xiaoyu_knowledge",
      objectId: "request",
      action: operation,
      outcome: e instanceof KnowledgeRefusal ? "denied" : "error",
    });
    if (!(e instanceof KnowledgeRefusal)) throw e;
    return fail(violation(e.code, "knowledge request refused"));
  }
}
function body(v: unknown, keys: string[]) {
  demand(
    v && typeof v === "object" && !Array.isArray(v),
    "invalid_knowledge_request",
  );
  const b = v as Record<string, unknown>;
  demand(
    Object.keys(b).every((k) => keys.includes(k)),
    "invalid_knowledge_request",
  );
  return b;
}
function readable(c: TaskContext, r: BusinessKnowledge) {
  return (
    r.workspaceId === c.workspaceId &&
    (r.audience === "workspace" ||
      r.actorSub === c.sub ||
      r.memberSubs.includes(c.sub))
  );
}
function maintainable(c: TaskContext, r: BusinessKnowledge) {
  return r.actorSub === c.sub || c.holder.permissions.has("admin.manage");
}
export async function knowledgeUsable(
  ctx: TaskContext,
  r: BusinessKnowledge,
  allowStopped = false,
) {
  if (
    !ctx.knowledge ||
    !readable(ctx, r) ||
    (!allowStopped && r.state !== "active")
  )
    return false;
  for (const s of r.sources) {
    const live = await ctx.source({ kind: s.kind, id: s.id });
    if (!live || live.version !== s.version) return false;
  }
  const live = await ctx.knowledge.get(ctx.workspaceId, r.id);
  return (
    !!live &&
    live.revision === r.revision &&
    readable(ctx, live) &&
    (allowStopped || live.state === "active")
  );
}
export async function checkKnowledgeDependencies(
  ctx: TaskContext,
  refs: MemoryDependency[],
) {
  demand(!refs.length || ctx.knowledge, "knowledge_source_changed");
  for (const d of refs) {
    const r = await ctx.knowledge!.get(ctx.workspaceId, d.id);
    demand(
      r && r.revision === d.revision && (await knowledgeUsable(ctx, r)),
      "knowledge_source_changed",
    );
  }
}
export async function checkTaskKnowledge(ctx: TaskContext, taskId: string) {
  if (ctx.knowledge)
    await checkKnowledgeDependencies(
      ctx,
      await ctx.knowledge.dependencies(scope(ctx), taskId),
    );
}
async function fields(ctx: TaskContext, v: Record<string, unknown>) {
  demand(
    typeof v.title === "string" &&
      v.title.trim() &&
      v.title.length <= 100 &&
      typeof v.text === "string" &&
      v.text.trim() &&
      v.text.length <= 4000,
    "invalid_knowledge_request",
  );
  demand(
    typeof v.kind === "string" &&
      (MEMORY_KINDS as readonly string[]).includes(v.kind),
    "invalid_knowledge_request",
  );
  demand(
    v.audience === "workspace" || v.audience === "members",
    "invalid_knowledge_request",
  );
  demand(
    Array.isArray(v.memberSubs) &&
      v.memberSubs.length <= 100 &&
      v.memberSubs.every(
        (s) => typeof s === "string" && s.length > 0 && s.length <= 128,
      ),
    "invalid_knowledge_request",
  );
  const members = [...new Set(v.memberSubs as string[])].sort();
  demand(
    v.audience === "workspace" ? members.length === 0 : members.length > 0,
    "invalid_knowledge_request",
  );
  if (members.length) {
    demand(ctx.knowledgeMembers, "knowledge_roster_unavailable");
    const available = await ctx.knowledgeMembers();
    demand(
      members.every((s) => available.some((m) => m.sub === s)),
      "knowledge_member_unavailable",
    );
  }
  return {
    title: v.title.trim(),
    text: v.text.trim(),
    kind: v.kind as MemoryKind,
    audience: v.audience as BusinessKnowledge["audience"],
    memberSubs: members,
  };
}
const inputKeys = [
  "title",
  "text",
  "kind",
  "audience",
  "memberSubs",
  "objects",
  "businessOnly",
];
async function prepared(ctx: TaskContext, input: unknown) {
  const v = body(input, [...inputKeys, "requestId", "reviewedDigest"]);
  demand(v.businessOnly === true, "knowledge_review_required");
  const f = await fields(ctx, v),
    objects = v.objects ?? [];
  demand(
    Array.isArray(objects) &&
      objects.length <= 20 &&
      objects.every(isTaskObject),
    "invalid_knowledge_request",
  );
  const sources: TaskSource[] = [];
  for (const object of objects) {
    const s = await ctx.source(object);
    demand(s, "source_unavailable");
    sources.push(s);
  }
  demand(
    f.kind !== "fact" || sources.length > 0,
    "knowledge_fact_requires_source",
  );
  return { ...f, sources };
}
export async function previewBusinessKnowledge(
  ctx: TaskContext,
  input: unknown,
) {
  return guarded(ctx, "preview", async () => {
    const now = await fresh(ctx),
      data = await prepared(now, input);
    const end = await fresh(ctx);
    for (const s of data.sources)
      demand((await end.source(s))?.version === s.version, "source_changed");
    return { ...data, reviewedDigest: digest(data) };
  });
}
export async function createBusinessKnowledge(
  ctx: TaskContext,
  input: unknown,
) {
  return guarded(ctx, "create", async () => {
    let now = await fresh(ctx);
    const v = body(input, [...inputKeys, "requestId", "reviewedDigest"]),
      data = await prepared(now, input);
    demand(
      typeof v.requestId === "string" && UUID.test(v.requestId),
      "invalid_knowledge_request",
    );
    demand(v.reviewedDigest === digest(data), "knowledge_review_changed");
    const record: NewKnowledge = {
      ...scope(now),
      ...data,
      requestId: v.requestId,
      reviewedDigest: v.reviewedDigest as string,
    };
    const r = await now.knowledge.create(record);
    demand(r.reviewedDigest === record.reviewedDigest, "request_conflict");
    now = await fresh(ctx);
    demand(await knowledgeUsable(now, r), "knowledge_source_changed");
    await recordAuditEvent({
      workspaceId: ctx.workspaceId,
      actorId: ctx.sub,
      objectType: "xiaoyu_knowledge",
      objectId: r.id,
      action: "create",
      outcome: "success",
    });
    return { ...r, canManage: maintainable(now, r) };
  });
}
export async function listBusinessKnowledge(
  ctx: TaskContext,
  offset: unknown = 0,
) {
  return guarded(ctx, "list", async () => {
    let now = await fresh(ctx);
    demand(
      Number.isSafeInteger(offset) &&
        (offset as number) >= 0 &&
        (offset as number) <= 1000000,
      "invalid_knowledge_request",
    );
    const rows = await now.knowledge.list(now.workspaceId, offset as number),
      visible: BusinessKnowledge[] = [];
    for (const r of rows)
      if (await knowledgeUsable(now, r, true)) visible.push(r);
    now = await fresh(ctx);
    const items = [];
    for (const r of visible)
      if (await knowledgeUsable(now, r, true))
        items.push({ ...r, canManage: maintainable(now, r) });
    return {
      items,
      offset,
      limit: 100,
      nextOffset: rows.length === 100 ? (offset as number) + 100 : null,
    };
  });
}
export async function changeBusinessKnowledge(
  ctx: TaskContext,
  id: string,
  input: unknown,
) {
  return guarded(ctx, "change", async () => {
    let now = await fresh(ctx);
    demand(UUID.test(id), "not_found");
    const r = await now.knowledge.get(now.workspaceId, id);
    demand(r && maintainable(now, r), "not_found");
    const v = body(input, [
      "revision",
      "action",
      "title",
      "text",
      "kind",
      "audience",
      "memberSubs",
    ]);
    demand(v.revision === r.revision, "knowledge_conflict");
    const patch: KnowledgeChange = {};
    if (v.action === "stop") {
      demand(
        Object.keys(v).every((k) => ["revision", "action"].includes(k)),
        "invalid_knowledge_request",
      );
      patch.state = "stopped";
    } else {
      demand(await knowledgeUsable(now, r, true), "knowledge_source_changed");
      if (v.action === "restore") {
        demand(
          Object.keys(v).every((k) => ["revision", "action"].includes(k)),
          "invalid_knowledge_request",
        );
        patch.state = "active";
      } else {
        demand(v.action === "correct", "invalid_knowledge_request");
        Object.assign(patch, await fields(now, v));
        demand(
          patch.kind !== "fact" || r.sources.length > 0,
          "knowledge_fact_requires_source",
        );
      }
    }
    demand(
      await now.knowledge.change(now.workspaceId, id, r.revision, patch),
      "knowledge_conflict",
    );
    now = await fresh(ctx);
    await recordAuditEvent({
      workspaceId: ctx.workspaceId,
      actorId: ctx.sub,
      objectType: "xiaoyu_knowledge",
      objectId: id,
      action: String(v.action),
      outcome: "success",
    });
    // Mutations return a receipt, never stopped or newly restricted content.
    return { id, revision: r.revision + 1, state: patch.state ?? r.state };
  });
}
export async function searchKnowledgeMembers(ctx: TaskContext, query: unknown) {
  return guarded(ctx, "members", async () => {
    const now = await fresh(ctx);
    demand(
      typeof query === "string" && query.length <= 100,
      "invalid_knowledge_request",
    );
    if (!query.trim()) return { items: [] };
    demand(now.knowledgeMembers, "knowledge_roster_unavailable");
    const q = query.trim().toLowerCase(),
      rows = await now.knowledgeMembers();
    await fresh(ctx);
    return {
      items: rows
        .filter((m) => (m.displayName ?? m.sub).toLowerCase().includes(q))
        .slice(0, 20),
    };
  });
}
export async function recallBusinessKnowledge(
  ctx: TaskContext,
  b: TaskBundle,
  question: string,
) {
  if (!ctx.knowledge) return [];
  const terms =
    (question + " " + b.task.goal)
      .toLowerCase()
      .match(/[a-z0-9]{2,}|[\u3400-\u9fff]{2}/g)
      ?.slice(0, 64) ?? [];
  const rows = await ctx.knowledge.search(ctx.workspaceId, terms, b.references),
    chosen: BusinessKnowledge[] = [];
  for (const r of rows) {
    if (await knowledgeUsable(ctx, r)) chosen.push(r);
    if (chosen.length === 6) break;
  }
  demand(
    await ctx.knowledge.bind(
      scope(ctx),
      b.task.id,
      chosen.map((r) => ({ id: r.id, revision: r.revision })),
    ),
    "knowledge_source_changed",
  );
  await checkTaskKnowledge(await fresh(ctx), b.task.id);
  return chosen;
}
