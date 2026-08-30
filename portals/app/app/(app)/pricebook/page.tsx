import { EmptyState, ViewLayout } from "@vxture/design-ui";
import { resolveAppSession } from "../lib/session";
import { getMessages } from "../lib/i18n/server";
import { can } from "../../authz/decide";
import { getCatalogStore } from "../../domains/shared/registry";
import { listPrices, listProducts, listSolutions } from "../../domains/catalog/service";
import { PriceSection } from "../components/catalog-panels";
import { savePrice } from "../catalog/actions";
import { loadFailureText } from "../lib/load-failure";

// D9 price book - a module page since 2026-08-30.
//
// It carries the FLOOR, which the discount-signature rule reads (ADR-019), so
// it is the one catalogue surface whose numbers decide whether a sale needs a
// signature. Products still load alongside: a price entry names one, and a
// price book listing ids would be unreadable.

export const dynamic = "force-dynamic";

export default async function Page() {
  const { SHELL_TEXT, LOAD_ERROR } = await getMessages();
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
        description={loadFailureText(products.violations, LOAD_ERROR)}
      />
    );
  }

  return (
    <ViewLayout>
      <PriceSection
        products={products.value}
        prices={prices.ok ? prices.value : []}
        canPrice={can(session.authz, session.entitlement, "catalog.pricebook.upsert", "ui").allowed}
        onSavePrice={savePrice}
      />
    </ViewLayout>
  );
}
