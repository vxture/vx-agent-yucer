"use client";

import type { ReactNode } from "react";
import { Card } from "@vxture/design-ui";
import type { BriefTone } from "../../domains/pipeline/lib/brief";

// One next-best-action, visually. Pure presentation - the card that USES this
// binds its own server action and its own error dictionary, one card per file,
// which is the granularity reachable-codes.test.ts pairs at.
//
// THE REASON IS NOT OPTIONAL. A recommendation without its reason is an order
// (the AssistPanel contract, at operation scale), so the layout gives the
// reason a full line rather than a tooltip nobody opens.

const STRIPE: Record<BriefTone, string> = {
  bad: "border-s-(color:--danger-border)",
  warn: "border-s-(color:--warning-border)",
  good: "border-s-(color:--success-border)",
};

export function ActionCard({
  severity,
  title,
  reason,
  children,
}: {
  readonly severity: BriefTone;
  readonly title: string;
  readonly reason: string;
  /** The controls: one-click primary plus the regular path. */
  readonly children?: ReactNode;
}) {
  return (
    <Card className={`border-s-2 p-md ${STRIPE[severity]}`}>
      <div className="flex flex-wrap items-center justify-between gap-sm">
        <div className="min-w-0">
          <p className="text-foreground text-body-sm font-medium">{title}</p>
          <p className="text-muted-foreground mt-xs text-body-sm">{reason}</p>
        </div>
        {children ? <div className="flex shrink-0 items-center gap-sm">{children}</div> : null}
      </div>
    </Card>
  );
}
