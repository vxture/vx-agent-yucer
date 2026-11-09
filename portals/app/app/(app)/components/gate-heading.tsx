"use client";

import type { ReactNode } from "react";
import styles from "./public-page.module.css";
import { StatusBadge, type IconName } from "@vxture/design-ui";

// The heading every gate screen's middle band opens with.
//
// ONE SHAPE FOR ALL FOUR (owner, 2026-09-15: the refusal screens are to have
// exactly the same format). A statement, a state label beside it, and one line
// under it.
//
// THE LABEL LEADS THE SECOND LINE. It has been a centred badge above the
// title, then hung off its top-left corner, then set beside it on the right -
// and beside a heading is where it looked worst, because a badge is the size
// of body text and a heading is not, so it hung there unattached to anything.
// On the line it now leads it is the same height as the sentence it prefixes,
// and it reads as what it is: the state, and then what to do about it.

export function GateHeading({
  badge,
  badgeIcon,
  title,
  description,
}: {
  /** The state, as a short label leading the line under the title. Omitted
   *  when there is no state to name - the door and the sign-out confirmation
   *  pass none. */
  readonly badge?: ReactNode;
  readonly badgeIcon?: IconName;
  readonly title: ReactNode;
  readonly description?: ReactNode;
}) {
  return (
    <div className={styles.stateHeading}>
      <h1 >{title}</h1>

      {(badge || description) && (
        <p className={styles.stateDescription}>
          {badge && (
            <StatusBadge tone="info" size="xs" icon={badgeIcon}>
              {badge}
            </StatusBadge>
          )}
          {description}
        </p>
      )}
    </div>
  );
}
