"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, Drawer, EmptyState, ViewLayout } from "@vxture/design-ui";
import type { StrategyWorkspaceData } from "../strategy/workspace-data";
import { useLocale, useMessages } from "../lib/i18n/provider";
import { MarketLibrary } from "./market-library";
import { ModuleHeadline } from "./module-headline";
import { SegmentAdvicePanel } from "./segment-advice-panel";

export function MarketWorkspace({ data, initialMarket }: { readonly data: Pick<StrategyWorkspaceData, "markets" | "canWriteMarket" | "segmentAdvice" | "at">; readonly initialMarket?: string }) {
  const { MARKET_STRATEGY_TEXT: T, STRATEGY_TEXT } = useMessages();
  const locale = useLocale();
  const [checks, setChecks] = useState(false);
  return <ViewLayout className="@container" data-market-workspace>
    <ModuleHeadline moduleKey="segment" help={T.libraryWhy} action={data.canWriteMarket
      ? <Button asChild size="xl"><Link href="/segment/new">{T.newMarket}</Link></Button> : undefined} />
    {data.markets ? <MarketLibrary markets={data.markets} canWrite={data.canWriteMarket} initialMarket={initialMarket}
      actions={<Button size="md" variant="secondary" onClick={() => setChecks(true)}>{STRATEGY_TEXT.segmentAdviceTitle}
        <span className="text-body-small text-muted-foreground tabular-nums">{data.segmentAdvice.length}</span>
      </Button>} /> : <EmptyState title={T.unknown} />}
    <footer className="border-t border-dashed border-primary/10 pt-lg pb-2xl text-body-small text-muted-foreground">
      {T.dataAt} {new Date(data.at).toLocaleString(locale)}
    </footer>
    <Drawer open={checks} onClose={() => setChecks(false)} width="md" className="max-w-full" title={STRATEGY_TEXT.segmentAdviceTitle} closeLabel={T.closed}>
      <SegmentAdvicePanel advice={data.segmentAdvice} />
    </Drawer>
  </ViewLayout>;
}
