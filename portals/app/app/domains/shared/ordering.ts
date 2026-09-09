import { fail, ok, violation, type RuleResult } from "./result";

/* 排序 - shared machinery, not shared vocabulary.
 *
 * Moved here from domains/catalog/lib/lifecycle.ts on 2026-09-09, when 角色管理
 * needed it: authz sits UNDER the domains and may import from domains/shared
 * (it already takes RuleResult from here) but never from a domain. The config
 * vocabularies, the 大区 roster and the roles all order their rows through this
 * one function.
 */

export type MoveDirection = "up" | "down" | "top" | "bottom";

/**
 * Move one row up, down, to the top or to the bottom of its VISIBLE group, by
 * renumbering.
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
  direction: MoveDirection,
): RuleResult<readonly { readonly id: string; readonly sortOrder: number }[]> {
  const at = ordered.findIndex((r) => r.id === id);
  if (at < 0) {
    return fail(violation("not_found", "no such row to move", "id"));
  }
  if (!ordered[at]!.movable) {
    return fail(violation("not_movable", "this list is not the one being ordered", "id"));
  }
  const step = direction === "up" || direction === "top" ? -1 : 1;
  let swap = at + step;
  while (swap >= 0 && swap < ordered.length && !ordered[swap]!.movable) swap += step;
  if (swap < 0 || swap >= ordered.length) {
    return fail(violation("move_at_edge", "already at the end of the list", "id"));
  }
  const next = [...ordered];
  if (direction === "up" || direction === "down") {
    [next[at], next[swap]] = [next[swap]!, next[at]!];
  } else {
    /* TO THE END: the row leaves its place and lands past the LAST movable
       row in that direction (owner, 2026-09-09: 移到最顶，移到最低). Rows it
       passes keep their relative order - only the moving row changes place. */
    const [row] = next.splice(at, 1);
    let edge = direction === "top" ? 0 : next.length;
    if (direction === "top") {
      while (edge < next.length && !next[edge]!.movable) edge += 1;
    } else {
      while (edge > 0 && !next[edge - 1]!.movable) edge -= 1;
    }
    next.splice(edge, 0, row!);
  }
  return ok(next.map((r, i) => ({ id: r.id, sortOrder: i + 1 })));
}
