// Pure gate decisions, with NO session and NO persistence in the import graph.
//
// This split is a bundling boundary, not a stylistic one. context.ts resolves a
// member from the database, so it transitively pulls in lib/db.ts, the Prisma
// adapter and the pg driver - which reaches for `net` and `tls` and cannot be
// bundled for the browser. Any client component that wants to know "may this
// member do X" would drag the whole database client in with it.
//
// So the decision logic lives here and depends only on a permission set, and
// context.ts (server-only) re-exports it for callers that already hold a context.

import type { Entitlement } from "../entitlement/types";
import { authorize, type Decision, type Surface } from "./gate";
import { specFor, type ActionId } from "./actions";
import type { PermCode } from "./catalog";

/**
 * The minimum a decision needs. AuthzContext satisfies this structurally, so a
 * server caller passes its context unchanged and a client caller can pass a
 * plain permission set it was handed as props.
 */
export interface PermissionHolder {
  readonly permissions: ReadonlySet<PermCode>;
}

/**
 * Both gates for a named action. `surface` is the call site's, not the action's:
 * a page render passes "ui", an API route passes "data".
 */
export function can(
  holder: PermissionHolder,
  entitlement: Entitlement,
  action: ActionId,
  surface: Surface = "data",
): Decision {
  const spec = specFor(action);
  return authorize({
    entitlement,
    surface,
    feature: spec.feature,
    permission: spec.permission,
    held: holder.permissions,
  });
}

/**
 * Every action's decision in one pass, for rendering a surface without asking
 * the gate once per button. Same inputs, same order, same answers as can().
 */
export function decisionsFor(
  holder: PermissionHolder,
  entitlement: Entitlement,
  actions: readonly ActionId[],
  surface: Surface = "ui",
): Record<string, Decision> {
  const out: Record<string, Decision> = {};
  for (const a of actions) out[a] = can(holder, entitlement, a, surface);
  return out;
}
