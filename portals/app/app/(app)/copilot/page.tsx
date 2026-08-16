import { EmptyState, PageStack } from "@vxture/design-system";
import { resolveAppSession } from "../lib/session";
import { SHELL_TEXT } from "../lib/messages";
import { getCopilotStore } from "../../domains/shared/registry";
import { listProposals } from "../../domains/copilot/service";
import { can } from "../../authz/decide";
import { CopilotChat, type ChatMessageView } from "../components/copilot-chat";
import { ProposalQueue } from "../components/proposal-queue";
import { adjudicateProposals } from "./actions";
import { askCopilot } from "./ask-action";

// D8 copilot: the conversation and the proposal queue on one page.
//
// They belong together and stay VISUALLY SEPARATE. The conversation is where
// the agent talks; the queue is where a human signs. Merging them - letting a
// proposal be accepted from inside a chat bubble - is the frictionless path that
// turns the human-in-the-loop rule into a rubber stamp, which is precisely the
// failure ADR-003 exists to prevent.

export const dynamic = "force-dynamic";

export default async function CopilotPage() {
  const session = await resolveAppSession();
  if (!session) {
    return <EmptyState title={SHELL_TEXT.signedOutTitle} description={SHELL_TEXT.signedOutDescription} />;
  }

  const ctx = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: getCopilotStore(),
  };

  const [proposals, sessions] = await Promise.all([
    listProposals(ctx, { limit: 100 }),
    ctx.store.listSessions(session.workspaceId, session.user.sub, 1),
  ]);

  if (!proposals.ok) {
    return (
      <EmptyState
        title={SHELL_TEXT.loadFailed}
        description={proposals.violations.map((v) => v.message).join("; ")}
      />
    );
  }

  // Resume the most recent session rather than opening a new one on every page
  // load: a copilot that forgets the last exchange every time you navigate is
  // not a copilot.
  const latest = sessions[0] ?? null;
  const history = latest ? await ctx.store.listMessages(session.workspaceId, latest.id) : [];
  const initialMessages: ChatMessageView[] = history
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  return (
    <PageStack>
      <CopilotChat
        initialMessages={initialMessages}
        sessionId={latest?.id ?? null}
        canAsk={can(session.authz, session.entitlement, "copilot.ask", "ui").allowed}
        onAsk={askCopilot}
      />
      <ProposalQueue
        actions={proposals.value}
        canDecide={can(session.authz, session.entitlement, "copilot.action.decide", "ui").allowed}
        onDecide={adjudicateProposals}
      />
    </PageStack>
  );
}
