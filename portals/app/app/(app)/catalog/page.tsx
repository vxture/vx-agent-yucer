import { can } from "../../authz/decide";
import { CatalogPage } from "./shell";
import { StatusBadge } from "@vxture/design-ui";
import { ModuleHeadline } from "../components/module-headline";
import { inForceByProduct } from "../../domains/catalog/lib/pricing";
import { ProductRoster } from "../components/product-roster";
import { changeProductStatus, deleteProduct, moveProductRow } from "./actions";
import { getMessages } from "../lib/i18n/server";

// D9 products - the catalogue module page, rebuilt to the owner's 2026-09-05
// ruling: the header is the board's card (name, roster tags) - no fold since
// 2026-09-29, the per-type breakdown and its divider are gone - the body is the two rosters with the
// row operations locked right, and creation/ordering/config each have a page
// of their own.
//
// No tier gate anywhere on it. `catalog.*` carries `feature: null` (ADR-017):
// a workspace that bought anything needs to know what it sells.

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const { CATALOG_TEXT } = await getMessages();
  return (
    <CatalogPage
      render={({ products, prices, types, statuses, units, policy, authz, entitlement }) => {
        const canWrite = can(authz, entitlement, "catalog.product.upsert", "ui").allowed;
        // The two tags and the roster split are wired to the CANONICAL rows -
        // products on a workspace-added status live in the main roster and
        // are counted by neither tag (the tags are the commercial reading).
        const idOf = (code: string) => statuses.find((r) => r.statusCode === code)?.id;
        const activeId = idOf("active");
        const devId = idOf("in_development");
        const retiredId = idOf("retired");
        const live = products.filter((p) => p.statusId !== retiredId);

        // 标准价 column (owner, 2026-09-29): the list price IN FORCE, computed
        // here on the server - "in force" reads a clock, and a clock read
        // again during hydration is a different clock.
        const listPrices = Object.fromEntries(
          [...inForceByProduct(prices, policy.defaultCurrency, Date.now())].map(([id, e]) => [id, e.listPrice]),
        );

        return (
          <>
            <ModuleHeadline
              moduleKey="catalog"
              tags={
                <>
                  <StatusBadge tone="success">
                    {CATALOG_TEXT.tagActive(live.filter((p) => p.statusId === activeId).length)}
                  </StatusBadge>
                  {live.some((p) => p.statusId === devId) ? (
                    <StatusBadge tone="info">
                      {CATALOG_TEXT.tagDev(live.filter((p) => p.statusId === devId).length)}
                    </StatusBadge>
                  ) : null}
                </>
              }
            />

            <ProductRoster
              products={products}
              types={types}
              statuses={statuses}
              units={units}
              listPrices={listPrices}
              canWrite={canWrite}
              onMove={moveProductRow}
              onStatus={changeProductStatus}
              onDelete={deleteProduct}
            />
          </>
        );
      }}
    />
  );
}
