import type { ReactNode } from "react";
import { resolveAppSession } from "../lib/session";
import { can } from "../../authz/decide";
import { getAutonomy } from "../../domains/copilot/service";
import { getCopilotStore } from "../../domains/shared/registry";
import { AssistantModeProvider } from "./assistant-mode";

export async function AssistantProvider({ children }: { readonly children: ReactNode }) {
  const session = await resolveAppSession();
  if (!session) return null;
  const autonomy = await getAutonomy({ workspaceId: session.workspaceId, sub: session.user.sub, holder: session.authz, entitlement: session.entitlement, store: getCopilotStore() });
  const decision = can(session.authz, session.entitlement, "copilot.autopilot.enable", "ui");
  return <AssistantModeProvider mode={autonomy.ok ? autonomy.value.mode : undefined}
    canChange={decision.allowed} reason={decision.reason ?? undefined}>
    {children}
  </AssistantModeProvider>;
}
