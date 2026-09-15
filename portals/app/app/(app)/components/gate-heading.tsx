"use client";

import type { ReactNode } from "react";
import { StatusBadge, type IconName } from "@vxture/design-ui";

// The heading every gate screen's middle band opens with.
//
// ONE SHAPE FOR ALL FOUR (owner, 2026-09-15: the refusal screens are to have
// exactly the same format). A state label, the statement, and one line under
// it - and the label hangs off the top-left corner of the statement rather
// than floating centred above it, so the eye lands on the sentence and reads
// the state as an annotation of it.
//
// Left-aligned to the block, not centred, because that is what a corner label
// is: centring it produced two centred things stacked, which reads as two
// headings rather than a heading and its tag.

export function GateHeading({
  badge,
  badgeIcon,
  title,
  description,
}: {
  /** The state, as a short label. Omitted where there is no state to name. */
  readonly badge?: ReactNode;
  readonly badgeIcon?: IconName;
  readonly title: ReactNode;
  readonly description?: ReactNode;
}) {
  return (
    <div className="gap-sm flex flex-col items-center text-center">
      <div className="gap-2xs flex flex-col items-start">
        {badge && (
          <StatusBadge tone="info" icon={badgeIcon}>
            {badge}
          </StatusBadge>
        )}
        <h1 className="text-heading-2 text-balance">{title}</h1>
      </div>

      {description && (
        <p className="text-body-md text-muted-foreground">{description}</p>
      )}
    </div>
  );
}
