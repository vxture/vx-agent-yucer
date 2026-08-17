"use client";

import { useState, useTransition } from "react";
import { Button, DataTable, EmptyState, Section, StatusBadge, Tooltip, TooltipContent, TooltipTrigger, type DataTableColumn } from "@vxture/design-ui";
import type { LeadRecord } from "../../domains/signal/store";
import { LEAD_STATUS_LABEL, LEAD_TEXT } from "../lib/messages";
import { confidenceTone } from "../lib/view-model";
import type { LeadAction, LeadActionResult } from "../signal/lead-actions";

// The lead list, and the button that walks the attribution seam.
//
// Two things this surface is careful about:
//
//   - Convert is offered only for a QUALIFIED lead with an account. The rules
//     refuse otherwise, and rendering a button that is guaranteed to fail
//     teaches people to expect errors. An unmatched lead shows why instead.
//   - After a conversion it reports which attribution was recorded. That value
//     is frozen from this moment and can never be corrected through the
//     product, so the one time to show it is when it is decided.

export interface LeadListProps {
  readonly leads: readonly LeadRecord[];
  readonly canTriage: boolean;
  readonly canConvert: boolean;
  readonly onAct: (leadId: string, action: LeadAction) => Promise<LeadActionResult>;
}

const SOURCE_LABEL: Record<string, string> = {
  campaign: LEAD_TEXT.sourceCampaign,
  signal_campaign: LEAD_TEXT.sourceSignalCampaign,
  self_sourced: LEAD_TEXT.sourceSelf,
};

export function LeadList({ leads, canTriage, canConvert, onAct }: LeadListProps) {
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  function act(id: string, action: LeadAction) {
    setBusyId(id);
    setNote(null);
    startTransition(() => {
      void onAct(id, action)
        .then((r) => {
          if (r.ok && r.opportunityNo) {
            // Attribution is frozen from here. This is the only moment it is
            // worth stating, because it can never be changed afterwards.
            setNote(
              `${r.opportunityNo} - ${SOURCE_LABEL[r.attributionSource ?? ""] ?? r.attributionSource ?? ""}`,
            );
          }
        })
        .finally(() => setBusyId(null));
    });
  }

  const columns: readonly DataTableColumn<LeadRecord>[] = [
    {
      id: "company",
      header: LEAD_TEXT.columnCompany,
      cell: (row) => (
        <div>
          <div>{row.companyName}</div>
          <div>
            {row.leadNo}
            {row.contactName ? ` / ${row.contactName}` : ""}
          </div>
        </div>
      ),
    },
    {
      id: "score",
      header: LEAD_TEXT.columnScore,
      align: "right",
      cell: (row) =>
        row.score == null ? "-" : <StatusBadge tone={confidenceTone(row.score)}>{row.score}</StatusBadge>,
    },
    {
      id: "source",
      header: LEAD_TEXT.columnSource,
      cell: (row) =>
        row.campaignId ? (
          <StatusBadge tone="info">{LEAD_TEXT.sourceCampaign}</StatusBadge>
        ) : row.signalId ? (
          <StatusBadge tone="neutral">{LEAD_TEXT.sourceSignalCampaign}</StatusBadge>
        ) : (
          <StatusBadge tone="neutral">{LEAD_TEXT.sourceSelf}</StatusBadge>
        ),
    },
    { id: "owner", header: LEAD_TEXT.columnOwner, cell: (row) => row.ownerSub ?? "-" },
    {
      id: "status",
      header: LEAD_TEXT.columnStatus,
      cell: (row) => (
        <StatusBadge tone={row.status === "converted" ? "success" : "neutral"} dot>
          {LEAD_STATUS_LABEL[row.status] ?? row.status}
        </StatusBadge>
      ),
    },
    {
      id: "actions",
      header: "",
      align: "right",
      cell: (row) => {
        const busy = pending && busyId === row.id;
        if (row.status === "converted" || row.status === "disqualified") return null;

        return (
          <>
            {canTriage && row.status !== "qualified" ? (
              <>
                <Button variant="ghost" size="sm" disabled={busy} onClick={() => act(row.id, "disqualify")}>
                  {LEAD_TEXT.disqualify}
                </Button>
                <Button variant="outline" size="sm" disabled={busy} onClick={() => act(row.id, "qualify")}>
                  {LEAD_TEXT.qualify}
                </Button>
              </>
            ) : null}

            {canConvert && row.status === "qualified" ? (
              row.accountId ? (
                <Button size="sm" disabled={busy} onClick={() => act(row.id, "convert")}>
                  {LEAD_TEXT.convert}
                </Button>
              ) : (
                // The rule refuses without an account. Say why rather than
                // offering a button that is guaranteed to fail.
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Button size="sm" disabled>
                        {LEAD_TEXT.convert}
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>{LEAD_TEXT.needAccount}</TooltipContent>
                </Tooltip>
              )
            ) : null}
          </>
        );
      },
    },
  ];

  return (
    <Section title={LEAD_TEXT.title} description={LEAD_TEXT.description}>
      {note ? <StatusBadge tone="success">{note}</StatusBadge> : null}
      {leads.length === 0 ? (
        <EmptyState title={LEAD_TEXT.emptyTitle} description={LEAD_TEXT.emptyDescription} />
      ) : (
        <DataTable columns={columns} rows={leads} rowKey={(row) => row.id} />
      )}
    </Section>
  );
}
