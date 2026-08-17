"use client";

import { useState, useTransition } from "react";
import { Button, DataTable, EmptyState, Input, Label, NativeSelect, Section, StatusBadge, Textarea, type DataTableColumn } from "@vxture/design-ui";
import type { OpportunityRecord } from "../../domains/pipeline/store";
import { WINLOSS_REASON_LABEL, WINLOSS_TEXT } from "../lib/messages";
import { formatMoney } from "../lib/view-model";

// Closed deals still owing a post-mortem.
//
// The spec says entering a terminal stage MUST produce a review. Closing does
// not block on it - blocking would push people to leave deals open instead, and
// an open deal that is really lost distorts every forecast number. So the debt
// is made VISIBLE here instead, which is what turns "must" from a sentence in a
// document into something a person can act on.
//
// The form does not ask for the outcome. It is derived from the deal's own
// status server-side: a review claiming "won" on a lost deal would corrupt the
// dataset the whole learning loop reads.

export interface PendingReviewsProps {
  readonly opportunities: readonly OpportunityRecord[];
  readonly canRecord: boolean;
  readonly onRecord: (
    opportunityId: string,
    input: { primaryReason: string | null; competitor?: string; lessons?: string },
  ) => Promise<{ ok: boolean; error?: string }>;
}

const REASONS = ["price", "fit", "timing", "competitor", "no_decision", "other"] as const;

export function PendingReviews({ opportunities, canRecord, onRecord }: PendingReviewsProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [reason, setReason] = useState<string>("fit");
  const [competitor, setCompetitor] = useState("");
  const [lessons, setLessons] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(id: string) {
    setError(null);
    startTransition(() => {
      void onRecord(id, { primaryReason: reason, competitor, lessons }).then((r) => {
        if (!r.ok) {
          setError(r.error ?? "denied");
          return;
        }
        setOpenId(null);
        setCompetitor("");
        setLessons("");
      });
    });
  }

  const columns: readonly DataTableColumn<OpportunityRecord>[] = [
    {
      id: "name",
      header: WINLOSS_TEXT.columnOpportunity,
      cell: (row) => (
        <div>
          <div>{row.name}</div>
          <div>{row.opportunityNo}</div>
        </div>
      ),
    },
    {
      id: "outcome",
      header: WINLOSS_TEXT.columnOutcome,
      cell: (row) => (
        <StatusBadge tone={row.status === "won" ? "success" : "danger"} dot>
          {row.status === "won" ? WINLOSS_TEXT.outcomeWon : WINLOSS_TEXT.outcomeLost}
        </StatusBadge>
      ),
    },
    {
      id: "amount",
      header: WINLOSS_TEXT.columnAmount,
      align: "right",
      cell: (row) => formatMoney(row.amount?.amount ?? null, row.currency),
    },
    {
      id: "closed",
      header: WINLOSS_TEXT.columnClosed,
      cell: (row) => (row.closedAt ? row.closedAt.toISOString().slice(0, 10) : "-"),
    },
    {
      id: "actions",
      header: "",
      align: "right",
      cell: (row) =>
        canRecord ? (
          <Button
            variant={openId === row.id ? "secondary" : "outline"}
            size="sm"
            onClick={() => setOpenId(openId === row.id ? null : row.id)}
          >
            {WINLOSS_TEXT.record}
          </Button>
        ) : null,
    },
  ];

  const target = opportunities.find((o) => o.id === openId) ?? null;

  return (
    <Section title={WINLOSS_TEXT.title} description={WINLOSS_TEXT.description}>
      {error ? <StatusBadge tone="danger">{error}</StatusBadge> : null}

      {opportunities.length === 0 ? (
        <EmptyState title={WINLOSS_TEXT.emptyTitle} description={WINLOSS_TEXT.emptyDescription} />
      ) : (
        <DataTable columns={columns} rows={opportunities} rowKey={(row) => row.id} />
      )}

      {target ? (
        <Section tone="default" title={target.name}>
          <Label htmlFor="wlr-reason">{WINLOSS_TEXT.reasonLabel}</Label>
          <NativeSelect
            id="wlr-reason"
            value={reason}
            onChange={(e) => setReason(e.currentTarget.value)}
          >
            {REASONS.map((r) => (
              <option key={r} value={r}>
                {WINLOSS_REASON_LABEL[r]}
              </option>
            ))}
          </NativeSelect>

          <Label htmlFor="wlr-competitor">{WINLOSS_TEXT.competitorLabel}</Label>
          <Input
            id="wlr-competitor"
            value={competitor}
            onChange={(e) => setCompetitor(e.currentTarget.value)}
          />

          <Label htmlFor="wlr-lessons">{WINLOSS_TEXT.lessonsLabel}</Label>
          <Textarea id="wlr-lessons" value={lessons} onChange={(e) => setLessons(e.currentTarget.value)} />

          <Button variant="ghost" onClick={() => setOpenId(null)} disabled={pending}>
            {WINLOSS_TEXT.cancel}
          </Button>
          <Button onClick={() => submit(target.id)} disabled={pending}>
            {WINLOSS_TEXT.save}
          </Button>
        </Section>
      ) : null}
    </Section>
  );
}
