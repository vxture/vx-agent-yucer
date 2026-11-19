import { notFound, redirect } from "next/navigation";
import { resolveMarketId } from "../lib/market-route";
import { EmptyState } from "@vxture/design-ui";
import { MarketWorkspace } from "../components/market-workspace";
import { lockedPage } from "../components/locked-page";
import { getMessages } from "../lib/i18n/server";
import { loadFailureText } from "../lib/load-failure";
import { strategyWorkspaceData } from "../strategy/workspace-data";

export const dynamic = "force-dynamic";

export default async function SegmentPage({ searchParams }: { readonly searchParams: Promise<{ market?: string }> }) {
  const bundle = await strategyWorkspaceData();
  if (!bundle) return null;
  const locked = lockedPage(bundle.session, "segment");
  if (locked) return locked;
  if (!bundle.marketsRead.ok) {
    const { SHELL_TEXT, LOAD_ERROR } = await getMessages();
    return <EmptyState title={SHELL_TEXT.loadFailed} description={loadFailureText(bundle.marketsRead.violations, LOAD_ERROR)} />;
  }
  const { market } = await searchParams;
  const { markets, canWriteMarket, segmentAdvice, at } = bundle.data;
  if (market) {
    const id = resolveMarketId(markets ?? [], market);
    if (!id) notFound();
    redirect(`/segment/${encodeURIComponent(id)}`);
  }
  return <MarketWorkspace data={{ markets, canWriteMarket, segmentAdvice, at }} />;
}
