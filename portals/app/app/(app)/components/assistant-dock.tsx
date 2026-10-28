import type { ReactNode } from "react";
import { resolveAppSession } from "../lib/session";
import { can } from "../../authz/decide";
import { getAutonomy } from "../../domains/copilot/service";
import { getCopilotStore } from "../../domains/shared/registry";
import { AssistantMode } from "./assistant-mode";

export async function AssistantDock({ children }: { readonly children: ReactNode }) {
  const session = await resolveAppSession();
  if (!session) return null;
  const autonomy = await getAutonomy({ workspaceId: session.workspaceId, sub: session.user.sub, holder: session.authz, entitlement: session.entitlement, store: getCopilotStore() });
  return <div className="flex h-full min-h-0 flex-col gap-sm">
    {autonomy.ok ? <AssistantMode mode={autonomy.value.mode} canChange={can(session.authz, session.entitlement, "copilot.autopilot.enable", "ui").allowed} /> : null}
    <div className="min-h-0 flex-1">{children}</div>
  </div>;
}
