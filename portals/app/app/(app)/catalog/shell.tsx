import type { ReactNode } from "react";
import { EmptyState, ViewLayout } from "@vxture/design-ui";
import { resolveAppSession } from "../lib/session";
import { getMessages } from "../lib/i18n/server";
import type { PermissionHolder } from "../../authz/decide";
import type { Entitlement } from "../../entitlement/types";
import { getCatalogStore } from "../../domains/shared/registry";
import { listPrices, listProducts, listSolutions } from "../../domains/catalog/service";
import type {
  PriceEntryRecord,
  ProductRecord,
  SolutionItemRecord,
  SolutionRecord,
} from "../../domains/catalog/store";
import { loadFailureText } from "../lib/load-failure";

// The catalogue's three module pages share one body.
//
// /catalog, /solution and /pricebook each resolve the session, build the same
// context, run the same three reads and degrade the same way; only the section
// they render and the gate they check differ. Written out three times that was
// 60% duplication between two of them - measured by the quality gate on the PR
// that created them, which is the correct place for a shell like this to be
// noticed.
//
// ALL THREE READS FOR ALL THREE PAGES, deliberately. A price entry names a
// product and a solution is a list of them, so two of the pages need products
// anyway; the third read is one query against a catalogue of this size, and
// the alternative is three slightly different context builders that drift.

export interface CatalogData {
  products: readonly ProductRecord[];
  solutions: readonly { solution: SolutionRecord; items: readonly SolutionItemRecord[] }[];
  prices: readonly PriceEntryRecord[];
  authz: PermissionHolder;
  entitlement: Entitlement;
}

export async function CatalogPage({
  render,
}: {
  /** What this module page puts on screen, given the shared reads. */
  readonly render: (data: CatalogData) => ReactNode;
}) {
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

  // Products gate all three: a solution is a list of them and a price entry
  // names one, so a refused product read leaves nothing any of the pages can
  // render honestly.
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
      {render({
        products: products.value,
        solutions: solutions.ok ? solutions.value : [],
        prices: prices.ok ? prices.value : [],
        authz: session.authz,
        entitlement: session.entitlement,
      })}
    </ViewLayout>
  );
}
