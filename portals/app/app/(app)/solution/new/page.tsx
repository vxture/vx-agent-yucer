import { ViewHeader } from "@vxture/design-ui";
import { redirect } from "next/navigation";
import { getMessages } from "../../lib/i18n/server";
import { can } from "../../../authz/decide";
import { CatalogPage } from "../../catalog/shell";
import { NewSolutionForm } from "../../components/catalog-forms";
import { saveSolution } from "../../catalog/actions";

// 新建 / 修改方案 - the composition and its customisation are content-rich
// work, so they get a page (the 2026-09-05 flow ruling), while retiring and
// ordering stay row operations on the roster.
//
// ?code=X edits that solution: the anchor locks and the combination arrives
// filled in. An unknown code falls back to creation rather than showing an
// edit heading over an empty form.

export const dynamic = "force-dynamic";

export default async function NewSolutionPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ code?: string }>;
}) {
  const { CATALOG_TEXT } = await getMessages();
  const { code } = await searchParams;
  return (
    <CatalogPage
      render={({ products, solutions, statuses, authz, entitlement }) => {
        if (!can(authz, entitlement, "catalog.solution.upsert", "ui").allowed) {
          redirect("/solution");
        }
        const found = code
          ? solutions.find((s) => s.solution.solutionCode === code)
          : undefined;
        return (
          <>
            <ViewHeader
              title={found ? CATALOG_TEXT.editSolution : CATALOG_TEXT.newSolution}
              description={CATALOG_TEXT.newSolutionWhy}
            />
            <NewSolutionForm
              key={found?.solution.id ?? "new"}
              products={products}
              statuses={statuses}
              initial={found}
              onSave={saveSolution}
            />
          </>
        );
      }}
    />
  );
}
