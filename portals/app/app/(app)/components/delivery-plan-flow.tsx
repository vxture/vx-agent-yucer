"use client";

import { Icon } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";

// 交付计划的流程视图 - owner ruling, 2026-09-06 (按流程图展开，不要表格展开).
//
// WHY A FLOW AND NOT A TABLE. A delivery plan is a SEQUENCE: milestone 3 comes
// after 2, and what a reader wants from it is where the project has got to and
// where it stopped. A table states the same rows and makes the reader rebuild
// the order in their head; laid out along a line, "done, done, missed, then
// nothing" is one glance. The sequence is also the identity - `(project,
// sequence)` is a milestone's key in the DDL - so the order is data, not
// decoration.
//
// THE CONNECTOR CARRIES THE READING. A segment is green only when the
// milestone BEFORE it is done: the line is how far the project actually got,
// and it stops at the first thing that did not happen. That is the same fact
// `deriveProjectHealth` acts on - one `missed` overrides a reported green -
// so the picture and the health badge above it are reading the same rows.
//
// NO DS COMPONENT FOR THIS. The design system has no stepper or timeline;
// LevelMarker is the L1-L5 ranking base and its own docs reserve that material
// for ranking alone. So this is composed from DS primitives - Icon plus the
// intent colour tokens - and nothing here restyles a DS element. Registered as
// TD-023 with the element the DS is missing.

export interface PlanNode {
  readonly id: string;
  readonly sequence: number;
  readonly name: string;
  readonly status: string;
  readonly dueAt: string | null;
  readonly completedAt: string | null;
}

const NODE = {
  done: {
    ring: "border-(color:--success-border) bg-(color:--success-surface)",
    text: "text-(color:--success-text)",
    icon: "check" as const,
  },
  missed: {
    ring: "border-(color:--danger-border) bg-(color:--danger-surface)",
    text: "text-(color:--danger-text)",
    icon: "x" as const,
  },
  pending: {
    ring: "border-border bg-surface",
    text: "text-muted-foreground",
    // NO GLYPH, and that is the drawing rather than a gap: an empty outlined
    // circle is what "not yet" looks like on every stepper anybody has read,
    // and the DS icon set carries nothing that says pending without saying
    // something more specific.
    icon: null,
  },
} as const;

const shape = (status: string) =>
  status === "done" ? NODE.done : status === "missed" ? NODE.missed : NODE.pending;

export function DeliveryPlanFlow({ nodes }: { readonly nodes: readonly PlanNode[] }) {
  const { DELIVERY_TEXT } = useMessages();

  // Sorted here rather than trusted from the caller: the sequence IS the
  // reading, and a flow drawn in arrival order would be a different claim.
  const ordered = [...nodes].sort((a, b) => a.sequence - b.sequence);

  return (
    // Its own horizontal scroll: a long plan is wider than the row it hangs
    // under, and the page body must never scroll sideways.
    <div className="overflow-x-auto py-sm">
      <ol className="flex min-w-max items-start gap-0">
        {ordered.map((n, i) => {
          const look = shape(n.status);
          const previousDone = i === 0 || ordered[i - 1]!.status === "done";
          return (
            <li key={n.id} className="flex items-start">
              {i > 0 ? (
                // THE CONNECTOR STOPS WHERE THE PROJECT DID. Green only while
                // the work behind it actually happened.
                <span
                  aria-hidden
                  className={`mt-[0.9rem] h-px w-[3rem] shrink-0 ${
                    previousDone ? "bg-(color:--success-border)" : "bg-border"
                  }`}
                />
              ) : null}
              <div className="flex w-[7.5rem] flex-col items-center gap-2xs px-2xs text-center">
                <span
                  className={`flex size-control-sm items-center justify-center rounded-full border ${look.ring} ${look.text}`}
                  title={DELIVERY_TEXT.milestoneStatusLabel[n.status] ?? n.status}
                >
                  {look.icon ? <Icon name={look.icon} size="sm" /> : null}
                </span>
                <span className="text-foreground truncate text-body-sm" title={n.name}>
                  {n.name}
                </span>
                {/* WHAT HAPPENED beats what was planned: a done milestone shows
                    the day it landed, an open one the day it is due. Showing
                    both on every node made four dates per column and none of
                    them the one being looked for. */}
                <span className="text-muted-foreground tabular-nums text-body-sm">
                  {n.status === "done"
                    ? (n.completedAt ?? DELIVERY_TEXT.milestoneNoDate)
                    : (n.dueAt ?? DELIVERY_TEXT.milestoneNoDate)}
                </span>
                <span className={`text-body-sm ${look.text}`}>
                  {DELIVERY_TEXT.milestoneStatusLabel[n.status] ?? n.status}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
