"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, Icon, Progress } from "@vxture/design-ui";
import { BOARD_TEXT } from "../lib/messages";
import { BarList, Lede } from "./board-chart";
import type { BoardMetric, BoardSection } from "../lib/board";

// The left flank: where things stand for OUR side.
//
// Not a menu. Nine links answer "where can I go", which nobody wonders about
// twice; these panels answer "where do things stand" and happen also to be how
// you get there - the number IS the reason to click, so reading and navigating
// stop being separate acts.
//
// CARDS, not rows on a transparent rail. Each of these is a separate instrument
// reporting a separate thing - quota, resources, the decision queue - and a
// shared background would imply they belong to one reading. They do not.
//
// The pinned ones stay open because they are what a person opens this product
// to do. The rest are a title and one number until asked for: a board where
// everything is expanded is a wall, and nine equally-loud panels teach a reader
// nothing about which one matters.
//
// Every figure comes from that domain's own service through both gates (see
// board.ts). A section a member may not read shows NO numbers rather than
// zeros - "0 accounts" and "you cannot see accounts" are different statements.

export interface NavBoardProps {
  readonly sections: readonly BoardSection[];
  readonly pinned: readonly string[];
  readonly activeKey: string | null;
}

/** Spelled out: Tailwind reads source text, so a computed `grid-cols-${n}`
 *  would produce a class with no CSS behind it. */
const COLS: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
};

const TONE_CLASS: Record<string, string> = {
  bad: "text-destructive",
  warn: "text-warning",
  good: "text-success",
};

export function NavBoard({ sections, pinned, activeKey }: NavBoardProps) {
  const pinnedSet = new Set(pinned);
  const open = sections.filter((s) => pinnedSet.has(s.key));
  const rest = sections.filter((s) => !pinnedSet.has(s.key));

  return (
    <nav className="flex flex-col gap-xs" aria-label={BOARD_TEXT.boardLabel}>
      {open.map((s) => (
        /* A COMMON FLOOR, so the board reads as a rank of instruments rather
           than a ragged stack. 32 on the spacing scale is 128px - the height the
           two densest cards (today, resource) settle at on their own, which is
           why it is the reference rather than a number picked to look tidy.
           min-h, not h: content still governs, and a card that genuinely needs
           more grows instead of clipping. */
        <Card key={s.key} className="min-h-32 p-md">
          {/* ONE child, deliberately. Card is `flex flex-col gap-xl` - built for
              page-level cards whose sections stand 32px apart - and with two
              children that gap fired between the title and the chart, on top of
              the margin the content already carried: 42px of air inside a 256px
              card. Wrapping in a single child makes the gap inapplicable rather
              than overriding it, so the DS element is untouched and the rhythm
              in here is ours to set. */}
          <div className="flex flex-col gap-md">
            <SectionHead
              section={s}
              active={s.key === activeKey}
              total={undefined}
            />
            <Metrics section={s} />
          </div>
        </Card>
      ))}

      {/* The archive, gathered into ONE card. Seven separate cards for things
          nobody opens daily would give the archive the same weight as the work,
          which is the arrangement this redesign exists to undo. */}
      {rest.length > 0 ? (
        <Card className="overflow-hidden py-none">
          {rest.map((s, i) => (
            <Sector key={s.key} section={s} active={s.key === activeKey} first={i === 0} />
          ))}
        </Card>
      ) : null}
    </nav>
  );
}

/**
 * The title, and - for a charted section - its total on the same line.
 *
 * The total used to sit below as a full readout block: one digit at heading
 * size, alone on a row two hundred pixels wide, which is the "large empty area"
 * this pass exists to remove. On the title line it costs no height at all, and
 * it reads the way the sentence actually goes - "waiting on me: 4" - instead of
 * as a peer of the segments underneath, which it is not: they add up to it.
 */
function SectionHead({
  section: s,
  active,
  total,
}: {
  section: BoardSection;
  active: boolean;
  total?: BoardMetric;
}) {
  return (
    <div className="flex items-baseline justify-between gap-xs">
      <Link
        href={s.href}
        className={[
          "min-w-0 truncate text-xs font-semibold tracking-wide",
          active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
        ].join(" ")}
      >
        {s.title}
      </Link>
      {total ? (
        <span className="flex shrink-0 items-baseline gap-2xs">
          <span
            className={[
              "text-label-md font-semibold tabular-nums",
              total.tone ? TONE_CLASS[total.tone] : "text-foreground",
            ].join(" ")}
          >
            {total.value}
          </span>
          <span className="text-muted-foreground text-xs">{total.label}</span>
        </span>
      ) : null}
    </div>
  );
}

function Metrics({ section: s }: { section: BoardSection }) {
  if (s.metrics.length === 0) return null;

  // A charted section shows its HEADLINE figures as readouts and lets the chart
  // carry the rest. For "share" that is the one metric with no weight - the
  // total the segments add up to; for "bars" every figure is already printed on
  // its own row, so nothing is repeated above it.
  // On a charted section the figures belong to the chart (and its total to the
  // title line), so nothing is printed twice above it.
  const headline = s.chart ? [] : s.metrics;

  return (
    <>
      {headline.length > 0 ? <Readouts metrics={headline} /> : null}
      {s.chart === "lede" ? <Lede metrics={s.metrics} /> : null}
      {s.chart === "bars" ? <BarList metrics={s.metrics} /> : null}

      {/* Bare track. The percentage it represents is one of the figures above
          it now, so a caption here would print the same number twice - and a
          number read alone under an almost-empty track was what made a low
          attainment look like a rendering failure in the first place. */}
      {typeof s.progress === "number" ? <Progress value={s.progress} /> : null}
    </>
  );
}

/**
 * The plain figures, spread across the card rather than pushed to its left.
 *
 * A grid, not flex-wrap. Wrapped, three single-digit counts occupied about
 * ninety of the two hundred and thirty available pixels and left the rest of
 * the row empty - the card read as mostly nothing. Equal columns give each
 * figure the same share of the width, which is also the honest arrangement:
 * these are peers, and a flex row silently ranks them by how many characters
 * they happen to have.
 *
 * Capped at three columns because the fourth lands at roughly fifty pixels,
 * which is narrower than "1200 万".
 */
function Readouts({ metrics }: { metrics: readonly BoardMetric[] }) {
  const cols = Math.min(metrics.length, 3);
  return (
    <div className={`grid gap-x-md gap-y-sm ${COLS[cols]}`}>
      {metrics.map((m) => (
        <div key={m.label} className="min-w-0">
          {/* The number is the content and the label is the footnote, so the
              sizes say so. Tabular figures, because these are compared down a
              column and across days. */}
          <div
            className={[
              "text-heading-4 truncate tabular-nums",
              m.tone ? TONE_CLASS[m.tone] : "text-foreground",
            ].join(" ")}
          >
            {m.value}
          </div>
          <div className="text-muted-foreground truncate text-xs">{m.label}</div>
        </div>
      ))}
    </div>
  );
}

/**
 * One line of the archive, expandable to its numbers.
 *
 * The count sits on the collapsed line rather than behind the disclosure: it is
 * the whole reason to decide whether to open this, and hiding it would make
 * expanding mandatory to learn anything.
 */
function Sector({
  section: s,
  active,
  first,
}: {
  section: BoardSection;
  active: boolean;
  first: boolean;
}) {
  const [open, setOpen] = useState(false);
  const lead = s.metrics[0];
  const more = s.metrics.length > 1;

  return (
    <div className={[first ? "" : "border-border border-t", active ? "bg-accent" : ""].join(" ")}>
      <div className="flex items-center gap-xs px-sm py-xs">
        <Link href={s.href} className="text-foreground min-w-0 flex-1 truncate text-sm hover:underline">
          {s.title}
        </Link>
        {lead ? (
          <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
            {lead.label} {lead.value}
          </span>
        ) : null}
        {more ? (
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-label={open ? BOARD_TEXT.collapse(s.title) : BOARD_TEXT.expand(s.title)}
            className="text-muted-foreground hover:text-foreground shrink-0"
          >
            <Icon name={open ? "chevron-up" : "chevron-down"} size="xs" />
          </button>
        ) : null}
      </div>
      {open && more ? (
        <div className="flex flex-wrap gap-md px-sm pb-sm">
          {s.metrics.slice(1).map((m) => (
            <div key={m.label}>
              <div className="text-foreground text-label-md tabular-nums">{m.value}</div>
              <div className="text-muted-foreground text-xs">{m.label}</div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
