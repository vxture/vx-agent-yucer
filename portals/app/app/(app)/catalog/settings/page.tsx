import { ViewHeader } from "@vxture/design-ui";
import { redirect } from "next/navigation";
import { getMessages } from "../../lib/i18n/server";
import { can } from "../../../authz/decide";
import { CatalogPage } from "../shell";
import { CatalogSettingsPanel } from "../../components/catalog-settings-panel";
import { moveProductTypeRow, saveProductType } from "../actions";

// 产品系统设置 - the gear on the module page's header card (owner ruling
// 2026-09-05): the type vocabulary and the status semantics, i.e. the product
// SYSTEM's configuration, not any one product's edit page.
//
// Same courtesy-gate shape as /catalog/new: the gear is already hidden from
// anyone without catalog.write, so a landing without it is a typed URL and the
// list is a better answer than a dead end. The server actions carry the guard.

export const dynamic = "force-dynamic";

export default async function CatalogSettingsPage() {
  const { CATALOG_TEXT } = await getMessages();
  return (
    <CatalogPage
      render={({ products, types, authz, entitlement }) => {
        if (!can(authz, entitlement, "catalog.product.upsert", "ui").allowed) {
          redirect("/catalog");
        }
        return (
          <>
            <ViewHeader
              icon="settings"
              title={CATALOG_TEXT.settingsTitle}
              description={CATALOG_TEXT.settingsWhy}
            />
            <CatalogSettingsPanel
              types={types}
              products={products}
              onSaveType={saveProductType}
              onMoveType={moveProductTypeRow}
            />
          </>
        );
      }}
    />
  );
}
