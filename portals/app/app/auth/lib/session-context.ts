import type { AccessClaims } from "./claims";

/** Only verified claims are passed here. Compare authorization scope, not JWT
 * timestamps or token strings; a role-order change is not an identity change. */
export function sameAccessScope(a: AccessClaims, b: AccessClaims): boolean {
  return a.sub === b.sub
    && (a.active_org ?? null) === (b.active_org ?? null)
    && (a.active_workspace ?? null) === (b.active_workspace ?? null)
    && (a.account_status ?? null) === (b.account_status ?? null)
    && JSON.stringify([...(a.roles ?? [])].sort(ordinal)) === JSON.stringify([...(b.roles ?? [])].sort(ordinal));
}

function ordinal(a: string, b: string): number {
  return a < b ? -1 : Number(a > b);
}
