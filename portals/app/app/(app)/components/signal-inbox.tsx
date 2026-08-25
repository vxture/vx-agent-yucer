"use client";

import { useState, useTransition } from "react";
import { Button, DataTable, EmptyState, Section, StatusBadge, Tooltip, TooltipContent, TooltipTrigger, type DataTableColumn } from "@vxture/design-ui";
import type { SignalRecord } from "../../domains/signal/store";
import { SIGNAL_STATUS_LABEL, SIGNAL_TEXT, SIGNAL_TYPE_LABEL } from "../lib/messages";
import { confidenceTone, type Tone } from "../lib/view-model";

// The signal inbox: the detective domain's working surface.
//
// One presentation decision carries a product rule. An unmatched signal shows
// "new logo" rather than a blank or a dash, because an unrecognised company is
// the most valuable thing this domain finds - the spec is explicit that a
// missing account match must not be treated as a defect. Rendering it as
// absence would teach a salesperson to skip exactly the rows worth reading.

export type SignalAction = "promote" | "dismiss" | "duplicate" | "rescore";

export interface SignalInboxProps {
  readonly signals: readonly SignalRecord[];
  readonly canTriage: boolean;
  readonly canRescore: boolean;
  /** Server action. The client sends the id and the verb, never a computed patch. */
  readonly onAct: (signalId: string, action: SignalAction) => void | Promise<unknown>;
}

function scoreTone(score: number | null): Tone {
  return confidenceTone(score);
}

export function SignalInbox({ signals, canTriage, canRescore, onAct }: SignalInboxProps) {
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  function act(id: string, action: SignalAction) {
    setBusyId(id);
    startTransition(() => {
      void Promise.resolve(onAct(id, action)).finally(() => setBusyId(null));
    });
  }

  const columns: readonly DataTableColumn<SignalRecord>[] = [
    {
      id: "subject",
      header: SIGNAL_TEXT.columnSubject,
      cell: (row) => (
        <div>
          <div>{row.subject}</div>
          <div>{row.sourceRef ?? row.source}</div>
        </div>
      ),
    },
    {
      id: "type",
      header: SIGNAL_TEXT.columnType,
      cell: (row) => <StatusBadge tone="neutral">{SIGNAL_TYPE_LABEL[row.signalType] ?? row.signalType}</StatusBadge>,
    },
    {
      id: "score",
      header: SIGNAL_TEXT.columnScore,
      align: "right",
      cell: (row) =>
        row.score == null ? (
          <StatusBadge tone="neutral">{SIGNAL_TEXT.unscored}</StatusBadge>
        ) : (
          <StatusBadge tone={scoreTone(row.score)}>{row.score}</StatusBadge>
        ),
    },
    {
      id: "account",
      header: SIGNAL_TEXT.columnAccount,
      // An unmatched signal is a NEW LOGO, not missing data. Showing a dash here
      // would train people to ignore the rows this domain exists to surface.
      cell: (row) =>
        row.accountId ? (
          <span>{row.accountId.slice(0, 8)}</span>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <StatusBadge tone="brand">{SIGNAL_TEXT.unmatchedAccount}</StatusBadge>
              </span>
            </TooltipTrigger>
            <TooltipContent>{SIGNAL_TEXT.description}</TooltipContent>
          </Tooltip>
        ),
    },
    {
      id: "detected",
      header: SIGNAL_TEXT.columnDetected,
      cell: (row) => row.detectedAt.toISOString().slice(0, 10),
    },
    {
      id: "status",
      header: SIGNAL_TEXT.columnStatus,
      cell: (row) => (
        <StatusBadge tone={row.status === "promoted" ? "success" : "neutral"} dot>
          {SIGNAL_STATUS_LABEL[row.status] ?? row.status}
        </StatusBadge>
      ),
    },
    {
      id: "actions",
      header: "",
      align: "right",
      cell: (row) => {
        const busy = pending && busyId === row.id;
        // Terminal statuses offer nothing: a dismissed or duplicate signal is
        // out of the funnel, and a promoted one already produced its lead.
        if (row.status === "dismissed" || row.status === "duplicate" || row.status === "promoted") {
          return null;
        }
        return (
          <>
            {canRescore ? (
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => act(row.id, "rescore")}>
                {SIGNAL_TEXT.rescore}
              </Button>
            ) : null}
            {canTriage ? (
              <>
                <Button variant="ghost" size="sm" disabled={busy} onClick={() => act(row.id, "duplicate")}>
                  {SIGNAL_TEXT.markDuplicate}
                </Button>
                <Button variant="outline" size="sm" disabled={busy} onClick={() => act(row.id, "dismiss")}>
                  {SIGNAL_TEXT.dismiss}
                </Button>
                <Button
                  size="sm"
                  // Promotion needs a score - the rule refuses otherwise, and
                  // offering the button anyway would just produce an error.
                  disabled={busy || row.score == null}
                  onClick={() => act(row.id, "promote")}
                >
                  {SIGNAL_TEXT.promote}
                </Button>
              </>
            ) : null}
          </>
        );
      },
    },
  ];

  return (
    <Section title={SIGNAL_TEXT.title} description={SIGNAL_TEXT.description}>
      {signals.length === 0 ? (
        <EmptyState title={SIGNAL_TEXT.emptyTitle} description={SIGNAL_TEXT.emptyDescription} />
      ) : (
        <DataTable leadingSpacer indexStart={1} columns={columns} rows={signals} rowKey={(row) => row.id} />
      )}
    </Section>
  );
}
