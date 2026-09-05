import { fail, ok, violation, type RuleResult } from "../../shared/result";

// Product lifecycle and catalogue order - the rules behind the module page's
// row operations (owner ruling 2026-09-05). Pure, like pricing.ts next door.

/** The three system statuses, in lifecycle order. NOT workspace-configurable:
 * a status carries behaviour (only `active` is quotable), so an invented one
 * would be a state the rules cannot interpret. The config page DISPLAYS these
 * with their meaning; it edits only the type vocabulary. */
export const PRODUCT_STATUSES = ["in_development", "active", "retired"] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

/**
 * May this product move from `current` to `next`?
 *
 * in_development is a BIRTH state: a product enters it by being created there
 * and leaves it by launching (or being abandoned straight to retired). Nothing
 * returns to it - "we sold this, now we are developing it" is a new product
 * version, not a status edit, and letting rows slide back would quietly pull
 * quoted products out of the quotable set.
 *
 * retired -> active is allowed: retirement is a shelving decision, and
 * un-shelving is the same decision reversed. That reversibility is exactly why
 * the delete operation can refuse referenced products and point here instead.
 */
export function planStatusChange(
  current: ProductStatus,
  next: ProductStatus,
): RuleResult<ProductStatus> {
  if (current === next) {
    return fail(violation("status_unchanged", `already ${current}`, "status"));
  }
  if (next === "in_development") {
    return fail(
      violation(
        "development_is_birth_state",
        "a product enters development by being created there, never by sliding back",
        "status",
      ),
    );
  }
  return ok(next);
}

/**
 * May this product be DELETED?
 *
 * Refused while anything points at it. A deal line or a solution item holds
 * the product id; deleting the row would leave those records naming a thing
 * that no longer exists (the FKs RESTRICT for the same reason - this rule
 * exists so the refusal is a sentence, not a constraint error). Price entries
 * do NOT block: a price without its product means nothing, and the DDL
 * cascades them away.
 *
 * The alternative for a product with history is `retired` - which is why the
 * lifecycle keeps retirement reversible.
 */
export function planRemoval(refs: {
  readonly lines: number;
  readonly solutionItems: number;
}): RuleResult<true> {
  if (refs.lines > 0 || refs.solutionItems > 0) {
    return fail(
      violation(
        "product_in_use",
        `${refs.lines} deal line(s) and ${refs.solutionItems} solution item(s) reference it - retire instead`,
        "productId",
      ),
    );
  }
  return ok(true);
}

/**
 * Move one row up or down within its VISIBLE group, by renumbering.
 *
 * `ordered` is the workspace's full list in current order; `movable` marks the
 * rows the moving row is displayed among (the module page splits active+dev
 * from retired, so a move must land beside a row the user can SEE - swapping
 * with an invisible retired neighbour would be a click that changes nothing).
 *
 * Returns a DENSE renumbering of the whole list rather than a two-row swap:
 * rows fresh from the DDL default all carry sort_order 0, and swapping two
 * equal numbers is also a click that changes nothing. Renumbering makes the
 * first move self-heal the whole ordering.
 */
export function planMove(
  ordered: readonly { readonly id: string; readonly movable: boolean }[],
  id: string,
  direction: "up" | "down",
): RuleResult<readonly { readonly id: string; readonly sortOrder: number }[]> {
  const at = ordered.findIndex((r) => r.id === id);
  if (at < 0) {
    return fail(violation("not_found", "no such row to move", "id"));
  }
  if (!ordered[at]!.movable) {
    return fail(violation("not_movable", "this list is not the one being ordered", "id"));
  }
  const step = direction === "up" ? -1 : 1;
  let swap = at + step;
  while (swap >= 0 && swap < ordered.length && !ordered[swap]!.movable) swap += step;
  if (swap < 0 || swap >= ordered.length) {
    return fail(violation("move_at_edge", "already at the end of the list", "id"));
  }
  const next = [...ordered];
  [next[at], next[swap]] = [next[swap]!, next[at]!];
  return ok(next.map((r, i) => ({ id: r.id, sortOrder: i + 1 })));
}

// --- the type vocabulary -----------------------------------------------------

export interface ProductTypeDraft {
  typeCode: string;
  name: string;
  status: "active" | "retired";
}

/**
 * A type needs a code and a name.
 *
 * The code is what `product.category` holds by value, so it follows the anchor
 * rules (immutable after creation - the store upserts by it). The name is what
 * people read; renaming it is free precisely because nothing references it.
 */
export function planProductType(input: ProductTypeDraft): RuleResult<ProductTypeDraft> {
  if (!input.typeCode.trim()) {
    return fail(violation("code_required", "a type needs a code", "typeCode"));
  }
  if (!input.name.trim()) {
    return fail(violation("name_required", "a type needs a name", "name"));
  }
  return ok({
    ...input,
    typeCode: input.typeCode.trim(),
    name: input.name.trim(),
  });
}
