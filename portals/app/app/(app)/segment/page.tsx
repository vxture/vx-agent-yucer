import { EmptyState, StatusBadge, ViewLayout } from "@vxture/design-ui";
import { resolveAppSession } from "../lib/session";
import { getMessages } from "../lib/i18n/server";
import { can } from "../../authz/decide";
import {
  getAccountStore,
  getStrategyStore,
} from "../../domains/shared/registry";
import { listPlans, listSegments } from "../../domains/strategy/service";
import { listAccounts } from "../../domains/account/service";
import { accountMatchesCriteria } from "../../domains/strategy/lib/lifecycle";
import { SegmentRoster, type SegmentRow } from "../components/segment-roster";
import { ModuleHeadline, type HeadlineStat } from "../components/module-headline";
import { loadFailureText } from "../lib/load-failure";
import { changeSegmentStatus, deleteSegment, moveSegmentRow } from "../strategy/actions";
import { Tag } from "../components/tag";

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
  const { LOAD_ERROR, SHELL_TEXT, STRATEGY_TEXT } = await getMessages();
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
    listAccounts({ ...ctx, store: session.stores.account() }),
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
      if (a.segmentCode)
        perCode.set(a.segmentCode, (perCode.get(a.segmentCode) ?? 0) + 1);
    }
  }
  const planNames = new Map(
    (plans.ok ? plans.value : []).map((p) => [p.id, p.name]),
  );
  const rows: SegmentRow[] = segments.value.map((g) => ({
    id: g.id,
    segmentCode: g.segmentCode,
    name: g.name,
    planName: g.planId ? (planNames.get(g.planId) ?? null) : null,
    priority: g.priority,
    status: g.status,
    criteria: g.criteria,
    accountCount: perCode.get(g.segmentCode) ?? 0,
    matchedCount: accounts.ok
      ? accounts.value.filter((a) => accountMatchesCriteria(a, g.criteria))
          .length
      : 0,
  }));
  // Closed and archived plans are absent: their segmentation is settled, and
  // the rule behind the form would refuse the write anyway.
  const openPlans = (plans.ok ? plans.value : [])
    .filter((p) => p.status !== "closed" && p.status !== "archived")
    .map((p) => ({ id: p.id, name: p.name }));

  const live = rows.filter((r) => r.status === "active");
  // The breakdown decomposes the headline the same way the catalogue's does -
  // one cell per cut, its two counts as the small print, so a divergence is
  // visible before anybody opens the table.
  const stats: HeadlineStat[] = live.map((r) => ({
    key: r.id,
    name: r.name,
    value: r.accountCount,
    note: STRATEGY_TEXT.segmentStatCovered(r.accountCount, r.matchedCount),
  }));

  const canWrite = can(
    session.authz,
    session.entitlement,
    "strategy.segment.upsert",
    "ui",
  ).allowed;

  return (
    <ViewLayout>
      <ModuleHeadline
        moduleKey="segment"
        description={STRATEGY_TEXT.segmentsWhy}
        tags={
          <>
            <StatusBadge tone="success">
              {STRATEGY_TEXT.tagSegmentActive(live.length)}
            </StatusBadge>
            {rows.length > live.length ? (
              <Tag>
                {STRATEGY_TEXT.tagSegmentShelved(rows.length - live.length)}
              </Tag>
            ) : null}
          </>
        }
        stats={stats}
        emptyNote={STRATEGY_TEXT.segmentStatEmpty}
      />
      <SegmentRoster
        rows={rows}
        canWrite={canWrite}
        onMove={moveSegmentRow}
        onStatus={changeSegmentStatus}
        onDelete={deleteSegment}
      />
    </ViewLayout>
  );
}
