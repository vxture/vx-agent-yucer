import { getPipelineStore } from "../../../../domains/shared/registry";
import { getOpportunityDetail } from "../../../../domains/pipeline/service";
import { resolveAppSession } from "../../../lib/session";
import { AgentPanel } from "../../../components/agent-panel";
import { deckBundle, recordAction } from "../../deck-data";

// The deck beside one deal.
//
// Same shape as the account deck and for the same reason: a deck naming other
// deals beside this one is not clutter, it is a wrong answer.
//
// Two things are scoped differently here, and both are forced by where the
// data actually lives:
//
//   NOTES scope to the DEAL - listInteractions filters by opportunityId, so
//   these are the notes recorded against this pursuit.
//
//   JUDGEMENTS scope to its ACCOUNT, because no rule in judgement.ts produces
//   an opportunity-subject judgement. Filtering by the deal's own id would find
//   nothing forever and imply nothing is wrong with a deal that has been
//   stalled for two months.
//
// The note it CAPTURES anchors to the account: an interaction hangs off an
// account and optionally off an opportunity, and the deck's box takes text
// only. The deal page's own controls remain the place to record against the
// deal specifically.

export const dynamic = "force-dynamic";

export default async function DealDeck({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await resolveAppSession();
  if (!session) return null;

  const detail = await getOpportunityDetail(
    {
      workspaceId: session.workspaceId,
      sub: session.user.sub,
      holder: session.authz,
      entitlement: session.entitlement,
      store: getPipelineStore(),
    },
    id,
  );

  const bundle = await deckBundle(
    detail.ok
      ? {
          type: "opportunity",
          id,
          name: detail.value.name,
          judgementSubjectId: detail.value.accountId,
        }
      : undefined,
  );
  if (!bundle) return null;

  return (
    <AgentPanel
      data={bundle.agent}
      canRecord={bundle.canRecord}
      onRecord={recordAction(detail.ok ? detail.value.accountId : "")}
    />
  );
}
