import { ViewHeader } from "@vxture/design-ui";
import { redirect } from "next/navigation";
import { getMessages } from "../../lib/i18n/server";
import { can } from "../../../authz/decide";
import { CatalogPage } from "../../catalog/shell";
import { NewSolutionForm } from "../../components/catalog-forms";
import { saveSolution } from "../../catalog/actions";

// 新建方案 - see /catalog/new for the shape and why the gate redirects.

export const dynamic = "force-dynamic";

export default async function NewSolutionPage() {
  const { CATALOG_TEXT } = await getMessages();
  return (
    <CatalogPage
      render={({ products, authz, entitlement }) => {
        if (!can(authz, entitlement, "catalog.solution.upsert", "ui").allowed) {
          redirect("/solution");
        }
        return (
          <>
            <ViewHeader title={CATALOG_TEXT.newSolution} description={CATALOG_TEXT.newSolutionWhy} />
            <NewSolutionForm products={products} onSave={saveSolution} />
          </>
        );
      }}
    />
  );
}
