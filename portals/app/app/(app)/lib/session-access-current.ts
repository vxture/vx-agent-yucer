import { can } from "../../authz/decide";
import { resolveFreshAppSession, type AppSession } from "./session";

type OutputSession = Pick<AppSession, "user" | "workspaceId" | "authz" | "entitlement" | "scope">;
/** Long-running legacy assistant output is revalidated like private tasks. */
export async function copilotSessionStillCurrent(
  original: OutputSession, resolve: () => Promise<OutputSession | null> = resolveFreshAppSession,
): Promise<boolean> {
  const current = await resolve().catch(() => null);
  return !!current && current.user.sub === original.user.sub && current.user.activeOrg === original.user.activeOrg && current.workspaceId === original.workspaceId
    && can(current.authz, current.entitlement, "copilot.ask", "data").allowed
    && JSON.stringify([...current.authz.permissions].sort()) === JSON.stringify([...original.authz.permissions].sort())
    && JSON.stringify(current.scope) === JSON.stringify(original.scope);
}
