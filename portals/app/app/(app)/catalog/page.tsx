import { Card, EmptyState, ViewLayout } from "@vxture/design-ui";
import { resolveAppSession } from "../lib/session";
import { getMessages } from "../lib/i18n/server";
import { can } from "../../authz/decide";
import { getCatalogStore } from "../../domains/shared/registry";
import { listPrices, listProducts, listSolutions } from "../../domains/catalog/service";
import { CatalogPanels } from "../components/catalog-panels";
import { saveProduct, savePrice } from "./actions";

// D9 catalogue page.
//
// ONE ROUTE, THREE SECTIONS. Products, solutions and the price book are three
// facets of one thing, and a catalogue this size does not earn three routes -
// the launcher marks the latter two as SECTIONS of this page rather than as
// modules of their own, which is what they are.
//
// No tier gate anywhere on it. `catalog.*` carries `feature: null` (ADR-017):
// a workspace that bought anything needs to know what it sells.

export const dynamic = "force-dynamic";

export default async function CatalogPage() {
  const { CATALOG_TEXT, SHELL_TEXT } = await getMessages();
  const session = await resolveAppSession();
  if (!session) {
    return (
      <EmptyState
        title={SHELL_TEXT.signedOutTitle}
        description={SHELL_TEXT.signedOutDescription}
      />
    );
  }

  const ctx = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: getCatalogStore(),
  };

  const [products, solutions, prices] = await Promise.all([
    listProducts(ctx),
    listSolutions(ctx),
    listPrices(ctx),
  ]);

  if (!products.ok) {
    return (
      <EmptyState
        title={SHELL_TEXT.loadFailed}
        description={products.violations.map((v) => v.message).join("; ")}
      />
    );
  }

  return (
    <ViewLayout>
      <Card className="p-lg">
        {/* ONE child, so Card's gap-xl never fires between a title and its own
            captions - the same shape the other first-level pages use. */}
        <div className="flex flex-col gap-2xs">
          <h1 className="text-heading-2 text-foreground">
            {CATALOG_TEXT.lead(products.value.filter((p) => p.status === "active").length)}
          </h1>
          <p className="text-muted-foreground text-body-sm">{CATALOG_TEXT.leadWhy}</p>
        </div>
      </Card>

      <CatalogPanels
        products={products.value}
        /* A refused read degrades to an empty section rather than failing the
           page: the three permissions are separate, and a member who may see
           products but not prices should still get products. */
        solutions={solutions.ok ? solutions.value : []}
        prices={prices.ok ? prices.value : []}
        canWrite={
          can(session.authz, session.entitlement, "catalog.product.upsert", "ui").allowed
        }
        canPrice={
          can(session.authz, session.entitlement, "catalog.pricebook.upsert", "ui").allowed
        }
        onSaveProduct={saveProduct}
        onSavePrice={savePrice}
      />
    </ViewLayout>
  );
}
