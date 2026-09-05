import type { Entitlement } from "../../entitlement/types";
import { can, type PermissionHolder } from "../../authz/decide";
import { fail, ok, violation, type RuleResult } from "../shared/result";
import {
  planPrice,
  planPriceRemoval,
  planProduct,
  planSolution,
  type SolutionItemDraft,
  approvalFor,
} from "./lib/pricing";
import { planMove, planRemoval } from "./lib/lifecycle";
import { DEFAULT_TYPE_VOCABULARY, planProductType, planTypeRemoval } from "./lib/type-vocab";
import { analysePrices, type PriceAdvice } from "./lib/price-advice";
import {
  planProductStatusChange,
  planStatus,
  planStatusRemoval,
  STARTER_STATUS_DEFAULTS,
  SYSTEM_STATUS_DEFAULTS,
} from "./lib/status-vocab";
import { denied } from "../pipeline/service";
import type {
  CatalogStore,
  DiscountApprovalRecord,
  OpportunityLineRecord,
  PriceEntryRecord,
  ProductRecord,
  ProductStatusRecord,
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
    typeId?: string | null;
    unit: string;
    /** A status row's uuid. Omitted on an edit = keep what the row has;
     * omitted on a create = the canonical 在售 row. */
    statusId?: string;
  },
): Promise<RuleResult<ProductRecord>> {
  const gate = can(ctx.holder, ctx.entitlement, "catalog.product.upsert", "data");
  if (!gate.allowed) return denied(gate);

  // The type must be the workspace's own. A dangling uuid would only fail at
  // the FK; this names the refusal.
  if (input.typeId) {
    const types = await ctx.store.listProductTypes(ctx.workspaceId);
    if (!types.some((t) => t.id === input.typeId)) {
      return fail(violation("type_not_found", "no such product type", "typeId"));
    }
  }

  const [existing, vocab] = await Promise.all([
    ctx.store
      .listProducts(ctx.workspaceId)
      .then((rows) => rows.find((p) => p.productCode === input.productCode.trim())),
    ensureStatusVocab(ctx),
  ]);

  // Status is the vocabulary's, not the form's. Omitted keeps what the row
  // has (edit mode); a provided change on an EXISTING product must be a legal
  // move - otherwise re-saving the form would be a side door around
  // planProductStatusChange.
  let statusId: string;
  if (existing) {
    if (input.statusId !== undefined && input.statusId !== existing.statusId) {
      const from = vocab.find((r) => r.id === existing.statusId);
      const to = vocab.find((r) => r.id === input.statusId);
      if (!from || !to) {
        return fail(violation("status_not_found", "no such status", "statusId"));
      }
      const move = planProductStatusChange(from.statusCode, to.statusCode);
      if (!move.ok) return move as RuleResult<ProductRecord>;
      statusId = to.id;
    } else {
      statusId = existing.statusId;
    }
  } else {
    const born = input.statusId
      ? vocab.find((r) => r.id === input.statusId)
      : vocab.find((r) => r.statusCode === "active");
    if (!born) {
      return fail(violation("status_not_found", "no such status", "statusId"));
    }
    // Born straight onto the shelf would be a product that never existed
    // commercially - a record error, refused.
    if (born.statusCode === "retired") {
      return fail(
        violation("born_shelved", "a product cannot be created already retired", "statusId"),
      );
    }
    statusId = born.id;
  }

  const plan = planProduct({
    productCode: input.productCode,
    name: input.name,
    typeId: input.typeId ?? null,
    unit: input.unit,
    statusId,
  });
  if (!plan.ok) return plan as RuleResult<ProductRecord>;

  return ok(await ctx.store.upsertProduct(ctx.workspaceId, plan.value));
}

/**
 * Point a product at another status row - the roster menu's 上线/退役/转入.
 *
 * planProductStatusChange holds the one rule (在研 is birth-only); everything
 * else is the workspace's own business.
 */
export async function setProductStatus(
  ctx: CatalogContext,
  input: { productId: string; statusId: string },
): Promise<RuleResult<ProductRecord>> {
  const gate = can(ctx.holder, ctx.entitlement, "catalog.product.upsert", "data");
  if (!gate.allowed) return denied(gate);

  const [products, vocab] = await Promise.all([
    ctx.store.listProducts(ctx.workspaceId),
    ensureStatusVocab(ctx),
  ]);
  const current = products.find((p) => p.id === input.productId);
  if (!current) {
    return fail(violation("not_found", "no such product", "productId"));
  }
  const from = vocab.find((r) => r.id === current.statusId);
  const to = vocab.find((r) => r.id === input.statusId);
  if (!from || !to) {
    return fail(violation("status_not_found", "no such status", "statusId"));
  }
  const plan = planProductStatusChange(from.statusCode, to.statusCode);
  if (!plan.ok) return plan as RuleResult<ProductRecord>;

  const row = await ctx.store.setProductStatus(ctx.workspaceId, input.productId, to.id);
  if (!row) return fail(violation("not_found", "no such product", "productId"));
  return ok(row);
}

/**
 * Move a product one place up or down in the catalogue.
 *
 * The move happens within the roster the user is LOOKING at - the retired
 * shelf (products on the canonical 已退役 row) and the live roster split, so
 * a move never swaps with a row the click cannot see. planMove returns a
 * dense renumbering, which also heals the all-zero order pre-0028 rows carry.
 */
export async function moveProduct(
  ctx: CatalogContext,
  input: { productId: string; direction: "up" | "down" },
): Promise<RuleResult<true>> {
  const gate = can(ctx.holder, ctx.entitlement, "catalog.product.upsert", "data");
  if (!gate.allowed) return denied(gate);

  const [products, vocab] = await Promise.all([
    ctx.store.listProducts(ctx.workspaceId),
    ensureStatusVocab(ctx),
  ]);
  const moving = products.find((p) => p.id === input.productId);
  if (!moving) {
    return fail(violation("not_found", "no such product", "productId"));
  }
  const retiredId = vocab.find((r) => r.statusCode === "retired")?.id;
  const group = (p: ProductRecord) => (p.statusId === retiredId ? "retired" : "live");
  const plan = planMove(
    products.map((p) => ({ id: p.id, movable: group(p) === group(moving) })),
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
 * history is retirement. Price entries go with the product, as the DDL's
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
 *
 * A FRESH workspace is seeded with the product's starter vocabulary (a
 * delivered tenant is usable, not empty - owner ruling 2026-09-05). Fresh
 * means no types AND no products: a tenant that deleted every type on
 * purpose has products, and their empty vocabulary stays deleted rather
 * than resurrecting on the next read.
 */
export async function listProductTypes(
  ctx: CatalogContext,
): Promise<RuleResult<ProductTypeRecord[]>> {
  const gate = can(ctx.holder, ctx.entitlement, "catalog.product.view", "data");
  if (!gate.allowed) return denied(gate);
  let types = await ctx.store.listProductTypes(ctx.workspaceId);
  if (types.length === 0) {
    const products = await ctx.store.listProducts(ctx.workspaceId);
    if (products.length === 0) {
      for (const d of DEFAULT_TYPE_VOCABULARY) {
        await ctx.store.upsertProductType(ctx.workspaceId, {
          typeCode: d.typeCode,
          name: d.name,
          status: "active",
        });
      }
      types = await ctx.store.listProductTypes(ctx.workspaceId);
    }
  }
  return ok(types);
}

/**
 * Create or rename a type, or retire/reinstate it.
 *
 * `catalog.product.upsert`, deliberately NOT a new permission: the vocabulary
 * exists to classify products, and the person trusted to say what a product IS
 * is the person trusted to say what kinds exist.
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
 * Delete a TYPE outright.
 *
 * Refused while products carry it (planTypeRemoval names the count and points
 * at retirement); fk_product_type RESTRICTs underneath as the last line.
 */
export async function removeProductType(
  ctx: CatalogContext,
  input: { typeId: string },
): Promise<RuleResult<true>> {
  const gate = can(ctx.holder, ctx.entitlement, "catalog.product.upsert", "data");
  if (!gate.allowed) return denied(gate);

  const carrying = await ctx.store.countProductsByType(ctx.workspaceId, input.typeId);
  const plan = planTypeRemoval(carrying);
  if (!plan.ok) return plan as RuleResult<true>;

  const removed = await ctx.store.removeProductType(ctx.workspaceId, input.typeId);
  if (!removed) return fail(violation("not_found", "no such type", "typeId"));
  return ok(true);
}

/**
 * The workspace's status vocabulary, materialising the three canonical rows
 * on first contact. Every product write references a status row by uuid, so
 * the rows must exist before anything else can - and a fresh workspace gets
 * them from the domain's own defaults, the same values the DDL backfills.
 */
async function ensureStatusVocab(ctx: CatalogContext) {
  let rows = await ctx.store.listStatusConfigs(ctx.workspaceId);
  // A completely empty vocabulary is FIRST CONTACT: seed the full shipped
  // set, starter rows included. Otherwise only the load-bearing system codes
  // are re-ensured - starter rows are ordinary rows, and a tenant that
  // deleted one must not meet it again on the next read.
  const seed =
    rows.length === 0
      ? [...SYSTEM_STATUS_DEFAULTS, ...STARTER_STATUS_DEFAULTS].sort(
          (a, b) => a.sortOrder - b.sortOrder,
        )
      : SYSTEM_STATUS_DEFAULTS.filter(
          (d) => !rows.some((r) => r.statusCode === d.statusCode),
        );
  if (seed.length > 0) {
    for (const d of seed) {
      await ctx.store.upsertStatusConfig(ctx.workspaceId, {
        statusCode: d.statusCode,
        name: d.name,
        description: d.description,
      });
    }
    rows = await ctx.store.listStatusConfigs(ctx.workspaceId);
  }
  return rows;
}

/** The status vocabulary - what every status label on screen reads. */
export async function listProductStatuses(
  ctx: CatalogContext,
): Promise<RuleResult<ProductStatusRecord[]>> {
  const gate = can(ctx.holder, ctx.entitlement, "catalog.product.view", "data");
  if (!gate.allowed) return denied(gate);
  return ok(await ensureStatusVocab(ctx));
}

/** Create a status, or rename one / edit its 状态描述 (upsert by the code
 * anchor - the canonical rows rename like any other row). */
export async function saveProductStatus(
  ctx: CatalogContext,
  input: { statusCode: string; name: string; description?: string | null },
): Promise<RuleResult<ProductStatusRecord>> {
  const gate = can(ctx.holder, ctx.entitlement, "catalog.product.upsert", "data");
  if (!gate.allowed) return denied(gate);

  await ensureStatusVocab(ctx);
  const plan = planStatus({
    statusCode: input.statusCode,
    name: input.name,
    description: input.description ?? null,
  });
  if (!plan.ok) return plan as RuleResult<ProductStatusRecord>;

  return ok(await ctx.store.upsertStatusConfig(ctx.workspaceId, plan.value));
}

/**
 * Delete one ADDED status row. Canonical rows never delete
 * (planStatusRemoval); an added row is refused while products carry it.
 */
export async function removeProductStatus(
  ctx: CatalogContext,
  input: { statusId: string },
): Promise<RuleResult<true>> {
  const gate = can(ctx.holder, ctx.entitlement, "catalog.product.upsert", "data");
  if (!gate.allowed) return denied(gate);

  const row = (await ctx.store.listStatusConfigs(ctx.workspaceId)).find(
    (r) => r.id === input.statusId,
  );
  if (!row) return fail(violation("not_found", "no such status", "statusId"));

  const carrying = await ctx.store.countProductsByStatusId(ctx.workspaceId, input.statusId);
  const plan = planStatusRemoval(row.statusCode, carrying);
  if (!plan.ok) return plan as RuleResult<true>;

  await ctx.store.removeStatusConfig(ctx.workspaceId, input.statusId);
  return ok(true);
}

/** Reorder the status vocabulary. */
export async function moveProductStatus(
  ctx: CatalogContext,
  input: { statusId: string; direction: "up" | "down" },
): Promise<RuleResult<true>> {
  const gate = can(ctx.holder, ctx.entitlement, "catalog.product.upsert", "data");
  if (!gate.allowed) return denied(gate);

  const rows = await ensureStatusVocab(ctx);
  const plan = planMove(
    rows.map((r) => ({ id: r.id, movable: true })),
    input.statusId,
    input.direction,
  );
  if (!plan.ok) return plan as RuleResult<true>;

  await ctx.store.setStatusConfigOrder(ctx.workspaceId, plan.value);
  return ok(true);
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

  // THE CHAIN IS ASSERTED, NOT INFERRED (incr/0030). The new entry records
  // which price it replaced - the one in force for this product and currency
  // at the moment of writing - so an analysis of how a price moved reads the
  // decisions somebody made rather than an order a sort produced. Null when
  // this is the product's first price.
  const now = plan.value.effectiveAt.getTime();
  const supersedesId =
    (await ctx.store.listPrices(ctx.workspaceId))
      .filter(
        (e) =>
          e.productId === plan.value.productId &&
          e.currency === plan.value.currency &&
          e.effectiveAt.getTime() <= now,
      )
      .sort((a, b) => b.effectiveAt.getTime() - a.effectiveAt.getTime())[0]?.id ?? null;

  return ok(await ctx.store.appendPrice(ctx.workspaceId, { ...plan.value, supersedesId }));
}

/**
 * Delete one price entry.
 *
 * `catalog.pricebook.upsert`, the same permission that sets one: whoever may
 * move the floor may remove a floor they just typed wrong. What they may NOT
 * remove is the row a quote reads or a signature cites - planPriceRemoval
 * decides, and both refusals name what stands in the way.
 */
export async function removePrice(
  ctx: CatalogContext,
  input: { priceId: string },
): Promise<RuleResult<true>> {
  const gate = can(ctx.holder, ctx.entitlement, "catalog.pricebook.upsert", "data");
  if (!gate.allowed) return denied(gate);

  const prices = await ctx.store.listPrices(ctx.workspaceId);
  const entry = prices.find((e) => e.id === input.priceId);
  if (!entry) return fail(violation("not_found", "no such price entry", "priceId"));

  // In force = the newest entry for this product+currency that has taken
  // effect. Recomputed here rather than trusted from the caller: the interface
  // disables the control, the service decides.
  const now = Date.now();
  const inForce =
    prices
      .filter(
        (e) =>
          e.productId === entry.productId &&
          e.currency === entry.currency &&
          e.effectiveAt.getTime() <= now,
      )
      .sort((a, b) => b.effectiveAt.getTime() - a.effectiveAt.getTime())[0]?.id === entry.id;

  const approvals = await ctx.store.allApprovals(ctx.workspaceId);
  const signaturesOnFloor = approvals.filter(
    (a) =>
      a.productId === entry.productId &&
      a.currency === entry.currency &&
      a.floorPrice === entry.floorPrice,
  ).length;

  const plan = planPriceRemoval({ inForce, signaturesOnFloor });
  if (!plan.ok) return plan as RuleResult<true>;

  const removed = await ctx.store.removePrice(ctx.workspaceId, input.priceId);
  if (!removed) return fail(violation("not_found", "no such price entry", "priceId"));
  return ok(true);
}

/**
 * What the price book has to say about itself.
 *
 * GATED ON THE PRICE BOOK'S OWN READ, not on the write: analysis is reading
 * the floors and reasoning out loud, and a member who may see floors may see
 * what they imply. Acting on a recommendation is a separate act behind
 * `catalog.pricebook.upsert`, as every price write is.
 *
 * HISTORY IS NOT ANALYSED (owner, 2026-09-05): a superseded price is the
 * record of a decision already taken, and advising on it would be advising
 * about the past. Only the entry in force per product is considered.
 *
 * `productIds` narrows to a selection; omitted, every sellable product is
 * looked at - which is what the dock's own button asks for.
 */
export async function analysePriceBook(
  ctx: CatalogContext,
  input: { productIds?: readonly string[] } = {},
): Promise<RuleResult<PriceAdvice[]>> {
  const gate = can(ctx.holder, ctx.entitlement, "catalog.pricebook.view", "data");
  if (!gate.allowed) return denied(gate);

  const [products, statuses, prices, approvals] = await Promise.all([
    ctx.store.listProducts(ctx.workspaceId),
    ensureStatusVocab(ctx),
    ctx.store.listPrices(ctx.workspaceId),
    ctx.store.allApprovals(ctx.workspaceId),
  ]);

  // Only what can be sold is expected to carry a price: advising that a
  // retired product is unpriced would be noise the reader has to learn to
  // ignore, and a list you learn to ignore stops being read at all.
  const onSaleId = statuses.find((r) => r.statusCode === "active")?.id;
  let sellable = products.filter((p) => p.statusId === onSaleId);
  if (input.productIds && input.productIds.length > 0) {
    const wanted = new Set(input.productIds);
    sellable = sellable.filter((p) => wanted.has(p.id));
  }

  const now = Date.now();
  const inForce = new Map<string, (typeof prices)[number]>();
  for (const e of prices) {
    if (e.effectiveAt.getTime() > now) continue;
    const key = `${e.productId}::${e.currency}`;
    const held = inForce.get(key);
    if (!held || held.effectiveAt.getTime() < e.effectiveAt.getTime()) inForce.set(key, e);
  }

  const signaturesByProduct = new Map<string, number>();
  for (const a of approvals) {
    signaturesByProduct.set(a.productId, (signaturesByProduct.get(a.productId) ?? 0) + 1);
  }

  return ok(
    analysePrices({
      products: sellable,
      current: [...inForce.values()],
      allPrices: prices,
      signaturesByProduct,
    }),
  );
}
