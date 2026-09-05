import { can } from "../../authz/decide";
import { CatalogPage } from "./shell";
import { CatalogHeadline, type CatalogTypeStat } from "../components/catalog-headline";
import { ProductRoster } from "../components/product-roster";
import { changeProductStatus, deleteProduct, moveProductRow } from "./actions";
import { getMessages } from "../lib/i18n/server";

// D9 products - the catalogue module page, rebuilt to the owner's 2026-09-05
// ruling: the header is the board's collapsible card (name, roster tags, gear
// to system config, per-type breakdown), the body is the two rosters with the
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
      render={({ products, types, authz, entitlement }) => {
        const canWrite = can(authz, entitlement, "catalog.product.upsert", "ui").allowed;
        const live = products.filter((p) => p.status !== "retired");

        // Per-type stats in VOCABULARY order, so the config page's ordering is
        // what the header renders. Types with nothing live are skipped rather
        // than shown as zero - the breakdown decomposes the headline count,
        // and a zero contributes nothing to it. Untyped products close the
        // list under their own cell.
        const count = (list: readonly typeof live[number][], code: string | null) => ({
          active: list.filter((p) => p.category === code && p.status === "active").length,
          dev: list.filter((p) => p.category === code && p.status === "in_development").length,
        });
        const stats: CatalogTypeStat[] = types
          .map((t) => ({ key: t.typeCode, name: t.name, ...count(live, t.typeCode) }))
          .filter((s) => s.active + s.dev > 0);
        const untyped = count(live, null);
        if (untyped.active + untyped.dev > 0) {
          stats.push({ key: "__none", name: CATALOG_TEXT.noCategory, ...untyped });
        }

        return (
          <>
            <CatalogHeadline
              activeCount={live.filter((p) => p.status === "active").length}
              devCount={live.filter((p) => p.status === "in_development").length}
              stats={stats}
              canConfigure={canWrite}
            />

            <ProductRoster
              products={products}
              types={types}
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
