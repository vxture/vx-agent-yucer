import { getStrategyStore } from "../../domains/shared/registry";
import { listSegments } from "../../domains/strategy/service";
import { resolveAppSession } from "../lib/session";
import { can } from "../../authz/decide";
import { CatalogPage } from "../catalog/shell";
import { inForceByProduct } from "../../domains/catalog/lib/pricing";
import { typesInOrder } from "../../domains/catalog/lib/type-vocab";
import { solutionPricingFacts } from "../lib/solution-prices";
import { SolutionRoster } from "../components/solution-roster";
import { changeSolutionStatus, deleteSolution, moveSolutionRow } from "../catalog/actions";

// D9 solutions - the catalogue module page's pattern, applied here on the
// owner's 2026-09-05 ruling, with the difference the ruling names: a solution
// is a product COMBINATION plus its business CUSTOMISATION.
//
// A solution is a QUOTING TEMPLATE and nothing computes from it (ADR-014 s4):
// lines reference products, never the bundle. That is why deleting one cannot
// strand a deal - and why a broken template fails silently in front of a
// customer instead of loudly here, which is what the dock's check is for.
//

export const dynamic = "force-dynamic";

export default async function SolutionPage({ searchParams }: {
  readonly searchParams: Promise<{ solution?: string }>;
}) {
  const { solution } = await searchParams;
  const session = await resolveAppSession();
  const marketRead = session && await listSegments({
    workspaceId: session.workspaceId, sub: session.user.sub, holder: session.authz,
    entitlement: session.entitlement, store: getStrategyStore(),
  });
  const marketsBySolution: Record<string, { id: string; name: string }[]> = {};
  if (marketRead?.ok) for (const market of marketRead.value) {
    for (const id of market.solutionIds ?? []) (marketsBySolution[id] ??= []).push({ id: market.id, name: market.name });
  }
  return (
    <CatalogPage
      render={({ products, prices, solutions, types, policy, authz, entitlement, reads }) => {
        const canWrite = can(authz, entitlement, "catalog.solution.upsert", "ui").allowed;

        // Resolve the currency and clock once, then sum actual product prices.
        const currentPrices = inForceByProduct(prices, policy.defaultCurrency, Date.now());
        const productType = new Map(products.map((p) => [p.id, p.typeId]));
        const typeOrder = typesInOrder(types).map((t) => t.id);
        const facts = Object.fromEntries(
          solutions.map((s) => [
            s.solution.id,
            solutionPricingFacts(s.items, productType, typeOrder, currentPrices),
          ]),
        );

        return (
          <SolutionRoster
            summaryReads={reads}
            key={solution ?? "catalog"}
            initialSolutionId={solution}
            solutions={solutions}
            products={products}
            facts={facts}
            marketsBySolution={marketsBySolution}
            types={types}
            currency={policy.defaultCurrency}
            canWrite={canWrite}
            onMove={moveSolutionRow}
            onStatus={changeSolutionStatus}
            onDelete={deleteSolution}
          />
        );
      }}
    />
  );
}
