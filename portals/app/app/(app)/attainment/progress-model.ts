import { tierProgress } from "../../domains/pipeline/lib/attainment-analysis";
import type { AttainmentMetricTarget } from "../../domains/planning/attainment-plan";
import { periodRange } from "../../domains/shared/period";

export function periodPhase(period: string, observedAt: string) {
  const range = periodRange(period);
  return range && range.end.toISOString() <= observedAt
    ? ("ended" as const)
    : range && range.start.toISOString() > observedAt
      ? ("upcoming" as const)
      : ("active" as const);
}
export function targetProgress(
  value: number | null,
  target: Pick<AttainmentMetricTarget, "floor" | "target" | "stretch"> | null,
  phase: "active" | "ended" | "upcoming" = "active",
) {
  const scale =
    target && target.target > 0 ? tierProgress(value ?? 0, target) : null;
  const state = !target
    ? "noTarget"
    : target.target === 0
      ? "zeroTarget"
      : value === null || !scale
        ? "unknown"
        : phase === "upcoming"
          ? "notStarted"
          : scale.stage === "stretch"
            ? "stretchReached"
            : scale.stage === "target"
              ? "targetReached"
              : scale.stage === "floor"
                ? "floorReached"
                : target.floor !== null
                  ? "belowFloor"
                  : "belowTarget";
  const tone =
    value === null || !scale || phase === "upcoming"
      ? "neutral"
      : scale.stage === "stretch" || scale.stage === "target"
        ? "success"
        : phase === "ended"
          ? "negative"
          : "active";
  return { scale, state, tone } as const;
}
