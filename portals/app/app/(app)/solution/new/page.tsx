import { assistSolutionDraft } from "./assist-action";
import { nextBusinessCode } from "../../../domains/shared/business-code";
import { ViewHeader } from "../../components/business-controls";

import { PageCrumbs } from "../../components/page-crumbs";
import { notFound, redirect } from "next/navigation";
import { getMessages } from "../../lib/i18n/server";
import { can } from "../../../authz/decide";
import { CatalogPage } from "../../catalog/shell";
import { inForceByProduct } from "../../../domains/catalog/lib/pricing";
import { NewSolutionForm } from "../../components/catalog-forms";
import { saveSolution } from "../../catalog/actions";

export const dynamic = "force-dynamic";

export default async function NewSolutionPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ id?: string; code?: string }>;
}) {
  const { CATALOG_TEXT, DOMAIN_LABEL } = await getMessages();
  const { id, code } = await searchParams;
  return (
    <CatalogPage
      render={({ products, prices, policy, solutions, statuses, units, authz, entitlement }) => {
        if (!can(authz, entitlement, "catalog.solution.upsert", "ui").allowed) {
          redirect("/solution");
        }
        const found = id ? solutions.find(s => s.solution.id === id) : code
          ? solutions.find((s) => s.solution.solutionCode === code)
          : undefined;
        if ((id || code) && !found) notFound();
        return (
          <>
            <PageCrumbs
              trail={[{ label: DOMAIN_LABEL.solution, href: "/solution" }]}
              current={found ? CATALOG_TEXT.editSolution : CATALOG_TEXT.newSolution}
            />
            <ViewHeader
              title={found ? CATALOG_TEXT.editSolution : CATALOG_TEXT.newSolution}
              help={CATALOG_TEXT.newSolutionWhy}
            />
            <NewSolutionForm
              key={found?.solution.id ?? "new"}
              generatedCode={nextBusinessCode("SOL", solutions.map(s => s.solution.solutionCode))}
              products={products}
              statuses={statuses}
              units={units}
              currentPrices={Object.fromEntries(inForceByProduct(prices, policy.defaultCurrency, Date.now()))}
              currency={policy.defaultCurrency}
              initial={found}
              canAssist={can(authz, entitlement, "copilot.ask", "ui").allowed}
              onAssist={assistSolutionDraft}
              onSave={saveSolution}
            />
          </>
        );
      }}
    />
  );
}
