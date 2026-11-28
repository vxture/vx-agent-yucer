import { randomUUID } from "node:crypto";
import { can } from "../../authz/decide";
import { demand } from "./plan-values";
import { readFocusWorkspace, type FocusContext } from "./focus-read";
import { planVersions } from "./plan-state";
export type PlanActionResult = {
  id: string;
  revisionId: string;
  actionKey: string;
  accountId: string;
  met: boolean;
  evidence: string;
  occurredAt: string;
  recordedAt: string;
  recordedBy: string;
  requestKey: string;
};
export type PlanActionResultInput = Pick<
  PlanActionResult,
  | "revisionId"
  | "actionKey"
  | "accountId"
  | "met"
  | "evidence"
  | "occurredAt"
  | "requestKey"
> & { year: number; period: string };

export async function readPlanActionResults(
  ctx: FocusContext,
  query: { year: number; period?: string; revisionId?: string },
) {
  const focus = await readFocusWorkspace(ctx, query, {
    includeContactDetails: false,
  });
  if (!focus.revision) return [];
  const keys = new Set(focus.rows.flatMap((r) => r.actions.map((a) => a.key)));
  return (
    await ctx.store.actionResults(ctx.workspaceId, focus.revision.id)
  ).filter(
    (r) =>
      keys.has(r.actionKey) && focus.rows.some((a) => a.id === r.accountId),
  );
}
/** Verification appends evidence against the exact published action, never edits a plan. */
export async function recordPlanActionResult(
  ctx: FocusContext,
  input: PlanActionResultInput,
) {
  demand(
    can(ctx.holder, ctx.entitlement, "planning.target.update", "data").allowed,
    "plan_denied",
  );
  demand(
    input &&
      typeof input.met === "boolean" &&
      typeof input.evidence === "string" &&
      input.evidence.trim().length > 0 &&
      input.evidence.length <= 500 &&
      /^[\w-]{8,128}$/.test(input.requestKey),
    "invalid_evidence",
  );
  const at = (ctx.now?.() ?? new Date()).toISOString();
  demand(
    /^\d{4}-\d{2}-\d{2}$/.test(input.occurredAt) &&
      Number.isFinite(Date.parse(input.occurredAt)) &&
      new Date(input.occurredAt).toISOString().slice(0, 10) ===
        input.occurredAt &&
      input.occurredAt >= "1900-01-01" &&
      input.occurredAt <= at.slice(0, 10),
    "invalid_evidence",
  );
  const focus = await readFocusWorkspace(
    ctx,
    { year: input.year, period: input.period },
    { includeContactDetails: false },
  );
  demand(
    !focus.closed &&
      focus.revision?.id === input.revisionId &&
      focus.revision.current &&
      !focus.revision.draft,
    "draft_conflict",
  );
  demand(
    focus.rows.some(
      (r) =>
        r.id === input.accountId &&
        r.actions.some((a) => a.key === input.actionKey),
    ),
    "action_unknown",
  );
  // Revalidate the current revision under the same plan lock used by publishing.
  return ctx.store.transact(
    ctx.workspaceId,
    input.year,
    async (plan, write) => {
      demand(
        !planVersions(plan, at).closed &&
          planVersions(plan, at).current?.id === input.revisionId,
        "draft_conflict",
      );
      const row: PlanActionResult = {
        id: randomUUID(),
        revisionId: input.revisionId,
        actionKey: input.actionKey,
        accountId: input.accountId,
        met: input.met,
        evidence: input.evidence.trim(),
        occurredAt: input.occurredAt,
        recordedAt: at,
        recordedBy: ctx.sub,
        requestKey: input.requestKey,
      };
      return write.appendActionResult(row);
    },
  );
}

export function sameActionResult(
  a: PlanActionResult,
  b: PlanActionResult,
): boolean {
  return (
    [
      "revisionId",
      "actionKey",
      "accountId",
      "met",
      "evidence",
      "occurredAt",
      "recordedBy",
    ] as const
  ).every((key) => a[key] === b[key]);
}
