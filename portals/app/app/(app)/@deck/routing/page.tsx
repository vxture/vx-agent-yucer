import { resolveAppSession } from "../../lib/session";
import { can } from "../../../authz/decide";
import { AgentCapture } from "../../components/agent-capture";
import { RoutingAssignPanel } from "../../components/routing-assign-panel";
import { analyseAssignments, applyAssignment } from "../../routing/actions";
import { deckBundle, recordAction } from "../deck-data";

// The routing module's dock - the assistant, then 智能分配.
//
// NOTHING IS COMPUTED HERE. The owner's ruling of 2026-09-06 makes the
// analysis something a person ASKS for, so this route renders a panel in its
// idle state and the work happens in a server action when a button is pressed.
// An earlier version read territories, accounts and leads on every render to
// show findings nobody had asked for - which is the same over-reach the page
// itself was carrying.

export const dynamic = "force-dynamic";

export default async function RoutingDeck() {
  const [bundle, session] = await Promise.all([deckBundle(), resolveAppSession()]);
  if (!bundle || !session) return null;

  return (
    <div className="flex flex-col gap-sm">
      <AgentCapture data={bundle.agent} canRecord={bundle.canRecord} onRecord={recordAction("")} />
      <RoutingAssignPanel
        canAssign={
          can(session.authz, session.entitlement, "signal.lead.upsert", "ui").allowed
        }
        onAnalyse={analyseAssignments}
        onAccept={applyAssignment}
      />
    </div>
  );
}
