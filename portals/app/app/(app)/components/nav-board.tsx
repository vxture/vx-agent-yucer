"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon } from "@vxture/design-ui";
import { BOARD_TEXT } from "../lib/messages";
import type { BoardSection } from "../lib/board";

// Navigation as a board, not a menu.
//
// A menu of nine links answers "where can I go", which nobody wonders about
// twice. This answers "where do things stand" and happens to also be how you
// get there - the number IS the reason to click, so the label and the
// destination stop being separate acts.
//
// THREE SECTIONS STAY OPEN because they are what a person opens this product
// to do: what needs deciding today, what is waiting on their signature, and
// what is still in play. The rest are titles until asked for. That is not
// tidiness - a board where everything is expanded is a wall, and a reader
// scanning nine equally-loud panels learns nothing about which matters.
//
// THE NUMBERS ARE THE CONTENT. Each value is set large and tabular; the label
// under it is small. A count read at a glance is the entire point, and a
// board that renders "客户 12" as one grey line makes you read a sentence to
// get a number.
//
// Every figure comes from the domain's own service through both gates - see
// board.ts. A section a member cannot read shows NO numbers rather than zeros.

export interface NavBoardProps {
  readonly sections: readonly BoardSection[];
  /** Keys rendered open and not collapsible. Order is preserved from sections. */
  readonly pinned: readonly string[];
  readonly activeKey: string | null;
}

export function NavBoard({ sections, pinned, activeKey }: NavBoardProps) {
  const pinnedSet = new Set(pinned);
  const open = sections.filter((s) => pinnedSet.has(s.key));
  const rest = sections.filter((s) => !pinnedSet.has(s.key));

  return (
    <nav className="flex flex-col gap-xs p-sm" aria-label={BOARD_TEXT.boardLabel}>
      {open.map((s) => (
        <Section key={s.key} section={s} active={s.key === activeKey} pinned />
      ))}
      {rest.map((s) => (
        <Section key={s.key} section={s} active={s.key === activeKey} pinned={false} />
      ))}
    </nav>
  );
}

function Section({
  section: s,
  active,
  pinned,
}: {
  section: BoardSection;
  active: boolean;
  pinned: boolean;
}) {
  const [open, setOpen] = useState(pinned);
  const canToggle = !pinned && s.metrics.length > 0;

  return (
    <div
      className={[
        "rounded-md transition-colors",
        active ? "bg-accent" : "hover:bg-accent/50",
      ].join(" ")}
    >
      <div className="flex items-center gap-2xs px-sm pt-sm">
        {/* The title is always the link. Expanding is a second, quieter act -
            wanting the number should never be the only way to reach the page. */}
        <Link
          href={s.href}
          className="text-foreground min-w-0 flex-1 truncate text-label-md hover:underline"
        >
          {s.title}
        </Link>
        {canToggle ? (
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-label={open ? BOARD_TEXT.collapse(s.title) : BOARD_TEXT.expand(s.title)}
            className="text-muted-foreground hover:text-foreground shrink-0 rounded-sm p-2xs"
          >
            <Icon name={open ? "chevron-up" : "chevron-down"} size="xs" />
          </button>
        ) : null}
      </div>

      {open && s.metrics.length > 0 ? (
        <div className="flex flex-wrap gap-md px-sm pt-xs pb-sm">
          {s.metrics.map((m) => (
            <div key={m.label} className="min-w-0">
              <div className="text-foreground text-heading-4 tabular-nums">{m.value}</div>
              <div className="text-muted-foreground text-xs">{m.label}</div>
            </div>
          ))}
        </div>
      ) : (
        // Collapsed sections still need bottom padding, or the titles crowd
        // each other and the board reads as one block of text.
        <div className="pb-sm" />
      )}
    </div>
  );
}
