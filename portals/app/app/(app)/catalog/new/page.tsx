import { nextBusinessCode } from "../../../domains/shared/business-code";
import { ViewHeader } from "../../components/business-controls";

import { PageCrumbs } from "../../components/page-crumbs";
import { notFound, redirect } from "next/navigation";
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
// New links use the product UUID. Legacy number links are accepted on entry
// while that number remains in use. Status transitions live in the roster.
//
//// The GATE REDIRECTS rather than rendering a refusal: this route exists only
// behind controls the list page already hides from anyone without the
// permission, so landing here without it means a typed URL - and the list is
// a better answer than a dead end. The server actions still carry their own
// gates; this check is courtesy, not the guard.

export const dynamic = "force-dynamic";

export default async function NewProductPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ id?: string; code?: string }>;
}) {
  const { CATALOG_TEXT, DOMAIN_LABEL } = await getMessages();
  const { id, code } = await searchParams;
  return (
    <CatalogPage
      render={({ products, types, statuses, units, authz, entitlement }) => {
        if (!can(authz, entitlement, "catalog.product.upsert", "ui").allowed) {
          redirect("/catalog");
        }
        const initial = products.find(p => id ? p.id === id : code && p.productCode === code);
        if ((id || code) && !initial) notFound();
        const editing = initial !== undefined;
        return (
          <>
            <PageCrumbs
              trail={[{ label: DOMAIN_LABEL.catalog, href: "/catalog" }]}
              current={editing ? CATALOG_TEXT.editProduct : CATALOG_TEXT.newProduct}
            />
            <ViewHeader
              title={editing ? CATALOG_TEXT.editProduct : CATALOG_TEXT.newProduct}
              help={CATALOG_TEXT.newProductWhy}
            />
            <NewProductForm
              key={initial?.id ?? "new"}
              generatedCode={nextBusinessCode("PRD", products.map(p => p.productCode))}
              types={types}
              statuses={statuses}
              units={units}
              initial={initial}
              onSave={saveProduct}
            />
            {!editing ? (
              <ProductRoster
                products={products}
                types={types}
                statuses={statuses}
                units={units}
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
