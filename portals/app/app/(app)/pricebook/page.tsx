import { can } from "../../authz/decide";
import { CatalogPage } from "../catalog/shell";
import { PriceSection } from "../components/catalog-panels";
import { savePrice } from "../catalog/actions";

// D9 price book - a module page since 2026-08-30.
//
// It carries the FLOOR, which the discount-signature rule reads (ADR-019), so
// it is the one catalogue surface whose numbers decide whether a sale needs a
// signature. Products load alongside because a price entry names one, and a
// price book listing ids would be unreadable.
//
// The session, the reads and the refusal path are the catalogue shell's - see
// catalog/shell.tsx for why all three module pages share one body.

export const dynamic = "force-dynamic";

export default async function PricebookPage() {
  return (
    <CatalogPage
      render={({ products, prices, authz, entitlement }) => (
        <PriceSection
          products={products}
          prices={prices}
          canPrice={can(authz, entitlement, "catalog.pricebook.upsert", "ui").allowed}
          onSavePrice={savePrice}
        />
      )}
    />
  );
}
