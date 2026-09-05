"use client";

import { useState, useTransition } from "react";
import { Button, StatusBadge } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import { ActionCard } from "./action-card";
import type { BriefTone } from "../../domains/pipeline/lib/brief";

// One-click: settle an overdue commitment from the deal it blocks.
//
// TWO CLICKS OFFERED, NOT ONE, because an overdue promise has two honest
// endings and they are opposites: it was met (evidence exists somewhere) or it
// was missed. A single "clear it" button would decide which - and that
// decision is the reliability figure's input, so it stays with the person.
// Waiving needs a reason and stays on the commitment list, the regular path.
// ONE CARD PER FILE - reachable-codes.test.ts pairs at file granularity.

export function CommitmentActionCard({
  accountId,
  opportunityId,
  commitmentId,
  statement,
  severity,
  reason,
  onSettle,
}: {
  readonly accountId: string;
  readonly opportunityId: string;
  readonly commitmentId: string;
  readonly statement: string;
  readonly severity: BriefTone;
  readonly reason: string;
  readonly onSettle: (
    accountId: string,
    id: string,
    input: { to: string; opportunityId?: string },
  ) => Promise<{ ok: boolean; error?: string }>;
}) {
  const { WAR_ROOM_TEXT, FIELD_ERROR } = useMessages();
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function settle(to: "met" | "missed") {
    start(() => {
      void onSettle(accountId, commitmentId, { to, opportunityId }).then((r) => {
        setErr(r.ok ? null : (FIELD_ERROR[r.error ?? "denied"] ?? FIELD_ERROR.denied));
        setDone(r.ok ? to : null);
      });
    });
  }

  return (
    <ActionCard severity={severity} title={WAR_ROOM_TEXT.settleTitle(statement)} reason={reason}>
      {done ? (
        <StatusBadge tone="success">{WAR_ROOM_TEXT.settled}</StatusBadge>
      ) : (
        <>
          <Button size="sm" disabled={pending} onClick={() => settle("met")}>
            {WAR_ROOM_TEXT.settleMet}
          </Button>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => settle("missed")}>
            {WAR_ROOM_TEXT.settleMissed}
          </Button>
        </>
      )}
      {err ? <StatusBadge tone="danger">{err}</StatusBadge> : null}
    </ActionCard>
  );
}
