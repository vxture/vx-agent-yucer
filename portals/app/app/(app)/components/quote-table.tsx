"use client";

import Link from "next/link";
import {
  DataTable,
  EmptyState,
  Section,
  StatusBadge,
  TableTitleCell,
} from "@vxture/design-ui";
import { useTableSort } from "./table-fittings";
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

/* 排序取值: what each sortable column ORDERS ON. Not always what the cell
   renders - a money cell sorts on the raw amount, not its formatted string. */
const SORT_ON = {
  deal: (r: QuoteRow) => r.name,
  amount: (r: QuoteRow) => r.amount,
};

export function QuoteTable({ rows }: QuoteTableProps) {
  const { DATA_TABLE_LABELS, QUOTE_TEXT, STAGE_LABEL } = useMessages();
  const sorted = useTableSort<QuoteRow>([], SORT_ON);

  return (
    <Section id="quotes" icon="receipt">
      {rows.length === 0 ? (
        <EmptyState title={QUOTE_TEXT.none} description={QUOTE_TEXT.noneWhy} />
      ) : (
        <DataTable
          labels={DATA_TABLE_LABELS}
          rowKey={(r: QuoteRow) => r.opportunityId}
          rows={[...sorted.sortRows(rows)]}
          sort={sorted.sort}
          onSortChange={sorted.onSortChange}
          columns={[
            {
              id: "deal",
  sortable: true,
              header: QUOTE_TEXT.colDeal,
              cell: (r: QuoteRow) => (
                <TableTitleCell
                  tooltip={r.name}
                  title={
                    <Link href={`/pipeline/${r.opportunityId}`} className="hover:underline">
                      {r.name}
                    </Link>
                  }
                  description={r.opportunityNo}
                />
              ),
            },
            {
              id: "account",
              header: QUOTE_TEXT.colAccount,
              // LEFT: a customer name is the row's subject, and names are
              // scanned down a column by their first character.
              align: "left" as const,
              cell: (r: QuoteRow) => r.accountName ?? "-",
            },
            {
              id: "stage",
              header: QUOTE_TEXT.colStage,
              cell: (r: QuoteRow) =>
                (STAGE_LABEL as Record<string, string>)[r.stage] ?? r.stage,
            },
            {
              id: "lines",
              header: QUOTE_TEXT.colLines,

              cell: (r: QuoteRow) => String(r.lineCount),
            },
            {
              id: "amount",
              header: QUOTE_TEXT.colAmount,
              sortable: true,
              align: "money" as const,
              cell: (r: QuoteRow) => formatMoney(r.amount, r.currency),
            },
            {
              id: "signature",
              header: QUOTE_TEXT.colSignature,
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
