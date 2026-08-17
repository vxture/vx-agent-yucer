import { EmptyState, ViewLayout } from "@vxture/design-ui";
import { resolveAppSession } from "../lib/session";
import { SHELL_TEXT } from "../lib/messages";
import { getAccountStore, getCopilotStore } from "../../domains/shared/registry";
import { getAccountDetail } from "../../domains/account/service";
import { listPlaybooks, listProposals } from "../../domains/copilot/service";
import { MAX_PLAYBOOKS } from "../../domains/copilot/turn-service";
import { can } from "../../authz/decide";
import { CopilotChat, type ChatMessageView } from "../components/copilot-chat";
import { PlaybookCatalog } from "../components/playbook-catalog";
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

export default async function CopilotPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string }>;
}) {
  const { account: accountId } = await searchParams;
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

  // Resolved server-side through the account service, so an id in the URL that
  // the member may not read simply does not anchor the conversation. The client
  // never supplies the name.
  const anchored = accountId
    ? await getAccountDetail(
        { ...ctx, store: getAccountStore() },
        accountId,
      )
    : null;
  const account =
    anchored?.ok === true
      ? { id: anchored.value.account.id, name: anchored.value.account.name }
      : undefined;

  const [proposals, playbooks, sessions] = await Promise.all([
    listProposals(ctx, { limit: 100 }),
    listPlaybooks(ctx, { activeOnly: true }),
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
    <ViewLayout>
      <CopilotChat
        initialMessages={initialMessages}
        sessionId={latest?.id ?? null}
        canAsk={can(session.authz, session.entitlement, "copilot.ask", "ui").allowed}
        account={account}
        onAsk={askCopilot}
      />
      <ProposalQueue
        actions={proposals.value}
        canDecide={can(session.authz, session.entitlement, "copilot.action.decide", "ui").allowed}
        onDecide={adjudicateProposals}
      />
      {/* Below the queue, not above it: the plays explain the agent's answers,
          they are not something to act on. A failed read is silence rather than
          an error - grounding is an enhancement, and the same is true of being
          able to inspect it. */}
      {playbooks.ok ? (
        <PlaybookCatalog playbooks={playbooks.value} maxPerTurn={MAX_PLAYBOOKS} />
      ) : null}
    </ViewLayout>
  );
}
