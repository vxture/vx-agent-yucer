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
// sequence)` is a milestone's key in the DDL - so the order is data.
//
// THE CONNECTOR CARRIES THE READING. A segment is green only when the
// milestone BEFORE it is done: the line is how far the project actually got,
// and it stops at the first thing that did not happen. That is the same fact
// `deriveProjectHealth` acts on - one `missed` overrides a reported green.
//
// THE LINE IS A SIBLING OF THE CIRCLE, NOT A FLOATING OFFSET. The first
// version positioned the connector with a hand-tuned margin and it hung above
// the circles it was supposed to join (owner, 2026-09-06). Now each node is a
// flex row - half-line, circle, half-line - so `items-center` aligns them and
// there is no number to keep in step with the circle's size. Nodes are
// `flex-1`, so they are equal width whatever their names are.
//
// AND IT SITS ON ITS OWN SURFACE. Rendered into a table row's expanded cell,
// which carries no padding, it ran flush to the table's left edge and merged
// into the rows above and below. The inset wash and the padding are what make
// it read as something belonging to the project rather than a broken row.
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
    ring: "border-transparent bg-(color:--success-text) text-white",
    text: "text-(color:--success-text)",
    icon: "check" as const,
  },
  missed: {
    ring: "border-transparent bg-destructive text-white",
    text: "text-(color:--danger-text)",
    icon: "x" as const,
  },
  pending: {
    ring: "border-border bg-surface",
    text: "text-muted-foreground",
    // NO GLYPH: an empty outlined circle is what "not yet" looks like on every
    // stepper anybody has read, and the DS icon set carries nothing that says
    // pending without saying something more specific.
    icon: null,
  },
} as const;

const shape = (status: string) =>
  status === "done" ? NODE.done : status === "missed" ? NODE.missed : NODE.pending;

/** The track between two nodes is only "travelled" once the earlier one is done. */
const track = (done: boolean) => (done ? "bg-(color:--success-text)" : "bg-border");

export function DeliveryPlanFlow({ nodes }: { readonly nodes: readonly PlanNode[] }) {
  const { DELIVERY_TEXT } = useMessages();

  // Sorted here rather than trusted from the caller: the sequence IS the
  // reading, and a flow drawn in arrival order would be a different claim.
  const ordered = [...nodes].sort((a, b) => a.sequence - b.sequence);

  return (
    <div className="bg-accent/40 px-lg py-md">
      {/* Its own horizontal scroll: a long plan is wider than the row it hangs
          under, and the page body must never scroll sideways. */}
      <div className="overflow-x-auto">
        <ol className="flex min-w-max items-start">
          {ordered.map((n, i) => {
            const look = shape(n.status);
            const first = i === 0;
            const last = i === ordered.length - 1;
            return (
              <li key={n.id} className="flex w-[9rem] min-w-0 flex-1 flex-col items-center gap-2xs">
                {/* Half-track, circle, half-track - one row, so the line meets
                    the circle's centre by layout rather than by arithmetic. */}
                <div className="flex w-full items-center">
                  <span
                    aria-hidden
                    className={`h-px flex-1 ${
                      first ? "bg-transparent" : track(ordered[i - 1]!.status === "done")
                    }`}
                  />
                  <span
                    className={`flex size-control-sm shrink-0 items-center justify-center rounded-full border ${look.ring}`}
                    title={DELIVERY_TEXT.milestoneStatusLabel[n.status] ?? n.status}
                  >
                    {look.icon ? <Icon name={look.icon} size="sm" /> : null}
                  </span>
                  <span
                    aria-hidden
                    className={`h-px flex-1 ${
                      last ? "bg-transparent" : track(n.status === "done")
                    }`}
                  />
                </div>

                <span
                  className="text-foreground w-full truncate px-2xs text-center text-body-sm"
                  title={n.name}
                >
                  {n.name}
                </span>
                {/* ONE LINE, NOT TWO. The date a reader wants is the one that
                    happened - a done milestone shows when it landed, an open
                    one when it is due - and the status word beside it is the
                    only other thing this node has to say. */}
                <span className={`text-body-sm tabular-nums ${look.text}`}>
                  {(n.status === "done" ? n.completedAt : n.dueAt) ?? DELIVERY_TEXT.milestoneNoDate}
                  {" · "}
                  {DELIVERY_TEXT.milestoneStatusLabel[n.status] ?? n.status}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
