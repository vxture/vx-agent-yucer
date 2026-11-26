"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Drawer, EmptyState, ViewLayout } from "@vxture/design-ui";
import type { StrategyWorkspaceData } from "../strategy/workspace-data";
import { useLocale, useMessages } from "../lib/i18n/provider";
import { MarketLibrary } from "./market-library";
import { ModuleHeadline } from "./module-headline";
import { MarketModuleSummary } from "./planning-module-summary";
import { RowActions } from "./table-fittings";
import { collectionDrawerWidth } from "./collection-layout";
import { SegmentAdvicePanel } from "./segment-advice-panel";

export function MarketWorkspace({ data }: { readonly data: Pick<StrategyWorkspaceData, "markets" | "canWriteMarket" | "canPlan" | "segmentAdvice" | "at"> }) {
  const { MARKET_STRATEGY_TEXT: T, STRATEGY_TEXT, PLANNING_WORKSPACE_TEXT: W, DOMAIN_LABEL } = useMessages();
  const router = useRouter();
  const locale = useLocale();
  const [checks, setChecks] = useState(false);
  return <ViewLayout className="@container" data-market-workspace>
    <ModuleHeadline moduleKey="segment" help={T.libraryWhy}
      description={<MarketModuleSummary markets={data.markets}/>}
      pageActions={{more:<RowActions label={W.pageActions(DOMAIN_LABEL.segment)} items={[
        {id:"checks",label:`${STRATEGY_TEXT.segmentAdviceTitle} ${data.segmentAdvice.length}`,icon:"list-checks",onSelect:()=>setChecks(true)},
        ...(data.canPlan?[{id:"strategy",label:DOMAIN_LABEL.strategy,icon:"flag" as const,onSelect:()=>router.push("/strategy")}]:[]),
      ]}/>}}
      create={data.canWriteMarket ? { href: "/segment/new", label: T.newMarket } : undefined} />
    {data.markets ? <MarketLibrary markets={data.markets} canWrite={data.canWriteMarket} /> : <EmptyState title={T.unknown} />}
    <footer className="border-t border-dashed border-primary/10 pt-lg pb-2xl text-body-small text-muted-foreground">
      {T.dataAt} {new Date(data.at).toLocaleString(locale)}
    </footer>
    <Drawer open={checks} onClose={() => setChecks(false)} width={collectionDrawerWidth.standard} title={STRATEGY_TEXT.segmentAdviceTitle} closeLabel={T.closed}>
      <SegmentAdvicePanel advice={data.segmentAdvice} />
    </Drawer>
  </ViewLayout>;
}
