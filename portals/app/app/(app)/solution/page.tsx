import { EmptyState, ViewLayout } from "@vxture/design-ui";
import { resolveAppSession } from "../lib/session";
import { getMessages } from "../lib/i18n/server";
import { can } from "../../authz/decide";
import { getCatalogStore } from "../../domains/shared/registry";
import { listPrices, listProducts, listSolutions } from "../../domains/catalog/service";
import { SolutionSection } from "../components/catalog-panels";
import { saveSolution } from "../catalog/actions";
import { loadFailureText } from "../lib/load-failure";

// D9 solutions - a module page since 2026-08-30.
//
// A solution is a QUOTING TEMPLATE and nothing computes from it (ADR-014 s4):
// lines reference products, never the bundle. That is why it can stand alone
// without dragging the price book with it.

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
      <SolutionSection
        products={products.value}
        solutions={solutions.ok ? solutions.value : []}
        canSolution={can(session.authz, session.entitlement, "catalog.solution.upsert", "ui").allowed}
        onSaveSolution={saveSolution}
      />
    </ViewLayout>
  );
}
