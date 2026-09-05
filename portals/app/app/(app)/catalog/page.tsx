import { Card, ViewHeader } from "@vxture/design-ui";
import { getMessages } from "../lib/i18n/server";
import { can } from "../../authz/decide";
import { CatalogPage } from "./shell";
import { ProductSection } from "../components/catalog-panels";

// D9 products - the catalogue's first module page.
//
// Solutions and the price book left for routes of their own on 2026-08-30, so
// this page is products, and the lead line counts what is actually sellable.
//
// No tier gate anywhere on it. `catalog.*` carries `feature: null` (ADR-017):
// a workspace that bought anything needs to know what it sells.
//
// The session, the reads and the refusal path are the catalogue shell's - see
// shell.tsx for why all three module pages share one body.

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const { CATALOG_TEXT } = await getMessages();
  return (
    <CatalogPage
      render={({ products, authz, entitlement }) => (
        <>
          <ViewHeader
            title={CATALOG_TEXT.lead(
              products.filter((p) => p.status === "active").length,
            )}
            description={CATALOG_TEXT.leadWhy}
          />

          <ProductSection
            products={products}
            canWrite={
              can(authz, entitlement, "catalog.product.upsert", "ui").allowed
            }
          />
        </>
      )}
    />
  );
}
