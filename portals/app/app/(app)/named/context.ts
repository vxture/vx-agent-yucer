import type { AppSession } from "../lib/session";
import { salesPlanContext } from "../planning/plan-data";
import { getAuthzStore } from "../../authz/store";
export function focusContext(session: AppSession) {
  return { ...salesPlanContext(session), accounts: session.stores.account(), pipeline: session.stores.pipeline(), members: async () => (await getAuthzStore().listMembers(session.workspaceId)).filter(m => m.status === "active").map(m => ({ sub: m.sub, name: m.displayName ?? m.sub })) };
}
