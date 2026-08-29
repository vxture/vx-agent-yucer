"use client";

import { useState, useTransition } from "react";
import {
  ActionMenu,
  DataTable,
  EmptyState,
  FilterBar,
  ListCard,
  ListCardGrid,
  Section,
  StatusBadge,
  type DataTableColumn,
} from "@vxture/design-ui";
import { TableCard } from "./table-card";
import type { LeadRecord } from "../../domains/signal/store";
import { useMessages } from "../lib/i18n/provider";
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
  /**
   * What each qualified lead WOULD attribute to, computed by the rule layer
   * (previewAttribution) before anyone converts. Attribution freezes at
   * conversion and is uncorrectable afterwards (ADR-016), so the moment before
   * the click is the one moment this answer is worth anything.
   */
  readonly attributionPreviews: ReadonlyMap<string, { source: string; campaignId: string | null }>;
  readonly canTriage: boolean;
  readonly canConvert: boolean;
  readonly onAct: (
    leadId: string,
    action: LeadAction,
  ) => Promise<LeadActionResult>;
}

export function LeadList({
  leads,
  attributionPreviews,
  canTriage,
  canConvert,
  onAct,
}: LeadListProps) {
  const {
    DATA_TABLE_LABELS,
    DS_LABELS,
    LEAD_STATUS_LABEL,
    LEAD_TEXT,
    PIPELINE_TEXT,
    SIGNAL_ACTION_ERROR,
  } = useMessages();

  // Built here rather than at module scope: it is made OF copy, and copy now
  // depends on the request's locale. A module-level map would have frozen one
  // language at import time - the same trap as a static messages import, just
  // one indirection further away.
  const SOURCE_LABEL: Record<string, string> = {
    campaign: LEAD_TEXT.sourceCampaign,
    signal_campaign: LEAD_TEXT.sourceSignalCampaign,
    self_sourced: LEAD_TEXT.sourceSelf,
  };

  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "cards">("list");

  function act(id: string, action: LeadAction) {
    setBusyId(id);
    setNote(null);
    setError(null);
    startTransition(() => {
      void onAct(id, action)
        .then((r) => {
          // A refusal used to vanish here: only the success branch was read,
          // so a failed conversion left the screen exactly as it was. Silence
          // is worse than a wrong sentence - the user retries, then blames the
          // click, then the product (TD-010 sweep).
          if (!r.ok) {
            setError(SIGNAL_ACTION_ERROR[r.error ?? "denied"] ?? SIGNAL_ACTION_ERROR.not_found);
            return;
          }
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
        row.score == null ? (
          "-"
        ) : (
          <StatusBadge tone={confidenceTone(row.score)}>
            {row.score}
          </StatusBadge>
        ),
    },
    {
      id: "source",
      header: LEAD_TEXT.columnSource,
      // The RULE's answer where it has one. This cell used to re-derive the
      // attribution client-side (campaignId ? campaign : signalId ? ... ), a
      // second implementation of resolveAttribution that could drift from what
      // conversion would actually freeze. For qualified leads the rule is
      // asked; for the rest the derivation stays, labelled by the same map.
      cell: (row) => {
        const preview = attributionPreviews.get(row.id);
        const source = preview
          ? preview.source
          : row.campaignId
            ? "campaign"
            : row.signalId
              ? "signal_campaign"
              : "self_sourced";
        return (
          <StatusBadge tone={source === "campaign" ? "info" : "neutral"}>
            {SOURCE_LABEL[source] ?? source}
          </StatusBadge>
        );
      },
    },
    {
      id: "owner",
      header: LEAD_TEXT.columnOwner,
      cell: (row) => row.ownerSub ?? "-",
    },
    {
      id: "status",
      header: LEAD_TEXT.columnStatus,
      cell: (row) => (
        <StatusBadge
          tone={row.status === "converted" ? "success" : "neutral"}
          dot
        >
          {LEAD_STATUS_LABEL[row.status] ?? row.status}
        </StatusBadge>
      ),
    },
  ];

  /* Every verb stays in the menu and the unusable ones say why, rather than the
     row silently offering a different set each time. A menu whose contents
     change per row teaches nobody what the product can do, and "why is this
     greyed out" is answerable where "why is it missing" is not - which matters
     most for convert, whose refusal has a real cause the reader can act on. */
  function LeadActions({ row }: { row: LeadRecord }) {
    const busy = pending && busyId === row.id;
    const terminal =
      row.status === "converted" || row.status === "disqualified";
    const qualified = row.status === "qualified";

    return (
      <ActionMenu
        label={DS_LABELS.actionMenu}
        disabled={busy}
        items={[
          {
            id: "qualify",
            label: LEAD_TEXT.qualify,
            disabled: terminal || !canTriage || qualified,
            hint: terminal
              ? LEAD_TEXT.hintTerminal
              : !canTriage
                ? LEAD_TEXT.hintNoTriage
                : qualified
                  ? LEAD_TEXT.hintAlreadyQualified
                  : undefined,
            onSelect: () => act(row.id, "qualify"),
          },
          {
            id: "convert",
            label: LEAD_TEXT.convert,
            disabled: terminal || !canConvert || !qualified || !row.accountId,
            // The rule refuses without an account. Say why rather than offering
            // something guaranteed to fail.
            hint: terminal
              ? LEAD_TEXT.hintTerminal
              : !canConvert
                ? LEAD_TEXT.hintNoConvert
                : !qualified
                  ? LEAD_TEXT.hintNotQualified
                  : !row.accountId
                    ? LEAD_TEXT.needAccount
                    : undefined,
            onSelect: () => act(row.id, "convert"),
          },
          {
            id: "disqualify",
            label: LEAD_TEXT.disqualify,
            danger: true,
            separatorBefore: true,
            disabled: terminal || !canTriage,
            hint: terminal
              ? LEAD_TEXT.hintTerminal
              : !canTriage
                ? LEAD_TEXT.hintNoTriage
                : undefined,
            // GUARDED, not exempt. design-ui 5.0 makes every danger item choose
            // between a confirmation and a written reason for not having one,
            // and this action does not qualify for the exemption: the list
            // treats disqualified as terminal, so it is one-way from here.
            //
            // No onSelect - the type forbids it alongside confirm, because
            // wiring both fires both.
            confirm: {
              verb: LEAD_TEXT.disqualify,
              target: LEAD_TEXT.disqualifyTarget(row.companyName),
              consequence: LEAD_TEXT.disqualifyConsequence,
              titleTemplate: DS_LABELS.confirmTitleTemplate,
              cancelLabel: DS_LABELS.confirmCancel,
              pendingLabel: DS_LABELS.confirmPending,
              onConfirm: () => act(row.id, "disqualify"),
            },
          },
        ]}
      />
    );
  }

  return (
    <Section
      icon="lightbulb"
      title={LEAD_TEXT.title}
      description={LEAD_TEXT.description}
    >
      {note ? <StatusBadge tone="success">{note}</StatusBadge> : null}
      {error ? <StatusBadge tone="danger">{error}</StatusBadge> : null}
      {leads.length === 0 ? (
        <EmptyState
          title={LEAD_TEXT.emptyTitle}
          description={LEAD_TEXT.emptyDescription}
        />
      ) : (
        <>
          <FilterBar
            view={view}
            onViewChange={setView}
            count={PIPELINE_TEXT.rowCount(leads.length)}
          />

          <TableCard>
            {view === "list" ? (
              <DataTable
                labels={DATA_TABLE_LABELS}
                leadingSpacer
                indexStart={1}
                columns={columns}
                rows={leads}
                rowKey={(row) => row.id}
                rowActions={(row) => <LeadActions row={row} />}
              />
            ) : (
              <ListCardGrid className="p-md">
                {leads.map((row) => (
                  <ListCard
                    key={row.id}
                    title={row.companyName}
                    description={row.contactName ?? row.leadNo}
                    status={
                      <StatusBadge
                        tone={
                          row.status === "converted" ? "success" : "neutral"
                        }
                        dot
                      >
                        {LEAD_STATUS_LABEL[row.status] ?? row.status}
                      </StatusBadge>
                    }
                    actions={<LeadActions row={row} />}
                  />
                ))}
              </ListCardGrid>
            )}
          </TableCard>
        </>
      )}
    </Section>
  );
}
