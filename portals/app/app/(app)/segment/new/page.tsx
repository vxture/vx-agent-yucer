import { ViewHeader } from "../../components/business-controls";
import { EmptyState, ViewLayout } from "@vxture/design-ui";
import { PageCrumbs } from "../../components/page-crumbs";
import { notFound, redirect } from "next/navigation";
import { resolveAppSession } from "../../lib/session";
import { getMessages } from "../../lib/i18n/server";
import { loadFailureText } from "../../lib/load-failure";
import { can } from "../../../authz/decide";
import { getStrategyStore } from "../../../domains/shared/registry";
import { listSegments } from "../../../domains/strategy/service";
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

export default async function NewSegmentPage({searchParams}:{readonly searchParams:Promise<{code?:string}>}) {
  const {code}=await searchParams;
  const { MARKET_STRATEGY_TEXT: T, STRATEGY_TEXT, SHELL_TEXT, LOAD_ERROR } = await getMessages();
  const session = await resolveAppSession();
  if (!session) return null;
  // Unreachable: (app)/layout.tsx already renders the shared SignIn
  // screen and never mounts this page when there is no session. Kept
  // only because TypeScript needs it to narrow `session` below.
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
  const [segments, accounts] = await Promise.all([
    listSegments(ctx),
    listAccounts({ ...ctx, store: session.stores.account() }),
  ]);

  if(!segments.ok)return <EmptyState title={SHELL_TEXT.loadFailed} description={loadFailureText(segments.violations,LOAD_ERROR)}/>;
  const existing=code ? segments.value.find(s=>s.segmentCode===code) : undefined;
  if(code && !existing)notFound();
  const title=existing?T.editMarket:T.newMarket;

  return (
    <ViewLayout>
      <PageCrumbs
        trail={[{ label: T.markets, href: "/strategy?view=markets" }]}
        current={title}
      />
      <ViewHeader title={title} description={T.libraryWhy} divider />
      <SegmentForm
        key={code ?? "new"}
        initialCode={code}
        rows={segments.value}
        accountIndustries={accounts.ok ? accounts.value.map((a) => a.industry) : []}
        accountRegions={accounts.ok ? accounts.value.map((a) => a.region) : []}
        statusLabel={STRATEGY_TEXT.segmentStatusLabel}
        onSave={saveSegment}
      />
    </ViewLayout>
  );
}
