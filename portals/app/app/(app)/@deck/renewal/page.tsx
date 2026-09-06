import { resolveAppSession } from "../../lib/session";
import { getDeliveryStore } from "../../../domains/shared/registry";
import { listRenewals } from "../../../domains/delivery/service";
import { listRenewedProjectIds } from "../../../domains/pipeline/service";
import { analyseRenewals } from "../../../domains/delivery/lib/renewal-advice";
import { can } from "../../../authz/decide";
import { AgentCapture } from "../../components/agent-capture";
import { RenewalAdvicePanel } from "../../components/renewal-advice-panel";
import { openRenewal } from "../../renewal/actions";
import { deckBundle, recordAction } from "../deck-data";

// The renewal module's dock - the assistant, then the check that belongs to
// this page.
//
// THE PIPELINE READ FAILING IS NOT SURVIVABLE HERE EITHER, and it is the same
// argument the page makes: without "which projects already have a deal open
// off them", the check would tell somebody to approach a customer who is
// already being approached. A refusal is the better answer than a confident
// wrong one, so a failed read renders the assistant alone rather than a
// findings list computed without it.

export const dynamic = "force-dynamic";

export default async function RenewalDeck() {
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

  const renewed = await listRenewedProjectIds({ ...base, store: session.stores.pipeline() });
  if (!renewed.ok) return <div className="flex flex-col gap-sm">{capture}</div>;

  const candidates = await listRenewals({ ...base, store: getDeliveryStore() }, renewed.value);
  if (!candidates.ok) return <div className="flex flex-col gap-sm">{capture}</div>;

  const advice = analyseRenewals(
    candidates.value.map((c) => ({
      projectId: c.project.id,
      projectNo: c.project.projectNo,
      projectName: c.project.name,
      daysToEnd: c.daysToEnd,
      amount: c.draft?.amount ?? c.project.contractAmount?.amount ?? null,
      risk: c.verdict.kind === "due" ? c.verdict.risk : null,
      notDueReason: c.verdict.kind === "not_due" ? c.verdict.reason : null,
    })),
  );

  return (
    <div className="flex flex-col gap-sm">
      {capture}
      <RenewalAdvicePanel
        advice={advice}
        canOpen={
          can(session.authz, session.entitlement, "pipeline.opportunity.create", "ui").allowed
        }
        onOpen={openRenewal}
      />
    </div>
  );
}
