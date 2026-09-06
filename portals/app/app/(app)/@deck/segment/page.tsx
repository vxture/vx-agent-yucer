import { resolveAppSession } from "../../lib/session";
import { getStrategyStore } from "../../../domains/shared/registry";
import { listSegments } from "../../../domains/strategy/service";
import { listAccounts } from "../../../domains/account/service";
import { accountMatchesCriteria } from "../../../domains/strategy/lib/lifecycle";
import { analyseSegments } from "../../../domains/strategy/lib/segment-advice";
import { AgentCapture } from "../../components/agent-capture";
import { SegmentAdvicePanel } from "../../components/segment-advice-panel";
import { deckBundle, recordAction } from "../deck-data";

// The segment module's dock - the assistant, then the check that belongs to
// this page.
//
// THE COUNTS ARE ASSEMBLED HERE, not in a service, and that is deliberate:
// who carries a code is an ACCOUNT-domain fact and who a definition matches
// is computed from account rows, so the two reads happen through their own
// gated verbs (ADR-001: one object, one owning domain) and the pure rule is
// handed the result. A strategy service reaching into accounts would be the
// coupling this product refuses.

export const dynamic = "force-dynamic";

export default async function SegmentDeck() {
  const [bundle, session] = await Promise.all([deckBundle(), resolveAppSession()]);
  if (!bundle || !session) return null;

  const base = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
  };
  const [segments, accounts] = await Promise.all([
    listSegments({ ...base, store: getStrategyStore() }),
    listAccounts({ ...base, store: session.stores.account() }),
  ]);

  // A refused read is not an empty finding list: saying "nothing to fix" to
  // somebody who may not see the data would be a lie the page cannot check.
  if (!segments.ok || !accounts.ok) {
    return (
      <div className="flex flex-col gap-sm">
        <AgentCapture
          data={bundle.agent}
          canRecord={bundle.canRecord}
          onRecord={recordAction("")}
        />
      </div>
    );
  }

  const counts = new Map<string, { assigned: number; matched: number }>();
  const mismatch = new Map<string, { assignedNotMatching: number; matchingNotAssigned: number }>();
  for (const g of segments.value) {
    const assignedRows = accounts.value.filter((a) => a.segmentCode === g.segmentCode);
    const matchedRows = accounts.value.filter((a) => accountMatchesCriteria(a, g.criteria));
    const matchedIds = new Set(matchedRows.map((a) => a.id));
    const assignedIds = new Set(assignedRows.map((a) => a.id));
    counts.set(g.segmentCode, { assigned: assignedRows.length, matched: matchedRows.length });
    mismatch.set(g.segmentCode, {
      assignedNotMatching: assignedRows.filter((a) => !matchedIds.has(a.id)).length,
      // Matched but carrying SOME OTHER code counts too: they are already cut
      // in elsewhere, which is a different decision from being uncut, but
      // both are accounts this definition claims and does not have.
      matchingNotAssigned: matchedRows.filter((a) => !assignedIds.has(a.id)).length,
    });
  }

  const advice = analyseSegments({
    segments: segments.value.map((g) => ({
      id: g.id,
      segmentCode: g.segmentCode,
      name: g.name,
      planId: g.planId,
      status: g.status,
      criteria: g.criteria,
    })),
    counts,
    mismatch,
  });

  return (
    <div className="flex flex-col gap-sm">
      <AgentCapture
        data={bundle.agent}
        canRecord={bundle.canRecord}
        onRecord={recordAction("")}
      />
      <SegmentAdvicePanel advice={advice} />
    </div>
  );
}
