"use client";

import type { ReactNode } from "react";
import { StatusBadge, type IconName } from "@vxture/design-ui";

// The heading every gate screen's middle band opens with.
//
// ONE SHAPE FOR ALL FOUR (owner, 2026-09-15: the refusal screens are to have
// exactly the same format). A statement, a state label beside it, and one line
// under it.
//
// THE LABEL SITS TO THE RIGHT OF THE TITLE, ON THE SAME LINE, ALIGNED TO ITS
// TOP. It was a centred badge stacked above the title, which read as two
// headings rather than a heading and its tag; a first correction hung it off
// the top-left corner, which the owner then placed on the right instead.
// `items-start` is what does the aligning - the badge is half the title's
// height, so anything else leaves it floating in the middle of the line.

export function GateHeading({
  badge,
  badgeIcon,
  title,
  description,
}: {
  /** The state, as a short label beside the title. Omitted when there is no
   *  state to name - the door and the sign-out confirmation pass none. */
  readonly badge?: ReactNode;
  readonly badgeIcon?: IconName;
  readonly title: ReactNode;
  readonly description?: ReactNode;
}) {
  return (
    <div className="gap-sm flex flex-col items-center text-center">
      <div className="gap-sm flex items-start justify-center">
        <h1 className="text-heading-2 text-balance">{title}</h1>
        {badge && (
          <StatusBadge tone="info" icon={badgeIcon}>
            {badge}
          </StatusBadge>
        )}
      </div>

      {description && (
        <p className="text-body-md text-muted-foreground">{description}</p>
      )}
    </div>
  );
}
