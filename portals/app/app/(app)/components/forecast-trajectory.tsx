import { Card, EmptyState, Section, StatusBadge } from "@vxture/design-ui";

import { getMessages } from "../lib/i18n/server";
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

/**
 * How many readings the plot shows.
 *
 * Eight because it is what the card's width carries without the columns
 * becoming hairlines, and because a forecast is argued over a quarter - eight
 * weekly snapshots is roughly that. Older readings are not lost, they are
 * simply not what this chart is for.
 */
const VISIBLE_POINTS = 8;

export async function ForecastTrajectory({
  points,
  wan,
  submit,
}: {
  readonly points: readonly TrajectoryPoint[];
  /** Formatter, passed in so the component holds no locale text of its own. */
  readonly wan: (n: number) => string;
  /**
   * The control that adds a point. A SLOT rather than a prop bundle: it is a
   * client component with a server action bound to it, and this component is a
   * server component - it can render the node, it cannot construct it.
   */
  readonly submit?: React.ReactNode;
}) {
  // A SERVER component, so it awaits rather than hooks - and it had to become
  // async to do it, which is the honest shape: reading the request's locale is
  // I/O, not state.
  const { PIPELINE_TEXT } = await getMessages();

  // Built here, not at module scope: it is made OF copy, so at import time it
  // would have frozen one language - the same trap as a static messages import.
  const SERIES = [
    { key: "commit", label: PIPELINE_TEXT.tCommit, cls: "bg-primary" },
    { key: "bestCase", label: PIPELINE_TEXT.tBestCase, cls: "bg-primary/50" },
    {
      key: "pipeline",
      label: PIPELINE_TEXT.tPipeline,
      cls: "bg-muted-foreground/40",
    },
    { key: "closed", label: PIPELINE_TEXT.tClosed, cls: "bg-success" },
  ] as const;

  // One baseline across all four series: they are the same unit measured the
  // same way, so scaling each to its own max would make the small ones look
  // like the big ones.
  // THE MOST RECENT WINDOW, not the whole history. A trajectory is read for
  // where the number is heading, and a quarter that has been forecast weekly
  // for months would squeeze every reading to a hairline to show movement
  // nobody is looking at. Taking the tail rather than the head is the point:
  // the newest reading must always be the rightmost one.
  const shown = points.slice(-VISIBLE_POINTS);

  // Scaled to the WINDOW, not the full series. A baseline drawn from readings
  // that are no longer on screen would flatten the ones that are, with nothing
  // visible to explain why.
  const max = Math.max(
    ...shown.flatMap((p) => [p.commit, p.bestCase, p.pipeline, p.closed]),
    1,
  );

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
      /* Says so when readings were dropped. Windowing silently would let a
         chart of the last eight weeks pass for the whole quarter, and the
         reader has no way to tell the difference from the plot alone. Absent
         when everything is on screen - a window nobody hit needs no caption.
         `action` rather than `titleSuffix` because Section forwards icon,
         title, description and action to its header but not titleSuffix. */
      action={
        <div className="flex items-center gap-xs">
          {points.length > shown.length ? (
            <StatusBadge tone="neutral">
              {PIPELINE_TEXT.trajectoryWindow(shown.length, points.length)}
            </StatusBadge>
          ) : null}
          {submit}
        </div>
      }
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
          {/* Plot above, legend beneath it and centred.

            The plot stretches: each column is flex-1, so five readings or eight
            fill whatever width the card is given and the spacing between them
            stays even. Left as shrink-0 they clustered against the left edge of
            a 992px card, and a chart that does not use its width reads as a
            chart missing data.

            The legend moved off the right flank to under the plot. On the flank
            it was competing with the plot for the same horizontal space - every
            pixel it took was a pixel the readings did not get - and it was
            reading as a fifth column of the chart rather than as its key. Below
            and centred it belongs to the whole plot instead of to its right
            edge, and the plot gets the full width back. */}
          <div className="flex flex-col gap-md">
            <div className="flex items-end gap-md">
              {shown.map((p) => (
                <div
                  key={p.at}
                  className="flex min-w-0 flex-1 flex-col items-center gap-xs"
                >
                  <div className="flex h-28 items-end gap-2xs">
                    {SERIES.map((s) => {
                      const v = p[s.key];
                      return (
                        <div
                          key={s.key}
                          className={`w-3 rounded-t-sm ${s.cls}`}
                          style={{
                            height: `${Math.max(2, (v / max) * 112)}px`,
                          }}
                          title={`${s.label} ${wan(v)}`}
                        />
                      );
                    })}
                  </div>
                  <span className="text-muted-foreground truncate text-xs tabular-nums">
                    {p.at}
                  </span>
                </div>
              ))}
            </div>

            {/* The figure beside each label is the LATEST reading, which is what
              the rightmost column shows - the key doubles as the current
              position so the card answers "where are we" without the reader
              measuring a bar against nothing. */}
            <ul className="border-border flex flex-wrap items-baseline justify-center gap-x-lg gap-y-xs border-t pt-md">
              {SERIES.map((s) => (
                <li key={s.key} className="flex items-baseline gap-xs">
                  <span
                    className={`size-2 shrink-0 rounded-sm ${s.cls}`}
                    aria-hidden
                  />
                  <span className="text-muted-foreground text-xs">
                    {s.label}
                  </span>
                  <span className="text-foreground text-xs font-semibold tabular-nums">
                    {wan(shown[shown.length - 1]![s.key])}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      )}
    </Section>
  );
}
