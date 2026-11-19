import { notFound } from "next/navigation";
import { EmptyState } from "@vxture/design-ui";
import { MarketDetail } from "../../components/market-detail";
import { lockedPage } from "../../components/locked-page";
import { getMessages } from "../../lib/i18n/server";
import { loadFailureText } from "../../lib/load-failure";
import { strategyWorkspaceData } from "../../strategy/workspace-data";

export const dynamic = "force-dynamic";

export default async function SegmentDetailPage({ params }: { readonly params: Promise<{ id: string }> }) {
  const bundle = await strategyWorkspaceData();
  if (!bundle) return null;
  const locked = lockedPage(bundle.session, "segment");
  if (locked) return locked;
  if (!bundle.marketsRead.ok) {
    const { SHELL_TEXT, LOAD_ERROR } = await getMessages();
    return <EmptyState title={SHELL_TEXT.loadFailed} description={loadFailureText(bundle.marketsRead.violations, LOAD_ERROR)} />;
  }
  const { id } = await params;
  const market = bundle.data.markets?.find(m => m.id === id);
  if (!market) notFound();
  return <MarketDetail market={market} canWrite={bundle.data.canWriteMarket} at={bundle.data.at} />;
}
