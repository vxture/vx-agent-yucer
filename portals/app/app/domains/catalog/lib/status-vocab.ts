import { fail, ok, violation, type RuleResult } from "../../shared/result";

// The STATUS vocabulary's rules - and nothing else's (owner ruling
// 2026-09-05: 类型是类型，状态是状态; this file and type-vocab.ts import
// nothing from each other).
//
// A status describes ONLY what stage a product is at. The rows themselves
// are the content - a status has no enablement and no hidden "behavior"
// classification. Each row is a code (anchor), a name, and a 状态描述.
//
// THE THREE CANONICAL ROWS are seeded per workspace (the DDL backfills
// existing workspaces; the service materialises them for fresh ones from the
// defaults below). They are protected from DELETION - not because the two
// vocabularies are related, but because the module page's rosters, its two
// tags and the 上线/退役 row operations are wired to these rows by code.
// They rename and reorder freely; workspace-added statuses take the full
// operation set.

export const SYSTEM_STATUS_CODES = ["in_development", "active", "retired"] as const;
export type SystemStatusCode = (typeof SYSTEM_STATUS_CODES)[number];

/** The canonical rows as first created. DATA, not UI copy: the workspace owns
 * and edits these rows afterwards, which is why the defaults live in the
 * domain rather than in a message dictionary the database cannot see. */
export const SYSTEM_STATUS_DEFAULTS: readonly {
  readonly statusCode: SystemStatusCode;
  readonly name: string;
  readonly description: string;
  readonly sortOrder: number;
}[] = [
  { statusCode: "in_development", name: "在研", description: "计划中、研发中的产品：真实存在、出现在计划里，但不可报价。", sortOrder: 1 },
  { statusCode: "active", name: "在售", description: "成熟在售的产品：唯一可报价的状态。", sortOrder: 2 },
  { statusCode: "retired", name: "已退役", description: "搁置而非删除：随时可恢复在售，历史引用全部保留。", sortOrder: 3 },
];

export function isSystemStatus(statusCode: string): boolean {
  return (SYSTEM_STATUS_CODES as readonly string[]).includes(statusCode);
}

export interface StatusDraft {
  statusCode: string;
  name: string;
  description: string | null;
}

/** A status needs a code and a name; the description is welcome, not owed. */
export function planStatus(input: StatusDraft): RuleResult<StatusDraft> {
  if (!input.statusCode.trim()) {
    return fail(violation("code_required", "a status needs a code", "statusCode"));
  }
  if (!input.name.trim()) {
    return fail(violation("name_required", "a status needs a name", "name"));
  }
  return ok({
    statusCode: input.statusCode.trim(),
    name: input.name.trim(),
    description: input.description?.trim() || null,
  });
}

/**
 * May this STATUS row be deleted?
 *
 * Canonical rows never (the roster split and the row operations are wired to
 * them). Added rows: refused while products reference them - fk_product_status
 * RESTRICTs underneath, this rule is the sentence.
 */
export function planStatusRemoval(
  statusCode: string,
  productsCarrying: number,
): RuleResult<true> {
  if (isSystemStatus(statusCode)) {
    return fail(
      violation(
        "system_status",
        `${statusCode} is a canonical status; rename it, never delete it`,
        "statusCode",
      ),
    );
  }
  if (productsCarrying > 0) {
    return fail(
      violation(
        "status_in_use",
        `${productsCarrying} product(s) carry this status - move them first`,
        "statusCode",
      ),
    );
  }
  return ok(true);
}

/**
 * May a product move from one status row to another?
 *
 * One rule only: 在研 is the birth state - a product enters it by being
 * created there and never by sliding back, because the quotable set must
 * only shrink through retirement, which is visible and reversible. Every
 * other move is the workspace's own business.
 */
export function planProductStatusChange(
  fromCode: string,
  toCode: string,
): RuleResult<true> {
  if (fromCode === toCode) {
    return fail(violation("status_unchanged", `already ${fromCode}`, "status"));
  }
  if (toCode === "in_development") {
    return fail(
      violation(
        "development_is_birth_state",
        "a product enters development by being created there, never by sliding back",
        "status",
      ),
    );
  }
  return ok(true);
}
