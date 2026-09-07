import { resolveAppSession } from "../../lib/session";
import { can } from "../../../authz/decide";
import { AgentCapture } from "../../components/agent-capture";
import { RoutingAssignPanel } from "../../components/routing-assign-panel";
import { analyseAssignments, applyAssignment } from "../../lead/assign-actions";
import { deckBundle, recordAction } from "../deck-data";

// 线索管理's dock - the assistant, then 智能分配.
//
// THIS WAS @deck/routing FOR AN AFTERNOON. 分派 is a button inside 线索管理
// now (owner, 2026-09-06: 无需过度拆分), so its panel belongs to the lead
// module's dock rather than to a module of its own.
//
// THE PROPOSALS ARE ALREADY THERE (owner, asked directly). Opening the page IS
// asking, so the panel arrives with the list rather than with a button that
// would produce it - and 智能分配 / 重新分析 means what it says: take the
// numbers again, now.
//
// COMPUTED BY THE SAME ACTION THE BUTTON CALLS, not a second read path that
// happens to agree today. One function decides what a proposal is, so the
// first render and every re-run cannot answer differently.

export const dynamic = "force-dynamic";

export default async function LeadDeck() {
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
