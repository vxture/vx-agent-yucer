"use client";

import { Progress } from "@vxture/design-ui";
import { attainmentMilestones, type ExecutionRow } from "../lib/attainment-progress";
import { useLocale, useMessages } from "../lib/i18n/provider";
import { formatMoney } from "../lib/view-model";

// Domain tier -> DS semantic color; the native DS bar owns the track and fill.
const FILL = {
  below: "[&>div]:bg-warning",
  floor: "[&>div]:bg-info",
  target: "[&>div]:bg-primary",
  stretch: "[&>div]:bg-success",
} as const;
const INK = {
  below: "text-warning-text",
  floor: "text-info-text",
  target: "text-primary-text",
  stretch: "text-success-text",
} as const;
const MARKER = {
  floor: "border-destructive",
  target: "border-primary",
  stretch: "border-warning",
} as const;

export function AttainmentProgressBar({ row, details = false }: {
  row: ExecutionRow;
  details?: boolean;
}) {
  const { ATTAINMENT_PLAN_TEXT: T } = useMessages();
  const locale = useLocale();
  const scale = attainmentMilestones(row);
  if (!scale) {
    const reason = row.error
      ? row.currencyConflict ? T.currencyConflict : T.loadFailed
      : row.target?.target === 0 ? T.zeroTarget : T.noTarget;
    return (
      <div data-attainment-placeholder title={reason}>
        <div aria-hidden>
          <Progress value={0} max={1} className="h-sm" />
        </div>
        <span className="sr-only">{reason}</span>
      </div>
    );
  }
  const stage = {
    below: scale.milestones.some((m) => m.tier === "floor") ? T.belowFloor : T.belowTarget,
    floor: T.floorReached,
    target: T.targetReached,
    stretch: T.stretchReached,
  }[scale.stage];
  const labelOf = (tier: "floor" | "target" | "stretch") =>
    tier === "target" ? T.currentTarget : T[tier];
  const money = (n: number | null) => formatMoney(n, row.currency, locale);
  return (
    <div className="flex min-w-0 flex-col gap-xs" data-attainment-scale={scale.stage} data-attainment-period={row.period} data-attainment-maximum={scale.maximum}>
      <div className="relative">
        <Progress
          value={Math.max(0, row.closed!)}
          max={scale.maximum}
          className={`h-sm ${FILL[scale.stage]}`}
          aria-label={`${row.name} ${row.period} ${T.progressLabel}`}
          aria-valuetext={`${stage}; ${T.currentClosed} ${money(row.closed)} / ${T.currentTarget} ${money(row.target!.target)}`}
          title={scale.milestones.map((m) => `${labelOf(m.tier)} ${money(m.amount)}`).join(" / ")}
        />
        {/* Inset endpoint markers to preserve the track's rounded caps. */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-full" aria-hidden>
          {scale.milestones.map((m) => (
            <span
              key={m.tier}
              data-attainment-marker={m.tier}
              data-covered={row.closed! >= m.amount}
              className={`absolute inset-y-0 -translate-x-1/2 border-l-2 ring-1 ring-foreground/15 ${m.tier === "target" && row.closed! >= m.amount ? "border-primary-foreground" : MARKER[m.tier]}`}
              style={{ left: `clamp(var(--space-md), ${m.position}%, calc(100% - var(--space-md)))` }}
            />
          ))}
        </div>
      </div>
      {details ? (
        <div className="flex flex-wrap items-baseline justify-between gap-x-md gap-y-2xs text-body-small">
          <span className={`shrink-0 ${INK[scale.stage]}`}>{stage}</span>
          <span className="ml-auto flex flex-wrap justify-end gap-x-sm gap-y-2xs text-right text-muted-foreground tabular-nums">
            {scale.milestones.filter((m) => m.tier !== "target").map((m) => (
              <span key={m.tier} title={`${labelOf(m.tier)} ${money(m.amount)}`}>
                {labelOf(m.tier)} {money(m.amount)}
              </span>
            ))}
            <span>{T.commit} {money(row.commit)}</span>
          </span>
        </div>
      ) : null}
    </div>
  );
}
