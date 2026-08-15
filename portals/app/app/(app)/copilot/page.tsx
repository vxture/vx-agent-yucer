import { EmptyState } from "@vxture/design-system";
import { resolveAppSession } from "../lib/session";
import { SHELL_TEXT } from "../lib/messages";
import { getCopilotStore } from "../../domains/shared/registry";
import { listProposals } from "../../domains/copilot/service";
import { ProposalQueue } from "../components/proposal-queue";
import { adjudicateProposals } from "./actions";

// D8 copilot page: the proposal queue a human adjudicates.
//
// `canDecide` only controls what the UI offers. The same gate runs again inside
// the server action, because a disabled button is a courtesy and not a control.

export const dynamic = "force-dynamic";

export default async function CopilotPage() {
  const session = await resolveAppSession();
  if (!session) {
    return <EmptyState title={SHELL_TEXT.signedOutTitle} description={SHELL_TEXT.signedOutDescription} />;
  }

  const result = await listProposals({
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: getCopilotStore(),
  });

  if (!result.ok) {
    return (
      <EmptyState
        title={SHELL_TEXT.loadFailed}
        description={result.violations.map((v) => v.message).join("; ")}
      />
    );
  }

  return (
    <ProposalQueue
      actions={result.value}
      canDecide={session.authz.permissions.has("copilot.decide")}
      onDecide={adjudicateProposals}
    />
  );
}
