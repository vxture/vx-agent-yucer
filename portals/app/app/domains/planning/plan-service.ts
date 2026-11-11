import { can } from "../../authz/decide";
import type { DataScope } from "../../authz/scope";
import type { PlanningContext } from "./service";
import type { SalesPlanStore } from "./plan-store";
import {
  demand,
  digest,
  newKey,
  planVersions,
  validateContent,
  validateRevision,
  type PlanContent,
  type PlanRevision,
  type SalesPlan,
} from "./plan-model";

export type SalesPlanContext = Omit<PlanningContext, "store"> & {
  store: SalesPlanStore;
  scope: DataScope;
  now?: () => Date;
  // Server-computed digest of the original request, before source enrichment.
  requestDigest?: string;
};
export type PlanCommand =
  | { kind: "draft"; content: PlanContent; restoreId?: string }
  | {
      kind: "save";
      revisionId: string;
      editToken: number;
      content: PlanContent;
    }
  | {
      kind: "release";
      revisionId: string;
      editToken: number;
      reason: string;
      effectiveAt?: string;
      cancelScheduled?: boolean;
      adoptions?: { targetId: string; snapshot: unknown }[];
    }
  | { kind: "cancel"; reason: string }
  | { kind: "discard"; revisionId: string; editToken: number }
  | { kind: "lock"; period: string; reason: string }
  | { kind: "close"; reason: string };
function gate(ctx: SalesPlanContext, write: boolean) {
  const d = can(
    ctx.holder,
    ctx.entitlement,
    write ? "planning.target.update" : "planning.target.view",
    "data",
  );
  demand(d.allowed, "plan_denied");
  // A complete release includes customer/member snapshots. Until a scoped
  // editing contract exists, only workspace-scoped maintainers receive it.
  demand(ctx.scope.kind === "workspace", "plan_scope_required");
}
function sourceGate(ctx: SalesPlanContext, content: PlanContent) {
  demand(
    !content.budgets.length ||
      can(ctx.holder, ctx.entitlement, "account.view", "data").allowed,
    "plan_source_permission",
  );
  demand(
    !(content.team.length || content.actions.length) ||
      can(ctx.holder, ctx.entitlement, "admin.member.view", "data").allowed,
    "plan_source_permission",
  );
}
export async function readSalesPlan(ctx: SalesPlanContext, year: number) {
  gate(ctx, false);
  const plan = await ctx.store.read(ctx.workspaceId, year);
  for (const r of plan?.revisions ?? []) sourceGate(ctx, r.content);
  return plan;
}
export async function changeSalesPlan(
  ctx: SalesPlanContext,
  input: {
    year: number;
    expectedEventNo: number;
    requestKey: string;
    command: PlanCommand;
  },
): Promise<SalesPlan> {
  gate(ctx, true);
  demand(
    Number.isInteger(input.year) && input.year >= 2000 && input.year <= 2200,
    "invalid_period",
  );
  demand(
    typeof input.requestKey === "string" &&
      /^[a-zA-Z0-9_-]{8,128}$/.test(input.requestKey),
    "invalid_request",
  );
  const hash =
    ctx.requestDigest ??
    digest({
      command: input.command,
      expectedEventNo: input.expectedEventNo,
      actor: ctx.sub,
    });
  return ctx.store.transact(ctx.workspaceId, input.year, (plan) => {
    for (const r of plan.revisions) sourceGate(ctx, r.content);
    if ("content" in input.command) sourceGate(ctx, input.command.content);
    const now = (ctx.now?.() ?? new Date()).toISOString();
    const state = planVersions(plan, now);
    const cmd = input.command;
    const retry = plan.events.find((e) => e.requestKey === input.requestKey);
    if (retry) {
      demand(retry.requestHash === hash, "idempotency_conflict");
      return plan;
    }
    demand(state.eventNo === input.expectedEventNo, "plan_conflict");
    demand(!state.closed, "plan_closed");
    const event = (
      kind:
        | "draft"
        | "save"
        | "release"
        | "cancel"
        | "discard"
        | "lock"
        | "close",
      revisionId: string | null,
      reason: string,
      extras: {
        effectiveAt?: string;
        relatedNo?: number;
        period?: string;
      } = {},
    ) => {
      plan.events.push({
        no: (plan.events.at(-1)?.no ?? 0) + 1,
        kind,
        revisionId,
        relatedNo: extras.relatedNo ?? null,
        period: extras.period ?? null,
        at: now,
        effectiveAt: extras.effectiveAt ?? now,
        actor: ctx.sub,
        reason,
        requestKey:
          extras.relatedNo && cmd.kind !== "cancel"
            ? `${input.requestKey}_cancel`
            : input.requestKey,
        requestHash: hash,
      });
    };
    const draft = () => {
      const r = plan.revisions.find(
        (r) => "revisionId" in cmd && r.id === cmd.revisionId,
      );
      demand(r?.state === "draft", "draft_not_found");
      demand(
        "editToken" in cmd && r.editToken === cmd.editToken,
        "draft_conflict",
      );
      demand(
        r.baseId === state.current?.id || (!r.baseId && !state.current),
        "plan_conflict",
      );
      return r;
    };
    if (cmd.kind === "draft") {
      demand(!state.draft, "draft_exists");
      const source = cmd.restoreId
        ? plan.revisions.find(
            (r) => r.id === cmd.restoreId && r.state === "sealed",
          )
        : state.current;
      demand(!cmd.restoreId || source, "version_not_found");
      const content = structuredClone(source?.content ?? cmd.content);
      demand(content.year === plan.year, "invalid_period");
      validateContent(content, false);
      plan.revisions.push({
        id: newKey(),
        state: "draft",
        editToken: 1,
        version: null,
        baseId: state.current?.id ?? null,
        restoresId: cmd.restoreId ?? null,
        content,
        contentHash: null,
        reason: "",
        createdBy: ctx.sub,
        createdAt: now,
        sealedBy: null,
        sealedAt: null,
      });
      event("draft", plan.revisions.at(-1)!.id, "");
    } else if (cmd.kind === "save") {
      const r = draft();
      demand(cmd.content.year === plan.year, "invalid_period");
      validateContent(cmd.content, false);
      r.content = structuredClone(cmd.content);
      r.editToken++;
      event("save", r.id, "");
    } else if (cmd.kind === "release") {
      const r = draft();
      validateRevision(plan, r.content, now);
      const reason = cmd.reason.trim();
      demand(
        plan.revisions.every((r) => r.state !== "sealed") || reason,
        "change_reason_required",
      );
      const effective = cmd.effectiveAt
        ? new Date(cmd.effectiveAt).toISOString()
        : now;
      demand(effective >= now, "retroactive_release");
      demand(
        effective < `${plan.year + 1}-01-01T00:00:00.000Z`,
        "effective_outside_period",
      );
      if (state.scheduled) {
        demand(cmd.cancelScheduled, "scheduled_exists");
        const old = plan.events.find(
          (e) => e.kind === "release" && e.revisionId === state.scheduled!.id,
        )!;
        event("cancel", old.revisionId, reason, { relatedNo: old.no });
      }
      if (cmd.adoptions) {
        demand(
          !plan.revisions.some((x) => x.state === "sealed"),
          "adoption_first_release_only",
        );
        for (const adoption of cmd.adoptions) {
          demand(
            !plan.legacy.some((l) => l.targetId === adoption.targetId),
            "already_adopted",
          );
          plan.legacy.push({ ...adoption, revisionId: r.id });
        }
      }
      r.version = Math.max(0, ...plan.revisions.map((x) => x.version ?? 0)) + 1;
      r.state = "sealed";
      r.sealedAt = now;
      r.sealedBy = ctx.sub;
      r.reason = reason;
      r.contentHash = digest(r.content);
      r.editToken++;
      event("release", r.id, reason, { effectiveAt: effective });
    } else if (cmd.kind === "cancel") {
      demand(state.scheduled, "no_scheduled_release");
      demand(cmd.reason.trim(), "change_reason_required");
      const old = plan.events.find(
        (e) => e.kind === "release" && e.revisionId === state.scheduled!.id,
      )!;
      event("cancel", old.revisionId, cmd.reason.trim(), { relatedNo: old.no });
    } else if (cmd.kind === "discard") {
      const r = draft();
      r.state = "abandoned";
      r.editToken++;
      event("discard", r.id, "");
    } else if (cmd.kind === "lock") {
      demand(state.current && cmd.reason.trim(), "change_reason_required");
      const period = state.current.content.periods.find(
        (p) => p.key === cmd.period,
      );
      demand(
        period && period.parent && period.end <= now.slice(0, 10),
        "period_not_finished",
      );
      demand(
        !plan.events.some((e) => e.kind === "lock" && e.period === cmd.period),
        "period_already_closed",
      );
      demand(!state.scheduled, "scheduled_exists");
      event("lock", state.current.id, cmd.reason, { period: cmd.period });
    } else if (cmd.kind === "close") {
      demand(cmd.reason.trim(), "change_reason_required");
      if (state.scheduled) {
        const old = plan.events.find(
          (e) => e.kind === "release" && e.revisionId === state.scheduled!.id,
        )!;
        event("cancel", old.revisionId, cmd.reason.trim(), {
          relatedNo: old.no,
        });
      }
      if (state.draft) {
        state.draft.state = "abandoned";
        state.draft.editToken++;
      }
      event("close", state.current?.id ?? null, cmd.reason.trim());
    }
    return plan;
  });
}
export interface TargetBasis {
  planId?: string;
  metric: string;
  sourceKind: "sales_plan" | "legacy" | "none";
  revisionId: string | null;
  lineKey: string | null;
  legacyTargetId: string | null;
  version: number | null;
  target: string | null;
  currency: string | null;
  resolvedAt: string;
}
