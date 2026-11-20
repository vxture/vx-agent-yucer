/** Never serialize an RP cookie, token or central sid to the browser. */
export interface SessionIdentity {
  sub: string;
  activeOrg: string | null;
  activeWorkspace: string | null;
  roles?: readonly string[];
  accountStatus?: string | null;
}

export function sameSessionIdentity(a: SessionIdentity, b: SessionIdentity): boolean {
  const roles = (identity: SessionIdentity) => JSON.stringify([...(identity.roles ?? [])].sort((x, y) => x < y ? -1 : Number(x > y)));
  return a.sub === b.sub && a.activeOrg === b.activeOrg && a.activeWorkspace === b.activeWorkspace
    && (a.accountStatus ?? null) === (b.accountStatus ?? null) && roles(a) === roles(b);
}
