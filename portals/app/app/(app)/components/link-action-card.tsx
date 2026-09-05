"use client";

import { Button } from "@vxture/design-ui";
import { ActionCard } from "./action-card";
import type { BriefTone } from "../../domains/pipeline/lib/brief";

// A next-best-action whose right answer is a PLACE, not a click.
//
// Two of the brief's findings deliberately do not get one-click fixes:
// stating who signs (a judgement about people) and approving a below-floor
// line (money, which must be seen line by line before it is signed). For
// those the card carries the finding and TAKES you to the control that
// already exists - same page, anchored - rather than duplicating a lesser
// copy of it here. No action bound, no dictionary needed.

export function LinkActionCard({
  severity,
  title,
  reason,
  href,
  cta,
}: {
  readonly severity: BriefTone;
  readonly title: string;
  readonly reason: string;
  readonly href: string;
  readonly cta: string;
}) {
  return (
    <ActionCard severity={severity} title={title} reason={reason}>
      <Button asChild size="sm" variant="outline">
        <a href={href}>{cta}</a>
      </Button>
    </ActionCard>
  );
}
