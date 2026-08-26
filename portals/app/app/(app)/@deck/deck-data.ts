import { can } from "../../authz/decide";
import { agentPanel, type AgentScope } from "../lib/board";
import { resolveAppSession } from "../lib/session";
import { recordFollowUp } from "../account/field-actions";
import type { AgentPanelData } from "../lib/board";

// What every deck route needs, gathered once.
//
// The deck is a PARALLEL ROUTE (@deck) rather than a prop threaded through the
// layout, and that is the whole reason this file exists. A layout cannot know
// which object a page is showing - it has no params and cannot read the
// pathname - so a deck rendered by the layout can only ever report across the
// workspace. On a detail page that is not clutter, it is a WRONG ANSWER: it
// says "this is what needs deciding about the thing in front of you" while
// listing other things entirely.
//
// A parallel route lets the route that knows the object supply the deck for it,
// and default.tsx covers everywhere else.

export interface DeckBundle {
  readonly agent: AgentPanelData;
  readonly canRecord: boolean;
}

export async function deckBundle(
  scope?: AgentScope,
): Promise<DeckBundle | null> {
  const session = await resolveAppSession();
  if (!session) return null;

  const agent = await agentPanel(
    {
      workspaceId: session.workspaceId,
      sub: session.user.sub,
      holder: session.authz,
      entitlement: session.entitlement,
    },
    new Date(),
    scope,
  );

  return {
    agent,
    canRecord: can(session.authz, session.entitlement, "account.upsert", "ui")
      .allowed,
  };
}

/**
 * Recording a note from the deck.
 *
 * The account id is a parameter now rather than always "". An unanchored note
 * is still worth keeping - demanding one at capture time is the friction
 * ADR-012's kill criterion measures - but when the deck IS looking at an
 * account, the note it captures obviously belongs to it, and making the reader
 * re-state that would be asking them to type what the screen already knows.
 */
export function recordAction(accountId: string) {
  return async (text: string) => {
    "use server";
    return recordFollowUp(accountId, {
      channel: "other",
      occurredAt: new Date().toISOString(),
      rawNote: text,
    });
  };
}
