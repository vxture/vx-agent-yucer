"use client";

import { Card, Section, StatusBadge } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import type { FunnelReading, StageReading } from "../../domains/shared/funnel";
import type { FunnelStage } from "../../domains/shared/funnel-exit";

// 漏斗总览 - five stages, what passed, what leaked, and why.
//
// A BAR PER STAGE, NOT A CHART. The classic funnel picture draws each stage as
// a slice of the one above, which only reads correctly when every stage is a
// strict subset of the last - and this one is not: a project can exist without
// an opportunity (self-sourced delivery), so the widths would lie. Three
// numbers per stage and a proportion bar built from those same three say the
// same thing without the implied arithmetic.
//
// THE UNEXPLAINED COUNT IS THE POINT OF THE PAGE, not an omission from it.
// Only 商机智探 and 线索管理 ask for a reason when something ends; a deal that
// was lost, a project cancelled and an instalment written off still record a
// status and nothing else. Showing that as a gap is what makes it fixable -
// hiding it would make three stages look problem-free.

const SHARE = {
  advanced: "bg-(color:--success-text)",
  open: "bg-(color:--level-2)",
  exited: "bg-(color:--warning-text)",
} as const;

export function FunnelOverview({
  reading,
  blind,
}: {
  readonly reading: FunnelReading;
  /** Stages this reader is not entitled to see - reported, not drawn as zero. */
  readonly blind: readonly FunnelStage[];
}) {
  const { FUNNEL_TEXT, EXIT_REASON_LABEL } = useMessages();

  const pct = (r: StageReading | null) =>
    r?.passRate === null || r === null ? null : Math.round(r.passRate * 100);

  return (
    /* The module header above carries the page's name and its description;
       this section names what the list IS. Printing the same title twice makes
       a reader check whether the two agree instead of reading either. */
    <Section id="funnel" icon="chart-bar" title={FUNNEL_TEXT.byStage} description={FUNNEL_TEXT.why}>
      {blind.length > 0 ? (
        <StatusBadge tone="warning">
          {/* The separator is copy too - it differs by language, and a literal
              here is exactly the kind of stray Chinese TD-002 keeps out of
              components. */}
          {FUNNEL_TEXT.blind(
            blind.map((b) => FUNNEL_TEXT.stage[b] ?? b).join(FUNNEL_TEXT.listSeparator),
          )}
        </StatusBadge>
      ) : null}

      <div className="flex flex-col gap-md">
        {reading.stages.map((s) => (
          <Card key={s.stage} className="flex flex-col gap-sm p-lg">
            <div className="flex flex-wrap items-baseline justify-between gap-sm">
              <span className="text-foreground text-label-lg">
                {FUNNEL_TEXT.stage[s.stage] ?? s.stage}
              </span>
              <span className="text-muted-foreground tabular-nums text-body-sm">
                {/* NULL IS NOT ZERO. Nothing reached this stage is a different
                    statement from everything that reached it died, and one
                    number cannot carry both. */}
                {s.reached === 0
                  ? FUNNEL_TEXT.nothingReached
                  : FUNNEL_TEXT.passed(pct(s) ?? 0, s.reached)}
              </span>
            </div>

            {s.reached > 0 ? (
              <div className="flex h-xs w-full overflow-hidden rounded-full">
                {(["advanced", "open", "exited"] as const).map((k) =>
                  s[k] > 0 ? (
                    <span
                      key={k}
                      className={SHARE[k]}
                      style={{ flexGrow: s[k], flexBasis: 0 }}
                      title={`${FUNNEL_TEXT.part[k]} ${s[k]}`}
                      aria-hidden
                    />
                  ) : null,
                )}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-md">
              {(["advanced", "open", "exited"] as const).map((k) => (
                <span key={k} className="text-muted-foreground text-body-sm">
                  <span className="text-foreground tabular-nums">{s[k]}</span> {FUNNEL_TEXT.part[k]}
                </span>
              ))}
            </div>

            {s.reasons.length > 0 ? (
              <div className="flex flex-wrap gap-xs">
                {s.reasons.map((r) => (
                  <StatusBadge key={r.code} tone="neutral">
                    {EXIT_REASON_LABEL[r.code] ?? r.code} {r.count}
                  </StatusBadge>
                ))}
              </div>
            ) : null}

            {s.unexplained > 0 ? (
              // THE BLIND SPOT, said out loud. These are subjects that ended
              // here with nothing recording why - because this stage has no
              // surface that asks yet.
              <span className="text-(color:--warning-text) text-body-sm">
                {FUNNEL_TEXT.unexplained(s.unexplained)}
              </span>
            ) : null}
          </Card>
        ))}
      </div>
    </Section>
  );
}
