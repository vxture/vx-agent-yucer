"use client";

import {
  DataTable,
  EmptyState,
  Section,
  StatusBadge,
} from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import { NewEntryLink } from "./form-page";
import type {
  PriceEntryRecord,
  ProductRecord,
  SolutionItemRecord,
  SolutionRecord,
} from "../../domains/catalog/store";

// The catalogue's DISPLAY sections for /solution and /pricebook.
//
// THE FORMS LEFT ON 2026-09-05 (owner ruling: a list page shows; creating is a
// page of its own, with room for the assistant), and ProductSection left later
// the same day when /catalog became the module page - product-roster.tsx is
// its successor, with the row operations the ruling added. Each remaining
// section renders its rows and, for the permitted, a single entry button to
// /solution/new or /pricebook/new. The permission split survives the move:
// each button and each page checks the same gate the inline form did, because
// whoever moves the floor approves every discount in the product.

/**
 * The shapes the catalogue sections take between them.
 *
 * No component takes all of it: each section Picks the three or four fields it
 * uses. It stays one declaration because the fields are the same fields - a
 * price entry's shape does not change depending on which page renders it - and
 * three copies would be three things to keep in step.
 */
export interface CatalogPanelsProps {
  readonly products: readonly ProductRecord[];
  readonly solutions: readonly {
    readonly solution: SolutionRecord;
    readonly items: readonly SolutionItemRecord[];
  }[];
  readonly prices: readonly PriceEntryRecord[];
  readonly canWrite: boolean;
  readonly canPrice: boolean;
  readonly canSolution: boolean;
}

/**
 * THE THREE WERE ONE COMPONENT AND ARE NOW THREE.
 *
 * They rendered together while /catalog was one route with three anchors. The
 * per-domain menu ended that: with armory holding five entries, three of them
 * landing on /catalog read as a broken menu rather than as one screen with
 * parts. Each section keeps its own id so existing anchors still resolve.
 */
export function SolutionSection({
  products,
  solutions,
  canSolution,
}: Pick<CatalogPanelsProps, "products" | "solutions" | "canSolution">) {
  const { CATALOG_TEXT } = useMessages();
  const productName = new Map(products.map((p) => [p.id, p.name]));
  return (
    <Section id="solutions" icon="puzzle">
      {solutions.length === 0 ? (
        <EmptyState
          title={CATALOG_TEXT.noSolutions}
          description={CATALOG_TEXT.emptyBundle}
        />
      ) : (
        <div className="flex flex-col gap-sm">
          {solutions.map(({ solution, items }) => (
            <div
              key={solution.id}
              className="flex flex-wrap items-baseline gap-xs"
            >
              <span className="text-foreground font-medium">
                {solution.name}
              </span>
              <span className="mono text-muted-foreground text-body-sm">
                {solution.solutionCode}
              </span>
              <StatusBadge tone="neutral">
                {CATALOG_TEXT.solutionItems(items.length)}
              </StatusBadge>
              <span className="text-muted-foreground text-body-sm">
                {items
                  .map(
                    (i) =>
                      `${productName.get(i.productId) ?? i.productId} x${i.quantity}`,
                  )
                  .join(" · ")}
              </span>
            </div>
          ))}
        </div>
      )}
      {canSolution ? <NewEntryLink href="/solution/new" /> : null}
    </Section>
  );
}

export function PriceSection({
  products,
  prices,
  canPrice,
}: Pick<CatalogPanelsProps, "products" | "prices" | "canPrice">) {
  const { CATALOG_TEXT, DATA_TABLE_LABELS } = useMessages();
  const productName = new Map(products.map((p) => [p.id, p.name]));
  return (
    <Section id="pricebook" icon="currency-cny">
      {prices.length === 0 ? (
        <EmptyState
          title={CATALOG_TEXT.noPrices}
          description={CATALOG_TEXT.pricebookWhy}
        />
      ) : (
        <DataTable
          labels={DATA_TABLE_LABELS}
          indexStart={1}
          rowKey={(r: PriceEntryRecord) => r.id}
          rows={[...prices]}
          columns={[
            {
              id: "product",
              header: CATALOG_TEXT.colName,
              cell: (r: PriceEntryRecord) =>
                productName.get(r.productId) ?? r.productId,
            },
            {
              id: "currency",
              header: CATALOG_TEXT.colCurrency,
              cell: (r: PriceEntryRecord) => r.currency,
            },
            {
              id: "list",
              header: CATALOG_TEXT.colList,
              align: "right" as const,
              cell: (r: PriceEntryRecord) => r.listPrice.toLocaleString(),
            },
            {
              id: "floor",
              header: CATALOG_TEXT.colFloor,
              align: "right" as const,
              // The floor reads as the decision it is. Equal to list means
              // "not discountable", which is worth seeing at a glance rather
              // than working out by comparing two columns.
              cell: (r: PriceEntryRecord) => (
                <span
                  className={
                    r.floorPrice === r.listPrice
                      ? "text-(color:--warning-text)"
                      : undefined
                  }
                >
                  {r.floorPrice.toLocaleString()}
                </span>
              ),
            },
            {
              id: "effective",
              header: CATALOG_TEXT.colEffective,
              cell: (r: PriceEntryRecord) =>
                r.effectiveAt.toISOString().slice(0, 10),
            },
          ]}
        />
      )}
      {canPrice ? (
        <NewEntryLink href="/pricebook/new" />
      ) : (
        <p className="text-muted-foreground mt-sm text-body-sm">
          {CATALOG_TEXT.priceDenied}
        </p>
      )}
    </Section>
  );
}
