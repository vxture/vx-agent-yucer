import type { ReactNode } from "react";
import { EmptyState, ViewLayout } from "@vxture/design-ui";
import { resolveAppSession } from "../lib/session";
import { getMessages } from "../lib/i18n/server";
import type { PermissionHolder } from "../../authz/decide";
import type { Entitlement } from "../../entitlement/types";
import { getCatalogStore } from "../../domains/shared/registry";
import {
  listPrices,
  pricingPolicy,
  listProducts,
  listProductStatuses,
  listProductTypes,
  listProductUnits,
  listSolutions,
} from "../../domains/catalog/service";
import type {
  PriceEntryRecord,
  ProductRecord,
  ProductStatusRecord,
  ProductTypeRecord,
  ProductUnitRecord,
  SolutionItemRecord,
  SolutionRecord,
} from "../../domains/catalog/store";

import { loadFailureText } from "../lib/load-failure";
import { DEFAULT_PRICING_POLICY, type PricingPolicy } from "../../domains/catalog/lib/pricing-policy";

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
  types: readonly ProductTypeRecord[];
  /** The status vocabulary - names and 状态描述 come from here. */
  statuses: readonly ProductStatusRecord[];
  /** 计价单位 (0037). Read for the same reason the other two are: a product row
   *  carries a uuid, and every surface that shows a product shows its unit. */
  units: readonly ProductUnitRecord[];
  solutions: readonly { solution: SolutionRecord; items: readonly SolutionItemRecord[] }[];
  prices: readonly PriceEntryRecord[];
  /** 计价规则 (incr/0044): what the price book's numbers are in. */
  policy: PricingPolicy;
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

  const [products, types, statuses, units, solutions, prices, policy] = await Promise.all([
    listProducts(ctx),
    listProductTypes(ctx),
    listProductStatuses(ctx),
    listProductUnits(ctx),
    listSolutions(ctx),
    listPrices(ctx),
    pricingPolicy(ctx),
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
        types: types.ok ? types.value : [],
        statuses: statuses.ok ? statuses.value : [],
        units: units.ok ? units.value : [],
        solutions: solutions.ok ? solutions.value : [],
        prices: prices.ok ? prices.value : [],
        policy: policy.ok ? policy.value : DEFAULT_PRICING_POLICY,
        authz: session.authz,
        entitlement: session.entitlement,
      })}
    </ViewLayout>
  );
}
