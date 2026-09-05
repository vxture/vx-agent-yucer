import { fail, ok, violation, type RuleResult } from "../../shared/result";

// The PRODUCT ROSTER's own rules: deletion and manual order. The two config
// vocabularies keep their rules in type-vocab.ts and status-vocab.ts, which
// deliberately know nothing of each other or of this file.

/**
 * May this product be DELETED?
 *
 * Refused while anything points at it. A deal line or a solution item holds
 * the product id; deleting the row would leave those records naming a thing
 * that no longer exists (the FKs RESTRICT for the same reason - this rule
 * exists so the refusal is a sentence, not a constraint error). Price entries
 * do NOT block: a price without its product means nothing, and the DDL
 * cascades them away.
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
 * `ordered` is the full list in current order; `movable` marks the rows the
 * moving row is displayed among (the module page splits live from retired, so
 * a move must land beside a row the user can SEE). Returns a DENSE
 * renumbering of the whole list rather than a two-row swap: rows fresh from
 * the DDL default all carry sort_order 0, and swapping two equal numbers is a
 * click that changes nothing. The first move self-heals the whole ordering.
 *
 * Generic over anything with an id - the config vocabularies order their
 * rows through this too, which is shared machinery, not shared vocabulary.
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
