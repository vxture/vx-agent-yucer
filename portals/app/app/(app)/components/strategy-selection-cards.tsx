"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle, Icon } from "@vxture/design-ui";
import type { SolutionReference } from "../../domains/catalog/service";
import type { SegmentCriteria, TargetMarketIntent } from "../../domains/strategy/lib/lifecycle";
import { useMessages } from "../lib/i18n/provider";
import { Tag } from "./tag";

interface SelectedMarket {
  segmentId: string;
  marketName: string;
  intent: TargetMarketIntent | null;
  approach: string | null;
  criteria?: SegmentCriteria;
  status?: "active" | "paused" | "retired";
  matched?: number | null;
  missing?: number | null;
  solutions?: readonly SolutionReference[] | null;
}

// Shared read/draft presentation; mutation controls are supplied only by the editor.
export function StrategyMarketCards({ markets, actions }: {
  readonly markets: readonly SelectedMarket[] | null;
  readonly actions?: (market: SelectedMarket) => ReactNode;
}) {
  const { MARKET_STRATEGY_TEXT: T, STRATEGY_TEXT } = useMessages();
  if (markets === null || !markets.length) return <p className="text-body-small text-muted-foreground">{markets === null ? T.unknown : T.noPlanMarkets}</p>;
  return <div className="grid grid-cols-1 gap-lg @xl:grid-cols-2 @3xl:grid-cols-3" data-strategy-target-market-grid>
    {markets.map(m => <Card key={m.segmentId} className="min-w-0 gap-lg py-lg" data-strategy-target-market>
      <CardHeader><div className="flex items-start gap-sm">
        <Icon name="globe" size="lg" className="shrink-0 text-primary-text" aria-hidden="true"/>
        <div className="flex min-h-control-md min-w-0 flex-1 flex-wrap items-center justify-between gap-sm">
          <CardTitle className="min-w-0"><Link className="break-words transition-colors hover:text-primary-text" href={`/strategy?view=markets&market=${encodeURIComponent(m.segmentId)}`}>{m.marketName}</Link></CardTitle>
          <div className="flex shrink-0 flex-wrap items-center gap-xs"><Tag tone={m.intent === "focus" ? "success" : "neutral"}>{m.intent === "focus" ? T.focusMarket : m.intent === "validate" ? T.validateMarket : T.unclassifiedMarket}</Tag>
            {m.status && m.status !== "active" ? <Tag>{STRATEGY_TEXT.segmentStatusLabel[m.status]}</Tag> : null}
          </div>
        </div>
      </div></CardHeader>
      <CardContent className="flex-1"><div className="flex min-w-0 gap-sm">
        <span className="size-icon-lg shrink-0" aria-hidden="true"/>
        <dl className="grid min-w-0 flex-1 grid-cols-[auto_minmax(0,1fr)] content-start items-baseline gap-x-sm gap-y-md text-body-small" data-strategy-market-facts>
          <dt className="text-muted-foreground">{T.criteria}</dt>
          <dd className="min-w-0 break-words">{m.criteria ? [...m.criteria.industries, ...(m.criteria.sizes ?? []), ...m.criteria.regions].join(" / ") || T.undefined : T.unknown}</dd>
          {m.criteria?.customerNeed ? <><dt className="text-muted-foreground">{T.customerNeed}</dt><dd className="min-w-0 whitespace-pre-wrap break-words">{m.criteria.customerNeed}</dd></> : null}
          <dt className="text-muted-foreground">{T.marketApproach}</dt>
          <dd className={`min-w-0 whitespace-pre-wrap break-words ${m.approach ? "" : "text-muted-foreground"}`}>{m.approach || T.noMarketApproach}</dd>
          <dt className="text-muted-foreground">{T.featuredSolutions}</dt>
          <dd className="flex min-w-0 flex-col items-start gap-xs">
            {m.solutions === null ? <span className="text-muted-foreground">{T.unknown}</span> : !m.solutions?.length ? <span className="text-muted-foreground">{T.noPlanSolutions}</span> : m.solutions.map(s => <Link key={s.id} href={`/solution?solution=${encodeURIComponent(s.id)}`} className="break-words transition-colors hover:text-primary-text">{s.name}</Link>)}
          </dd>
        </dl>
      </div></CardContent>
      {m.matched !== undefined || actions ? <CardFooter className="mt-auto"><span className="size-icon-lg shrink-0" aria-hidden="true"/><div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-sm" data-strategy-market-footer>
        {m.matched !== undefined ? <div className="flex flex-wrap items-baseline gap-x-sm gap-y-xs text-body-small">
          <span className="inline-flex items-baseline gap-xs text-muted-foreground">{T.customerCount}<span className="font-medium tabular-nums text-foreground">{m.matched ?? T.unknown}</span></span>
          {m.missing ? <span className="text-muted-foreground">{T.missing} <span className="tabular-nums">{m.missing}</span></span> : null}
        </div> : null}
        {actions?.(m)}
      </div></CardFooter> : null}
    </Card>)}
    {markets.length % 2 ? <div aria-hidden="true" className="hidden rounded-md border border-primary/5 @xl:block @3xl:hidden" data-strategy-market-placeholder/> : null}
    {Array.from({length:(3-markets.length % 3) % 3},(_,i)=><div key={i} aria-hidden="true" className="hidden rounded-md border border-primary/5 @3xl:block" data-strategy-market-placeholder/>)}
  </div>;
}

export function StrategySolutionCards({ solutions, markets, sharedIds }: {
  readonly solutions: readonly SolutionReference[] | null;
  readonly markets: readonly { marketName: string; solutionIds?: readonly string[] }[];
  readonly sharedIds: readonly string[] | undefined;
}) {
  const { MARKET_STRATEGY_TEXT: T } = useMessages();
  if (solutions === null) return <p className="text-body-small text-muted-foreground">{T.solutionOptionsUnavailable}</p>;
  if (!solutions.length) return <p className="text-body-small text-muted-foreground">{T.noPlanSolutions}</p>;
  return <div className="grid grid-cols-1 gap-lg @xl:grid-cols-2 @3xl:grid-cols-3" data-strategy-solution-grid>
    {solutions.map(s => <Card key={s.id} className="min-w-0 gap-md py-lg"><CardHeader>
      <div className="flex items-start gap-sm"><Icon name="package" size="lg" className="shrink-0 text-muted-foreground" aria-hidden="true"/>
        <div className="flex min-w-0 flex-col gap-xs"><CardTitle><Link href={`/solution?solution=${encodeURIComponent(s.id)}`} className="break-words transition-colors hover:text-primary">{s.name}</Link></CardTitle>
          <span className="text-body-small text-muted-foreground">{s.solutionCode}{s.status === "retired" ? ` \u00b7 ${T.retiredSolution}` : ""}</span></div>
      </div></CardHeader><CardContent><div className="flex min-w-0 gap-sm"><span className="size-icon-lg shrink-0" aria-hidden="true"/><div className="flex min-w-0 flex-1 flex-col gap-sm text-body-small">
        {sharedIds?.includes(s.id) ? <span className="text-muted-foreground">{T.sharedScope}</span> : null}
        {markets.some(m => m.solutionIds?.includes(s.id)) ? <dl className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-sm">
          <dt className="text-muted-foreground">{T.targetMarketsTitle}</dt><dd className="break-words">{markets.filter(m => m.solutionIds?.includes(s.id)).map(m => m.marketName).join(" / ")}</dd>
        </dl> : null}
      </div></div></CardContent></Card>)}
  </div>;
}
