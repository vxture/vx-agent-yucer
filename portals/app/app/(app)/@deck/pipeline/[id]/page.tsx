import { getCopilotStore } from "../../../../domains/shared/registry";
import { getOpportunityDetail } from "../../../../domains/pipeline/service";
import { listProposals } from "../../../../domains/copilot/service";
import { canDecideProposal } from "../../../../domains/copilot/lib/advisor-gate";
import { adjudicateProposals } from "../../../copilot/actions";
import { getMessages } from "../../../lib/i18n/server";
import { displayRationale } from "../../../lib/proposal-rationale";
import { proposalGroup } from "../../../lib/proposal-group";
import { resolveAppSession } from "../../../lib/session";
import { AgentPanel } from "../../../components/agent-panel";
import { DealAdvisor } from "../../../components/deal-advisor";
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
  const { POSITION_TEXT, RATIONALE_TEXT } = await getMessages();

  const base = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
  };
  const detail = await getOpportunityDetail({ ...base, store: session.stores.pipeline() }, id);

  // 本单参谋 (deal batch 2c): THIS deal's proposals, read through the gated
  // verb. A refused read shows the section empty rather than hiding it - the
  // advisor exists on this page whether or not it has anything yet.
  const proposalsRead = detail.ok
    ? await listProposals({ ...base, store: getCopilotStore() }, { status: "proposed" }).catch(() => null)
    : null;
  const proposals = (proposalsRead?.ok ? proposalsRead.value : [])
    .filter((a) => a.subjectType === "opportunity" && a.subjectId === id)
    .map((a) => ({
      id: a.id,
      title: POSITION_TEXT.actionLabels[a.actionType] ?? a.actionType,
      rationale: displayRationale(a, RATIONALE_TEXT),
      group: proposalGroup(a.capability, POSITION_TEXT),
      confidence: a.confidence,
      decidable: canDecideProposal(session.authz, session.entitlement, a.capability, "ui").allowed,
    }));

  // Built here, not inline in AgentPanel's props: reachable-codes.test binds
  // an action to the nearest tag opened before it.
  const advisor = detail.ok ? (
    <DealAdvisor scope={detail.value.name} proposals={proposals} onAdjudicate={adjudicateProposals} />
  ) : null;

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
      advisor={advisor}
    />
  );
}
