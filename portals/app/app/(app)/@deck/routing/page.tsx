import { resolveAppSession } from "../../lib/session";
import { getPlanningStore } from "../../../domains/shared/registry";
import { previewRouting } from "../../../domains/signal/service";
import { listTerritories } from "../../../domains/planning/service";
import { listAccounts } from "../../../domains/account/service";
import { analyseRouting } from "../../../domains/signal/lib/routing-advice";
import { AgentCapture } from "../../components/agent-capture";
import { RoutingAdvicePanel } from "../../components/routing-advice-panel";
import { deckBundle, recordAction } from "../deck-data";

// The routing module's dock - the assistant, then the check that belongs to
// this page.
//
// IT READS EXACTLY THE WAY THE PAGE DOES: the same three reads, feeding the
// same previewRouting. A second route to the same conclusion could disagree
// with the table beside it, and a dock contradicting the list it sits next to
// is worse than no dock.
//
// A FAILED READ RENDERS THE ASSISTANT ALONE. Territories ARE the routing rule
// here - without them every lead reads as unplaceable - so a findings list
// computed from a partial map would report a map full of holes that do not
// exist, and send somebody to fix nothing. The same argument the page makes
// for showing no suggestions rather than half-informed ones.

export const dynamic = "force-dynamic";

export default async function RoutingDeck() {
  const [bundle, session] = await Promise.all([deckBundle(), resolveAppSession()]);
  if (!bundle || !session) return null;

  const base = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
  };

  const capture = (
    <AgentCapture data={bundle.agent} canRecord={bundle.canRecord} onRecord={recordAction("")} />
  );

  const [territories, accounts] = await Promise.all([
    listTerritories({ ...base, store: getPlanningStore() }),
    listAccounts({ ...base, store: session.stores.account() }),
  ]);
  if (!territories.ok || !accounts.ok) return <div className="flex flex-col gap-sm">{capture}</div>;

  const regionOf = new Map(accounts.value.map((a) => [a.id, a.region]));
  const plan = await previewRouting(
    { ...base, store: session.stores.signal() },
    territories.value,
    regionOf,
  );
  if (!plan.ok) return <div className="flex flex-col gap-sm">{capture}</div>;

  const advice = analyseRouting(
    plan.value.map((p) => ({
      currentOwner: p.currentOwner,
      suggestedOwner: p.outcome.kind === "assigned" ? p.outcome.ownerSub : null,
      unroutableReason: p.outcome.kind === "unroutable" ? p.outcome.reason : null,
      region: p.region,
    })),
  );

  return (
    <div className="flex flex-col gap-sm">
      {capture}
      <RoutingAdvicePanel advice={advice} total={plan.value.length} />
    </div>
  );
}
