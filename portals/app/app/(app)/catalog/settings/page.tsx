import Link from "next/link";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Button,
  Icon,
} from "@vxture/design-ui";
import { redirect } from "next/navigation";
import { getMessages } from "../../lib/i18n/server";
import { can } from "../../../authz/decide";
import { CatalogPage } from "../shell";
import { CatalogTypeConfig } from "../../components/catalog-type-config";
import { CatalogStatusConfig } from "../../components/catalog-status-config";
import {
  deleteProductType,
  deleteStatusRow,
  moveProductTypeRow,
  moveStatusRow,
  saveProductType,
  saveStatusRow,
} from "../actions";

// 产品配置 - the gear on the module page's header card.
//
// A SECONDARY CONFIG PAGE, and the chrome says so (owner's second ruling,
// 2026-09-05): no module-page ViewHeader here - that pattern marks the level
// above. Instead: back + breadcrumb on one line, then a small plain title with
// no description line. The hierarchy is the message.
//
// Same courtesy-gate shape as /catalog/new: the gear is already hidden from
// anyone without catalog.write, so a landing without it is a typed URL and the
// list is a better answer than a dead end. The server actions carry the guard.

export const dynamic = "force-dynamic";

export default async function CatalogSettingsPage() {
  const { CATALOG_TEXT, DOMAIN_LABEL } = await getMessages();
  return (
    <CatalogPage
      render={({ products, types, statuses, authz, entitlement }) => {
        if (!can(authz, entitlement, "catalog.product.upsert", "ui").allowed) {
          redirect("/catalog");
        }
        return (
          <>
            <div className="flex flex-col gap-sm">
              <div className="flex items-center gap-sm">
                {/* arrow-left, NOT chevron-left: the breadcrumb's separators
                    are chevrons, and two chevron glyphs a centimetre apart
                    pointing opposite ways read as one broken widget (owner,
                    2026-09-05). The arrow is the product-wide back glyph. */}
                <Button asChild variant="ghost" size="icon-sm" aria-label={CATALOG_TEXT.back}>
                  <Link href="/catalog">
                    <Icon name="arrow-left" size="sm" />
                  </Link>
                </Button>
                <Breadcrumb>
                  <BreadcrumbList>
                    <BreadcrumbItem>
                      <BreadcrumbLink asChild>
                        <Link href="/catalog">{DOMAIN_LABEL.catalog}</Link>
                      </BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      <BreadcrumbPage>{CATALOG_TEXT.settingsTitle}</BreadcrumbPage>
                    </BreadcrumbItem>
                  </BreadcrumbList>
                </Breadcrumb>
              </div>
              <h1 className="text-foreground text-heading-4">{CATALOG_TEXT.settingsTitle}</h1>
            </div>

            {/* Two INDEPENDENT vocabularies, one mechanism each - 类型是类型，
                状态是状态 (owner, 2026-09-05). Neither knows the other exists. */}
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
          </>
        );
      }}
    />
  );
}
