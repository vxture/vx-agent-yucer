import { EmptyState, ViewLayout } from "@vxture/design-ui";
import { resolveAppSession } from "../lib/session";
import { getMessages } from "../lib/i18n/server";
import { can } from "../../authz/decide";
import { getAccountStore, getStrategyStore } from "../../domains/shared/registry";
import { listPlans, listSegments } from "../../domains/strategy/service";
import { listAccounts } from "../../domains/account/service";
import { accountMatchesCriteria } from "../../domains/strategy/lib/lifecycle";
import { SegmentPanel, type SegmentRow } from "../components/segment-panel";
import { saveSegment } from "../strategy/actions";
import { loadFailureText } from "../lib/load-failure";

// D1 market segments - a module page since 2026-08-30.
//
// It rendered inside /strategy until the menu became per-domain: with armory
// holding five entries, two of them landing on /strategy with different
// anchors read as a broken menu rather than as one screen with parts.
//
// The reads are unchanged, including the pair of counts whose DIFFERENCE is
// the finding: 在册客户 counts who carries the code, 条件命中 counts who the
// definition matches, and they diverge when a code was handed out against the
// definition.

export const dynamic = "force-dynamic";

export default async function SegmentPage() {
  const { SHELL_TEXT, LOAD_ERROR } = await getMessages();
  const session = await resolveAppSession();
  if (!session) {
    return (
      <EmptyState
        title={SHELL_TEXT.signedOutTitle}
        description={SHELL_TEXT.signedOutDescription}
      />
    );
  }

  const ctx = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: getStrategyStore(),
  };

  const [segments, plans, accounts] = await Promise.all([
    listSegments(ctx),
    listPlans(ctx),
    listAccounts({ ...ctx, store: getAccountStore() }),
  ]);

  if (!segments.ok) {
    return (
      <EmptyState
        title={SHELL_TEXT.loadFailed}
        description={loadFailureText(segments.violations, LOAD_ERROR)}
      />
    );
  }

  const perCode = new Map<string, number>();
  if (accounts.ok) {
    for (const a of accounts.value) {
      if (a.segmentCode) perCode.set(a.segmentCode, (perCode.get(a.segmentCode) ?? 0) + 1);
    }
  }
  const planNames = new Map((plans.ok ? plans.value : []).map((p) => [p.id, p.name]));
  const rows: SegmentRow[] = segments.value.map((g) => ({
    id: g.id,
    segmentCode: g.segmentCode,
    name: g.name,
    planId: g.planId,
    planName: g.planId ? (planNames.get(g.planId) ?? null) : null,
    priority: g.priority,
    status: g.status,
    criteria: g.criteria,
    accountCount: perCode.get(g.segmentCode) ?? 0,
    matchedCount: accounts.ok
      ? accounts.value.filter((a) => accountMatchesCriteria(a, g.criteria)).length
      : 0,
  }));
  // Closed and archived plans are absent: their segmentation is settled, and
  // the rule behind the form would refuse the write anyway.
  const openPlans = (plans.ok ? plans.value : [])
    .filter((p) => p.status !== "closed" && p.status !== "archived")
    .map((p) => ({ id: p.id, name: p.name }));

  return (
    <ViewLayout>
      <SegmentPanel
        rows={rows}
        plans={openPlans}
        canEdit={can(session.authz, session.entitlement, "strategy.segment.upsert", "ui").allowed}
        onSave={saveSegment}
      />
    </ViewLayout>
  );
}
