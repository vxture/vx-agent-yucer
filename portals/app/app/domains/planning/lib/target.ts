// D2 sales planning (docs/20-specs/20-capability-domains.md, D2).
//
// D2 sets targets; D6 computes achievement. Neither domain writes the other's
// data, which is why attainment lives in pipeline/lib/forecast.ts and only the
// TARGET side lives here.
//
// The rule that shapes this file: a target's SCOPE TUPLE is its identity.
// (period, scope_type, territory_id, owner_sub, metric) is the unique key, and
// the column locks allow UPDATE only on plan_id, target_amount, currency and
// status. Editing a scope would silently move a commitment from one person or
// period to another while keeping its history - so changing scope means a new
// target, and the old one is closed.

import { fail, ok, violation, type RuleResult } from "../../shared/result";
import { isNonNegative, type Money } from "../../shared/money";

export const TARGET_METRICS = ["revenue", "new_logo", "pipeline", "margin"] as const;
export type TargetMetric = (typeof TARGET_METRICS)[number];

export const TARGET_STATUSES = ["draft", "committed", "closed"] as const;
export type TargetStatus = (typeof TARGET_STATUSES)[number];

export type TargetScopeType = "workspace" | "territory" | "owner";

export interface TargetScope {
  period: string;
  scopeType: TargetScopeType;
  territoryId: string | null;
  ownerSub: string | null;
  metric: TargetMetric;
}

export interface SalesTarget extends TargetScope {
  targetAmount: Money;
  status: TargetStatus;
  planId: string | null;
}

/** Canonical string form of the identity tuple, for dedup and comparison. */
export function scopeKey(scope: TargetScope): string {
  return [scope.period, scope.scopeType, scope.territoryId ?? "", scope.ownerSub ?? "", scope.metric].join(
    "|",
  );
}

export function validateTargetScope(scope: TargetScope): RuleResult<TargetScope> {
  if (!scope.period.trim()) {
    return fail(violation("period_required", "a target must name its period", "period"));
  }
  if (!(TARGET_METRICS as readonly string[]).includes(scope.metric)) {
    return fail(violation("unknown_metric", `${String(scope.metric)} is not a target metric`, "metric"));
  }
  if (scope.scopeType === "workspace" && (scope.territoryId || scope.ownerSub)) {
    return fail(violation("scope_overspecified", "a workspace target carries no territory or owner", "scopeType"));
  }
  if (scope.scopeType === "territory" && !scope.territoryId) {
    return fail(violation("scope_incomplete", "a territory target needs a territory", "territoryId"));
  }
  if (scope.scopeType === "owner" && !scope.ownerSub) {
    return fail(violation("scope_incomplete", "an owner target needs an owner", "ownerSub"));
  }
  return ok(scope);
}

export function planTargetCreation(input: {
  scope: TargetScope;
  targetAmount: Money;
  planId?: string | null;
  existing?: readonly TargetScope[];
}): RuleResult<SalesTarget> {
  const scope = validateTargetScope(input.scope);
  if (!scope.ok) return scope as RuleResult<SalesTarget>;

  if (!isNonNegative(input.targetAmount)) {
    return fail(violation("amount_negative", "a target cannot be negative", "targetAmount"));
  }

  const key = scopeKey(input.scope);
  if ((input.existing ?? []).some((e) => scopeKey(e) === key)) {
    // The unique index would reject it anyway; saying so here names the reason.
    return fail(
      violation(
        "duplicate_scope",
        "a target already exists for this period, scope and metric; adjust that one rather than adding a second",
        "scopeType",
      ),
    );
  }

  return ok({
    ...input.scope,
    period: input.scope.period.trim(),
    targetAmount: input.targetAmount,
    status: "draft",
    planId: input.planId ?? null,
  });
}

export interface TargetPatch {
  targetAmount?: Money;
  status?: TargetStatus;
  planId?: string | null;
}

/**
 * Only the number and the state move.
 *
 * A closed target is frozen: it is the historical record of what was committed
 * for a finished period, and re-opening it to change the number is how a missed
 * quarter becomes a met one.
 */
export function planTargetUpdate(
  current: SalesTarget,
  patch: TargetPatch,
): RuleResult<TargetPatch> {
  if (current.status === "closed") {
    return fail(
      violation(
        "target_closed",
        "a closed target records what was committed for a finished period and cannot be edited",
        "status",
      ),
    );
  }
  if (patch.targetAmount && !isNonNegative(patch.targetAmount)) {
    return fail(violation("amount_negative", "a target cannot be negative", "targetAmount"));
  }
  if (patch.targetAmount && patch.targetAmount.currency !== current.targetAmount.currency) {
    return fail(
      violation(
        "currency_mismatch",
        "changing a target's currency changes what was committed; close it and set a new one",
        "currency",
      ),
    );
  }
  if (patch.status && !(TARGET_STATUSES as readonly string[]).includes(patch.status)) {
    return fail(violation("unknown_status", `${String(patch.status)} is not a target status`, "status"));
  }
  // draft -> committed -> closed only moves forward: uncommitting a number
  // someone already reported upward is the same problem as editing a closed one.
  if (patch.status && TARGET_STATUSES.indexOf(patch.status) < TARGET_STATUSES.indexOf(current.status)) {
    return fail(
      violation("status_regression", `a target cannot go from ${current.status} back to ${patch.status}`, "status"),
    );
  }
  return ok(patch);
}

const SCOPE_KEYS = ["period", "scopeType", "scope_type", "territoryId", "territory_id", "ownerSub", "owner_sub", "metric"] as const;

/** Guard: the identity tuple is not writable. */
export function assertScopeUnchanged(patch: Record<string, unknown>): RuleResult<true> {
  const found = SCOPE_KEYS.filter((k) => Object.prototype.hasOwnProperty.call(patch, k));
  if (found.length === 0) return ok(true);
  return {
    ok: false,
    violations: found.map((k) =>
      violation(
        "scope_immutable",
        `sales_target.${k} is part of the target's identity; a different scope is a different target`,
        k,
      ),
    ),
  };
}
