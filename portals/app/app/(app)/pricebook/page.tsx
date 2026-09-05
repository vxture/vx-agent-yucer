import { StatusBadge } from "@vxture/design-ui";
import { getMessages } from "../lib/i18n/server";
import { can } from "../../authz/decide";
import { CatalogPage } from "../catalog/shell";
import { ModuleHeadline, type HeadlineStat } from "../components/module-headline";
import { PriceBook } from "../components/price-book";
import { deletePriceEntry, savePrice } from "../catalog/actions";

// D9 price book - the catalogue module page's pattern and layout, applied
// here on the owner's 2026-09-05 ruling: the collapsible header card with its
// roster tags and per-type breakdown, then the rosters with their operations.
//
// It carries the FLOOR, which the discount-signature rule reads (ADR-019), so
// it is the one catalogue surface whose numbers decide whether a sale needs a
// signature. Products load alongside because a price entry names one, and a
// price book listing ids would be unreadable.
//
// No gear: the price book has no vocabulary to configure - what it needs from
// the catalogue's config (types, statuses) it reads.

export const dynamic = "force-dynamic";

export default async function PricebookPage() {
  const { CATALOG_TEXT } = await getMessages();
  return (
    <CatalogPage
      render={({ products, prices, types, statuses, authz, entitlement }) => {
        const canPrice = can(authz, entitlement, "catalog.pricebook.upsert", "ui").allowed;

        // Only what can actually be sold is expected to carry a price: a
        // product in development or on the shelf is not a pricing gap, and
        // counting it as one would teach people the number means nothing.
        const activeId = statuses.find((r) => r.statusCode === "active")?.id;
        const sellable = products.filter((p) => p.statusId === activeId);
        const priced = new Set(prices.map((e) => e.productId));

        const count = (typeId: string | null) => {
          const rows = sellable.filter((p) => p.typeId === typeId);
          const yes = rows.filter((p) => priced.has(p.id)).length;
          return { priced: yes, unpriced: rows.length - yes };
        };
        const stats: HeadlineStat[] = types
          .map((t) => ({ key: t.id, name: t.name, ...count(t.id) }))
          .filter((c) => c.priced + c.unpriced > 0)
          .map((c) => ({
            key: c.key,
            name: c.name,
            value: c.priced + c.unpriced,
            note: CATALOG_TEXT.priceStat(c.priced, c.unpriced),
          }));
        const untyped = count(null);
        if (untyped.priced + untyped.unpriced > 0) {
          stats.push({
            key: "__none",
            name: CATALOG_TEXT.noCategory,
            value: untyped.priced + untyped.unpriced,
            note: CATALOG_TEXT.priceStat(untyped.priced, untyped.unpriced),
          });
        }

        const pricedCount = sellable.filter((p) => priced.has(p.id)).length;
        const unpricedCount = sellable.length - pricedCount;

        // IN FORCE = the newest entry per product+currency that has taken
        // effect. Computed HERE, on the server: it reads a clock, and a clock
        // read again during hydration is a different clock from the one that
        // rendered the HTML. A future-dated price is a decision already made
        // and not yet in force - it stays in the superseded table, dated,
        // where somebody can see it coming.
        const now = Date.now();
        const byKey = new Map<string, (typeof prices)[number]>();
        for (const e of prices) {
          if (e.effectiveAt.getTime() > now) continue;
          const key = `${e.productId}::${e.currency}`;
          const held = byKey.get(key);
          if (!held || held.effectiveAt.getTime() < e.effectiveAt.getTime()) byKey.set(key, e);
        }
        const name = new Map(products.map((p) => [p.id, p.name]));
        const inForce = new Set([...byKey.values()].map((e) => e.id));
        const current = [...byKey.values()].sort((a, b) =>
          (name.get(a.productId) ?? "").localeCompare(name.get(b.productId) ?? ""),
        );
        // WHEN A PRICE STOPPED APPLYING is when its successor took effect -
        // and since incr/0030 the successor is ASSERTED (supersedesId) rather
        // than guessed from the dates. The date fallback stays for rows
        // written before that increment: they have no pointer, and the order
        // they were entered in is the only evidence there is.
        const successor = new Map<string, (typeof prices)[number]>();
        for (const e of prices) {
          if (e.supersedesId) successor.set(e.supersedesId, e);
        }
        const superseded = prices
          .filter((e) => !inForce.has(e.id))
          .map((e) => {
            const next =
              successor.get(e.id) ??
              prices
                .filter(
                  (o) =>
                    o.productId === e.productId &&
                    o.currency === e.currency &&
                    o.effectiveAt.getTime() > e.effectiveAt.getTime(),
                )
                .sort((a, b) => a.effectiveAt.getTime() - b.effectiveAt.getTime())[0];
            return { ...e, supersededAt: next?.effectiveAt ?? null };
          });

        return (
          <>
            <ModuleHeadline
              moduleKey="pricebook"
              description={CATALOG_TEXT.pricebookWhy}
              tags={
                <>
                  <StatusBadge tone="success">{CATALOG_TEXT.tagPriced(pricedCount)}</StatusBadge>
                  {unpricedCount > 0 ? (
                    <StatusBadge tone="warning">
                      {CATALOG_TEXT.tagUnpriced(unpricedCount)}
                    </StatusBadge>
                  ) : null}
                </>
              }
              stats={stats}
              emptyNote={CATALOG_TEXT.priceStatEmpty}
            />

            <PriceBook
              products={products}
              current={current}
              superseded={superseded}
              canPrice={canPrice}
              onSave={savePrice}
              onDelete={deletePriceEntry}
            />
          </>
        );
      }}
    />
  );
}
