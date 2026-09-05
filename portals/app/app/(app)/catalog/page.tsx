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
      render={({ products, types, statuses, authz, entitlement }) => {
        const canWrite = can(authz, entitlement, "catalog.product.upsert", "ui").allowed;
        // The two tags and the roster split are wired to the CANONICAL rows -
        // products on a workspace-added status live in the main roster and
        // are counted by neither tag (the tags are the commercial reading).
        const idOf = (code: string) => statuses.find((r) => r.statusCode === code)?.id;
        const activeId = idOf("active");
        const devId = idOf("in_development");
        const retiredId = idOf("retired");
        const live = products.filter((p) => p.statusId !== retiredId);

        // Per-type stats in VOCABULARY order, so the config page's ordering is
        // what the header renders. Types with nothing live are skipped rather
        // than shown as zero - the breakdown decomposes the headline count,
        // and a zero contributes nothing to it. Untyped products close the
        // list under their own cell.
        const count = (typeId: string | null) => ({
          active: live.filter((p) => p.typeId === typeId && p.statusId === activeId).length,
          dev: live.filter((p) => p.typeId === typeId && p.statusId === devId).length,
        });
        const stats: CatalogTypeStat[] = types
          .map((t) => ({ key: t.id, name: t.name, ...count(t.id) }))
          .filter((s) => s.active + s.dev > 0);
        const untyped = count(null);
        if (untyped.active + untyped.dev > 0) {
          stats.push({ key: "__none", name: CATALOG_TEXT.noCategory, ...untyped });
        }

        return (
          <>
            <CatalogHeadline
              activeCount={live.filter((p) => p.statusId === activeId).length}
              devCount={live.filter((p) => p.statusId === devId).length}
              stats={stats}
              canConfigure={canWrite}
            />

            <ProductRoster
              products={products}
              types={types}
              statuses={statuses}
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
