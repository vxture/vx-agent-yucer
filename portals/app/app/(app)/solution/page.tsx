import { can } from "../../authz/decide";
import { CatalogPage } from "../catalog/shell";
import { SolutionSection } from "../components/catalog-panels";
import { saveSolution } from "../catalog/actions";

// D9 solutions - a module page since 2026-08-30.
//
// A solution is a QUOTING TEMPLATE and nothing computes from it (ADR-014 s4):
// lines reference products, never the bundle. That is why it can stand alone
// without dragging the price book with it.
//
// The session, the reads and the refusal path are the catalogue shell's - see
// catalog/shell.tsx for why all three module pages share one body.

export const dynamic = "force-dynamic";

export default async function SolutionPage() {
  return (
    <CatalogPage
      render={({ products, solutions, authz, entitlement }) => (
        <SolutionSection
          products={products}
          solutions={solutions}
          canSolution={can(authz, entitlement, "catalog.solution.upsert", "ui").allowed}
          onSaveSolution={saveSolution}
        />
      )}
    />
  );
}
