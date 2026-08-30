"use client";

import Link from "next/link";
import { DataTable, EmptyState, Section, StatusBadge } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import { formatMoney } from "../lib/view-model";

// What we have actually offered, per deal.
//
// NOT A NEW OBJECT. A quote is the CURRENT STATE of an opportunity's lines -
// opportunity_line already carries quantity, unit price, amount and
// needs_approval, price_book_entry carries the floor those were judged
// against, and line_discount_approval carries the signature. All three existed
// and nothing put them together, so "what did we offer this customer" was a
// question the product could not answer without opening one deal at a time.
//
// Modelling a quote as its own row would have been worse than useless: two
// records of one offer that can disagree, and the line is the one the
// discount rule actually reads.
//
// THE COLUMN THAT MATTERS IS 待签字. A line below the floor raises
// needs_approval; an approval clears it. A quote with unsigned lines is not
// an offer yet - it is an offer waiting on somebody - and that is the state
// this page exists to make visible across every deal at once.

export interface QuoteRow {
  readonly opportunityId: string;
  readonly opportunityNo: string;
  readonly name: string;
  readonly accountName: string | null;
  readonly stage: string;
  readonly lineCount: number;
  readonly amount: number;
  readonly currency: string;
  /** Lines below the floor that nobody has signed for yet. */
  readonly awaitingSignature: number;
}

export interface QuoteTableProps {
  readonly rows: readonly QuoteRow[];
}

export function QuoteTable({ rows }: QuoteTableProps) {
  const { DATA_TABLE_LABELS, QUOTE_TEXT, STAGE_LABEL } = useMessages();

  return (
    <Section id="quotes" icon="receipt" title={QUOTE_TEXT.title} description={QUOTE_TEXT.why}>
      {rows.length === 0 ? (
        <EmptyState title={QUOTE_TEXT.none} description={QUOTE_TEXT.noneWhy} />
      ) : (
        <DataTable
          labels={DATA_TABLE_LABELS}
          rowKey={(r: QuoteRow) => r.opportunityId}
          rows={[...rows]}
          columns={[
            {
              id: "deal",
              header: QUOTE_TEXT.colDeal,
              cell: (r: QuoteRow) => (
                <div className="flex flex-col gap-3xs">
                  <Link href={`/pipeline/${r.opportunityId}`} className="text-foreground hover:underline">
                    {r.name}
                  </Link>
                  <span className="text-muted-foreground text-xs tabular-nums">{r.opportunityNo}</span>
                </div>
              ),
            },
            {
              id: "account",
              header: QUOTE_TEXT.colAccount,
              cell: (r: QuoteRow) => r.accountName ?? "-",
            },
            {
              id: "stage",
              header: QUOTE_TEXT.colStage,
              cell: (r: QuoteRow) => (STAGE_LABEL as Record<string, string>)[r.stage] ?? r.stage,
            },
            {
              id: "lines",
              header: QUOTE_TEXT.colLines,
              align: "right" as const,
              cell: (r: QuoteRow) => String(r.lineCount),
            },
            {
              id: "amount",
              header: QUOTE_TEXT.colAmount,
              align: "right" as const,
              cell: (r: QuoteRow) => formatMoney(r.amount, r.currency),
            },
            {
              id: "signature",
              header: QUOTE_TEXT.colSignature,
              align: "center" as const,
              // Zero draws nothing. A badge on every row would spend the
              // colour that the blocked ones need.
              cell: (r: QuoteRow) =>
                r.awaitingSignature > 0 ? (
                  <StatusBadge tone="warning">
                    {QUOTE_TEXT.awaiting(r.awaitingSignature)}
                  </StatusBadge>
                ) : (
                  <span className="text-muted-foreground">-</span>
                ),
            },
          ]}
        />
      )}
    </Section>
  );
}
