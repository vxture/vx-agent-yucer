import { resolveAppSession } from "../../lib/session";
import { getCatalogStore } from "../../../domains/shared/registry";
import { analyseSolutionSet } from "../../../domains/catalog/service";
import { AgentCapture } from "../../components/agent-capture";
import { SolutionAdvicePanel } from "../../components/solution-advice-panel";
import { deckBundle, recordAction } from "../deck-data";

// The solution module's dock - the same composition the price book uses: the
// conversation on top, and beneath it the check that belongs to THIS page.
//
// A solution is a template nothing computes from (ADR-014 s4), so a broken
// one fails in front of a customer rather than here. That is exactly what a
// dock is for: the page shows what the solutions ARE, and the dock says which
// of them would not survive being quoted.

export const dynamic = "force-dynamic";

export default async function SolutionDeck() {
  const [bundle, session] = await Promise.all([deckBundle(), resolveAppSession()]);
  if (!bundle || !session) return null;

  const advice = await analyseSolutionSet({
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: getCatalogStore(),
  });

  return (
    <div className="flex flex-col gap-sm">
      <AgentCapture
        data={bundle.agent}
        canRecord={bundle.canRecord}
        onRecord={recordAction("")}
      />
      {advice.ok ? <SolutionAdvicePanel advice={advice.value} /> : null}
    </div>
  );
}
