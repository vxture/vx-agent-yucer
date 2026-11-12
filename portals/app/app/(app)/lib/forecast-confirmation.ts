import { createHash, randomUUID } from "node:crypto";
import {
  planCall,
  type ForecastTotals,
  type SnapshotRevenueBasis,
  type SnapshotRow,
} from "../../domains/pipeline/lib/forecast";
import type { TargetBasis } from "../../domains/planning/plan-service";
import { canonical } from "../../domains/planning/plan-values";
import { toMinor } from "../../domains/shared/money";

export type ForecastConfirmation = {
  token: string;
  workspaceId: string;
  sub: string;
  period: string;
  scopeKey: string;
  observedAt: string;
  expiresAt: number;
  currency: string;
  totals: ForecastTotals;
  basis: TargetBasis[];
  fingerprint: string;
};
export type ForecastConfirmationView = Pick<
  ForecastConfirmation,
  "token" | "period" | "scopeKey" | "observedAt" | "currency" | "totals"
> & { basis?: SnapshotRevenueBasis | null };

export function confirmationFingerprint(
  totals: ForecastTotals,
  basis: readonly TargetBasis[],
) {
  return createHash("sha256")
    .update(
      canonical([
        totals.commitAmount,
        totals.bestCaseAmount,
        totals.pipelineAmount,
        totals.closedAmount,
        totals.newLogoCount,
        [...basis]
          .sort((a, b) => a.metric.localeCompare(b.metric))
          .map(({ resolvedAt: _at, ...b }) => b),
      ]),
    )
    .digest("hex");
}

export function createForecastConfirmation(
  input: Omit<ForecastConfirmation, "token" | "expiresAt" | "fingerprint">,
  now = Date.now(),
): ForecastConfirmation {
  return {
    ...input,
    token: randomUUID(),
    expiresAt: now + 15 * 60_000,
    fingerprint: confirmationFingerprint(input.totals, input.basis),
  };
}

export function confirmationMatches(
  c: ForecastConfirmation,
  input: { workspaceId: string; sub: string; period: string; scopeKey: string },
  now = Date.now(),
) {
  return (
    c.expiresAt > now &&
    c.workspaceId === input.workspaceId &&
    c.sub === input.sub &&
    c.period === input.period &&
    c.scopeKey === input.scopeKey
  );
}

export function sameForecastCall(
  snapshot: SnapshotRow,
  call: { amount?: number | null; note?: string | null } | undefined,
) {
  const normalized = planCall(call, snapshot.currency);
  const minor = (amount: number | undefined) =>
    amount === undefined ? null : toMinor(amount);
  return (
    normalized.ok &&
    minor(snapshot.callAmount?.amount) ===
      minor(normalized.value.callAmount?.amount) &&
    (snapshot.callNote ?? null) === normalized.value.callNote
  );
}
