import { cn } from "@vxture/design-ui";

// 计数角标 - the count bubble that hangs on an icon button's corner.
//
// THIS IS THE TD-006 STOPGAP, BUILT RATHER THAN BORROWED. The DS has no count
// badge: it has `Badge` and `StatusBadge`, and both are INLINE STATUS LABELS
// designed to sit in clusters inside a table cell. Borrowing `Badge` for a
// corner count produced the two faults the owner named on 2026-09-07 - 太大,
// and 颜色没有警示效果.
//
// The size fault was structural rather than cosmetic. `Badge` is fixed at
// `h-control-2xs` with `px-sm`, so a SINGLE DIGIT rendered 30x20 - very nearly
// as wide as the 32px button it hangs on, which is why it read as a second
// control rather than as a mark on the first.
//
// The colour fault is a real disagreement inside the DS, and the DS states the
// losing side of it in its own comment: `destructive` takes a muted fill
// because 「徽章常成片出现，满屏实心红会把整页的视觉重心压到异常状态上」.
// That is correct for inline status labels and false for a corner count -
// there are exactly two on the whole screen and interrupting the eye is the
// entire job. One element cannot serve both, which is why this is a missing
// ELEMENT rather than a missing variant.
//
// WHAT IT MAY AND MAY NOT DO. It restyles nothing. It is its own span, and
// every value in it is a DS token (`--destructive`, `--destructive-foreground`,
// `--card`). It deliberately does NOT wrap `Badge`, so that nothing here is a
// local redefinition of a DS element's surface - TD-006 records why writing
// `bg-destructive` onto the Badge call site was refused, and that reasoning is
// unchanged.
//
// Recovery: when the DS ships a count badge, delete this file and consume it.

export interface CountBadgeProps {
  /** Rendered only when positive - a zero badge is a mark saying "nothing". */
  readonly count: number;
  readonly className?: string;
}

/**
 * 最多两位，超过显示 99 (owner, 2026-09-07).
 *
 * NOT "99+". The owner ruled the plain number, and the ruling holds: the badge
 * is 16px tall, and a third glyph costs a third of its width to carry a
 * distinction nobody acts on differently. Past ninety-nine the message is
 * already "more than you will clear in one sitting", and the exact figure is
 * one click away in the panel the button opens.
 */
export function cappedCount(count: number): string {
  return String(Math.min(count, 99));
}

export function CountBadge({ count, className }: CountBadgeProps) {
  if (count <= 0) return null;

  return (
    <span
      className={cn(
        // A 16px circle at one digit, growing to a pill at two. `min-w` with
        // centred content rather than a fixed width: a circle around "9" and a
        // pill around "42" are one rule, not two cases.
        "inline-flex h-[1rem] min-w-[1rem] items-center justify-center rounded-full px-[0.1875rem]",
        // 实底红 + 白字, both straight off the DS palette. Muted red on a 16px
        // bubble is a pale dot that reads as decoration.
        "bg-destructive text-destructive-foreground",
        // 10px, semibold, tabular. Below the DS's smallest label step on
        // purpose - `text-label-sm` is 12px and does not fit a 16px bubble that
        // also carries padding. Tabular figures stop "11" and "48" rendering at
        // different widths and making the badge twitch as the count moves.
        "text-[0.625rem] font-semibold leading-none tabular-nums",
        // The ring is what makes it legible ON TOP OF an icon rather than
        // beside it: two pixels of the header's own surface separate the red
        // from the glyph underneath, so neither has to give way.
        "ring-2 ring-card",
        className,
      )}
    >
      {cappedCount(count)}
    </span>
  );
}
