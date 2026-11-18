import { can } from "../../authz/decide";
import { CatalogPage } from "./shell";
import { ProductRoster } from "../components/product-roster";
import { changeProductStatus, deleteProduct, moveProductRow, savePrice, deletePriceEntry } from "./actions";

// No tier gate anywhere on it. `catalog.*` carries `feature: null` (ADR-017):
// a workspace that bought anything needs to know what it sells.

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  return (
    <CatalogPage
      render={({ products, prices, types, statuses, units, policy, authz, entitlement }) => {
        const canWrite = can(authz, entitlement, "catalog.product.upsert", "ui").allowed;
        // Use the same clock for the initial render and client hydration.
        const now = Date.now();
        const canPrice = can(authz, entitlement, "catalog.pricebook.upsert", "ui").allowed;

        return (
          <ProductRoster
            products={products}
            types={types}
            statuses={statuses}
            units={units}
            pricing={{ prices, currency: policy.defaultCurrency, now, canPrice,
              onSave: savePrice, onDelete: deletePriceEntry }}
            canWrite={canWrite}
            onMove={moveProductRow}
            onStatus={changeProductStatus}
            onDelete={deleteProduct}
          />
        );
      }}
    />
  );
}
