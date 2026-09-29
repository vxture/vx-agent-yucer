import { resolveAppSession, tenantIdOf } from "../../(app)/lib/session";
import { liveIdentityFrom, type LiveIdentity } from "./check";

/** The signed-in member's identity for the live probes, or null - see
 *  liveIdentityFrom for when a session cannot mint. */
export async function liveIdentity(): Promise<LiveIdentity | null> {
  const session = await resolveAppSession().catch(() => null);
  return session ? liveIdentityFrom({ workspaceId: session.workspaceId, tenantId: tenantIdOf(session), accessToken: await session.accessToken() }) : null;
}
