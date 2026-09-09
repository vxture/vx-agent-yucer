"use client";

import { Icon, StatusBadge } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import { Tag } from "./tag";

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
// WHY FIVE, from what this product actually sells. The catalogue's types are
// 软件产品 / 订阅服务 / 实施服务 / 维保服务 / 培训服务, and a delivery project
// delivers those, so the milestone count follows the CONTRACT's shape in three
// families:
//
//   实施类 (software + implementation, the bulk): 启动 -> 需求调研/蓝图 ->
//     配置开发 -> 集成测试与数据迁移 -> 上线切换 -> 终验 -> 质保移交. Six or
//     seven if written out, but a contract usually gates about FIVE - testing
//     and migration fold into go-live, warranty handover folds into "N days
//     after acceptance".
//   订阅接入 (SaaS): 启动 -> 配置接入 -> 试运行 -> 正式启用. Four.
//   维保 / 培训: one or two - delivery IS the completion.
//
// And the milestones pair with the collections schedule: payment gates sit on
// acceptance gates (预付 / 上线 / 终验 / 质保到期), three or four of them, with
// the milestone set running one or two longer.
//
// Five covers the longest common family. THREE IS WHAT FITS, and the two
// rulings collide at this width rather than one being wrong:
//
//   Insetting the panel to the business columns takes 192px of a 616px table -
//   two leading edge columns plus the action column, 31% of the width - and a
//   card needs about 114px to hold a five-character name beside its marker
//   plus a date beneath (20 + 4 + 65 content, 24 padding). Of the 424px left:
//   3 columns give 136px, 4 give 100, 5 give 68. Measured, not estimated.
//
// So one row holds three, and a five-gate contract wraps to a second row -
// which the layout rule already allows. Widening the shell or narrowing the
// inset is what buys the fourth and fifth; the arithmetic is here so that
// choice can be redone rather than re-guessed.
//
// (An earlier version of this comment said "kickoff, pilot, rollout" - that is
// a PRODUCT ROLLOUT's playbook, reverse-engineered from the demo fixture's own
// milestone names two lines after admitting the fixture could not settle the
// number. Corrected on the owner's challenge, 2026-09-06.)
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
  /** Days later than what was committed, or null when nothing was committed.
   * NOT zero for the second case - see milestoneSlippage. */
  readonly slippedDays: number | null;
  /** The customer-side signatory, as our own people recorded it. */
  readonly acceptedBy: string | null;
  /** How many times this gate's plan has been moved, and why it moved LAST.
   * The count is the pattern; the reason is the answer to the question the
   * count makes a reader ask. */
  readonly changeCount: number;
  readonly lastChangeReason: string | null;
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
    // INSET TO THE BUSINESS COLUMNS, not flush to the table (owner,
    // 2026-09-06). The left edge lands under the title column and the right
    // edge stops at the action column, so the plan reads as hanging off the
    // project's own name rather than off the table frame.
    //
    // The two figures are the edge columns' width, twice on the left (选择 +
    // 序号) and once on the right (操作) - the 64px that table-fittings pins.
    // If that constant ever moves, these move with it.
    <div className="bg-accent py-xl pl-[8rem] pr-[4rem]">
            {/* FIXED FIVE, not auto-fit. The rule is that a short plan keeps the
          same geometry as a long one and leaves the remainder as whitespace -
          three milestones must not stretch to fill five columns' width, and a
          responsive column count would break exactly that. */}
      <ol className="grid grid-cols-3 gap-sm">
        {ordered.map((n) => {
          const look = shape(n.status);
          return (
            // A CARD THAT LETS THE PANEL THROUGH. Solid white read as a
            // second table pasted onto the tinted ground; a translucent
            // gradient keeps the card a surface without cutting it out of the
            // panel, and a light border is enough to say where it ends.
            <li
              key={n.id}
              className={`flex min-w-0 flex-col gap-xs rounded-md border border-l-2 bg-gradient-to-b from-card/80 to-card/30 px-sm py-md ${look.edge} border-y-border/50 border-r-border/50`}
            >
              {/* MARKER AND NAME ON ONE LINE: the ordinal is part of the
                  milestone's name in the reader's head - "the third one,
                  上线" - not a separate fact stacked above it. */}
              <div className="flex min-w-0 items-center gap-2xs">
                <span
                  className={`flex size-control-2xs shrink-0 items-center justify-center rounded-full border text-label-sm tabular-nums ${look.marker}`}
                  title={DELIVERY_TEXT.milestoneStatusLabel[n.status] ?? n.status}
                >
                  {look.icon ? <Icon name={look.icon} size="sm" /> : n.sequence}
                </span>
                <span className="text-foreground truncate text-body-sm" title={n.name}>
                  {n.name}
                </span>
              </div>

              {/* THE MIDDLE BAND IS WHAT MATTERS ABOUT THIS MILESTONE.
                  Commercially that is three things, in the order they are
                  read: what state it is in, whether it has moved from what was
                  committed, and whether the customer has actually signed. */}
              <span className="flex min-w-0 flex-wrap items-center gap-2xs">
                <span className={`truncate text-body-sm ${look.text}`}>
                  {DELIVERY_TEXT.milestoneStatusLabel[n.status] ?? n.status}
                </span>
                {/* SLIPPAGE, AND ONLY LATE SLIPPAGE IS A WARNING. A gate that
                    moved EARLIER is news too, but it is not a problem, so it
                    reads as plain text - colouring both the same would make
                    the eye stop at good news. Null and zero are both absent
                    here on purpose: nothing was committed, or nothing moved. */}
                {n.slippedDays !== null && n.slippedDays !== 0 ? (
                  <Tag tone={n.slippedDays > 0 ? "warning" : "neutral"}>
                    {n.slippedDays > 0
                      ? DELIVERY_TEXT.milestoneSlippedLate(n.slippedDays)
                      : DELIVERY_TEXT.milestoneSlippedEarly(-n.slippedDays)}
                  </Tag>
                ) : null}
              </span>
              {/* DONE IS NOT ACCEPTED, which is the whole reason these are two
                  columns. A finished gate the customer has not signed is money
                  that cannot be invoiced yet, and saying nothing here would let
                  it read as settled business. */}
              {n.status === "done" ? (
                <span
                  className={`truncate text-body-sm ${n.acceptedBy ? "text-(color:--success-text)" : "text-muted-foreground"}`}
                >
                  {n.acceptedBy
                    ? DELIVERY_TEXT.milestoneAcceptedByName(n.acceptedBy)
                    : DELIVERY_TEXT.milestoneAwaitingAcceptance}
                </span>
              ) : null}
              {/* WHY IT MOVED. A slippage badge says a gate is late; this says
                  it was moved deliberately and by whose reasoning - which is
                  the difference between a plan that slipped and a plan that
                  was renegotiated. Shown only where there is something to
                  show, so an untouched gate stays quiet. */}
              {n.changeCount > 0 ? (
                <span
                  className="text-muted-foreground truncate text-body-sm"
                  title={n.lastChangeReason ?? undefined}
                >
                  {DELIVERY_TEXT.milestoneChanged(n.changeCount)}
                  {n.lastChangeReason ? ` · ${n.lastChangeReason}` : ""}
                </span>
              ) : null}
              {/* THE DATE THAT HAPPENED, not both dates: a done milestone shows
                  when it landed, an open one when it is due. */}
              {/* THE TIMESTAMP SITS AT THE FOOT, quietest of the three bands:
                  a date is what you check after you have read what happened. */}
              <span className="text-muted-foreground truncate text-body-sm tabular-nums">
                {(n.status === "done" ? n.completedAt : n.dueAt) ?? DELIVERY_TEXT.milestoneNoDate}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
