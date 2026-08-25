import { Tooltip, TooltipContent, TooltipTrigger } from "@vxture/design-ui";
import type { BoardMetric, BoardSection } from "../lib/board";

// Two ways of drawing a handful of numbers, for the left flank's cards.
//
// STOPGAP - registered as TD-008. The design system has no data-visualisation
// element of any kind: MetricCard, MetricGrid, PanelItem, FactList and
// LabeledValue are all text readouts, and Progress draws one ratio and nothing
// else. There is nothing to compose here, so these are built locally.
//
// What keeps them inside the rules meanwhile:
//
//   - Every colour is a DS semantic token (primary / destructive / warning /
//     success / muted). No palette entry, no literal, no local variable. The
//     tone comes from BoardMetric.tone, which board.ts sets because the colour
//     carries meaning - it is data, not decoration.
//   - Every spacing, radius and type size is a DS token.
//   - The ONLY computed value is a percentage width, and that is the data
//     itself. No class can express it, and expressing it would mean inventing
//     a scale of widths, which is worse.
//
// WHICH SHAPE IS NOT A STYLE CHOICE, so neither component decides it -
// board.ts does, via `chart`. "share" asserts the numbers partition one
// population; "bars" asserts they are independent magnitudes on a common unit.
// Drawing a set of unrelated numbers as one bar would claim a relationship that
// does not exist, and the component has no way to know.

const FILL: Record<string, string> = {
  bad: "bg-destructive",
  warn: "bg-warning",
  good: "bg-success",
};

/** Tone carries meaning here - board.ts sets it from the data, not from taste. */
const TEXT: Record<string, string> = {
  bad: "text-destructive",
  warn: "text-warning",
  good: "text-success",
};

/**
 * The ramp for segments that carry no tone.
 *
 * One hue at falling opacity, not four hues. A categorical palette is what a
 * chart library would reach for and it is precisely what this repo may not
 * invent - picking four distinguishable hues IS designing a colour scale, and
 * the DS owns colour (TD-008 asks it for one).
 *
 * Monochrome is also the more honest reading. These segments have no tone
 * because nothing about them is good or bad - "stall risk 2, chain mapping 1"
 * are kinds, not verdicts - and four colours would imply four meanings the data
 * does not carry. A ramp says "same thing, different amounts", which is true.
 *
 * Without this every untoned segment rendered bg-primary, so a bar split three
 * ways looked like one undivided block: the split, which is the entire content
 * of the chart, was invisible.
 */
const RAMP = ["bg-primary", "bg-primary/70", "bg-primary/45", "bg-primary/25"];
/** The legend dot for each ramp step, so a figure ties to its segment. */
const RAMP_TEXT = ["text-primary", "text-primary/70", "text-primary/45", "text-primary/25"];

/** Toned segments keep their meaning; untoned ones step down the ramp. */
function fillFor(m: BoardMetric, untonedIndex: number): string {
  return m.tone ? FILL[m.tone] : RAMP[untonedIndex % RAMP.length];
}

/** Index within the untoned subset, so the ramp starts at full strength. */
function untonedIndexes(parts: readonly BoardMetric[]): number[] {
  let n = 0;
  return parts.map((m) => (m.tone ? -1 : n++));
}

/** Metrics that carry a magnitude. The rest are headlines, not segments. */
function drawable(metrics: readonly BoardMetric[]): BoardMetric[] {
  return metrics.filter((m) => typeof m.weight === "number" && m.weight > 0);
}

/**
 * One figure that demands action, and the rest as context.
 *
 * This replaced a stacked proportion bar, and the reason is worth keeping: a
 * segmented bar asserts that the SPLIT of a whole is what matters. For these
 * cards it never was. Nobody needs the ratio of today to this-week to watch -
 * they need "4 today", and then, only if they are still reading, the rest. The
 * bar spent the card's whole visual budget encoding a relationship no one had
 * asked about, which is exactly why it read as decoration.
 *
 * So the hierarchy IS the design. The lede is set at display size and carries
 * its own tone, so the eye lands on the number with a deadline before it lands
 * on anything else; everything after it compresses onto one muted line, present
 * for the reader who wants it and silent for the one who does not.
 *
 * Which metric leads is not decided here - board.ts puts it first, because
 * "which number demands action" is a business judgement. For the queue that is
 * today's count; for the decision chain it is unreached decision-makers, since
 * that card exists to say a deal has nobody in it who can approve.
 */
export function Lede({ metrics }: { metrics: readonly BoardMetric[] }) {
  const [lede, ...rest] = metrics;
  if (!lede) return null;

  return (
    <div className="flex flex-col gap-2xs">
      <div className="flex items-baseline gap-xs">
        <span className={`text-heading-2 tabular-nums ${lede.tone ? TEXT[lede.tone] : "text-foreground"}`}>
          {lede.value}
        </span>
        <span className="text-muted-foreground min-w-0 truncate text-xs">{lede.label}</span>
      </div>

      {rest.length > 0 ? (
        /* One line, dot-separated, and it wraps rather than truncating - these
           are the figures a reader goes looking for, so losing the tail to an
           ellipsis would defeat the point of keeping them. */
        <p className="text-muted-foreground text-xs">
          {rest.map((m, i) => (
            <span key={m.label}>
              {i > 0 ? <span aria-hidden="true"> · </span> : null}
              <span className={`tabular-nums ${m.tone ? TEXT[m.tone] : "text-foreground"}`}>{m.value}</span>{" "}
              {m.label}
            </span>
          ))}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Independent magnitudes, compared.
 *
 * A row each: name, then its figure, then a track under both. Scaled to the
 * LARGEST value rather than to their sum - these do not add up to anything, so
 * a share would be a fiction, and scaling to the leader is what makes "this one
 * is twice that one" readable.
 */
export function BarList({ metrics }: { metrics: readonly BoardMetric[] }) {
  const rows = drawable(metrics);
  if (rows.length === 0) return null;
  const max = Math.max(...rows.map((m) => m.weight ?? 0));

  return (
    <ul className="flex flex-col gap-2xs">
      {rows.map((m, i) => (
        /* Track tucked directly under its own line - no gap between a label and
           the bar that measures it, since they are one statement. The spacing
           that matters is BETWEEN rows, and that is the list gap. */
        <li key={m.label} className="flex flex-col">
          <div className="flex items-baseline justify-between gap-xs">
            <span className="text-foreground min-w-0 truncate text-xs">{m.label}</span>
            <span className="text-foreground shrink-0 text-xs font-semibold tabular-nums">{m.value}</span>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="bg-muted h-2xs w-full overflow-hidden rounded-full" role="img" aria-label={`${m.label} ${m.value}`}>
                <span
                  className={`block h-full rounded-full ${fillFor(m, i)}`}
                  style={{ width: `${((m.weight ?? 0) / max) * 100}%` }}
                />
              </div>
            </TooltipTrigger>
            <TooltipContent>
              {m.label} {m.value}
            </TooltipContent>
          </Tooltip>
        </li>
      ))}
    </ul>
  );
}

/**
 * The pool, on an axis.
 *
 * Without a scale a bar of pipeline is a coloured rectangle: 881万 means
 * nothing until you know what it has to cover. So the track's full width is
 * what the floor DEMANDS - the gap times the coverage multiple - and a mark
 * inside it shows where covering the gap exactly once would land. The distance
 * between the fill and that mark is the redundancy the whole rule is about, and
 * here it is visible rather than arithmetic.
 *
 * The target is deliberately absent: the quota card above already carries it,
 * and repeating it made two cards say the same 1200万. What no other card
 * carries is the SHORTFALL, which is the number this pool actually answers to.
 *
 * Segments are labelled but not numbered. With amounts the legend ran to two
 * lines in a 256px column, and the amount belongs on hover anyway - the legend
 * exists to say which band is which, not to be a table.
 */
export function Gauge({ gauge }: { gauge: NonNullable<BoardSection["gauge"]> }) {
  const pct = (n: number) => `${Math.min(100, (n / gauge.scaleMax) * 100)}%`;

  return (
    <div className="flex flex-col gap-xs">
      <div className="flex items-baseline justify-between gap-xs">
        <span className="text-muted-foreground shrink-0 text-xs">{gauge.label}</span>
        <span className="flex min-w-0 items-baseline gap-xs">
          <span className="text-foreground text-label-md font-semibold tabular-nums">{gauge.value}</span>
          {gauge.note ? (
            <span className={`shrink-0 text-xs tabular-nums ${gauge.thin ? TEXT.bad : TEXT.good}`}>{gauge.note}</span>
          ) : null}
        </span>
      </div>

      {/* The track is the required pool; the fill is what exists. */}
      <div className="relative">
        <div className="bg-muted flex h-xs w-full gap-px overflow-hidden rounded-full">
          {gauge.funnel.map((f, i) =>
            f.weight > 0 ? (
              <Tooltip key={f.label}>
                <TooltipTrigger asChild>
                  <span className={RAMP[i % RAMP.length]} style={{ width: pct(f.weight) }} />
                </TooltipTrigger>
                <TooltipContent>
                  {f.label} {f.value}
                </TooltipContent>
              </Tooltip>
            ) : null,
          )}
        </div>

        {/* The reference mark: a pure scale tick, carrying no label and no
            hover of its own. Drawn over the track rather than beside it - an
            axis that sits outside the bar it scales gets read as a second bar.

            pointer-events-none matters more than it looks. The mark lies on top
            of the segments, and those DO have tooltips; without this it would
            sit in front of them intercepting the hover for a tooltip it no
            longer has, and the band of pipeline underneath would go quiet for
            no visible reason.

            The figure it marks is not lost with its label: the coverage
            percentage beside the heading states the same relationship, and the
            shortfall itself is the quota card's target minus its closed. */}
        <span
          className="bg-foreground pointer-events-none absolute inset-y-0 w-px"
          style={{ left: pct(gauge.referenceAmount) }}
          aria-hidden="true"
        />
      </div>

      {/* Names only - every figure on this card, including the reference, is on
          hover. */}
      <ul className="flex flex-wrap items-baseline gap-x-sm gap-y-2xs">
        {gauge.funnel.map((f, i) => (
          <li key={f.label} className="flex items-baseline gap-2xs">
            <span aria-hidden="true" className={`text-xs leading-none ${RAMP_TEXT[i % RAMP_TEXT.length]}`}>
              &bull;
            </span>
            <span className="text-muted-foreground text-xs">{f.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
