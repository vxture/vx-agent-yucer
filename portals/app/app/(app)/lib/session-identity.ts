/** Never serialize an RP cookie, token or central sid to the browser. */
export interface SessionIdentity {
  sub: string;
  activeOrg: string | null;
  activeWorkspace: string | null;
}

export function sameSessionIdentity(a: SessionIdentity, b: SessionIdentity): boolean {
  return a.sub === b.sub && a.activeOrg === b.activeOrg && a.activeWorkspace === b.activeWorkspace;
}
