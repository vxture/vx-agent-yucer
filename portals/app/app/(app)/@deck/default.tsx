import { AgentPanel } from "../components/agent-panel";
import { deckBundle, recordAction } from "./deck-data";

// The deck everywhere that has no deck of its own.
//
// Unscoped: it reports across the workspace, which is the right answer beside
// a first-level page - those pages ask "how are things across the board" and
// the deck answers in the same register.
//
// THE ASSISTANT AND NOTHING ELSE (owner, 2026-10-02): no 今天要定的, no 敌情.
// A page without a deck of its own has no decisions of its own to show, and a
// workspace-wide list there is some other module's information in this one's
// sidebar. The assistant fills the whole column.

export const dynamic = "force-dynamic";

export default async function DefaultDeck() {
  const bundle = await deckBundle();
  if (!bundle) return null;

  return (
    <AgentPanel
      data={bundle.agent}
      canRecord={bundle.canRecord}
      canAsk={bundle.canAsk}
      decisions={false}
      // No account id: an unanchored note is still worth keeping, and demanding
      // one at capture time is the friction ADR-012's kill criterion measures.
      onRecord={recordAction("")}
    />
  );
}
