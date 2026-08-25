import { Card, EmptyState, Section } from "@vxture/design-ui";
import { PIPELINE_TEXT } from "../lib/messages";

// The forecast series, drawn.
//
// This component is the payoff for forecast_snapshot having UPDATE revoked.
// Accuracy is period-end actual against what was forecast at period start, and
// that is unanswerable unless every point survives - so the table is
// append-only, and until now nothing read it back. An immutability nobody
// collects on is a cost the product pays for nothing.
//
// Four series against one baseline, because the categories do NOT nest: a
// best-case total that silently included commit would double-count, and the
// reader decides whether to add them. Stacking them would make that decision
// for them and make it wrong.

export interface TrajectoryPoint {
  readonly at: string;
  readonly commit: number;
  readonly bestCase: number;
  readonly pipeline: number;
  readonly closed: number;
}

const SERIES = [
  { key: "commit", label: PIPELINE_TEXT.tCommit, cls: "bg-primary" },
  { key: "bestCase", label: PIPELINE_TEXT.tBestCase, cls: "bg-primary/50" },
  { key: "pipeline", label: PIPELINE_TEXT.tPipeline, cls: "bg-muted-foreground/40" },
  { key: "closed", label: PIPELINE_TEXT.tClosed, cls: "bg-success" },
] as const;

export function ForecastTrajectory({
  points,
  wan,
}: {
  readonly points: readonly TrajectoryPoint[];
  /** Formatter, passed in so the component holds no locale text of its own. */
  readonly wan: (n: number) => string;
}) {
  // One baseline across all four series: they are the same unit measured the
  // same way, so scaling each to its own max would make the small ones look
  // like the big ones.
  const max = Math.max(...points.flatMap((p) => [p.commit, p.bestCase, p.pipeline, p.closed]), 1);

  return (
    /* Section, not Card+SectionHeader, so this reads the same way as the board
       and the review section: the heading and its description sit OUTSIDE the
       surface, and only the content goes on it. This was the odd one of the
       three - its heading lived inside its own card, which made the page's
       three subjects look like two subjects and one boxed aside. */
    <Section
      icon="chart-line"
      title={PIPELINE_TEXT.trajectory}
      description={PIPELINE_TEXT.trajectoryWhy}
    >

      {/* The section keeps its heading when a period has no snapshots. It used
          to return null, which was harmless while the period was fixed and
          always had data - now that the period is switchable, vanishing would
          make a titled section disappear on selection, which reads as a broken
          page rather than as an empty one. */}
      {points.length === 0 ? (
        <div>
          <EmptyState
            title={PIPELINE_TEXT.trajectoryEmptyTitle}
            description={PIPELINE_TEXT.trajectoryEmptyDescription}
          />
        </div>
      ) : (
      <Card className="p-md">
        <div className="flex items-end gap-lg overflow-x-auto">
        {points.map((p) => (
          <div key={p.at} className="flex shrink-0 flex-col items-center gap-xs">
            <div className="flex h-28 items-end gap-2xs">
              {SERIES.map((s) => {
                const v = p[s.key];
                return (
                  <div
                    key={s.key}
                    className={`w-3 rounded-t-sm ${s.cls}`}
                    style={{ height: `${Math.max(2, (v / max) * 112)}px` }}
                    title={`${s.label} ${wan(v)}`}
                  />
                );
              })}
            </div>
            <span className="text-muted-foreground text-xs tabular-nums">{p.at}</span>
          </div>
        ))}

        <div className="flex shrink-0 flex-col gap-2xs self-center">
          {SERIES.map((s) => (
            <div key={s.key} className="flex items-center gap-xs">
              <span className={`size-2 rounded-sm ${s.cls}`} aria-hidden />
              <span className="text-muted-foreground text-xs">{s.label}</span>
              <span className="text-foreground ml-auto text-xs tabular-nums">
                {wan(points[points.length - 1]![s.key])}
              </span>
            </div>
          ))}
        </div>
        </div>
      </Card>
      )}
    </Section>
  );
}
