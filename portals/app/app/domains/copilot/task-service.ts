import { createHash } from "node:crypto";
import { can, type PermissionHolder } from "../../authz/decide";
import type { Entitlement } from "../../entitlement/types";
import { featureKeysFor } from "../../entitlement/capability";
import { recordAuditEvent } from "../../audit/lib/record";
import { defaultTurnMeter } from "../../usage/lib/copilot-turns";
import { runTurn } from "../../agent/orchestrator/turn";
import type { TurnDeps } from "./turn-service";
import {
  TASK_RULE_VERSION,
  TASK_STATES,
  UUID,
  isTaskObject,
  taskToolAllowed,
  type TaskObject,
  type TaskScope,
  type TaskSource,
} from "./lib/task-contract";
import type { CopilotStore } from "./store";
import {
  taskCreationFingerprint,
  type TaskBundle,
  type TaskMutation,
  type TaskRecord,
  type TaskReference,
  type TaskStore,
} from "./task-store";
import { fail, ok, violation, type RuleResult } from "../shared/result";

export interface TaskContext {
  workspaceId: string;
  sub: string;
  holder: PermissionHolder;
  entitlement: Entitlement;
  store: TaskStore;
  sessions: CopilotStore;
  source: (object: TaskObject) => Promise<TaskSource | null>;
  // Must re-read current identity, entitlement, permissions and data scope.
  // An in-flight model result must not use a request-start permission snapshot.
  refresh: () => Promise<TaskContext | null>;
}
class TaskRefusal extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
const scopeOf = (c: TaskContext): TaskScope => ({
  workspaceId: c.workspaceId,
  actorSub: c.sub,
});
function demand(yes: unknown, code: string): asserts yes {
  if (!yes) throw new TaskRefusal(code);
}
const hash = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
function gate(c: TaskContext): void {
  const g = can(c.holder, c.entitlement, "copilot.ask", "data");
  demand(g.allowed, g.reason ?? "permission_denied");
  demand(c.entitlement.workspace_id === c.workspaceId, "permission_denied");
}
async function guarded<T>(
  ctx: TaskContext,
  operation: string,
  fn: () => Promise<T>,
): Promise<RuleResult<T>> {
  try {
    return ok(await fn());
  } catch (e) {
    if (!(e instanceof TaskRefusal)) throw e;
    await recordAuditEvent({
      workspaceId: ctx.workspaceId,
      actorId: ctx.sub,
      objectType: "xiaoyu_task",
      objectId: "request",
      action: `${TASK_RULE_VERSION}.${operation}`,
      outcome: "denied",
    });
    return fail(violation(e.code, "task request refused"));
  }
}
function body(value: unknown, keys: string[]): Record<string, unknown> {
  demand(
    value && typeof value === "object" && !Array.isArray(value),
    "invalid_task_request",
  );
  const v = value as Record<string, unknown>;
  demand(
    Object.keys(v).every((k) => keys.includes(k)),
    "invalid_task_request",
  );
  return v;
}
async function current(ctx: TaskContext): Promise<TaskContext> {
  const now = await ctx.refresh();
  demand(
    now && now.workspaceId === ctx.workspaceId && now.sub === ctx.sub,
    "access_changed",
  );
  gate(now);
  return now;
}
async function checkSources(ctx: TaskContext, b: TaskBundle): Promise<void> {
  for (const r of b.references) {
    const live = await ctx.source({ kind: r.kind, id: r.id });
    demand(live, "source_unavailable");
    demand(
      live.kind === r.kind && live.id === r.id && live.version === r.version,
      "source_changed",
    );
  }
}
async function owned(
  ctx: TaskContext,
  id: string,
  content = false,
): Promise<TaskBundle> {
  gate(ctx);
  demand(UUID.test(id), "not_found");
  const meta = await ctx.store.load(scopeOf(ctx), id);
  demand(meta, "not_found");
  await checkSources(ctx, meta);
  if (!content) return meta;
  const all = await ctx.store.load(scopeOf(ctx), id, true);
  demand(all && all.task.revision === meta.task.revision, "task_conflict");
  return all;
}
async function source(
  ctx: TaskContext,
  object: TaskObject,
  role: TaskReference["role"],
): Promise<Omit<TaskReference, "referenceId">> {
  const r = await ctx.source(object);
  demand(
    r && r.kind === object.kind && r.id === object.id,
    "source_unavailable",
  );
  return { ...r, role };
}
function active(b: TaskBundle): void {
  demand(
    b.task.status === "active" || b.task.status === "paused",
    "task_finished",
  );
}
function publicBundle(b: TaskBundle) {
  return {
    ...b,
    currentRuleVersion: TASK_RULE_VERSION,
    ruleChanged: b.task.ruleVersion !== TASK_RULE_VERSION,
    capabilities: {
      conversation: true,
      privateNotes: true,
      businessRead: false,
      formDraft: false,
      save: false,
      publish: false,
    },
    recovery: {
      automaticModelRetry: false,
      automaticBusinessSubmit: false,
      interruptedRequests: b.turns
        .filter((t) => t.status === "running")
        .map((t) => t.requestId),
    },
  };
}

export async function createPrivateTask(
  ctx: TaskContext,
  input: unknown,
): Promise<RuleResult<TaskRecord>> {
  return guarded(ctx, "create", async () => {
    gate(ctx);
    const v = body(input, ["requestId", "goal", "targets"]);
    demand(
      typeof v.requestId === "string" && UUID.test(v.requestId),
      "invalid_task_request",
    );
    demand(
      typeof v.goal === "string" &&
        v.goal.trim().length > 0 &&
        v.goal.length <= 1000,
      "invalid_task_request",
    );
    const targets = v.targets ?? [];
    demand(
      Array.isArray(targets) &&
        targets.length <= 20 &&
        targets.every(isTaskObject),
      "invalid_task_request",
    );
    const refs: Omit<TaskReference, "referenceId">[] = [];
    for (const t of targets)
      if (!refs.some((r) => r.kind === t.kind && r.id === t.id))
        refs.push(await source(ctx, t, "target"));
    const task = await ctx.store.create(
      scopeOf(ctx),
      v.goal.trim(),
      TASK_RULE_VERSION,
      refs,
      v.requestId,
    );
    demand(
      task.requestHash === taskCreationFingerprint(v.goal.trim(), refs),
      "request_conflict",
    );
    const verified = await owned(await current(ctx), task.id);
    demand(
      refs.every((r) =>
        verified.references.some(
          (old) =>
            old.kind === r.kind && old.id === r.id && old.role === "target",
        ),
      ),
      "request_conflict",
    );
    return verified.task;
  });
}
export async function listPrivateTasks(
  ctx: TaskContext,
): Promise<RuleResult<TaskRecord[]>> {
  return guarded(ctx, "list", async () => {
    gate(ctx);
    const rows = await ctx.store.list(scopeOf(ctx)),
      allowed: TaskRecord[] = [];
    for (const task of rows) {
      try {
        await owned(ctx, task.id);
        allowed.push(task);
      } catch (e) {
        if (!(e instanceof TaskRefusal)) throw e;
      }
    }
    // Listing must also check freshness before handing out private titles.
    const fresh = await current(ctx),
      result: TaskRecord[] = [];
    for (const task of allowed) {
      try {
        await owned(fresh, task.id);
        result.push(task);
      } catch (e) {
        if (!(e instanceof TaskRefusal)) throw e;
      }
    }
    return result;
  });
}
export async function readPrivateTask(ctx: TaskContext, id: string) {
  return guarded(ctx, "read", async () => {
    const bundle = await owned(await current(ctx), id, true);
    const fresh = await owned(await current(ctx), id);
    demand(bundle.task.revision === fresh.task.revision, "task_conflict");
    return publicBundle(bundle);
  });
}

async function mutation(
  ctx: TaskContext,
  b: TaskBundle,
  v: Record<string, unknown>,
): Promise<TaskMutation> {
  const patch: TaskMutation = { ruleVersion: TASK_RULE_VERSION };
  switch (v.action) {
    case "page":
      body(v, ["action", "revision", "page"]);
      active(b);
      demand(v.page === null || isTaskObject(v.page), "invalid_task_request");
      patch.page = v.page;
      patch.references = v.page ? [await source(ctx, v.page, "context")] : [];
      break;
    case "link":
      body(v, ["action", "revision", "object"]);
      active(b);
      demand(isTaskObject(v.object), "invalid_task_request");
      demand(b.references.length < 100, "task_source_limit");
      patch.references = [await source(ctx, v.object, "target")];
      break;
    case "notes":
      body(v, ["action", "revision", "key", "text", "contractVersion"]);
      active(b);
      demand(
        v.contractVersion === "private-notes/1" &&
          typeof v.key === "string" &&
          /^[a-zA-Z0-9_-]{1,64}$/.test(v.key) &&
          typeof v.text === "string" &&
          v.text.length <= 10000,
        "invalid_draft",
      );
      patch.draft = { key: v.key, text: v.text };
      break;
    case "status":
      body(v, ["action", "revision", "status"]);
      active(b);
      demand(
        typeof v.status === "string" &&
          (TASK_STATES as readonly string[]).includes(v.status),
        "invalid_task_request",
      );
      patch.status = v.status as TaskMutation["status"];
      break;
    case "legacy": {
      body(v, ["action", "revision", "sessionId"]);
      active(b);
      demand(
        typeof v.sessionId === "string" && UUID.test(v.sessionId),
        "not_found",
      );
      const old = await ctx.sessions.getSession(ctx.workspaceId, v.sessionId);
      demand(old && old.actorSub === ctx.sub, "not_found");
      if (old.subjectType && old.subjectId)
        patch.references = [
          await source(
            ctx,
            {
              kind: old.subjectType === "plan" ? "strategy" : old.subjectType,
              id: old.subjectId,
            },
            "legacy",
          ),
        ];
      // Missing per-message provenance: no legacy text is copied or replayed.
      patch.legacySessionId = old.id;
      break;
    }
    case "resume":
      body(v, ["action", "revision", "checkpointId"]);
      active(b);
      if (v.checkpointId !== undefined)
        demand(v.checkpointId === b.checkpoint?.id, "checkpoint_changed");
      patch.status = "active";
      break;
    default:
      throw new TaskRefusal("task_tool_denied");
  }
  const additions = (patch.references ?? []).filter(
    (r) =>
      !b.references.some(
        (old) => old.kind === r.kind && old.id === r.id && old.role === r.role,
      ),
  );
  demand(b.references.length + additions.length <= 100, "task_source_limit");
  if (patch.draft && !b.drafts.some((d) => d.key === patch.draft!.key)) {
    // Metadata loads deliberately omit note text; count is checked on content below.
    const content = await ctx.store.load(scopeOf(ctx), b.task.id, true);
    demand(
      content &&
        (content.drafts.some((d) => d.key === patch.draft!.key) ||
          content.drafts.length < 20),
      "task_draft_limit",
    );
  }
  return patch;
}
export async function changePrivateTask(
  ctx: TaskContext,
  id: string,
  input: unknown,
) {
  return guarded(ctx, "change", async () => {
    let now = await current(ctx);
    const meta = await owned(now, id);
    const v = body(input, [
      "action",
      "revision",
      "page",
      "object",
      "key",
      "text",
      "contractVersion",
      "status",
      "sessionId",
      "checkpointId",
      "requestId",
    ]);
    demand(
      Number.isSafeInteger(v.revision) && v.revision === meta.task.revision,
      "task_conflict",
    );
    const release = await ctx.sessions.acquireSessionTurn(
      ctx.workspaceId,
      meta.task.sessionId,
    );
    demand(release, "turn_in_progress");
    try {
      now = await current(ctx);
      const b = await owned(now, id);
      demand(b.task.revision === v.revision, "task_conflict");
      if (v.action === "interrupt") {
        body(v, ["action", "revision", "requestId"]);
        const turn = b.turns.find(
          (t) => t.requestId === v.requestId && t.status === "running",
        );
        demand(turn, "request_not_running");
        demand(
          await ctx.store.finishTurn(scopeOf(ctx), id, turn.id, {
            errorCode: "request_interrupted",
            interrupted: true,
          }),
          "task_conflict",
        );
      } else {
        const patch = await mutation(now, b, v);
        demand(
          taskToolAllowed(
            {
              tool: patch.draft ? "draft.notes" : "task.update",
              ...scopeOf(ctx),
              ruleVersion: TASK_RULE_VERSION,
            },
            scopeOf(ctx),
          ),
          "task_tool_denied",
        );
        demand(
          await ctx.store.mutate(scopeOf(ctx), id, b.task.revision, patch),
          "task_conflict",
        );
      }
      return publicBundle(await owned(await current(ctx), id, true));
    } finally {
      await release();
    }
  });
}

export async function runPrivateTaskTurn(
  ctx: TaskContext,
  id: string,
  input: unknown,
  deps: TurnDeps & { tenantId: string; subjectToken?: string },
) {
  return guarded(ctx, "turn", async () => {
    const v = body(input, ["requestId", "revision", "question"]);
    demand(
      typeof v.requestId === "string" &&
        UUID.test(v.requestId) &&
        typeof v.question === "string" &&
        v.question.trim() &&
        v.question.length <= 10000,
      "invalid_task_request",
    );
    const question = v.question.trim(),
      questionHash = hash(question);
    let now = await current(ctx),
      b = await owned(now, id, true);
    const replay = () => {
      const old = b.turns.find((t) => t.requestId === v.requestId);
      if (!old) return null;
      demand(old.questionHash === questionHash, "request_conflict");
      demand(
        old.status === "succeeded",
        old.status === "running"
          ? "request_in_progress"
          : "request_already_attempted",
      );
      demand(old.ruleVersion === TASK_RULE_VERSION, "rule_changed");
      const message = b.messages.find((m) => m.id === old.assistantMessageId);
      demand(message, "request_unavailable");
      return {
        taskId: id,
        sessionId: b.task.sessionId,
        requestId: v.requestId,
        answer: message.content,
        replayed: true,
        ruleVersion: TASK_RULE_VERSION,
      };
    };
    const previous = replay();
    if (previous) return previous;
    demand(
      Number.isSafeInteger(v.revision) && v.revision === b.task.revision,
      "task_conflict",
    );
    demand(b.task.status === "active", "task_not_active");
    demand(b.task.ruleVersion === TASK_RULE_VERSION, "rule_changed");
    demand(deps.tenantId, "tenant_required");
    const release = await ctx.sessions.acquireSessionTurn(
      ctx.workspaceId,
      b.task.sessionId,
    );
    demand(release, "turn_in_progress");
    try {
      now = await current(ctx);
      b = await owned(now, id, true);
      const repeated = replay();
      if (repeated) return repeated;
      const meter = deps.meter ?? defaultTurnMeter();
      demand(meter.admit(now.entitlement).ok, "quota_exceeded");
      demand(
        taskToolAllowed(
          {
            tool: "model.chat",
            ...scopeOf(now),
            ruleVersion: TASK_RULE_VERSION,
          },
          scopeOf(ctx),
        ),
        "task_tool_denied",
      );
      const turn = await ctx.store.beginTurn(
        scopeOf(ctx),
        id,
        v.revision as number,
        v.requestId,
        question,
        questionHash,
        TASK_RULE_VERSION,
      );
      demand(turn, "task_conflict");
      try {
        await meter.record(ctx.workspaceId, turn.userMessageId);
        const result = await runTurn(
          {
            question,
            history: b.messages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
            prompt: {
              productName: "Yucer",
              permissions: [...now.holder.permissions],
              features: featureKeysFor(now.entitlement),
              task: {
                id,
                goal: b.task.goal,
                targets: b.references
                  .filter((r) => r.role === "target")
                  .map((r) => ({ kind: r.kind, id: r.id })),
                page: b.task.page,
              },
            },
            atlas: {
              workspaceId: ctx.workspaceId,
              tenantId: deps.tenantId,
              subjectToken: deps.subjectToken,
              applicationId: b.task.sessionId,
              requestId: turn.id,
              taskId: id,
              featureId: "copilot.chat",
              businessId: turn.userMessageId,
            },
            runos: {
              workspaceId: ctx.workspaceId,
              tenantId: deps.tenantId,
              subjectToken: deps.subjectToken,
              taskId: id,
              sessionId: b.task.sessionId,
            },
            draftOnly: true,
            rejectUnexpectedTools: true,
          },
          deps,
        );
        demand(result.answer.trim().length > 0, "task_model_failed");
        // No model output is persisted or delivered after revocation or source
        // changes. Sources are re-read, not trusted from the old checkpoint.
        now = await current(ctx);
        await owned(now, id);
        demand(
          await ctx.store.finishTurn(scopeOf(ctx), id, turn.id, {
            answer: result.answer,
            tokens: result.totalTokens,
          }),
          "task_conflict",
        );
        await owned(await current(ctx), id);
        await recordAuditEvent({
          workspaceId: ctx.workspaceId,
          actorId: ctx.sub,
          objectType: "xiaoyu_task",
          objectId: id,
          action: `${TASK_RULE_VERSION}.copilot.ask`,
          outcome: "success",
          taskId: id,
          costAmount: result.totalTokens,
          costUnit: "tokens",
        });
        return {
          taskId: id,
          sessionId: b.task.sessionId,
          requestId: v.requestId,
          answer: result.answer,
          replayed: false,
          ruleVersion: TASK_RULE_VERSION,
        };
      } catch (e) {
        const code =
          e instanceof TaskRefusal
            ? e.code
            : e instanceof Error && e.message === "tool_boundary_denied"
              ? "task_tool_denied"
              : "task_model_failed";
        await ctx.store.finishTurn(scopeOf(ctx), id, turn.id, {
          errorCode: code,
        });
        await recordAuditEvent({
          workspaceId: ctx.workspaceId,
          actorId: ctx.sub,
          objectType: "xiaoyu_task",
          objectId: id,
          action: `${TASK_RULE_VERSION}.copilot.ask`,
          outcome: e instanceof TaskRefusal ? "denied" : "error",
          taskId: id,
        });
        throw new TaskRefusal(code);
      }
    } finally {
      await release();
    }
  });
}
