"use client";

import type { ReactNode } from "react";
import { useMessages } from "../lib/i18n/provider";
import { ROW_EDGE, SOURCE_CHIP, type RowTone } from "./deal-tone";
import type { BriefTone } from "../../domains/pipeline/lib/brief";

// One next-best-action, visually. Pure presentation - the card that USES this
// binds its own server action and its own error dictionary, one card per file,
// which is the granularity reachable-codes.test.ts pairs at.
//
// THE REASON IS NOT OPTIONAL. A recommendation without its reason is an order
// (the AssistPanel contract, at operation scale), so the layout gives the
// reason a full line rather than a tooltip nobody opens.

const EDGE: Record<BriefTone, RowTone> = { bad: "bad", warn: "warn", good: "good" };

/** YC-072 .action: an edge-toned row - who is speaking, the finding with its
 *  reason under it, the control at the end. */
export function ActionCard({
  severity,
  title,
  reason,
  source = "rule",
  children,
}: {
  readonly severity: BriefTone;
  readonly title: string;
  readonly reason: string;
  /** The chip at the front; null for an entry that is nobody's finding. */
  readonly source?: "rule" | null;
  /** The controls: one-click primary plus the regular path. */
  readonly children?: ReactNode;
}) {
  const { RISK_TEXT } = useMessages();
  return (
    <div
      className={`border-border bg-card flex flex-wrap items-center gap-x-sm gap-y-2xs rounded-r-lg border border-l-[3px] px-sm py-xs ${ROW_EDGE[EDGE[severity]]}`}
    >
      {source ? <span className={SOURCE_CHIP}>{RISK_TEXT.source[source]}</span> : null}
      <div className="min-w-0 flex-[1_1_200px]">
        <p className="text-foreground text-[12.5px] font-bold">{title}</p>
        <p className="text-muted-foreground text-[11.5px]">{reason}</p>
      </div>
      {children ? <div className="ml-auto flex shrink-0 items-center gap-xs">{children}</div> : null}
    </div>
  );
}
