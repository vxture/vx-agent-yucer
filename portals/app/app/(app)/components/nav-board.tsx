"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, Icon, Progress } from "@vxture/design-ui";
import { BOARD_TEXT } from "../lib/messages";
import type { BoardSection } from "../lib/board";

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
    <nav className="flex flex-col gap-sm" aria-label={BOARD_TEXT.boardLabel}>
      {open.map((s) => (
        <Card key={s.key} className="p-sm">
          <SectionHead section={s} active={s.key === activeKey} />
          <Metrics section={s} />
        </Card>
      ))}

      {/* The archive, gathered into ONE card. Seven separate cards for things
          nobody opens daily would give the archive the same weight as the work,
          which is the arrangement this redesign exists to undo. */}
      {rest.length > 0 ? (
        <Card className="overflow-hidden">
          {rest.map((s, i) => (
            <Sector key={s.key} section={s} active={s.key === activeKey} first={i === 0} />
          ))}
        </Card>
      ) : null}
    </nav>
  );
}

function SectionHead({ section: s, active }: { section: BoardSection; active: boolean }) {
  return (
    <Link
      href={s.href}
      className={[
        "block truncate text-xs font-semibold tracking-wide",
        active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
      ].join(" ")}
    >
      {s.title}
    </Link>
  );
}

function Metrics({ section: s }: { section: BoardSection }) {
  if (s.metrics.length === 0) return null;
  return (
    <>
      <div className="mt-xs flex flex-wrap gap-md">
        {s.metrics.map((m) => (
          <div key={m.label} className="min-w-0">
            {/* The number is the content and the label is the footnote, so the
                sizes say so. Tabular figures, because these are compared down a
                column and across days. */}
            <div
              className={[
                "text-heading-4 tabular-nums",
                m.tone ? TONE_CLASS[m.tone] : "text-foreground",
              ].join(" ")}
            >
              {m.value}
            </div>
            <div className="text-muted-foreground text-xs">{m.label}</div>
          </div>
        ))}
      </div>
      {typeof s.progress === "number" ? (
        <div className="mt-sm">
          <Progress value={s.progress} />
          <div className="text-muted-foreground mt-2xs text-xs tabular-nums">
            {BOARD_TEXT.quotaLeft(s.progress)}
          </div>
        </div>
      ) : null}
    </>
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
