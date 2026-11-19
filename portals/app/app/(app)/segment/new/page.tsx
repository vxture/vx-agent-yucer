import { nextBusinessCode } from "../../../domains/shared/business-code";
import { ViewHeader } from "../../components/business-controls";
import { EmptyState, ViewLayout } from "@vxture/design-ui";
import { PageCrumbs } from "../../components/page-crumbs";
import { notFound, redirect } from "next/navigation";
import { resolveAppSession } from "../../lib/session";
import { getMessages } from "../../lib/i18n/server";
import { loadFailureText } from "../../lib/load-failure";
import { can } from "../../../authz/decide";
import { getCatalogStore, getStrategyStore } from "../../../domains/shared/registry";
import { segmentVocabulary } from "../../../domains/strategy/segment-assist-service";
import { assistSegmentDraft } from "./assist-action";
import { listSegments } from "../../../domains/strategy/service";
import { SegmentForm } from "../../components/segment-form";
import { saveSegment } from "../../strategy/actions";

// Create and edit share the same business form and configured vocabulary.
// Route identity selects the record; changing an anchor cannot switch records.

export const dynamic = "force-dynamic";

export default async function NewSegmentPage({searchParams}:{readonly searchParams:Promise<{id?:string;code?:string}>}) {
  const {id,code}=await searchParams;
  const { MARKET_STRATEGY_TEXT: T, SHELL_TEXT, LOAD_ERROR } = await getMessages();
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
  const [segments, vocabulary] = await Promise.all([
    listSegments(ctx),
    segmentVocabulary({ ...ctx, store: session.stores.account() }, getCatalogStore()),
  ]);

  if(!segments.ok)return <EmptyState title={SHELL_TEXT.loadFailed} description={loadFailureText(segments.violations,LOAD_ERROR)}/>;
  const existing=id ? segments.value.find(s=>s.id===id) : code ? segments.value.find(s=>s.segmentCode===code) : undefined;
  if((id || code) && !existing)notFound();
  const title=existing?T.editMarket:T.newMarket;

  return (
    <ViewLayout>
      <PageCrumbs
        trail={[{ label: T.markets, href: "/segment" }, ...(existing ? [{label:existing.name,href:`/segment/${encodeURIComponent(existing.id)}`}] : [])]}
        current={title}
      />
      <ViewHeader title={title} help={T.libraryWhy} divider />
      <SegmentForm
        key={existing?.id ?? "new"}
        original={existing}
        generatedCode={nextBusinessCode("MKT", segments.value.map(s => s.segmentCode))}
        vocabulary={vocabulary}
        canAssist={can(session.authz, session.entitlement, "copilot.ask", "ui").allowed}
        onAssist={assistSegmentDraft}
        onSave={saveSegment}
      />
    </ViewLayout>
  );
}
