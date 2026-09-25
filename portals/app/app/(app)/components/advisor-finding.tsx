"use client";

import { useState, useTransition } from "react";
import { Button, StatusBadge } from "@vxture/design-ui";
import { SOURCE_CHIP_MODEL } from "./deal-tone";
import { useMessages } from "../lib/i18n/provider";
import type { Decision } from "../../domains/copilot/lib/action";

// 发现行 - the advisor's in-place proposal (YC-069 §07, deal batch 4b): right
// under the fact it would change, marked 智能分析, with the words from the
// record it rests on. 采纳 accepts AND carries it out (the queue's own
// action); 忽略 rejects it, which is also what stops the same words being
// proposed again (YC-070). The model never writes the fact itself (ADR-003).

export interface FindingItem {
  readonly id: string;
  readonly text: string;
  /** The exact words from the record. */
  readonly quote: string | null;
  /** Where the words are from ("09-15 电话"). */
  readonly source: string | null;
  /** The per-row gate (YC-042). */
  readonly decidable: boolean;
}

export function AdvisorFinding({
  items,
  onAdjudicate,
}: {
  readonly items: readonly FindingItem[];
  readonly onAdjudicate: (
    ids: string[],
    decision: Decision,
  ) => Promise<{
    ok: boolean;
    decided: string[];
    skipped: Array<{ id: string; reason: string }>;
    failed: Array<{ id: string; reason: string }>;
    error?: string;
  }>;
}) {
  const { DEAL_PAGE_TEXT, PROPOSAL_ERROR } = useMessages();
  const [done, setDone] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const decide = (id: string, decision: Decision) =>
    start(async () => {
      setError(null);
      const r = await onAdjudicate([id], decision);
      const refusal = r.failed.find((f) => f.id === id)?.reason ?? r.skipped.find((f) => f.id === id)?.reason;
      if (r.ok && r.decided.includes(id) && !refusal) {
        setDone((d) => new Set([...d, id]));
        return;
      }
      setError(PROPOSAL_ERROR[refusal ?? r.error ?? "not_found"] ?? PROPOSAL_ERROR.not_found ?? null);
    });

  const shown = items.filter((i) => !done.has(i.id));
  if (shown.length === 0 && !error) return null;
  return (
    <div className="flex flex-col gap-xs">
      {shown.map((i) => (
        // ONE WRAPPING ROW (YC-072 .finding): the mark, what it says with the
        // words it rests on under it, the two verbs at the end - on the same
        // line in 栏2's wide column, wrapped under the text in 栏1's narrow one.
        <div
          key={i.id}
          className="border-primary/40 bg-card flex flex-wrap items-center gap-x-sm gap-y-2xs rounded-md border border-dashed px-sm py-xs text-body-sm"
        >
          <span className={SOURCE_CHIP_MODEL}>{DEAL_PAGE_TEXT.findingSource}</span>
          <div className="min-w-0 flex-[1_1_200px]">
            <p className="text-foreground">{i.text}</p>
            {i.quote ? <p className="text-muted-foreground text-[11px]">{DEAL_PAGE_TEXT.findingQuote(i.source, i.quote)}</p> : null}
          </div>
          {i.decidable ? (
            <span className="ml-auto flex flex-none items-center gap-2xs">
              <Button size="xs" variant="outline" disabled={pending} onClick={() => decide(i.id, "reject")}>
                {DEAL_PAGE_TEXT.findingIgnore}
              </Button>
              <Button size="xs" disabled={pending} onClick={() => decide(i.id, "accept")}>
                {DEAL_PAGE_TEXT.findingAccept}
              </Button>
            </span>
          ) : null}
        </div>
      ))}
      {error ? <StatusBadge tone="danger">{error}</StatusBadge> : null}
    </div>
  );
}
