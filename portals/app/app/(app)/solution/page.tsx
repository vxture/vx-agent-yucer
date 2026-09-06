import { StatusBadge } from "@vxture/design-ui";
import { getMessages } from "../lib/i18n/server";
import { can } from "../../authz/decide";
import { CatalogPage } from "../catalog/shell";
import { ModuleHeadline, type HeadlineStat } from "../components/module-headline";
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
// THE HEADLINE COUNTS COVERAGE, not solutions: how much of what is on sale
// any solution actually takes to market. The number of templates is a fact
// about this page; what it decomposes into is a fact about the business.

export const dynamic = "force-dynamic";

export default async function SolutionPage() {
  const { CATALOG_TEXT } = await getMessages();
  return (
    <CatalogPage
      render={({ products, solutions, types, statuses, authz, entitlement }) => {
        const canWrite = can(authz, entitlement, "catalog.solution.upsert", "ui").allowed;

        const activeId = statuses.find((r) => r.statusCode === "active")?.id;
        const sellable = products.filter((p) => p.statusId === activeId);
        const live = solutions.filter((s) => s.solution.status !== "retired");
        const covered = new Set(live.flatMap((s) => s.items.map((i) => i.productId)));

        const count = (typeId: string | null) => {
          const rows = sellable.filter((p) => p.typeId === typeId);
          const yes = rows.filter((p) => covered.has(p.id)).length;
          return { inSolution: yes, outside: rows.length - yes };
        };
        const stats: HeadlineStat[] = types
          .map((t) => ({ key: t.id, name: t.name, ...count(t.id) }))
          .filter((c) => c.inSolution + c.outside > 0)
          .map((c) => ({
            key: c.key,
            name: c.name,
            value: c.inSolution + c.outside,
            note: CATALOG_TEXT.solutionStat(c.inSolution, c.outside),
          }));
        const untyped = count(null);
        if (untyped.inSolution + untyped.outside > 0) {
          stats.push({
            key: "__none",
            name: CATALOG_TEXT.noCategory,
            value: untyped.inSolution + untyped.outside,
            note: CATALOG_TEXT.solutionStat(untyped.inSolution, untyped.outside),
          });
        }

        return (
          <>
            <ModuleHeadline
              moduleKey="solution"
              description={CATALOG_TEXT.solutionsWhy}
              tags={
                <>
                  <StatusBadge tone="success">
                    {CATALOG_TEXT.tagSolutionActive(live.length)}
                  </StatusBadge>
                  {solutions.length > live.length ? (
                    <StatusBadge tone="neutral">
                      {CATALOG_TEXT.tagSolutionRetired(solutions.length - live.length)}
                    </StatusBadge>
                  ) : null}
                </>
              }
              stats={stats}
              emptyNote={CATALOG_TEXT.solutionStatEmpty}
            />

            <SolutionRoster
              solutions={solutions}
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
