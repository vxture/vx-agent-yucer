import type { BoardMetric } from "../lib/board";

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

const DOT: Record<string, string> = {
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
const RAMP_DOT = ["text-primary", "text-primary/70", "text-primary/45", "text-primary/25"];

/** Toned segments keep their meaning; untoned ones step down the ramp. */
function fillFor(m: BoardMetric, untonedIndex: number): string {
  return m.tone ? FILL[m.tone] : RAMP[untonedIndex % RAMP.length];
}
function dotFor(m: BoardMetric, untonedIndex: number): string {
  return m.tone ? DOT[m.tone] : RAMP_DOT[untonedIndex % RAMP_DOT.length];
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
 * One population, split.
 *
 * A single track in segments, then a legend that carries the actual figures.
 * The bar answers "which of these dominates" at a glance and the legend answers
 * "by how much" - putting the numbers ON the segments would fail at the width
 * this card actually gets, where a one-unit segment is four pixels wide.
 */
export function ShareBar({ metrics }: { metrics: readonly BoardMetric[] }) {
  const parts = drawable(metrics);
  const total = parts.reduce((sum, m) => sum + (m.weight ?? 0), 0);
  if (parts.length === 0 || total === 0) return null;

  const idx = untonedIndexes(parts);

  return (
    <div className="flex flex-col gap-xs">
      <div
        className="bg-muted flex h-2xs w-full gap-px overflow-hidden rounded-full"
        role="img"
        aria-label={parts.map((m) => `${m.label} ${m.value}`).join("; ")}
      >
        {parts.map((m, i) => (
          <span
            key={m.label}
            className={fillFor(m, idx[i])}
            /* The one computed value in this file, and it is the datum. */
            style={{ width: `${((m.weight ?? 0) / total) * 100}%` }}
          />
        ))}
      </div>

      {/* Legend on one line per pair, wrapping. The dot ties a figure to its
          segment; without it the reader has to match by position, which breaks
          the moment a segment is too small to see. */}
      <ul className="flex flex-wrap gap-x-md gap-y-2xs">
        {parts.map((m, i) => (
          <li key={m.label} className="flex items-baseline gap-2xs">
            <span aria-hidden="true" className={`text-xs leading-none ${dotFor(m, idx[i])}`}>
              &bull;
            </span>
            <span className="text-foreground text-xs font-semibold tabular-nums">{m.value}</span>
            <span className="text-muted-foreground truncate text-xs">{m.label}</span>
          </li>
        ))}
      </ul>
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
          <div
            className="bg-muted h-2xs w-full overflow-hidden rounded-full"
            role="img"
            aria-label={`${m.label} ${m.value}`}
          >
            <span
              className={`block h-full rounded-full ${fillFor(m, i)}`}
              style={{ width: `${((m.weight ?? 0) / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
