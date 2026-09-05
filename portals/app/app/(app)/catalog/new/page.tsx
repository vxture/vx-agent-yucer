import { ViewHeader } from "@vxture/design-ui";
import { redirect } from "next/navigation";
import { getMessages } from "../../lib/i18n/server";
import { can } from "../../../authz/decide";
import { CatalogPage } from "../shell";
import { NewProductForm } from "../../components/catalog-forms";
import { saveProduct } from "../actions";

// 新建产品 - a page, not a strip under the table (owner ruling 2026-09-05).
//
// The GATE REDIRECTS rather than rendering a refusal: this route exists only
// behind a button the list page already hides from anyone without the
// permission, so landing here without it means a typed URL - and the list is
// a better answer than a dead end. The server action still carries its own
// gate; this check is courtesy, not the guard.

export const dynamic = "force-dynamic";

export default async function NewProductPage() {
  const { CATALOG_TEXT } = await getMessages();
  return (
    <CatalogPage
      render={({ products, authz, entitlement }) => {
        if (!can(authz, entitlement, "catalog.product.upsert", "ui").allowed) {
          redirect("/catalog");
        }
        return (
          <>
            <ViewHeader title={CATALOG_TEXT.newProduct} description={CATALOG_TEXT.newProductWhy} />
            <NewProductForm products={products} onSave={saveProduct} />
          </>
        );
      }}
    />
  );
}
