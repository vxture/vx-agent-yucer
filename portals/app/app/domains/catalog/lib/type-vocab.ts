import { fail, ok, violation, type RuleResult } from "../../shared/result";

// The TYPE vocabulary's rules - and nothing else's (owner ruling 2026-09-05:
// 类型是类型，状态是状态; this file and status-vocab.ts import nothing from
// each other). A type describes what KIND of product something is, carries
// its own effective/retired state, and knows nothing about product status.

/** The product-level starter vocabulary (owner ruling 2026-09-05): a
 * delivered tenant is a USABLE product, not an empty one. Seeded once per
 * workspace on first contact, then entirely the tenant's - renamed, deleted,
 * extended to fit their own industry. Industry-neutral on purpose; the
 * industry-specific fit is the tenant's edit, not our guess. */
export const DEFAULT_TYPE_VOCABULARY: readonly {
  readonly typeCode: string;
  readonly name: string;
}[] = [
  { typeCode: "software", name: "软件" },
  { typeCode: "hardware", name: "硬件" },
  { typeCode: "service", name: "服务" },
];

export interface ProductTypeDraft {
  typeCode: string;
  name: string;
  status: "active" | "retired";
}

/**
 * A type needs a code and a name.
 *
 * The code is the workspace's anchor (upserts and imports match on it);
 * products associate by uuid, so the code never joins - it displays.
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

/**
 * May this TYPE be deleted?
 *
 * Refused while products carry it - fk_product_type RESTRICTs underneath,
 * this rule is the sentence. An in-use type's exit is retirement, which
 * keeps rendering on the products that already carry it.
 */
export function planTypeRemoval(productsCarrying: number): RuleResult<true> {
  if (productsCarrying > 0) {
    return fail(
      violation(
        "type_in_use",
        `${productsCarrying} product(s) carry this type - retire it instead`,
        "typeCode",
      ),
    );
  }
  return ok(true);
}
