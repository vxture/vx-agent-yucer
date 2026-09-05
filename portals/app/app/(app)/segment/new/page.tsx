import { EmptyState, ViewHeader, ViewLayout } from "@vxture/design-ui";
import { redirect } from "next/navigation";
import { resolveAppSession } from "../../lib/session";
import { getMessages } from "../../lib/i18n/server";
import { can } from "../../../authz/decide";
import { getStrategyStore } from "../../../domains/shared/registry";
import { listPlans, listSegments } from "../../../domains/strategy/service";
import { listAccounts } from "../../../domains/account/service";
import { SegmentForm } from "../../components/segment-form";
import { saveSegment } from "../../strategy/actions";

// 新建/编辑细分市场 - a page since 2026-09-05. One page for both because the
// write IS one act (upsert-by-anchor): picking an existing code loads it and
// locks the code field, since accounts point at the code by string.
//
// The ACCOUNTS are read here for one reason: the criteria vocabulary. A
// segment is a cut of the actual market, and the assistant offers the
// industries and regions customers actually carry - an industry nobody is in
// is a cut of nothing.

export const dynamic = "force-dynamic";

export default async function NewSegmentPage() {
  const { SHELL_TEXT, STRATEGY_TEXT } = await getMessages();
  const session = await resolveAppSession();
  if (!session) {
    return <EmptyState title={SHELL_TEXT.signedOutTitle} description={SHELL_TEXT.signedOutDescription} />;
  }
  if (!can(session.authz, session.entitlement, "strategy.segment.upsert", "ui").allowed) {
    redirect("/segment");
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

  const openPlans = (plans.ok ? plans.value : [])
    .filter((p) => p.status !== "closed" && p.status !== "archived")
    .map((p) => ({ id: p.id, name: p.name }));

  return (
    <ViewLayout>
      <ViewHeader title={STRATEGY_TEXT.segmentFormTitle} description={STRATEGY_TEXT.segmentsWhy} />
      <SegmentForm
        rows={segments.ok ? segments.value : []}
        plans={openPlans}
        accountIndustries={accounts.ok ? accounts.value.map((a) => a.industry) : []}
        accountRegions={accounts.ok ? accounts.value.map((a) => a.region) : []}
        statusLabel={STRATEGY_TEXT.segmentStatusLabel}
        onSave={saveSegment}
      />
    </ViewLayout>
  );
}
