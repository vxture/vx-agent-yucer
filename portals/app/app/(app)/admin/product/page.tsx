import { redirect } from "next/navigation";
import { ViewHeader, ViewLayout } from "@vxture/design-ui";
import { getMessages } from "../../lib/i18n/server";
import { can } from "../../../authz/decide";
import { CatalogPage } from "../../catalog/shell";
import { CatalogTypeConfig } from "../../components/catalog-type-config";
import { CatalogStatusConfig } from "../../components/catalog-status-config";
import {
  deleteProductType,
  deleteStatusRow,
  moveProductTypeRow,
  moveStatusRow,
  saveProductType,
  saveStatusRow,
} from "../../catalog/actions";

// 产品配置 - moved out of /catalog/settings on 2026-09-08 (owner).
//
// It was reached only from a gear on the catalogue module page, which is how a
// settings page ends up somewhere nobody looks for settings: a person setting
// up a workspace goes to configuration, not to the product list. It is one
// item in 配置管理 now, under 业务参数.
//
// ONE ITEM, THREE SECTIONS (owner). 产品类型 / 产品状态 / 计价单位 are one
// vocabulary - what a product IS, whether it may be sold, and what one of it
// means - set in one sitting. They remain three INDEPENDENT mechanisms: none
// of them knows the others exist, which is the ruling of 2026-09-05 and the
// reason this page composes three panels rather than one editor.
//
// THE GATE IS catalog.product.upsert, as it was. Reading the vocabulary is
// pointless without the ability to change it - the products page already shows
// what a type or a status IS - so this page is for the person who may edit.

export const dynamic = "force-dynamic";

export default async function ProductSettingsPage() {
  const { ADMIN_TEXT, DOMAIN_LABEL } = await getMessages();
  return (
    <CatalogPage
      render={({ products, types, statuses, authz, entitlement }) => {
        if (!can(authz, entitlement, "catalog.product.upsert", "ui").allowed) {
          redirect("/admin");
        }
        return (
          <ViewLayout>
            <ViewHeader
              icon="cube"
              title={DOMAIN_LABEL.product}
              description={ADMIN_TEXT.entryHint.product}
            />
            <CatalogTypeConfig
              types={types}
              products={products}
              onSave={saveProductType}
              onMove={moveProductTypeRow}
              onDelete={deleteProductType}
            />
            <CatalogStatusConfig
              statuses={statuses}
              products={products}
              onSave={saveStatusRow}
              onMove={moveStatusRow}
              onDelete={deleteStatusRow}
            />
          </ViewLayout>
        );
      }}
    />
  );
}
