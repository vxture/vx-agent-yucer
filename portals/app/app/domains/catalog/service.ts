import type { Entitlement } from "../../entitlement/types";
import { can, type PermissionHolder } from "../../authz/decide";
import { fail, ok, violation, type RuleResult } from "../shared/result";
import {
  planPrice,
  planProduct,
  planSolution,
  type SolutionItemDraft,
  approvalFor,
} from "./lib/pricing";
import {
  planMove,
  planProductType,
  planRemoval,
  planStatusChange,
  type ProductStatus,
} from "./lib/lifecycle";
import { denied } from "../pipeline/service";
import type {
  CatalogStore,
  DiscountApprovalRecord,
  OpportunityLineRecord,
  PriceEntryRecord,
  ProductRecord,
  ProductTypeRecord,
  SolutionItemRecord,
  SolutionRecord,
} from "./store";

/**
 * A line with the one fact a reader cannot derive from it: whether the
 * signature its `needsApproval` flag demands has actually been given.
 */
export type ApprovedLine = OpportunityLineRecord & { readonly approved: boolean };

// D9 catalogue application service - the READ half (ADR-014, ADR-017).
//
// THE GATE IS PERMISSION-ONLY, and that is the partition's whole design rather
// than an omission. `catalog.*` actions carry `feature: null`: the catalogue is
// chain infrastructure, not a sellable capability - you cannot sell anything
// without knowing what you sell - so no tier withholds it and the only question
// left is who inside the workspace may look and who may change it. See ADR-017.
//
// So every function here runs the same two-gate call as every other domain; it
// simply resolves the entitlement half to "baseline" every time. Writing the
// gate out rather than skipping it matters: a service that skipped `can()`
// because it "has no feature key" would be a service nobody could later add a
// key to without auditing every call site.
//
// THE WRITE HALF IS BELOW, and it is where the three permissions earn their
// keep: `catalog.write` maintains what we sell, `catalog.price` decides what we
// will not go below. Those are two jobs, and a product where the person editing
// the catalogue can also move the floor is a product where every discount is
// self-approved.

export interface CatalogContext {
  workspaceId: string;
  sub: string;
  holder: PermissionHolder;
  entitlement: Entitlement;
  store: CatalogStore;
}

/** A solution with the products it is made of, which is the only useful shape. */
export interface SolutionView {
  solution: SolutionRecord;
  items: SolutionItemRecord[];
}

export async function listProducts(
  ctx: CatalogContext,
): Promise<RuleResult<ProductRecord[]>> {
  const gate = can(ctx.holder, ctx.entitlement, "catalog.product.view", "data");
  if (!gate.allowed) return denied(gate);
  return ok(await ctx.store.listProducts(ctx.workspaceId));
}

/**
 * Solutions, each with its items.
 *
 * The items are fetched here rather than left to the caller because a solution
 * without them is not a solution - it is a name. Every surface that shows one
 * needs to show what it contains, and making each of them loop would put the
 * same N+1 in every page instead of in one place where it is visible.
 */
export async function listSolutions(
  ctx: CatalogContext,
): Promise<RuleResult<SolutionView[]>> {
  const gate = can(ctx.holder, ctx.entitlement, "catalog.solution.view", "data");
  if (!gate.allowed) return denied(gate);

  const solutions = await ctx.store.listSolutions(ctx.workspaceId);
  const views = await Promise.all(
    solutions.map(async (solution) => ({
      solution,
      items: await ctx.store.listSolutionItems(ctx.workspaceId, solution.id),
    })),
  );
  return ok(views);
}

/**
 * The price book.
 *
 * A SEPARATE ACTION from the product list even though both resolve to
 * `catalog.read` today. The floor price is the most commercially sensitive
 * number in this domain - it decides which discounts need a signature - and
 * giving it its own action id means the day someone decides reps may see
 * products but not floors, there is already a seam to cut along. Collapsing it
 * into `catalog.product.view` would make that a refactor instead of a grant.
 */
export async function listPrices(
  ctx: CatalogContext,
): Promise<RuleResult<PriceEntryRecord[]>> {
  const gate = can(ctx.holder, ctx.entitlement, "catalog.pricebook.view", "data");
  if (!gate.allowed) return denied(gate);
  return ok(await ctx.store.listPrices(ctx.workspaceId));
}

/**
 * Every opportunity line in the workspace, for product-level rollups.
 *
 * GATED ON `pipeline.view`, NOT ON A CATALOGUE ACTION, and the mismatch is
 * deliberate. `opportunity_line` lives in `yucer_pipeline` and by ADR-001 the
 * owning partition is D6: a line is part of a DEAL, and reading deals is what
 * decides whether you may see it. The catalogue store holds it only because the
 * pricing rules and the line rows travel together.
 *
 * It exists at all because two surfaces were reaching `getCatalogStore()`
 * directly - `/pipeline` and the board - which is the same defect PR #26 fixed
 * on the account detail page: a page holding a store handle has skipped both
 * gates, and hiding the navigation link is not access control.
 */
export async function listOpportunityLines(
  ctx: CatalogContext,
): Promise<RuleResult<ApprovedLine[]>> {
  const gate = can(ctx.holder, ctx.entitlement, "pipeline.view", "data");
  if (!gate.allowed) return denied(gate);
  const [lines, approvals] = await Promise.all([
    ctx.store.allLines(ctx.workspaceId),
    ctx.store.allApprovals(ctx.workspaceId),
  ]);
  // The join happens HERE rather than in each caller, because `needsApproval`
  // without `approved` reads as "still pending" and every surface that shows
  // one would have to remember to fetch the other. Three of them exist today
  // and a caller that CAN forget the join will forget it - the same reasoning
  // that put this read behind a service instead of a store handle.
  const byDeal = new Map<string, DiscountApprovalRecord[]>();
  for (const a of approvals) {
    const list = byDeal.get(a.opportunityId);
    if (list) list.push(a);
    else byDeal.set(a.opportunityId, [a]);
  }
  return ok(
    lines.map((l) => ({
      ...l,
      approved: approvalFor(l, byDeal.get(l.opportunityId) ?? []) !== null,
    })),
  );
}

// --- writes ------------------------------------------------------------------

export async function upsertProduct(
  ctx: CatalogContext,
  input: {
    productCode: string;
    name: string;
    category?: string | null;
    unit: string;
    status?: ProductStatus;
  },
): Promise<RuleResult<ProductRecord>> {
  const gate = can(ctx.holder, ctx.entitlement, "catalog.product.upsert", "data");
  if (!gate.allowed) return denied(gate);

  // Status is NOT a free field on the form; it is the lifecycle's. An omitted
  // status keeps what the row already has (edit mode), and a provided one on
  // an EXISTING row must be a legal transition - otherwise re-saving the form
  // would be a side door around planStatusChange, and "active -> in
  // development" would be one import away.
  const existing = (await ctx.store.listProducts(ctx.workspaceId)).find(
    (p) => p.productCode === input.productCode.trim(),
  );
  let status: ProductStatus;
  if (existing) {
    if (input.status !== undefined && input.status !== existing.status) {
      const move = planStatusChange(existing.status, input.status);
      if (!move.ok) return move as RuleResult<ProductRecord>;
      status = move.value;
    } else {
      status = existing.status;
    }
  } else {
    status = input.status ?? "active";
  }

  const plan = planProduct({
    productCode: input.productCode,
    name: input.name,
    category: input.category ?? null,
    unit: input.unit,
    status,
  });
  if (!plan.ok) return plan as RuleResult<ProductRecord>;

  return ok(await ctx.store.upsertProduct(ctx.workspaceId, plan.value));
}

export async function upsertSolution(
  ctx: CatalogContext,
  input: {
    solutionCode: string;
    name: string;
    summary?: string | null;
    status?: "active" | "retired";
    items: readonly SolutionItemDraft[];
  },
): Promise<RuleResult<SolutionRecord>> {
  const gate = can(ctx.holder, ctx.entitlement, "catalog.solution.upsert", "data");
  if (!gate.allowed) return denied(gate);

  const plan = planSolution(
    {
      solutionCode: input.solutionCode,
      name: input.name,
      summary: input.summary ?? null,
      status: input.status ?? "active",
    },
    input.items,
  );
  if (!plan.ok) return plan as RuleResult<SolutionRecord>;

  return ok(
    await ctx.store.upsertSolution(
      ctx.workspaceId,
      plan.value.solution,
      plan.value.items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
    ),
  );
}

/**
 * Move a product through its lifecycle: launch (-> active) or retire.
 *
 * `catalog.product.upsert`, same as editing - which row is on sale is catalogue
 * maintenance, the same job as what the row says. The transitions themselves
 * are planStatusChange's (in_development is a birth state; retirement is
 * reversible).
 */
export async function setProductStatus(
  ctx: CatalogContext,
  input: { productId: string; status: ProductStatus },
): Promise<RuleResult<ProductRecord>> {
  const gate = can(ctx.holder, ctx.entitlement, "catalog.product.upsert", "data");
  if (!gate.allowed) return denied(gate);

  const products = await ctx.store.listProducts(ctx.workspaceId);
  const current = products.find((p) => p.id === input.productId);
  if (!current) {
    return fail(violation("not_found", "no such product", "productId"));
  }
  const plan = planStatusChange(current.status, input.status);
  if (!plan.ok) return plan as RuleResult<ProductRecord>;

  const row = await ctx.store.setProductStatus(ctx.workspaceId, input.productId, plan.value);
  if (!row) return fail(violation("not_found", "no such product", "productId"));
  return ok(row);
}

/**
 * Move a product one place up or down in the catalogue.
 *
 * The move happens within the roster the user is LOOKING at - active and
 * in-development rows on one list, retired on the other - so a move never
 * swaps with a row the click cannot see. planMove returns a dense renumbering
 * of the whole list, which also heals the all-zero order the DDL default
 * leaves on pre-0028 rows.
 */
export async function moveProduct(
  ctx: CatalogContext,
  input: { productId: string; direction: "up" | "down" },
): Promise<RuleResult<true>> {
  const gate = can(ctx.holder, ctx.entitlement, "catalog.product.upsert", "data");
  if (!gate.allowed) return denied(gate);

  const products = await ctx.store.listProducts(ctx.workspaceId);
  const moving = products.find((p) => p.id === input.productId);
  if (!moving) {
    return fail(violation("not_found", "no such product", "productId"));
  }
  const group = (s: ProductStatus) => (s === "retired" ? "retired" : "live");
  const plan = planMove(
    products.map((p) => ({ id: p.id, movable: group(p.status) === group(moving.status) })),
    input.productId,
    input.direction,
  );
  if (!plan.ok) return plan as RuleResult<true>;

  await ctx.store.setProductOrder(ctx.workspaceId, plan.value);
  return ok(true);
}

/**
 * Delete a product outright.
 *
 * Refused while any deal line or solution item references it (planRemoval) -
 * the refusal names the counts, and the row-level answer for a product with
 * history is `retired`. Price entries go with the product, as the DDL's
 * cascade already says.
 */
export async function removeProduct(
  ctx: CatalogContext,
  input: { productId: string },
): Promise<RuleResult<true>> {
  const gate = can(ctx.holder, ctx.entitlement, "catalog.product.upsert", "data");
  if (!gate.allowed) return denied(gate);

  const refs = await ctx.store.countProductRefs(ctx.workspaceId, input.productId);
  const plan = planRemoval(refs);
  if (!plan.ok) return plan as RuleResult<true>;

  const removed = await ctx.store.removeProduct(ctx.workspaceId, input.productId);
  if (!removed) return fail(violation("not_found", "no such product", "productId"));
  return ok(true);
}

/**
 * The type vocabulary, for the module header's per-type stats and the config
 * page. View-gated with the products it classifies.
 */
export async function listProductTypes(
  ctx: CatalogContext,
): Promise<RuleResult<ProductTypeRecord[]>> {
  const gate = can(ctx.holder, ctx.entitlement, "catalog.product.view", "data");
  if (!gate.allowed) return denied(gate);
  return ok(await ctx.store.listProductTypes(ctx.workspaceId));
}

/**
 * Create or rename a type, or retire/reinstate it.
 *
 * `catalog.product.upsert`, deliberately NOT a new permission: the vocabulary
 * exists to classify products, and the person trusted to say what a product IS
 * is the person trusted to say what kinds exist. A separate permission would
 * split one job across two roles with no scenario asking for it.
 */
export async function upsertProductType(
  ctx: CatalogContext,
  input: { typeCode: string; name: string; status?: "active" | "retired" },
): Promise<RuleResult<ProductTypeRecord>> {
  const gate = can(ctx.holder, ctx.entitlement, "catalog.product.upsert", "data");
  if (!gate.allowed) return denied(gate);

  const plan = planProductType({
    typeCode: input.typeCode,
    name: input.name,
    status: input.status ?? "active",
  });
  if (!plan.ok) return plan as RuleResult<ProductTypeRecord>;

  return ok(await ctx.store.upsertProductType(ctx.workspaceId, plan.value));
}

/** Reorder the type vocabulary - the order the header's stat cells render in. */
export async function moveProductType(
  ctx: CatalogContext,
  input: { typeId: string; direction: "up" | "down" },
): Promise<RuleResult<true>> {
  const gate = can(ctx.holder, ctx.entitlement, "catalog.product.upsert", "data");
  if (!gate.allowed) return denied(gate);

  const types = await ctx.store.listProductTypes(ctx.workspaceId);
  const plan = planMove(
    types.map((t) => ({ id: t.id, movable: true })),
    input.typeId,
    input.direction,
  );
  if (!plan.ok) return plan as RuleResult<true>;

  await ctx.store.setProductTypeOrder(ctx.workspaceId, plan.value);
  return ok(true);
}

/**
 * Set a price, which APPENDS a new entry rather than editing the old one.
 *
 * `catalog.price`, not `catalog.write`. Whoever can move the floor can approve
 * every discount in the product without approving anything - `priceLine` reads
 * the floor to decide `needsApproval` - so it is a different job from editing
 * the catalogue, held by different roles. Same shape as pipeline.forecast
 * splitting off pipeline.write one domain over.
 */
export async function setPrice(
  ctx: CatalogContext,
  input: {
    productId: string;
    currency: string;
    listPrice: number;
    floorPrice: number;
    effectiveAt?: Date;
  },
): Promise<RuleResult<PriceEntryRecord>> {
  const gate = can(ctx.holder, ctx.entitlement, "catalog.pricebook.upsert", "data");
  if (!gate.allowed) return denied(gate);

  const plan = planPrice({
    productId: input.productId,
    currency: input.currency,
    listPrice: input.listPrice,
    floorPrice: input.floorPrice,
    effectiveAt: input.effectiveAt ?? new Date(),
  });
  if (!plan.ok) return plan as RuleResult<PriceEntryRecord>;

  return ok(await ctx.store.appendPrice(ctx.workspaceId, plan.value));
}
