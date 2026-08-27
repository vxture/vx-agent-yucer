"use client";

import { ShellIconButton } from "@vxture/design-system";
import { Badge } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";

// The header's handle on the agent deck.
//
// It is the one control that has to work when the right flank is shut, which is
// most of the time on anything narrower than a desk monitor - so it carries the
// count itself. A toggle that only said "open the agent" would make "is anything
// waiting for me?" cost a click, and a question that costs a click gets asked
// once a day instead of whenever it matters.
//
// The count is the number of proposals awaiting THIS member's decision, not a
// generic unread tally: the agent proposes and a human decides (ADR-003), so the
// only number worth interrupting someone with is the one they alone can clear.
//
// NO `active` FILL, for the same reason the board toggle dropped one: an
// active state earns its weight when the state it reports is otherwise
// invisible, and the deck is right there on screen when it is open. Two of the
// three header icon buttons painting themselves accent-blue made the two
// carrying the least information the heaviest objects in the bar. The count
// badge is the thing worth seeing here, and it was competing with a fill.
//
// COMPOSITION, not restyling. The badge is a sibling of the DS button inside a
// relative wrapper rather than a replacement for its children, so the button
// keeps its own icon, sizing and focus ring exactly as the DS draws them, and
// nothing here overrides a DS class.
//
// It is NOT the solid-red bubble that was asked for, and that is not an
// oversight - see TD-006. The DS has no compact count badge, and its nearest
// element refuses a solid red on the record: badgeVariants' destructive variant
// is `bg-destructive-muted`, with the stated reason that badges arrive in
// clusters and a screenful of solid red drags a page's visual weight onto its
// error states. Overriding that fill here would be a local restyle of the DS,
// the exact deviation CLAUDE.md's rigid zone forbids. So this uses the DS's
// danger badge as the DS draws it, and the gap is registered rather than
// papered over.

export interface AgentDockButtonProps {
  readonly count: number;
  readonly open: boolean;
  readonly onToggle: () => void;
}

export function AgentDockButton({
  count,
  open,
  onToggle,
}: AgentDockButtonProps) {
  const { HEADER_TEXT } = useMessages();
  // The accessible name carries the count too. A screen reader landing on a bare
  // "智能助手" would get the badge as a separate, contextless number.
  const label =
    count > 0 ? HEADER_TEXT.agentDockWithCount(count) : HEADER_TEXT.agentDock;

  return (
    <span className="relative inline-flex">
      <ShellIconButton icon="sparkles" label={label} onClick={onToggle} />

      {count > 0 ? (
        // aria-hidden because the count is already in the button's label; a
        // screen reader should hear it once, attached to the control it
        // describes, not twice as a loose number beside it.
        <span
          className="pointer-events-none absolute -top-2xs -right-2xs"
          aria-hidden="true"
        >
          <Badge variant="destructive">
            {/* Past two digits the badge would be wider than the button it sits
                on. The exact number stops being the point long before then - the
                message is "more than you will clear in one sitting". */}
            {count > 99 ? HEADER_TEXT.countOverflow : count}
          </Badge>
        </span>
      ) : null}
    </span>
  );
}
