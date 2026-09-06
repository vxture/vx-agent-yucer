"use client";

import { Icon } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";

// 交付计划 - the plan a project row opens onto. Owner rulings: a FLOW rather
// than a table (2026-09-06), then CARDS in a fixed grid, on a panel that is
// clearly not another table row.
//
// WHY CARDS AND NOT A LINE OF NODES. The connector version put four words
// under a dot and asked the reader to take the whole plan in as one thin
// stripe; inside a table row that read as damage rather than as content. A
// card gives each milestone a box with room for its name, its date and its
// state, and the grid keeps the sequence legible without a drawn line.
//
// FIVE PER ROW, LEFT-ALIGNED. Fixed columns rather than auto-fit, because the
// owner's rule is that a short plan keeps the same geometry as a long one and
// leaves whitespace on the right - three milestones must not stretch into five
// columns' width. Beyond five the grid wraps and the layout still holds.
//
// WHY FIVE. The demo data cannot settle it - two projects carry plans, of
// three milestones and one - so the number comes from the shape of the work:
// a delivery engagement is planned in the order of kickoff, pilot, rollout,
// acceptance, handover. Five covers that; a plan longer than five is a real
// plan and wraps rather than being squeezed.
//
// THE SEQUENCE IS THE IDENTITY - `(project, sequence)` is a milestone's key in
// the DDL - so it is drawn, not implied: the ordinal sits in the marker of a
// milestone that has not happened yet, and gives way to the outcome's icon on
// one that has.
//
// NO DS COMPONENT FOR THIS: the design system has no stepper or timeline, and
// LevelMarker's material is reserved for ranking. Composed from DS primitives
// and the intent tokens; registered as TD-023.

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
    marker: "border-transparent bg-(color:--success-text) text-white",
    text: "text-(color:--success-text)",
    edge: "border-l-(color:--success-text)",
    icon: "check" as const,
  },
  missed: {
    marker: "border-transparent bg-destructive text-white",
    text: "text-(color:--danger-text)",
    edge: "border-l-destructive",
    icon: "x" as const,
  },
  pending: {
    marker: "border-border bg-card text-muted-foreground",
    text: "text-muted-foreground",
    edge: "border-l-border",
    // NO GLYPH - the ordinal goes here instead. An outlined circle carrying
    // its own step number says "not yet, and it is the third one", which is
    // two facts for the price of one mark.
    icon: null,
  },
} as const;

const shape = (status: string) =>
  status === "done" ? NODE.done : status === "missed" ? NODE.missed : NODE.pending;

export function DeliveryPlanFlow({ nodes }: { readonly nodes: readonly PlanNode[] }) {
  const { DELIVERY_TEXT } = useMessages();

  // Sorted here rather than trusted from the caller: the sequence IS the
  // reading, and a plan drawn in arrival order would be a different claim.
  const ordered = [...nodes].sort((a, b) => a.sequence - b.sequence);

  return (
    // A RECESSED PANEL, not another row. The expanded cell of a table carries
    // no padding and the rows around it are white, so without a ground of its
    // own the plan ran flush to the table's edge and read as a broken row.
    <div className="bg-accent px-lg py-lg">
            {/* FIXED FIVE, not auto-fit. The rule is that a short plan keeps the
          same geometry as a long one and leaves the remainder as whitespace -
          three milestones must not stretch to fill five columns' width, and a
          responsive column count would break exactly that. */}
      <ol className="grid grid-cols-5 gap-sm">
        {ordered.map((n) => {
          const look = shape(n.status);
          return (
            <li
              key={n.id}
              className={`bg-card flex min-w-0 flex-col gap-2xs rounded-md border border-l-2 p-sm ${look.edge}`}
            >
              <span
                className={`flex size-control-sm items-center justify-center rounded-full border text-label-sm tabular-nums ${look.marker}`}
                title={DELIVERY_TEXT.milestoneStatusLabel[n.status] ?? n.status}
              >
                {look.icon ? <Icon name={look.icon} size="sm" /> : n.sequence}
              </span>
              <span className="text-foreground truncate text-body-sm" title={n.name}>
                {n.name}
              </span>
              {/* THE DATE THAT HAPPENED, not both dates: a done milestone shows
                  when it landed, an open one when it is due. */}
              {/* THE STATUS WORD IS GONE FROM THIS LINE. The card already says
                  it three times over - the left edge, the marker's fill, the
                  icon - and as a fourth telling it was pushing the date out of
                  a 106px card (measured 2026-09-06). It stays in the marker's
                  tooltip. */}
              <span className={`truncate text-body-sm tabular-nums ${look.text}`}>
                {(n.status === "done" ? n.completedAt : n.dueAt) ?? DELIVERY_TEXT.milestoneNoDate}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
