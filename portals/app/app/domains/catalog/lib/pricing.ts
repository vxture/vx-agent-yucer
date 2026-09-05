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
export function priceLine(draft: DraftLine, entry: PriceEntryRecord | null): PricedLine {
  const currency = draft.currency ?? entry?.currency ?? "CNY";
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
  unit: string;
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
 * three different deals. The DDL defaults it to "set", which is a shipping
 * default, not permission to leave it blank when a person is typing.
 */
export function planProduct(input: ProductDraft): RuleResult<ProductDraft> {
  if (!input.productCode.trim()) {
    return fail(violation("code_required", "a product needs a code", "productCode"));
  }
  if (!input.name.trim()) {
    return fail(violation("name_required", "a product needs a name", "name"));
  }
  if (!input.unit.trim()) {
    return fail(violation("unit_required", "a product needs a unit of sale", "unit"));
  }
  return ok({
    ...input,
    productCode: input.productCode.trim(),
    name: input.name.trim(),
    unit: input.unit.trim(),
  });
}

export interface SolutionDraft {
  solutionCode: string;
  name: string;
  summary: string | null;
  status: "active" | "retired";
}

export interface SolutionItemDraft {
  productId: string;
  quantity: number;
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
  return ok({
    solution: {
      ...input,
      solutionCode: input.solutionCode.trim(),
      name: input.name.trim(),
      summary: input.summary?.trim() || null,
    },
    items: [...items],
  });
}

export interface PriceDraft {
  productId: string;
  currency: string;
  listPrice: number;
  floorPrice: number;
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
  if (input.listPrice < 0 || input.floorPrice < 0) {
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
