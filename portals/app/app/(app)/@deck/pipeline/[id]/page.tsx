import Link from "next/link";
import { getCopilotStore } from "../../../../domains/shared/registry";
import { getOpportunityDetail } from "../../../../domains/pipeline/service";
import { listProposals } from "../../../../domains/copilot/service";
import { canDecideProposal, canRunAdvisor } from "../../../../domains/copilot/lib/advisor-gate";
import { EXTRACTION_ACTION_TYPES } from "../../../../domains/copilot/lib/action";
import { adjudicateProposals } from "../../../copilot/actions";
import { getMessages } from "../../../lib/i18n/server";
import { displayRationale } from "../../../lib/proposal-rationale";
import { proposalGroup } from "../../../lib/proposal-group";
import { resolveAppSession } from "../../../lib/session";
import { AgentPanel } from "../../../components/agent-panel";
import { DealAdvisor } from "../../../components/deal-advisor";
import { DealMeetingButton } from "../../../components/deal-meeting";
import { buildDealMeetingPackAction } from "../../../pipeline/meeting-pack-action";
import { DealSituation } from "../../../components/deal-situation";
import { briefDealSituation } from "../../../pipeline/deal-situation-action";
import { citedNotes, peekSituation, situationFrameFor } from "../../../pipeline/deal-situation-data";
import { SITUATION_CAPABILITY } from "../../../../domains/copilot/lib/deal-situation";
import { NEXT_ACTION_CAPABILITY } from "../../../../domains/copilot/lib/next-action";
import { NextActionTrigger } from "../../../components/next-action-trigger";
import { proposeNextAction } from "../../../pipeline/next-action-action";
import { nextActionDue, nextActionFrameFor } from "../../../pipeline/next-action-data";
import { decisionChainsByOpportunity, getAccountDetail } from "../../../../domains/account/service";
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
// The note it CAPTURES anchors to the account AND this deal (deal batch 4b,
// YC-072 "自动挂到本单"): beside a deal, a note is about that deal - and a
// note on a deal is what 证据抽取 reads for its buying evidence.

export const dynamic = "force-dynamic";

export default async function DealDeck({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await resolveAppSession();
  if (!session) return null;
  const { POSITION_TEXT, RATIONALE_TEXT, ASK_ABOUT_TEXT, NEXT_ACTION_TEXT } = await getMessages();

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
    // 证据抽取's proposals are decided in place, beside their fact (batch 4b/4c)
    // - except 下一步最佳动作 (batch 8c), a plan step that belongs here, first.
    .filter(
      (a) =>
        a.subjectType === "opportunity" &&
        a.subjectId === id &&
        (a.capability === NEXT_ACTION_CAPABILITY || !EXTRACTION_ACTION_TYPES.includes(a.actionType)),
    )
    .sort((a, b) => Number(b.capability === NEXT_ACTION_CAPABILITY) - Number(a.capability === NEXT_ACTION_CAPABILITY))
    .map((a) => ({
      id: a.id,
      title:
        a.capability === NEXT_ACTION_CAPABILITY
          ? NEXT_ACTION_TEXT.proposal(String(a.payload.statement ?? ""), String(a.payload.dueAt ?? ""))
          : (POSITION_TEXT.actionLabels[a.actionType] ?? a.actionType),
      rationale:
        a.capability === NEXT_ACTION_CAPABILITY
          ? NEXT_ACTION_TEXT.why(String(a.payload.forCriterion ?? ""), a.rationale)
          : displayRationale(a, RATIONALE_TEXT),
      group: proposalGroup(a.capability, POSITION_TEXT),
      confidence: a.confidence,
      decidable: canDecideProposal(session.authz, session.entitlement, a.capability, "ui").allowed,
    }));

  // Built here, not inline in AgentPanel's props: reachable-codes.test binds
  // an action to the nearest tag opened before it.
  // 商机会前包 (batch 11a): the people to choose from are this deal's chain,
  // named from the customer's contacts - both through their gated verbs.
  const accountCtx = { ...base, store: session.stores.account() };
  const [accountRead, chainRead] = detail.ok
    ? await Promise.all([
        getAccountDetail(accountCtx, detail.value.accountId).catch(() => null),
        decisionChainsByOpportunity(accountCtx, detail.value.accountId, [{ id, name: detail.value.name }]).catch(() => null),
      ])
    : [null, null];
  const onDeal = new Set(chainRead?.ok ? (chainRead.value[0]?.people ?? []).filter((p) => p.status === "active").map((p) => p.id) : []);
  const meetingPeople = (accountRead?.ok ? accountRead.value.contacts : [])
    .filter((c) => onDeal.has(c.id))
    .map((c) => ({ id: c.id, name: c.name, title: c.title ?? null }));
  const meeting = detail.ok ? <DealMeetingButton opportunityId={id} people={meetingPeople} onBuild={buildDealMeetingPackAction} /> : null;
  // 局势简报 (batch 8b): on an open deal whose workspace may run it. What is
  // already written for the data as it stands comes with the page; nothing
  // written means the card writes it and says it is updating.
  const frame =
    detail.ok && detail.value.status === "open" && canRunAdvisor(session.authz, session.entitlement, SITUATION_CAPABILITY).allowed
      ? await situationFrameFor(session, id).catch(() => null)
      : null;
  const written = frame ? await peekSituation(session, frame).catch(() => null) : null;
  const situation = frame ? (
    <DealSituation
      opportunityId={id}
      initial={
        written?.situation
          ? { ok: true, situation: written.situation, cited: citedNotes(frame, written.situation), stallHolder: frame.stallHolder, cached: true }
          : null
      }
      onRun={briefDealSituation}
    />
  ) : null;
  // 下一步最佳动作 (batch 8c): asked on open when this data has had no run
  // today and no next action waits (owner 2026-09-28: on open, not a sweep).
  const nextFrame =
    frame && canRunAdvisor(session.authz, session.entitlement, NEXT_ACTION_CAPABILITY).allowed
      ? await nextActionFrameFor(session, frame).catch(() => null)
      : null;
  const askNext = nextFrame ? await nextActionDue(session, nextFrame).catch(() => false) : false;
  const nextAction = askNext ? <NextActionTrigger opportunityId={id} onRun={proposeNextAction} /> : null;
  const proposalsBlock = detail.ok ? (
    <DealAdvisor scope={detail.value.name} proposals={proposals} onAdjudicate={adjudicateProposals} />
  ) : null;
  const advisor = detail.ok ? (
    <>
      {/* 对话锚定本单 / 预演 (batch 11b/11c) beside 会前包 - all three are
          about this one deal. */}
      <div className="flex flex-wrap items-center justify-end gap-sm text-body-small">
        <Link href={`/copilot?opportunity=${encodeURIComponent(id)}`} className="text-primary hover:underline">
          {ASK_ABOUT_TEXT.linkFromDeal}
        </Link>
        <Link href={`/copilot?opportunity=${encodeURIComponent(id)}&mode=rehearsal`} className="text-primary hover:underline">
          {ASK_ABOUT_TEXT.linkRehearsal}
        </Link>
        {meeting}
      </div>
      {situation}
      {nextAction}
      {proposalsBlock}
    </>
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
      canAsk={bundle.canAsk}
      // The question goes to the copilot about THIS deal - which carries its
      // customer, as the 问参谋（本单） link below it already does.
      askAnchor={detail.ok ? { opportunityId: id } : undefined}
      onRecord={recordAction(detail.ok ? detail.value.accountId : "", detail.ok ? id : undefined)}
      advisor={advisor}
    />
  );
}
