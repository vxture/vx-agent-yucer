"use client";

import { DataTable, EmptyState, Section, StatusBadge } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import { SaveCell } from "./save-cell";
import { formatMoney } from "../lib/view-model";

// Which subscriptions are coming back round, and one button per project to open
// the deal.
//
// A PROPOSAL, NOT A WRITE. Opening a renewal is a commercial approach to a
// customer - ADR-003's line at its sharpest, and the reason the derivation
// stops at "this is due" rather than creating the opportunity for you. Per-row
// for the same reason routing is: a "renew everything" button would approach a
// dozen customers on one click.
//
// NOT-DUE ROWS STAY IN THE LIST, with their reason. `too_far_out` is only
// noise, but `no_end_date` on a subscription is a data gap that will silently
// cost a renewal, and it is invisible on a page that shows only what is due -
// the same argument that keeps unroutable leads on /routing.
//
// THE RISK COLUMN READS THE DERIVED HEALTH, not the one the delivery team
// reported. Delivery quality is the single thing about a renewal knowable in
// advance, and a green report next to an overdue instalment is precisely the
// case where the reported answer is the wrong one to act on.

export interface RenewalRow {
  readonly projectId: string;
  readonly projectNo: string;
  readonly projectName: string;
  /** Negative once the term has lapsed, which is when it matters most. */
  readonly daysToEnd: number | null;
  readonly amount: number | null;
  readonly currency: string;
  readonly risk: "low" | "watch" | null;
  /** Why it is not due, when it is not. */
  readonly notDueReason: string | null;
}

export interface RenewalTableProps {
  readonly rows: readonly RenewalRow[];
  readonly canOpen: boolean;
  readonly onOpen: (input: {
    projectId: string;
  }) => Promise<{ ok: boolean; error?: string }>;
}

export function RenewalTable({ rows, canOpen, onOpen }: RenewalTableProps) {
  const { DATA_TABLE_LABELS, RENEWAL_TEXT, RENEWAL_ERROR } = useMessages();

  return (
    <Section id="renewal" icon="file-text">
      {rows.length === 0 ? (
        <EmptyState
          title={RENEWAL_TEXT.none}
          description={RENEWAL_TEXT.noneWhy}
        />
      ) : (
        <>
          <DataTable
            labels={DATA_TABLE_LABELS}
            rowKey={(r: RenewalRow) => r.projectId}
            rows={[...rows]}
            columns={[
              {
                id: "project",
                header: RENEWAL_TEXT.colProject,
                cell: (r: RenewalRow) => (
                  <div className="flex flex-col gap-3xs">
                    <span className="text-foreground">{r.projectName}</span>
                    <span className="text-muted-foreground text-body-sm tabular-nums">
                      {r.projectNo}
                    </span>
                  </div>
                ),
              },
              {
                id: "ends",
                header: RENEWAL_TEXT.colEnds,
                cell: (r: RenewalRow) =>
                  r.daysToEnd === null ? (
                    <span className="text-muted-foreground text-body-sm">
                      {RENEWAL_TEXT.noEndDate}
                    </span>
                  ) : r.daysToEnd < 0 ? (
                    // A LAPSED TERM IS NOT "-12 days left". Saying it the other
                    // way round is what makes it read as the most urgent row
                    // rather than the furthest-away one.
                    <StatusBadge tone="danger">
                      {RENEWAL_TEXT.lapsed(-r.daysToEnd)}
                    </StatusBadge>
                  ) : (
                    <span className="text-foreground text-body-sm tabular-nums">
                      {RENEWAL_TEXT.dueIn(r.daysToEnd)}
                    </span>
                  ),
              },
              {
                id: "amount",
                header: RENEWAL_TEXT.colAmount,
                align: "right" as const,
                // WHAT LAST TERM WAS WORTH, carried forward unchanged. What the
                // next one is worth is a negotiation, and seeding it with an
                // invented uplift puts a number nobody chose in front of a
                // customer.
                cell: (r: RenewalRow) => (
                  <span className="text-foreground text-body-sm tabular-nums">
                    {formatMoney(r.amount, r.currency)}
                  </span>
                ),
              },
              {
                id: "verdict",
                header: RENEWAL_TEXT.colVerdict,
                cell: (r: RenewalRow) =>
                  r.notDueReason ? (
                    <span className="text-muted-foreground text-body-sm">
                      {RENEWAL_TEXT.notDue[r.notDueReason] ?? r.notDueReason}
                    </span>
                  ) : (
                    <StatusBadge
                      tone={r.risk === "watch" ? "warning" : "success"}
                    >
                      {RENEWAL_TEXT.risk[r.risk ?? "low"] ?? ""}
                    </StatusBadge>
                  ),
              },
              {
                id: "open",
                header: RENEWAL_TEXT.colOpen,
                align: "center" as const,
                cell: (r: RenewalRow) =>
                  !canOpen || r.notDueReason ? (
                    <span className="text-muted-foreground">-</span>
                  ) : (
                    // Its OWN state, so the "created" badge lands on the row
                    // that was acted on rather than on whichever row still
                    // has a button after the list re-derives.
                    <SaveCell
                      errors={RENEWAL_ERROR}
                      label={RENEWAL_TEXT.open}
                      savedLabel={RENEWAL_TEXT.opened}
                      onSave={() => onOpen({ projectId: r.projectId })}
                    />
                  ),
              },
            ]}
          />
          {!canOpen ? (
            <p className="text-muted-foreground mt-sm text-body-sm">
              {RENEWAL_TEXT.denied}
            </p>
          ) : null}
        </>
      )}
    </Section>
  );
}
