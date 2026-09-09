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

/* planMove LIVES IN domains/shared/ordering.ts NOW (2026-09-09): 角色管理
   orders its roles through it, and authz sits under the domains, so the
   machinery moved to the one place both may import from. Re-exported here so
   every caller that learned it from the catalogue keeps its import. */
export { planMove, type MoveDirection } from "../../shared/ordering";
