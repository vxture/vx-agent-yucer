"use client";

import { Icon } from "@vxture/design-ui";

// THE FOLD ARROW ON A CASCADING TABLE ROW (owner, 2026-09-30: 组织架构 is the
// reference; 权限视图 and the org unit list were too big, tinted, and lit up
// on hover). One component, so the four trees cannot drift apart again.
//
// A BARE BUTTON ON PURPOSE, not the DS Button. Its ghost variant tiles on
// hover and tints on aria-expanded, and its icon sizes start at 32px - each
// the "常态背景 / hover 背景" the owner asked to lose. Everything here is the
// muted glyph at 24px, turning foreground on hover; the state is the glyph
// itself (right = folded, down = open) and the label.

export const TREE_TOGGLE_SIZE = "size-6";

export function TreeToggle({
  expanded,
  label,
  onToggle,
}: {
  readonly expanded: boolean;
  /** What the button acts on, e.g. the row's name - read out with the state. */
  readonly label: string;
  readonly onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className={`text-muted-foreground hover:text-foreground flex ${TREE_TOGGLE_SIZE} shrink-0 cursor-pointer items-center justify-center`}
      aria-expanded={expanded}
      aria-label={label}
      onClick={onToggle}
    >
      <Icon name={expanded ? "chevron-down" : "chevron-right"} size="xs" />
    </button>
  );
}

/** A leaf keeps the arrow's width, so titles line up down a level. */
export function TreeToggleSpacer() {
  return <span className={`${TREE_TOGGLE_SIZE} shrink-0`} aria-hidden />;
}
