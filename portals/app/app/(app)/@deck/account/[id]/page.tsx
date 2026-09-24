import { getAccountStore } from "../../../../domains/shared/registry";
import { getAccountDetail } from "../../../../domains/account/service";
import { resolveAppSession } from "../../../lib/session";
import { AgentPanel } from "../../../components/agent-panel";
import { deckBundle, recordAction } from "../../deck-data";
import { canAdviseOn } from "../../../../domains/copilot/lib/advisor-gate";
import { buildMeetingBriefAction } from "../../../account/meeting-brief-action";

// The deck beside one account.
//
// It reports on THIS account: the judgements whose subject it is, whatever
// their urgency, and the notes recorded against it. The unscoped deck filters
// to "due today" because it is a reason to look right rather than a second copy
// of the queue; here the question is different - not "what is due today" but
// "what is there" - so a watch-tier item about the account you are reading is
// exactly what you came to find out.
//
// The NAME IS RESOLVED THROUGH THE GATED SERVICE, never from the URL. An id in
// the address bar that the member may not read must not become a name on their
// screen; when the read is refused the deck falls back to the unscoped one
// rather than naming something it was not allowed to see.

export const dynamic = "force-dynamic";

export default async function AccountDeck({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await resolveAppSession();
  if (!session) return null;

  const detail = await getAccountDetail(
    {
      workspaceId: session.workspaceId,
      sub: session.user.sub,
      holder: session.authz,
      entitlement: session.entitlement,
      store: session.stores.account(),
    },
    id,
  );

  const bundle = await deckBundle(
    detail.ok
      ? { type: "account", id, name: detail.value.account.name }
      : undefined,
  );
  if (!bundle) return null;

  return (
    <AgentPanel
      data={bundle.agent}
      canRecord={bundle.canRecord}
      // Anchored: a note captured while reading this account belongs to it, and
      // making the reader re-state that is asking them to type what the screen
      // already knows.
      onRecord={recordAction(detail.ok ? id : "")}
      // 会前准备 (L6 batch five): the account's contacts to pick attendees
      // from - the same gated read that named the deck, not a second one.
      briefFor={
        detail.ok && canAdviseOn(session.authz, session.entitlement, "account.manage", "ui").allowed
          ? {
              accountId: id,
              contacts: detail.value.contacts.map((c) => ({ id: c.id, name: c.name, title: c.title })),
            }
          : undefined
      }
      onBuildBrief={buildMeetingBriefAction}
    />
  );
}
