import { StatusBadge } from "@vxture/design-ui";
import { getMessages } from "../lib/i18n/server";
import { can } from "../../authz/decide";
import { CatalogPage } from "../catalog/shell";
import { ModuleHeadline } from "../components/module-headline";
import { inForceByProduct } from "../../domains/catalog/lib/pricing";
import { typesInOrder } from "../../domains/catalog/lib/type-vocab";
import { solutionPricingFacts } from "../lib/solution-prices";
import { SolutionRoster } from "../components/solution-roster";
import { changeSolutionStatus, deleteSolution, moveSolutionRow } from "../catalog/actions";
import { Tag } from "../components/tag";

// D9 solutions - the catalogue module page's pattern, applied here on the
// owner's 2026-09-05 ruling, with the difference the ruling names: a solution
// is a product COMBINATION plus its business CUSTOMISATION.
//
// A solution is a QUOTING TEMPLATE and nothing computes from it (ADR-014 s4):
// lines reference products, never the bundle. That is why deleting one cannot
// strand a deal - and why a broken template fails silently in front of a
// customer instead of loudly here, which is what the dock's check is for.
//
// The header is title and roster tags only - no fold since 2026-09-29 (owner:
// 展开内容删除). Coverage by product type now reads per row, in the roster's
// 涵盖产品类型 column.

export const dynamic = "force-dynamic";

export default async function SolutionPage() {
  const { CATALOG_TEXT } = await getMessages();
  return (
    <CatalogPage
      render={({ products, prices, solutions, types, policy, authz, entitlement }) => {
        const canWrite = can(authz, entitlement, "catalog.solution.upsert", "ui").allowed;

        const live = solutions.filter((s) => s.solution.status !== "retired");

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
          <>
            <ModuleHeadline
              moduleKey="solution"
              tags={
                <>
                  <StatusBadge tone="success">
                    {CATALOG_TEXT.tagSolutionActive(live.length)}
                  </StatusBadge>
                  {solutions.length > live.length ? (
                    <Tag>
                      {CATALOG_TEXT.tagSolutionRetired(solutions.length - live.length)}
                    </Tag>
                  ) : null}
                </>
              }
            />

            <SolutionRoster
              solutions={solutions}
              facts={facts}
              types={types}
              currency={policy.defaultCurrency}
              canWrite={canWrite}
              onMove={moveSolutionRow}
              onStatus={changeSolutionStatus}
              onDelete={deleteSolution}
            />
          </>
        );
      }}
    />
  );
}
