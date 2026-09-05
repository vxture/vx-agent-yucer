"use client";

import { useState, useTransition } from "react";
import { Button, StatusBadge } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import { ActionCard } from "./action-card";
import type { BriefTone } from "../../domains/pipeline/lib/brief";
import type { Decision } from "../../domains/copilot/lib/action";

// One-click: adjudicate the copilot's queued proposals for THIS deal.
//
// ACCEPT IS PER-PROPOSAL AND NAMED; reject-all is deliberately absent. The
// queue page can reject with a reason; a card that could sweep the machine's
// findings away in one anonymous click would teach people to do exactly that.
// Accepting EXECUTES (adjudicateProposals runs copilot.execute for accepted
// ids), so the button text says what will happen, not "accept".
// ONE CARD PER FILE - reachable-codes.test.ts pairs at file granularity.

export function ProposalActionCard({
  proposals,
  severity,
  reason,
  onAdjudicate,
}: {
  readonly proposals: readonly { readonly id: string; readonly title: string }[];
  readonly severity: BriefTone;
  readonly reason: string;
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
  const { WAR_ROOM_TEXT, PROPOSAL_ERROR } = useMessages();
  const [decided, setDecided] = useState<ReadonlySet<string>>(new Set());
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function accept(id: string) {
    start(() => {
      void onAdjudicate([id], "accept").then((r) => {
        if (r.decided.includes(id)) {
          setDecided((prev) => new Set([...prev, id]));
          setErr(null);
          return;
        }
        // The result names WHY per id - skipped (already decided elsewhere)
        // and failed (accepted, tried, refused) are different findings, and
        // the queue's own dictionary already has sentences for both.
        const reason =
          r.failed.find((f) => f.id === id)?.reason ??
          r.skipped.find((f) => f.id === id)?.reason ??
          r.error ??
          "not_found";
        setErr(PROPOSAL_ERROR[reason] ?? PROPOSAL_ERROR.not_found);
      });
    });
  }

  return (
    <ActionCard severity={severity} title={WAR_ROOM_TEXT.proposalsTitle(proposals.length)} reason={reason}>
      <div className="flex flex-col items-end gap-xs">
        {proposals.map((p) => (
          <div key={p.id} className="flex items-center gap-sm">
            <span className="text-muted-foreground max-w-[16rem] truncate text-body-sm">{p.title}</span>
            {decided.has(p.id) ? (
              <StatusBadge tone="success">{WAR_ROOM_TEXT.accepted}</StatusBadge>
            ) : (
              <Button size="sm" disabled={pending} onClick={() => accept(p.id)}>
                {WAR_ROOM_TEXT.acceptAndExecute}
              </Button>
            )}
          </div>
        ))}
        <a className="text-body-sm underline" href="/copilot">
          {WAR_ROOM_TEXT.toQueue}
        </a>
        {err ? <StatusBadge tone="danger">{err}</StatusBadge> : null}
      </div>
    </ActionCard>
  );
}
