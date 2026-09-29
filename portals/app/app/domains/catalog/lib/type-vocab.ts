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
/** Sized for >=80% of common B2B catalogues (owner ruling): software
 * vendors, SaaS, device makers, manufacturers, distributors, integrators
 * and service firms all find their rows here; a tenant deletes the rest. */
export const DEFAULT_TYPE_VOCABULARY: readonly {
  readonly typeCode: string;
  readonly typeNo: string;
  readonly name: string;
}[] = [
  { typeCode: "software", typeNo: "01", name: "软件产品" },
  { typeCode: "subscription", typeNo: "02", name: "订阅服务" },
  { typeCode: "hardware", typeNo: "03", name: "硬件设备" },
  { typeCode: "goods", typeNo: "04", name: "实物商品" },
  { typeCode: "consumables", typeNo: "05", name: "耗材配件" },
  { typeCode: "implementation", typeNo: "06", name: "实施服务" },
  { typeCode: "maintenance", typeNo: "07", name: "维保服务" },
  { typeCode: "training", typeNo: "08", name: "培训服务" },
  { typeCode: "consulting", typeNo: "09", name: "咨询服务" },
];

export interface ProductTypeDraft {
  /** The category's code, or null for a level that carries none (incr/0101). */
  typeCode: string | null;
  typeNo: string;
  name: string;
  status: "active" | "retired";
}

/**
 * One type's own fields: a code, a two-digit number and a name.
 *
 * THREE IDENTIFIERS, EACH WITH ONE JOB (owner, 2026-09-29): the id is the
 * identity and is never shown; the code is the English code, editable, what
 * imports match on; the number is what people read, 01 or 01-02.
 */
export function planProductType(input: ProductTypeDraft): RuleResult<ProductTypeDraft> {
  if (!input.name.trim()) {
    return fail(violation("name_required", "a type needs a name", "name"));
  }
  if (!/^[0-9]{2}$/.test(input.typeNo.trim())) {
    return fail(violation("type_no_invalid", "a type number is two digits, 01-99", "typeNo"));
  }
  return ok({
    ...input,
    // ONE CODE PER CATEGORY (incr/0101): a level may carry none. The service
    // decides which row the category's code belongs to.
    typeCode: input.typeCode?.trim() || null,
    typeNo: input.typeNo.trim(),
    name: input.name.trim(),
  });
}

/** The fields placement is judged on - enough of a type to compare. */
export interface TypeSlot {
  readonly id?: string;
  readonly typeCode: string | null;
  readonly typeNo: string;
  readonly parentId: string | null;
}

/**
 * May this type sit where it is being put, beside the types already there?
 *
 * - the code is unique in the workspace (imports match on it);
 * - the number is unique among its siblings (01 once among 一级类, once under
 *   each 一级类);
 * - two levels at most: a parent must be a 一级类, and a 一级类 that has
 *   children cannot itself move under another.
 *
 * The same rules hold in the database (uidx_product_type_code,
 * uidx_product_type_no, trg_product_type_two_levels); this is where the
 * person hears which one, in their own words.
 */
export function planTypePlacement(
  slot: TypeSlot,
  existing: readonly { id: string; typeCode: string | null; typeNo: string; parentId: string | null }[],
): RuleResult<true> {
  const others = existing.filter((t) => t.id !== slot.id);
  if (slot.typeCode !== null && others.some((t) => t.typeCode === slot.typeCode)) {
    return fail(violation("type_code_taken", `code ${slot.typeCode} is already used`, "typeCode"));
  }
  if (others.some((t) => t.parentId === slot.parentId && t.typeNo === slot.typeNo)) {
    return fail(violation("type_no_taken", `number ${slot.typeNo} is already used at this level`, "typeNo"));
  }
  if (slot.parentId !== null) {
    const parent = existing.find((t) => t.id === slot.parentId);
    if (!parent || parent.parentId !== null || parent.id === slot.id) {
      return fail(violation("type_parent_invalid", "a parent must be a top-level type", "parentId"));
    }
    if (slot.id && existing.some((t) => t.parentId === slot.id)) {
      return fail(violation("type_has_children", "a type with sub-types cannot become a sub-type", "parentId"));
    }
  }
  return ok(true);
}

/** How a type reads everywhere: number 01 / 01-02, name 软件产品 /
 *  软件产品-基础软件 (owner, 2026-09-29: 两个字段，连接显示). */
export interface TypeLabel {
  readonly no: string;
  readonly name: string;
}

export function typeLabel(
  types: readonly { id: string; typeNo: string; name: string; parentId: string | null }[],
  typeId: string | null,
): TypeLabel | null {
  if (!typeId) return null;
  const t = types.find((x) => x.id === typeId);
  if (!t) return null;
  const parent = t.parentId ? types.find((x) => x.id === t.parentId) : undefined;
  return parent
    ? { no: `${parent.typeNo}-${t.typeNo}`, name: `${parent.name}-${t.name}` }
    : { no: t.typeNo, name: t.name };
}

/** A type and its sub-types - what "filter by this type" matches: choosing a
 *  一级类 includes everything under it. */
export function typeFamily(
  types: readonly { id: string; parentId: string | null }[],
  typeId: string,
): ReadonlySet<string> {
  return new Set([typeId, ...types.filter((t) => t.parentId === typeId).map((t) => t.id)]);
}

/** Types in reading order: by number, each 一级类 followed by its 二级类. */
export function typesInOrder<T extends { id: string; typeNo: string; parentId: string | null }>(
  types: readonly T[],
): T[] {
  const byNo = (a: T, b: T) => a.typeNo.localeCompare(b.typeNo);
  const tops = types.filter((t) => t.parentId === null).sort(byNo);
  return tops.flatMap((top) => [top, ...types.filter((t) => t.parentId === top.id).sort(byNo)]);
}

/**
 * May this TYPE be deleted?
 *
 * Refused while products carry it - fk_product_type RESTRICTs underneath,
 * this rule is the sentence - and while it still has sub-types
 * (fk_product_type_parent RESTRICTs those). An in-use type's exit is
 * retirement, which keeps rendering on the products that already carry it.
 */
export function planTypeRemoval(productsCarrying: number, children = 0): RuleResult<true> {
  if (children > 0) {
    return fail(violation("type_has_children", `${children} sub-type(s) sit under this type - remove them first`, "typeCode"));
  }
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
