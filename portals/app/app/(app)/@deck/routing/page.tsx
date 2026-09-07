import { resolveAppSession } from "../../lib/session";
import { can } from "../../../authz/decide";
import { AgentCapture } from "../../components/agent-capture";
import { RoutingAssignPanel } from "../../components/routing-assign-panel";
import { analyseAssignments, applyAssignment } from "../../routing/actions";
import { deckBundle, recordAction } from "../deck-data";

// The routing module's dock - the assistant, then 智能分配.
//
// THE PROPOSALS ARE ALREADY THERE (owner, 2026-09-06, asked directly: 跑，并且
// 直接把建议列在面板里). Opening the page IS asking, so the panel arrives with
// the list rather than with a button that would produce it - and 智能分配 /
// 重新分析 becomes what it says: take the numbers again, now.
//
// COMPUTED BY THE SAME ACTION THE BUTTON CALLS, not by a second read path that
// happens to agree today. One function decides what a proposal is, so the
// first render and every re-run cannot answer differently.

export const dynamic = "force-dynamic";

export default async function RoutingDeck() {
  const [bundle, session] = await Promise.all([deckBundle(), resolveAppSession()]);
  if (!bundle || !session) return null;

  const first = await analyseAssignments();

  return (
    <div className="flex flex-col gap-sm">
      <AgentCapture data={bundle.agent} canRecord={bundle.canRecord} onRecord={recordAction("")} />
      <RoutingAssignPanel
        canAssign={
          can(session.authz, session.entitlement, "signal.lead.upsert", "ui").allowed
        }
        initial={first}
        onAnalyse={analyseAssignments}
        onAccept={applyAssignment}
      />
    </div>
  );
}
