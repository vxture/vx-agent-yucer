import { ViewHeader } from "@vxture/design-ui";
import { redirect } from "next/navigation";
import { getMessages } from "../../lib/i18n/server";
import { can } from "../../../authz/decide";
import { CatalogPage } from "../shell";
import { NewProductForm } from "../../components/catalog-forms";
import { ProductRoster } from "../../components/product-roster";
import { changeProductStatus, deleteProduct, moveProductRow, saveProduct } from "../actions";

// 新建产品 - and, on the same page, the catalogue's ORDER (owner ruling
// 2026-09-05: 新建与排序同一页面). A new product joins at the end of the list
// below, and the arrows put it where it belongs without a round trip - the
// one moment ordering matters most is right after something new appears.
//
// ?code=X turns the page into EDIT mode for that product: the code field
// locks (it is the identity the upsert matches on) and status stays with the
// row - transitions belong to the roster's row menu.
//
// The GATE REDIRECTS rather than rendering a refusal: this route exists only
// behind controls the list page already hides from anyone without the
// permission, so landing here without it means a typed URL - and the list is
// a better answer than a dead end. The server actions still carry their own
// gates; this check is courtesy, not the guard.

export const dynamic = "force-dynamic";

export default async function NewProductPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ code?: string }>;
}) {
  const { CATALOG_TEXT } = await getMessages();
  const { code } = await searchParams;
  return (
    <CatalogPage
      render={({ products, types, authz, entitlement }) => {
        if (!can(authz, entitlement, "catalog.product.upsert", "ui").allowed) {
          redirect("/catalog");
        }
        const initial = code ? products.find((p) => p.productCode === code) : undefined;
        // An unknown ?code= is a stale link; the create form under a 修改
        // heading would quietly create, so fall back to plain creation.
        const editing = initial !== undefined;
        return (
          <>
            <ViewHeader
              title={editing ? CATALOG_TEXT.editProduct : CATALOG_TEXT.newProduct}
              description={CATALOG_TEXT.newProductWhy}
            />
            <NewProductForm
              key={initial?.id ?? "new"}
              products={products}
              types={types}
              initial={initial}
              onSave={saveProduct}
            />
            {!editing ? (
              <ProductRoster
                products={products}
                types={types}
                canWrite
                variant="sort"
                onMove={moveProductRow}
                onStatus={changeProductStatus}
                onDelete={deleteProduct}
              />
            ) : null}
          </>
        );
      }}
    />
  );
}
