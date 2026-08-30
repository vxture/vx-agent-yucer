import { Card } from "@vxture/design-ui";
import { getMessages } from "../lib/i18n/server";
import { can } from "../../authz/decide";
import { CatalogPage } from "./shell";
import { ProductSection } from "../components/catalog-panels";
import { saveProduct } from "./actions";

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
          <Card className="p-lg">
            {/* ONE child, so Card's gap-xl never fires between a title and its
                own captions - the same shape the other first-level pages use. */}
            <div className="flex flex-col gap-2xs">
              <h1 className="text-heading-2 text-foreground">
                {CATALOG_TEXT.lead(products.filter((p) => p.status === "active").length)}
              </h1>
              <p className="text-muted-foreground text-body-sm">{CATALOG_TEXT.leadWhy}</p>
            </div>
          </Card>

          <ProductSection
            products={products}
            canWrite={can(authz, entitlement, "catalog.product.upsert", "ui").allowed}
            onSaveProduct={saveProduct}
          />
        </>
      )}
    />
  );
}
