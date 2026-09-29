import type { PriceEntryRecord } from "../store";
import { fail, ok, violation, type RuleResult } from "../../shared/result";

// Pricing and reconciliation - the two rules the catalogue exists to carry.
// Pure, so both can be tested without a store and without a deal.

export interface DraftLine {
  readonly productId: string;
  readonly solutionId?: string | null;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly currency?: string;
  /** 本单定制说明 (incr/0082). Undefined = not restated by this save. */
  readonly customNote?: string | null;
}

export interface PricedLine {
  readonly productId: string;
  readonly solutionId: string | null;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly amount: number;
  readonly currency: string;
  /** True when the price fell below the product's floor - a human must sign. */
  readonly needsApproval: boolean;
  readonly customNote: string | null;
}

/**
 * Price a draft line against the book.
 *
 * `needsApproval` is COMPUTED here and never accepted from a caller. A flag a
 * client could set is not an approval gate; it is a suggestion the client can
 * decline to make.
 *
 * A product with no price entry does NOT get flagged. "Below floor" and "has no
 * floor" are different states, and treating an unpriced product as a discount
 * breach would make every new product need approval on its first quote, which
 * teaches people that the flag means nothing.
 */
export function priceLine(
  draft: DraftLine,
  entry: PriceEntryRecord | null,
  /** The workspace's default (incr/0044) - what a line is priced in when
   *  neither the draft nor the book says. Passed rather than assumed: this
   *  function is pure, and a literal here was one of the eleven. */
  defaultCurrency: string,
): PricedLine {
  const currency = draft.currency ?? entry?.currency ?? defaultCurrency;
  // Rounded to cents at the line, so a sum of lines cannot drift from a header
  // by fractions no screen ever shows.
  const amount = Math.round(draft.quantity * draft.unitPrice * 100) / 100;
  return {
    productId: draft.productId,
    solutionId: draft.solutionId ?? null,
    quantity: draft.quantity,
    unitPrice: draft.unitPrice,
    amount,
    currency,
    needsApproval: entry !== null && draft.unitPrice < entry.floorPrice,
    customNote: draft.customNote ?? null,
  };
}

/**
 * The entry IN FORCE for each product in one currency: the newest that has
 * taken effect by `now`. A future-dated entry is a decision made and not yet
 * in force, so it does not count. Products with no entry are absent - "not
 * priced" is its own state, not a zero.
 *
 * `now` is passed, not read: the caller is a server render, and a clock read
 * again during hydration is a different clock.
 */
export function inForceByProduct(
  prices: readonly PriceEntryRecord[],
  currency: string,
  now: number,
): Map<string, PriceEntryRecord> {
  const out = new Map<string, PriceEntryRecord>();
  for (const e of prices) {
    if (e.currency !== currency || e.effectiveAt.getTime() > now) continue;
    const held = out.get(e.productId);
    if (!held || held.effectiveAt.getTime() < e.effectiveAt.getTime()) out.set(e.productId, e);
  }
  return out;
}

/**
 * One solution's list reading (owner, 2026-09-29: 涵盖产品类型 + 标准价合计).
 *
 * `typeIds` - the product types its items cover, in `typeOrder` (the
 * vocabulary's order), untyped products contributing none.
 * `listTotal` - quantity x 标准价 over the STANDARD lines only; optional lines
 * are the per-deal menu, not the package's price.
 * `unpriced` - standard lines with no price in force, which the total cannot
 * include; the caller says so rather than showing a sum that silently lost a
 * product.
 */
export function solutionListFacts(
  items: readonly { productId: string; quantity: number; optional: boolean }[],
  productType: ReadonlyMap<string, string | null>,
  typeOrder: readonly string[],
  listPrice: ReadonlyMap<string, number>,
): { typeIds: string[]; listTotal: number; unpriced: number } {
  const covered = new Set(
    items.map((i) => productType.get(i.productId)).filter((t): t is string => !!t),
  );
  let total = 0;
  let unpriced = 0;
  for (const i of items) {
    if (i.optional) continue;
    const price = listPrice.get(i.productId);
    if (price === undefined) unpriced += 1;
    else total += i.quantity * price;
  }
  return {
    typeIds: typeOrder.filter((t) => covered.has(t)),
    listTotal: Math.round(total * 100) / 100,
    unpriced,
  };
}

/**
 * The deal total, from its lines.
 *
 * ADR-014 section 2: when lines exist they are authoritative and the header is
 * their sum. This is the only place that sum is computed, so the two numbers
 * cannot drift - "the total and the detail disagree" is the most common and the
 * hardest-to-trace mess this kind of system produces.
 */
export function lineTotal(lines: readonly { amount: number }[]): number {
  return Math.round(lines.reduce((sum, l) => sum + l.amount, 0) * 100) / 100;
}

/** Does the stored header still match its lines? */
export function reconciles(headerAmount: number | null, lines: readonly { amount: number }[]): boolean {
  // No lines means the header stands alone - the legacy shape, legal, not a
  // mismatch.
  if (lines.length === 0) return true;
  return headerAmount !== null && Math.abs(headerAmount - lineTotal(lines)) < 0.005;
}

/**
 * Roll lines up by product.
 *
 * The reason opportunity_line exists at all: "4,200,000 committed" says nothing
 * about which product line carries it.
 */
export function byProduct(
  lines: readonly { productId: string; amount: number; quantity: number }[],
): Map<string, { amount: number; quantity: number; lines: number }> {
  const out = new Map<string, { amount: number; quantity: number; lines: number }>();
  for (const l of lines) {
    const prev = out.get(l.productId) ?? { amount: 0, quantity: 0, lines: 0 };
    out.set(l.productId, {
      amount: Math.round((prev.amount + l.amount) * 100) / 100,
      quantity: prev.quantity + l.quantity,
      lines: prev.lines + 1,
    });
  }
  return out;
}

// --- catalogue writes (batch 6b-1b) -----------------------------------------

export interface ProductDraft {
  productCode: string;
  name: string;
  /** The type association, by uuid (incr/0029). */
  typeId: string | null;
  /** The unit association, by uuid (incr/0037) - a vocabulary row, not a
   * typed string. See below for why this field is not decoration. */
  unitId: string;
  /** A status row's uuid; the SERVICE validates it against the vocabulary
   * (a pure rule cannot see workspace state). */
  statusId: string;
}

/**
 * A product needs a code, a name and a unit.
 *
 * THE UNIT IS NOT DECORATION. Every line multiplies quantity by unit price, so
 * a product whose unit nobody declared produces a number whose meaning nobody
 * can state - "10 x 1000" is ten seats or ten days or ten sites, and those are
 * three different deals.
 *
 * IT IS A VOCABULARY ROW SINCE 0037, not a typed string, and for the same
 * reason: 套 typed here and 台 typed there are two units nobody can group by.
 * A pure rule cannot check the uuid against the workspace's vocabulary - the
 * SERVICE does that, exactly as it does for statusId.
 */
export function planProduct(input: ProductDraft): RuleResult<ProductDraft> {
  if (!input.productCode.trim()) {
    return fail(violation("code_required", "a product needs a code", "productCode"));
  }
  if (!input.name.trim()) {
    return fail(violation("name_required", "a product needs a name", "name"));
  }
  if (!input.unitId.trim()) {
    return fail(violation("unit_required", "a product needs a unit of sale", "unitId"));
  }
  return ok({
    ...input,
    productCode: input.productCode.trim(),
    name: input.name.trim(),
    unitId: input.unitId.trim(),
  });
}

export interface SolutionDraft {
  solutionCode: string;
  name: string;
  summary: string | null;
  /** 适用场景 - incr/0031. */
  scenario: string | null;
  status: "active" | "retired";
}

export interface SolutionItemDraft {
  productId: string;
  quantity: number;
  /** Standard or add-on - the customisation inside the combination. */
  optional?: boolean;
  /** What is tailored about this line. */
  note?: string | null;
}

/**
 * A solution is a bundle, so it must contain something.
 *
 * An empty solution is a name with nothing behind it, and the read service
 * already treats items as part of what a solution IS. Quantities must be
 * positive: a zero-quantity item is a product someone meant to remove and
 * did not, and it would silently contribute nothing to every quote built from
 * the template.
 */
export function planSolution(
  input: SolutionDraft,
  items: readonly SolutionItemDraft[],
): RuleResult<{ solution: SolutionDraft; items: SolutionItemDraft[] }> {
  if (!input.solutionCode.trim()) {
    return fail(violation("code_required", "a solution needs a code", "solutionCode"));
  }
  if (!input.name.trim()) {
    return fail(violation("name_required", "a solution needs a name", "name"));
  }
  if (items.length === 0) {
    return fail(
      violation("items_required", "a solution with no products is a name, not a bundle", "items"),
    );
  }
  const seen = new Set<string>();
  for (const it of items) {
    if (!(it.quantity > 0)) {
      return fail(
        violation("quantity_positive", `${it.productId} needs a quantity above zero`, "quantity"),
      );
    }
    if (seen.has(it.productId)) {
      return fail(
        violation("duplicate_product", `${it.productId} appears twice; use one line with the total`, "productId"),
      );
    }
    seen.add(it.productId);
  }
  // A SOLUTION NEEDS A STANDARD CORE (incr/0031). Everything optional is a
  // menu - a list of things that could be bought - and quoting from it starts
  // from nothing. What makes a bundle a solution is that some of it is the
  // answer and the rest is the tailoring.
  if (items.every((i) => i.optional === true)) {
    return fail(
      violation(
        "all_optional",
        "every line is optional; a solution needs a standard core, otherwise it is a menu",
        "items",
      ),
    );
  }
  return ok({
    solution: {
      ...input,
      solutionCode: input.solutionCode.trim(),
      name: input.name.trim(),
      summary: input.summary?.trim() || null,
      scenario: input.scenario?.trim() || null,
    },
    items: items.map((i) => ({
      ...i,
      optional: i.optional ?? false,
      note: i.note?.trim() || null,
    })),
  });
}

export interface PriceDraft {
  productId: string;
  currency: string;
  listPrice: number;
  floorPrice: number;
  /** 保底价 (incr/0099). Null is accepted by the TYPE because history carries
   * it, and refused by planPrice because a new price must set one. */
  minPrice: number | null;
  effectiveAt: Date;
}

/**
 * A price entry, and the floor is the whole reason this validation exists.
 *
 * `floor > list` is refused because it would make EVERY sale need a signature,
 * which is the same as having no floor at all - the DDL says so in its own
 * CHECK and this restates it where the caller can be told why rather than
 * getting a constraint name.
 *
 * A floor EQUAL to list is allowed and is meaningful: it says this product is
 * not discountable. That is a real commercial position, not a mistake.
 */
export function planPrice(input: PriceDraft): RuleResult<PriceDraft> {
  if (!input.productId) {
    return fail(violation("product_required", "a price needs a product", "productId"));
  }
  if (!input.currency.trim()) {
    return fail(violation("currency_required", "a price needs a currency", "currency"));
  }
  // 保底价 IS REQUIRED ON EVERY NEW PRICE (owner, 2026-09-29: 新设价必填).
  // Entries written before incr/0099 carry none and keep carrying none; this
  // rule only runs on a new entry, so it cannot reach back into history.
  if (input.minPrice === null || !Number.isFinite(input.minPrice)) {
    return fail(violation("min_price_required", "a new price needs a minimum price", "minPrice"));
  }
  if (input.listPrice < 0 || input.floorPrice < 0 || input.minPrice < 0) {
    return fail(violation("amount_negative", "a price cannot be negative", "listPrice"));
  }
  if (input.floorPrice > input.listPrice) {
    return fail(
      violation(
        "floor_above_list",
        "a floor above list price would make every sale need approval, which is the same as having no floor",
        "floorPrice",
      ),
    );
  }
  // min <= floor: a minimum above the approval line makes the signature
  // unreachable - every price an approver could sign would be refused anyway.
  if (input.minPrice > input.floorPrice) {
    return fail(
      violation(
        "min_above_floor",
        "a minimum above the approval price would refuse every price an approver could sign",
        "minPrice",
      ),
    );
  }
  return ok({ ...input, currency: input.currency.trim() });
}

/** What an approval has to look like to be matched against a line. */
export interface PricedApproval {
  readonly productId: string;
  readonly unitPrice: number;
  readonly currency: string;
}

/**
 * The signature covering this line, or null when nobody has signed this number.
 *
 * MATCHED ON THE PRICE, not on the line's id, and every property this feature
 * needs falls out of that (ADR-019):
 *
 *   * lines are rewritten wholesale whenever any one of them is edited, so an
 *     id-matched approval would evaporate on an unrelated edit;
 *   * re-quoting the product LOWER matches nothing and needs a new signature,
 *     which is the point - nobody signed off the new number;
 *   * re-quoting it back UP to a number that was signed off matches again, and
 *     correctly so.
 *
 * Currency is part of the match because 800 CNY and 800 USD are not the same
 * concession.
 */
export function approvalFor<A extends PricedApproval>(
  line: { readonly productId: string; readonly unitPrice: number; readonly currency: string },
  approvals: readonly A[],
): A | null {
  return (
    approvals.find(
      (a) =>
        a.productId === line.productId &&
        a.currency === line.currency &&
        a.unitPrice === line.unitPrice,
    ) ?? null
  );
}

/**
 * May this price entry be DELETED?
 *
 * THE ENTRY IN FORCE NEVER. It is what every quote reads; deleting it
 * un-prices the product silently, and an unpriced product stops being
 * flagged for discounts rather than stopping being sold.
 *
 * A SUPERSEDED ENTRY ONLY IF NO SIGNATURE LEANS ON IT. line_discount_approval
 * copies in the floor that was in force at signing (ADR-019), so an approval
 * carrying this entry's floor is a signature whose justification IS this row -
 * deleting it leaves the signature standing on a number nobody can find.
 *
 * What remains deletable is exactly what should be: a typo re-priced minutes
 * later, or a future-dated change somebody thought better of.
 */
export function planPriceRemoval(input: {
  readonly inForce: boolean;
  readonly signaturesOnFloor: number;
}): RuleResult<true> {
  if (input.inForce) {
    return fail(
      violation(
        "price_in_force",
        "this is the price the product is quoted at; re-price it instead",
        "priceId",
      ),
    );
  }
  if (input.signaturesOnFloor > 0) {
    return fail(
      violation(
        "price_signed",
        `${input.signaturesOnFloor} discount signature(s) cite this floor - deleting it would leave them unexplained`,
        "priceId",
      ),
    );
  }
  return ok(true);
}

/**
 * 原价 - what a deal's lines would come to at list price (owner, 2026-09-26:
 * 报价管理要有原价列，直观比较报价与原价).
 *
 * Each line is valued at the entry in force for its product and currency -
 * the LATEST one, the same pick `priceFor` makes when the line is priced, so
 * the list figure here is the one the floor check read. A line whose product
 * has no entry in that currency has no list price: it is counted in
 * `unpriced` and left out of BOTH sides, so the comparison is like for like
 * rather than a partial list total set against a full quote.
 *
 * `discount` is 1 - quoted / list over the priced lines: 0.12 = 12% off,
 * negative = quoted above list. Null when no line has a list price.
 */
export function listComparison(
  lines: readonly { readonly productId: string; readonly currency: string; readonly quantity: number; readonly amount: number }[],
  entries: readonly PriceEntryRecord[],
): { readonly listAmount: number | null; readonly quotedOnListed: number; readonly unpriced: number; readonly discount: number | null } {
  const latest = latestEntries(entries);
  let list = 0;
  let quoted = 0;
  let listed = 0;
  let unpriced = 0;
  for (const l of lines) {
    const entry = latest.get(`${l.productId}\u0000${l.currency}`);
    if (!entry) {
      unpriced += 1;
      continue;
    }
    listed += 1;
    list += l.quantity * entry.listPrice;
    quoted += l.amount;
  }
  const listAmount = listed === 0 ? null : Math.round(list * 100) / 100;
  const quotedOnListed = Math.round(quoted * 100) / 100;
  return {
    listAmount,
    quotedOnListed,
    unpriced,
    discount: listAmount === null || listAmount === 0 ? null : 1 - quotedOnListed / listAmount,
  };
}

/** The newest price entry per product and currency. */
function latestEntries(entries: readonly PriceEntryRecord[]): Map<string, PriceEntryRecord> {
  const latest = new Map<string, PriceEntryRecord>();
  for (const e of entries) {
    const key = `${e.productId}\u0000${e.currency}`;
    const held = latest.get(key);
    if (!held || e.effectiveAt.getTime() > held.effectiveAt.getTime()) latest.set(key, e);
  }
  return latest;
}

export interface ConcessionRow {
  readonly productId: string;
  readonly quantity: number;
  /** Per unit. Null when the product has no price entry in this currency. */
  readonly listPrice: number | null;
  readonly floorPrice: number | null;
  readonly unitPrice: number;
  /** Per unit, how far the quote sits under the floor; 0 at or above it. */
  readonly belowFloor: number;
  readonly needsApproval: boolean;
  readonly approved: boolean;
}

/**
 * 让价对照 (YC-065 R8, deal batch 10a): every line's list, floor and quote
 * side by side, and the deal's concession in total - what the approver signs
 * against. SHOWN, NEVER JUDGED: there is no "approve / reject" suggestion
 * here, only the numbers the rule already holds.
 *
 * The total counts only lines that have a list price; `unpriced` says how many
 * were left out, so a partial figure never passes for the whole deal.
 */
export function concessionSheet(
  lines: readonly {
    readonly productId: string;
    readonly currency: string;
    readonly quantity: number;
    readonly unitPrice: number;
    readonly amount: number;
    readonly needsApproval: boolean;
    readonly approved: boolean;
  }[],
  entries: readonly PriceEntryRecord[],
): {
  readonly rows: readonly ConcessionRow[];
  readonly listAmount: number | null;
  readonly concession: number | null;
  readonly rate: number | null;
  readonly unpriced: number;
} {
  const latest = latestEntries(entries);
  const round = (n: number) => Math.round(n * 100) / 100;
  let list = 0;
  let quoted = 0;
  let unpriced = 0;
  const rows = lines.map((l) => {
    const entry = latest.get(`${l.productId}\u0000${l.currency}`) ?? null;
    if (entry) {
      list += l.quantity * entry.listPrice;
      quoted += l.amount;
    } else {
      unpriced += 1;
    }
    return {
      productId: l.productId,
      quantity: l.quantity,
      listPrice: entry?.listPrice ?? null,
      floorPrice: entry?.floorPrice ?? null,
      unitPrice: l.unitPrice,
      belowFloor: entry ? round(Math.max(0, entry.floorPrice - l.unitPrice)) : 0,
      needsApproval: l.needsApproval,
      approved: l.approved,
    };
  });
  const listAmount = rows.length - unpriced === 0 ? null : round(list);
  const concession = listAmount === null ? null : round(list - quoted);
  return {
    rows,
    listAmount,
    concession,
    rate: listAmount === null || listAmount === 0 || concession === null ? null : concession / listAmount,
    unpriced,
  };
}
