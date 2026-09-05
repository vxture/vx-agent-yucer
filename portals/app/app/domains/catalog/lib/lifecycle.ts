import { fail, ok, violation, type RuleResult } from "../../shared/result";

// Product lifecycle, catalogue order, and the two config vocabularies - the
// rules behind the module page's row operations and the config page (owner
// rulings 2026-09-05, three rounds). Pure, like pricing.ts next door.

/** The three BEHAVIORS. Not statuses any more - 0029 made statuses a
 * workspace vocabulary, and what stayed system-fixed is what a status DOES:
 * only active-behavior rows are quotable, retired-behavior rows are the
 * shelf, development-behavior rows are real but unsellable. Every rule below
 * reads behavior; codes and names belong to the workspace. */
export const STATUS_BEHAVIORS = ["in_development", "active", "retired"] as const;
export type StatusBehavior = (typeof STATUS_BEHAVIORS)[number];

/** One row of the status vocabulary as the rules see it. `name` null on an
 * unrenamed system row - the interface's default label applies. */
export interface StatusVocabRow {
  readonly id: string | null;
  readonly statusCode: string;
  readonly name: string | null;
  readonly behavior: StatusBehavior;
  readonly sortOrder: number;
  readonly status: "active" | "retired";
}

/** A system row is one of the three seeded codes - the code IS its behavior.
 * Derived, never stored: a flag could drift, the code cannot. */
export function isSystemStatus(statusCode: string): boolean {
  return (STATUS_BEHAVIORS as readonly string[]).includes(statusCode);
}

/**
 * The vocabulary a workspace actually has: its stored rows, plus a virtual
 * row for any system code it has not touched yet. Absence means "the
 * defaults", so a fresh workspace needs no seeding to have a vocabulary -
 * and the service materialises a virtual row only when somebody edits it.
 */
export function mergeStatusVocab(
  stored: readonly StatusVocabRow[],
): StatusVocabRow[] {
  const seen = new Set(stored.map((r) => r.statusCode));
  const virtual = STATUS_BEHAVIORS.filter((c) => !seen.has(c)).map(
    (code): StatusVocabRow => ({
      id: null,
      statusCode: code,
      name: null,
      behavior: code,
      // The DDL backfill's order: development 1, active 2, retired 3.
      sortOrder: STATUS_BEHAVIORS.indexOf(code) + 1,
      status: "active",
    }),
  );
  return [...stored, ...virtual].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.statusCode.localeCompare(b.statusCode),
  );
}

/**
 * May this product move from one status row to another?
 *
 * The rule reads BEHAVIOR: development is a BIRTH behavior - a product enters
 * it by being created there and nothing slides back, because the quotable set
 * must only shrink through the shelf, which is visible and reversible. Moves
 * between rows of the same behavior are legal relabelings.
 *
 * The target must also be an ENABLED row: a disabled status is a state the
 * workspace has switched off, and moving a product into it would resurrect it
 * one row at a time.
 */
export function planStatusMove(
  from: StatusVocabRow,
  to: StatusVocabRow,
): RuleResult<string> {
  if (from.statusCode === to.statusCode) {
    return fail(violation("status_unchanged", `already ${from.statusCode}`, "status"));
  }
  if (to.status === "retired") {
    return fail(violation("status_disabled", `${to.statusCode} is switched off`, "status"));
  }
  if (to.behavior === "in_development" && from.behavior !== "in_development") {
    return fail(
      violation(
        "development_is_birth_state",
        "a product enters development by being created there, never by sliding back",
        "status",
      ),
    );
  }
  return ok(to.statusCode);
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
 * The code is the workspace's anchor (upserts and imports match on it);
 * products associate by uuid since 0029, so renaming the code is merely
 * refused by the column lock, not load-bearing for joins.
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
 * Refused while products carry it - the FK RESTRICTs underneath, this rule is
 * the sentence. An in-use type's exit is retirement, which keeps rendering.
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

// --- the status vocabulary ---------------------------------------------------

export interface StatusVocabDraft {
  statusCode: string;
  name: string | null;
  behavior: StatusBehavior;
  status: "active" | "retired";
}

/**
 * Create or edit one status row.
 *
 * SYSTEM rows (the three seeded codes): behavior is the code itself and never
 * moves; the name may be cleared back to the default (null); disabling is
 * refused for `active` and `retired` - a catalogue where nothing can be sold
 * or shelved is not a catalogue. `in_development` MAY be disabled: a
 * workspace that never stages development simply switches the stage off.
 *
 * ADDED rows: code and name required, behavior chosen at creation (the store
 * cannot change it later - the column lock has no UPDATE grant on behavior).
 */
export function planStatusVocab(input: StatusVocabDraft): RuleResult<StatusVocabDraft> {
  const code = input.statusCode.trim();
  if (!code) {
    return fail(violation("code_required", "a status needs a code", "statusCode"));
  }
  const system = isSystemStatus(code);
  if (system && input.behavior !== code) {
    return fail(
      violation(
        "system_behavior_fixed",
        `${code} is a system status; its behavior is itself`,
        "behavior",
      ),
    );
  }
  if (!system && !(input.name ?? "").trim()) {
    return fail(violation("name_required", "a status needs a name", "name"));
  }
  if (!STATUS_BEHAVIORS.includes(input.behavior)) {
    return fail(violation("behavior_required", "pick what this status MEANS", "behavior"));
  }
  if (input.status === "retired" && (code === "active" || code === "retired")) {
    return fail(
      violation(
        "status_load_bearing",
        "a catalogue where nothing can be sold or shelved is not a catalogue",
        "status",
      ),
    );
  }
  return ok({
    ...input,
    statusCode: code,
    name: (input.name ?? "").trim() || null,
  });
}

/**
 * May this STATUS row be deleted?
 *
 * System rows never (disable in_development instead; active/retired are
 * load-bearing). Added rows: refused while products carry the code.
 */
export function planStatusRemoval(
  statusCode: string,
  productsCarrying: number,
): RuleResult<true> {
  if (isSystemStatus(statusCode)) {
    return fail(
      violation(
        "system_status",
        `${statusCode} is a system status; it can be renamed or (for development) disabled, never deleted`,
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
