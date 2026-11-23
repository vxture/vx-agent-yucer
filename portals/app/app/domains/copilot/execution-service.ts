import { can } from "../../authz/decide";
import { autopilotAuthorized } from "../../authz/gate";
import { createHash } from "node:crypto";
import type { Prisma, AgentExecutionStep } from "@prisma/client";
import {
  getPrismaClient,
  prismaEnabled,
  withDomainTransaction,
} from "../../lib/db";
import { readPrivateTask, type TaskContext } from "./task-service";
import {
  readBusinessForm,
  BUSINESS_FORM_CONTRACT,
  type BusinessForm,
} from "./lib/business-form";
import { UUID, TASK_RULE_VERSION, type TaskObject } from "./lib/task-contract";
import { isAutonomyMode, type AutonomyMode } from "./lib/autonomy";
import {
  executionAllowed,
  executionRisk,
  EXECUTION_RULE_VERSION,
} from "./execution-policy";
import { recordAuditEvent } from "../../audit/lib/record";
import { checkTaskMemory } from "./memory-service";
import { checkTaskKnowledge } from "./knowledge-service";
import type { BusinessReceipt } from "./execution-domain";
export interface ExecutionContext {
  task: TaskContext;
  sessionHash: string;
  write: (
    form: BusinessForm,
    operation: "save" | "publish",
    stepId: string,
  ) => Promise<TaskObject>;
}
function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === "object")
    return Object.fromEntries(
      Object.entries(v)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, value]) => [k, canonical(value)]),
    );
  return v;
}
const digest = (v: unknown) =>
  createHash("sha256")
    .update(JSON.stringify(canonical(v)))
    .digest("hex");
const json = (v: unknown) =>
  JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
const demand = (v: unknown, code: string): void => {
  if (!v) throw Error(code);
};
function body(value: unknown, keys: string[]): Record<string, unknown> {
  demand(
    value && typeof value === "object" && !Array.isArray(value),
    "invalid_execution_request",
  );
  const v = value as Record<string, unknown>;
  demand(
    Object.keys(v).every((k) => keys.includes(k)),
    "invalid_execution_request",
  );
  return v;
}
function formOf(step: AgentExecutionStep): BusinessForm {
  demand(step.ruleVersion === EXECUTION_RULE_VERSION, "rule_changed");
  demand(digest(step.payload) === step.payloadHash, "proposal_changed");
  return readBusinessForm(JSON.stringify(step.payload));
}
const scope = (ctx: ExecutionContext, taskId: string) => ({
  workspaceId: ctx.task.workspaceId,
  actorSub: ctx.task.sub,
  taskId,
});
async function fresh(ctx: ExecutionContext, taskId: string) {
  demand(prismaEnabled(), "execution_persistence_required");
  demand(
    UUID.test(taskId) && /^[a-f0-9]{64}$/.test(ctx.sessionHash),
    "invalid_execution_request",
  );
  const now = await ctx.task.refresh();
  demand(
    now && now.workspaceId === ctx.task.workspaceId && now.sub === ctx.task.sub,
    "access_changed",
  );
  if (!now) throw Error("access_changed");
  demand(
    can(now.holder, now.entitlement, "copilot.ask", "data").allowed &&
      now.entitlement.workspace_id === now.workspaceId,
    "permission_denied",
  );
  const metadata = await now.store.load(
    { workspaceId: now.workspaceId, actorSub: now.sub },
    taskId,
  );
  demand(metadata, "not_found");
  // Even receipt recovery may not leak revoked private derivatives.
  await checkTaskMemory(now, taskId);
  await checkTaskKnowledge(now, taskId);
  return now;
}
async function bundle(ctx: ExecutionContext, taskId: string) {
  const result = await readPrivateTask(await fresh(ctx, taskId), taskId);
  if (!result.ok) throw Error(result.violations[0]?.code ?? "task_unavailable");
  demand(result.value.task.ruleVersion === TASK_RULE_VERSION, "rule_changed");
  return result.value;
}
async function validReceipt(
  ctx: ExecutionContext,
  taskId: string,
  result: unknown,
) {
  const live = await fresh(ctx, taskId),
    receipt = result as BusinessReceipt;
  const source = await live.source(receipt.object);
  demand(
    source && source.version === receipt.version,
    "receipt_source_changed",
  );
  return receipt;
}
/** Proposals are server-created from an existing immutable private form only.
 * The browser/model never supplies executable payloads or object versions. */
export async function proposeExecution(
  ctx: ExecutionContext,
  taskId: string,
  input: unknown,
) {
  const v = body(input, ["key", "draftId", "operation"]);
  demand(
    typeof v.key === "string" &&
      typeof v.draftId === "string" &&
      UUID.test(v.draftId) &&
      (v.operation === "save" || v.operation === "publish"),
    "invalid_execution_request",
  );
  const live = await fresh(ctx, taskId);
  const b = await bundle({ ...ctx, task: live }, taskId);
  demand(b.task.status === "active", "task_not_active");
  const row = b.drafts.find(
    (d) =>
      d.key === v.key &&
      d.id === v.draftId &&
      d.contractVersion === BUSINESS_FORM_CONTRACT,
  );
  demand(row, "form_changed");
  if (!row) throw Error("form_changed");
  const form = readBusinessForm(row.text);
  demand(
    v.operation !== "publish" ||
      ["strategy", "sales_plan"].includes(form.module),
    "operation_not_registered",
  );
  const prepared = await live.business?.prepare(form);
  demand(prepared, "business_adapter_unavailable");
  const db = await getPrismaClient(),
    owned = scope(ctx, taskId);
  return db.agentExecutionStep.upsert({
    where: {
      taskId_draftId_operation: {
        taskId,
        draftId: row.id,
        operation: v.operation as string,
      },
    },
    update: {},
    create: {
      ...owned,
      draftId: row.id,
      operation: v.operation as string,
      payload: json(prepared),
      payloadHash: digest(json(prepared)),
      ruleVersion: EXECUTION_RULE_VERSION,
      expiresAt: new Date(Date.now() + 86400000),
    },
  });
}
/** Explicit user action. Mode is a preference, never the scope credential. */
export async function grantExecution(
  ctx: ExecutionContext,
  taskId: string,
  input: unknown,
) {
  const v = body(input, [
    "stepIds",
    "confirmedIds",
    "mode",
    "seconds",
    "maxActions",
  ]);
  const ids = v.stepIds as string[],
    confirmed = (v.confirmedIds ?? []) as string[];
  demand(
    Array.isArray(ids) &&
      ids.length > 0 &&
      ids.length <= 20 &&
      ids.every((id) => typeof id === "string" && UUID.test(id)) &&
      new Set(ids).size === ids.length,
    "invalid_execution_request",
  );
  demand(
    Array.isArray(confirmed) &&
      confirmed.every((id) => ids.includes(id)) &&
      typeof v.mode === "string" &&
      isAutonomyMode(v.mode),
    "invalid_execution_request",
  );
  const seconds = Number(v.seconds ?? 900),
    maxActions = Number(v.maxActions ?? ids.length);
  demand(
    Number.isInteger(seconds) &&
      seconds >= 1 &&
      seconds <= 3600 &&
      Number.isInteger(maxActions) &&
      maxActions > 0 &&
      maxActions <= ids.length,
    "invalid_execution_request",
  );
  const live = await fresh(ctx, taskId);
  const b = await bundle({ ...ctx, task: live }, taskId);
  demand(b.task.status === "active", "task_not_active");
  demand(
    can(live.holder, live.entitlement, "copilot.action.decide", "data")
      .allowed,
    "permission_denied",
  );
  const db = await getPrismaClient(),
    rows = await db.agentExecutionStep.findMany({
      where: { ...scope(ctx, taskId), id: { in: ids } },
    });
  demand(rows.length === ids.length, "not_found");
  for (const step of rows) {
    formOf(step);
    demand(step.expiresAt > new Date(), "authorization_expired");
    demand(
      b.drafts.some((d) => d.id === step.draftId),
      "form_changed",
    );
  }
  const grant = await db.agentExecutionGrant.create({
    data: {
      ...scope(ctx, taskId),
      sessionHash: ctx.sessionHash,
      stepIds: ids,
      confirmedIds: confirmed,
      mode: v.mode as string,
      maxActions,
      ruleVersion: EXECUTION_RULE_VERSION,
      expiresAt: new Date(Date.now() + seconds * 1000),
    },
  });
  return {
    id: grant.id,
    stepIds: grant.stepIds,
    mode: grant.mode,
    expiresAt: grant.expiresAt,
    maxActions: grant.maxActions,
  };
}
export async function revokeExecution(
  ctx: ExecutionContext,
  taskId: string,
  grantId: string,
) {
  await fresh(ctx, taskId);
  demand(UUID.test(grantId), "invalid_execution_request");
  const db = await getPrismaClient();
  const result = await db.agentExecutionGrant.updateMany({
    where: {
      ...scope(ctx, taskId),
      id: grantId,
      sessionHash: ctx.sessionHash,
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  });
  demand(result.count === 1, "grant_unavailable");
  return { revoked: true };
}
export async function readExecutions(ctx: ExecutionContext, taskId: string) {
  await fresh(ctx, taskId);
  const db = await getPrismaClient(),
    where = scope(ctx, taskId);
  const receipts = await db.agentExecutionReceipt.findMany({
    where,
    orderBy: { createdAt: "asc" },
  });
  const safe: Array<
    Omit<(typeof receipts)[number], "result"> & { result: BusinessReceipt }
  > = [];
  for (const receipt of receipts) {
    try {
      safe.push({
        ...receipt,
        result: await validReceipt(ctx, taskId, receipt.result),
      });
    } catch {
      /* Withhold inaccessible or obsolete result; do not expose its title. */
    }
  }
  const steps = await db.agentExecutionStep.findMany({
    where,
    orderBy: { createdAt: "asc" },
  });
  // Pending proposal content has the original provenance closure; never return
  // it after a source changed. Receipts are checked against the new object.
  let current: Awaited<ReturnType<typeof bundle>> | undefined;
  try {
    current = await bundle(ctx, taskId);
  } catch {
    /* fail closed */
  }
  const grants = await db.agentExecutionGrant.findMany({
    where: { ...where, sessionHash: ctx.sessionHash },
    orderBy: { createdAt: "desc" },
  });
  const draftIds = new Set(current?.drafts.map((d) => d.id));
  const canPrepare = current?.task.status === "active";
  const completed = new Set(receipts.map((r) => r.stepId));
  const visible = new Set(safe.map((r) => r.stepId));
  const used = new Map<string, number>();
  for (const receipt of receipts)
    used.set(receipt.grantId, (used.get(receipt.grantId) ?? 0) + 1);
  const now = new Date();
  return {
    canPrepare,
    steps: steps.map((s) => {
      let form: BusinessForm | undefined;
      if (draftIds.has(s.draftId)) {
        try { form = formOf(s); }
        catch { /* An obsolete or invalid proposal cannot be selected. */ }
      }
      const available = canPrepare && form && s.expiresAt > now;
      const status = visible.has(s.id)
        ? "succeeded"
        : completed.has(s.id)
          ? "result_unavailable"
          : !available
            ? "proposal_unavailable"
            : s.lastError ? "failed" : "pending";
      return {
        id: s.id,
        draftId: s.draftId,
        operation: s.operation,
        expiresAt: s.expiresAt,
        ruleVersion: s.ruleVersion,
        ...(form ? {
          form,
          risk: executionRisk(form, s.operation as "save" | "publish"),
        } : {}),
        lastError: available && !completed.has(s.id) ? s.lastError : null,
        status,
      };
    }),
    receipts: safe,
    grants: grants.filter((g) => g.ruleVersion === EXECUTION_RULE_VERSION).map((g) => ({
      id: g.id,
      stepIds: g.stepIds,
      confirmedIds: g.confirmedIds,
      mode: g.mode,
      expiresAt: g.expiresAt,
      revokedAt: g.revokedAt,
      maxActions: g.maxActions,
      remainingActions: Math.max(0, g.maxActions - (used.get(g.id) ?? 0)),
    })),
  };
}
/** Persisted steps can be resumed after a lost HTTP response. No effect is
 * inferred from text and no completed request is blindly sent again. */
export async function executeStep(
  ctx: ExecutionContext,
  taskId: string,
  input: unknown,
) {
  const v = body(input, ["stepId", "grantId"]);
  demand(
    typeof v.stepId === "string" &&
      UUID.test(v.stepId) &&
      typeof v.grantId === "string" &&
      UUID.test(v.grantId),
    "invalid_execution_request",
  );
  const owned = scope(ctx, taskId);
  await fresh(ctx, taskId);
  try {
    const receipt = await withDomainTransaction(async () => {
      const db = await getPrismaClient();
      // Serialize cancellation, revocation, budgets and duplicate submissions.
      await db.$queryRaw`SELECT id FROM yucer_agent.agent_task WHERE id=${taskId}::uuid AND workspace_id=${owned.workspaceId}::uuid AND actor_sub=${owned.actorSub} FOR UPDATE`;
      // Advance the row even though execution state lives separately. A
      // concurrent Serializable transaction must restart its stale snapshot
      // after waiting, rather than miss the just-committed receipt.
      await db.agentTask.updateMany({
        where: {
          id: taskId,
          workspaceId: owned.workspaceId,
          actorSub: owned.actorSub,
        },
        data: { updatedAt: new Date() },
      });
      const step = await db.agentExecutionStep.findFirst({
        where: { ...owned, id: v.stepId as string },
      });
      demand(step, "not_found");
      if (!step) throw Error("not_found");
      const grant = await db.agentExecutionGrant.findFirst({
        where: {
          ...owned,
          id: v.grantId as string,
          sessionHash: ctx.sessionHash,
        },
      });
      demand(grant && grant.stepIds.includes(step.id), "grant_unavailable");
      if (!grant) throw Error("grant_unavailable");
      await db.$queryRaw`SELECT id FROM yucer_agent.agent_execution_grant WHERE id=${grant.id}::uuid FOR UPDATE`;
      const previous = await db.agentExecutionReceipt.findUnique({
        where: { stepId: step.id },
      });
      if (previous) {
        await validReceipt(ctx, taskId, previous.result);
        return previous;
      }
      const live = await fresh(ctx, taskId);
      // One current identity snapshot per locked validation; source records are
      // still re-read in the transaction. The write adapter refreshes identity
      // again immediately before calling the original domain service.
      const locked: TaskContext = { ...live, refresh: async () => locked };
      const b = await bundle({ ...ctx, task: locked }, taskId);
      demand(b.task.status === "active", "task_not_active");
      demand(
        b.drafts.some((d) => d.id === step.draftId),
        "form_changed",
      );
      demand(grant.ruleVersion === EXECUTION_RULE_VERSION, "rule_changed");
      const form = formOf(step),
        operation = step.operation as "save" | "publish";
      demand(
        can(live.holder, live.entitlement, "copilot.action.decide", "data")
          .allowed,
        "permission_denied",
      );
      if (!grant.confirmedIds.includes(step.id))
        demand(
          autopilotAuthorized({
            entitlement: live.entitlement,
            held: live.holder.permissions,
            workspaceOptIn: true,
          }).allowed,
          "permission_denied",
        );
      executionAllowed({
        mode: grant.mode as AutonomyMode,
        risk: executionRisk(form, operation),
        confirmed: grant.confirmedIds.includes(step.id),
        expiresAt: grant.expiresAt,
        revokedAt: grant.revokedAt,
        stepExpiresAt: step.expiresAt,
        used: await db.agentExecutionReceipt.count({
          where: { grantId: grant.id },
        }),
        budget: grant.maxActions,
        now: new Date(),
      });
      for (const ref of form.sources) {
        const source = await live.source(ref);
        demand(source && source.version === ref.version, "source_changed");
      }
      const prepared = await live.business?.prepare(form);
      demand(prepared, "business_adapter_unavailable");
      // Do not accept a silent normalization as the user's old confirmation.
      demand(digest(json(prepared)) === step.payloadHash, "proposal_changed");
      const object = await ctx.write(form, operation, step.id);
      const source = await live.source(object);
      demand(source, "receipt_source_unavailable");
      const href =
        object.kind === "sales_plan"
          ? `/planning?year=${form.fields.year}`
          : object.kind === "solution"
            ? `/solution/${object.id}`
            : `/${object.kind}/${object.id}`;
      return db.agentExecutionReceipt.create({
        data: {
          ...owned,
          stepId: step.id,
          grantId: grant.id,
          ruleVersion: EXECUTION_RULE_VERSION,
          result: json({ object, version: source!.version, operation, href }),
        },
      });
    });
    await validReceipt(ctx, taskId, receipt.result);
    await recordAuditEvent({
      workspaceId: owned.workspaceId,
      actorId: owned.actorSub,
      objectType: "xiaoyu_execution",
      objectId: receipt.id,
      taskId,
      action: EXECUTION_RULE_VERSION,
      outcome: "success",
    });
    return receipt;
  } catch (error) {
    const code =
      error instanceof Error && /^[a-z_]{1,64}$/.test(error.message)
        ? error.message
        : "execution_interrupted";
    await (
      await getPrismaClient()
    ).agentExecutionStep.updateMany({
      where: { ...owned, id: v.stepId as string },
      data: { lastError: code, attemptedAt: new Date() },
    });
    await recordAuditEvent({
      workspaceId: owned.workspaceId,
      actorId: owned.actorSub,
      objectType: "xiaoyu_execution",
      objectId: v.stepId as string,
      taskId,
      action: EXECUTION_RULE_VERSION,
      outcome: "denied",
    });
    throw error;
  }
}

/** Explicit new phase. Old text and sources stay immutable and are never
 * silently relabelled as current. No task grant follows into the new phase. */
export async function continueExecution(
  ctx: ExecutionContext,
  taskId: string,
  receiptId: string,
) {
  demand(UUID.test(receiptId), "invalid_execution_request");
  const live = await fresh(ctx, taskId),
    db = await getPrismaClient();
  const receipt = await db.agentExecutionReceipt.findFirst({
    where: { ...scope(ctx, taskId), id: receiptId },
  });
  demand(receipt, "not_found");
  if (!receipt) throw Error("not_found");
  const result = await validReceipt(ctx, taskId, receipt.result);
  const previous = await live.store.load(
    { workspaceId: live.workspaceId, actorSub: live.sub },
    taskId,
  );
  demand(previous, "not_found");
  if (!previous) throw Error("not_found");
  const references = [];
  for (const old of previous.references) {
    const source = await live.source(old);
    demand(source, "source_unavailable");
    if (source) references.push({ ...source, role: old.role });
  }
  if (
    !references.some(
      (r) => r.id === result.object.id && r.kind === result.object.kind,
    )
  )
    references.push({
      ...result.object,
      version: result.version,
      role: "target" as const,
    });
  const next = await live.store.create(
    { workspaceId: live.workspaceId, actorSub: live.sub },
    previous.task.goal,
    TASK_RULE_VERSION,
    references,
    receipt.id,
  );
  const all = await live.store.load(
    { workspaceId: live.workspaceId, actorSub: live.sub },
    next.id,
    true,
  );
  if (all && !all.drafts.some((d) => d.key === "execution-receipt"))
    await live.store.mutate(
      { workspaceId: live.workspaceId, actorSub: live.sub },
      next.id,
      all.task.revision,
      {
        ruleVersion: TASK_RULE_VERSION,
        draft: {
          key: "execution-receipt",
          text: JSON.stringify({
            sourceTaskId: taskId,
            receiptId,
            completed: result,
            historicalContentCopied: false,
            grantsCopied: false,
          }),
        },
      },
    );
  return {
    taskId: next.id,
    sourceTaskId: taskId,
    receiptId,
    grantsCopied: false,
  };
}
