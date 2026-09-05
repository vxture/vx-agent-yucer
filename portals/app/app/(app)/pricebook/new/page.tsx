import { ViewHeader } from "@vxture/design-ui";
import { redirect } from "next/navigation";
import { getMessages } from "../../lib/i18n/server";
import { can } from "../../../authz/decide";
import { CatalogPage } from "../../catalog/shell";
import { NewPriceForm } from "../../components/catalog-forms";
import { savePrice } from "../../catalog/actions";

// 设定价格 - see /catalog/new for the shape and why the gate redirects.
//
// catalog.price, not catalog.write: whoever moves the floor approves every
// discount in the product, so this page belongs to the stricter permission
// (ADR-019) - same split the inline form kept, carried onto the route.

export const dynamic = "force-dynamic";

export default async function NewPricePage() {
  const { CATALOG_TEXT } = await getMessages();
  return (
    <CatalogPage
      render={({ products, prices, statuses, authz, entitlement }) => {
        if (!can(authz, entitlement, "catalog.pricebook.upsert", "ui").allowed) {
          redirect("/pricebook");
        }
        return (
          <>
            <ViewHeader title={CATALOG_TEXT.newPrice} description={CATALOG_TEXT.newPriceWhy} />
            <NewPriceForm products={products} prices={prices} statuses={statuses} onSave={savePrice} />
          </>
        );
      }}
    />
  );
}
