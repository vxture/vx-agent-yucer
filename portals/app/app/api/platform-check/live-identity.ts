import { resolveAppSession, tenantIdOf } from "../../(app)/lib/session";
import type { LiveIdentity } from "./check";

/**
 * The signed-in member's identity for the live probes, or null - a dev
 * session carries no access token, and a workspace with no active tenant
 * cannot mint (Atlas rejects a token without one), so both fall back to the
 * description-only probes rather than failing the whole check.
 */
export async function liveIdentity(): Promise<LiveIdentity | null> {
  const session = await resolveAppSession().catch(() => null);
  if (!session || !session.accessToken) return null;
  const tenantId = tenantIdOf(session);
  if (!tenantId) return null;
  return { workspaceId: session.workspaceId, tenantId, subjectToken: session.accessToken };
}
