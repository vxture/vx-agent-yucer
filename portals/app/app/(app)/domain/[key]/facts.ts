import type { PermissionHolder } from "../../../authz/decide";
import type { Entitlement } from "../../../entitlement/types";
import {
  getAccountStore,
  getCatalogStore,
  getFieldStore,
  getPipelineStore,
  getSignalStore,
  getStrategyStore,
} from "../../../domains/shared/registry";
import { listCampaigns, listPlans, listSegments } from "../../../domains/strategy/service";
import { listPrices, listProducts, listSolutions } from "../../../domains/catalog/service";
import { listSignals, listLeads } from "../../../domains/signal/service";
import { listPendingReviews, listPipeline } from "../../../domains/pipeline/service";
import { listCommitments } from "../../../domains/account/field-service";
import { listAccounts } from "../../../domains/account/service";
import { accountMatchesCriteria } from "../../../domains/strategy/lib/lifecycle";
import { fact, visibleFacts, type DomainFact } from "../../lib/domain-facts";

// The cross-module reads behind each domain home. One function per domain
// because the facts are not uniform - what crosses /strategy and /catalog has
// nothing structurally in common with what crosses /account and /pipeline, and
// a generic "count things" abstraction over them would be a shape neither
// domain actually has.
//
// Everything goes through the same gated services the module pages use, and a
// refusal becomes a null the renderer drops (see domain-facts.ts).

export interface FactsContext {
  workspaceId: string;
  sub: string;
  holder: PermissionHolder;
  entitlement: Entitlement;
}

const len = <T,>(r: { ok: boolean; value?: T[] }): number | null =>
  r.ok ? (r.value as T[]).length : null;

/** What we sell, and who we cut the market into. */
async function armoryFacts(ctx: FactsContext): Promise<DomainFact[]> {
  const [products, prices, solutions, segments, plans, accounts] = await Promise.all([
    listProducts({ ...ctx, store: getCatalogStore() }),
    listPrices({ ...ctx, store: getCatalogStore() }),
    listSolutions({ ...ctx, store: getCatalogStore() }),
    listSegments({ ...ctx, store: getStrategyStore() }),
    listPlans({ ...ctx, store: getStrategyStore() }),
    listAccounts({ ...ctx, store: getAccountStore() }),
  ]);

  // THE FACT NEITHER PAGE HOLDS. /catalog lists products and it lists prices,
  // but a product with no entry in the price book is only visible by reading
  // one list against the other - and an unpriced product cannot be quoted, so
  // it is a hole in what we can actually sell rather than an untidy table.
  const unpriced =
    products.ok && prices.ok
      ? products.value.filter(
          (p) => p.status === "active" && !prices.value.some((e) => e.productId === p.id),
        ).length
      : null;

  // A cut of the market that matches nobody: the definition lives on
  // /strategy, the accounts live on /account, and only here are they compared.
  const emptySegments =
    segments.ok && accounts.ok
      ? segments.value.filter(
          (s) =>
            s.status === "active" &&
            !accounts.value.some((a) => accountMatchesCriteria(a, s.criteria)),
        ).length
      : null;

  return visibleFacts([
    fact("activePlans", plans.ok ? plans.value.filter((p) => p.status === "active").length : null, "/strategy"),
    fact("segments", len(segments), "/strategy"),
    fact("emptySegments", emptySegments, "/strategy#segments", true),
    fact("products", products.ok ? products.value.filter((p) => p.status === "active").length : null, "/catalog"),
    fact("solutions", len(solutions), "/catalog#solutions"),
    fact("unpricedProducts", unpriced, "/catalog#pricebook", true),
  ]);
}

/** What arrived, and what we aimed. */
async function reconFacts(ctx: FactsContext): Promise<DomainFact[]> {
  const [signals, leads, campaigns] = await Promise.all([
    listSignals({ ...ctx, store: getSignalStore() }, { limit: 500 }),
    listLeads({ ...ctx, store: getSignalStore() }, { limit: 500 }),
    listCampaigns({ ...ctx, store: getStrategyStore() }),
  ]);

  // The funnel's two stalls. A signal nobody has triaged and a lead qualified
  // but never converted are both "it arrived and stopped" - the question this
  // domain exists to answer, and neither page states it because each sees only
  // its own half of the journey.
  const untriaged = signals.ok
    ? signals.value.filter((s) => s.status === "new" || s.status === "scored").length
    : null;
  const stalledLeads = leads.ok
    ? leads.value.filter((l) => l.status === "qualified").length
    : null;

  return visibleFacts([
    fact("runningCampaigns", campaigns.ok ? campaigns.value.filter((c) => c.status === "running").length : null, "/campaign"),
    fact("untriagedSignals", untriaged, "/signal", true),
    fact("stalledLeads", stalledLeads, "/signal#leads", true),
  ]);
}

/** Who we are working, and what is owed on both sides. */
async function positionFacts(ctx: FactsContext): Promise<DomainFact[]> {
  const [accounts, deals, overdue, reviews] = await Promise.all([
    listAccounts({ ...ctx, store: getAccountStore() }),
    listPipeline({ ...ctx, store: getPipelineStore() }),
    listCommitments({ ...ctx, store: getFieldStore() }, { overdueAt: new Date(), limit: 200 }),
    listPendingReviews({ ...ctx, store: getPipelineStore() }),
  ]);

  const openDeals = deals.ok ? deals.value.filter((d) => d.status === "open").length : null;

  return visibleFacts([
    fact("activeAccounts", accounts.ok ? accounts.value.filter((a) => a.status === "active").length : null, "/account"),
    fact("openDeals", openDeals, "/pipeline"),
    fact("overdueCommitments", len(overdue), "/account", true),
    fact("pendingReviews", len(reviews), "/pipeline#winloss", true),
  ]);
}

const BY_DOMAIN: Record<string, (ctx: FactsContext) => Promise<DomainFact[]>> = {
  armory: armoryFacts,
  recon: reconFacts,
  position: positionFacts,
};

/** Empty for a domain with no home - the page never asks for one. */
export async function factsFor(key: string, ctx: FactsContext): Promise<DomainFact[]> {
  const fn = BY_DOMAIN[key];
  return fn ? fn(ctx) : [];
}

/** The keys this module can answer for, so a guard can hold it to the rule. */
export const FACT_DOMAINS: readonly string[] = Object.keys(BY_DOMAIN);
