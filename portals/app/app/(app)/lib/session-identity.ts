/** Never serialize an RP cookie, token or central sid to the browser. */
export interface SessionIdentity {
  sub: string;
  activeOrg: string | null;
  activeWorkspace: string | null;
  roles?: readonly string[];
  accountStatus?: string | null;
}

export function sessionIdentityKey(identity: SessionIdentity): string {
  return JSON.stringify([
    identity.sub, identity.activeOrg, identity.activeWorkspace, identity.accountStatus ?? null,
    [...(identity.roles ?? [])].sort(),
  ]);
}

export function sameSessionIdentity(a: SessionIdentity, b: SessionIdentity): boolean {
  return sessionIdentityKey(a) === sessionIdentityKey(b);
}
