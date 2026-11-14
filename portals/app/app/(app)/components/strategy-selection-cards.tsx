"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle, Icon } from "@vxture/design-ui";
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
    {markets.map(m => <Card key={m.segmentId} className="min-w-0 gap-md py-lg" data-strategy-target-market>
      <CardHeader><div className="flex items-start gap-sm">
        <Icon name="globe" size="md" className="shrink-0 text-primary" aria-hidden="true"/>
        <div className="flex min-w-0 flex-1 flex-col gap-sm">
          <CardTitle><Link className="break-words transition-colors hover:text-primary" href={`/strategy?view=markets&market=${encodeURIComponent(m.segmentId)}`}>{m.marketName}</Link></CardTitle>
          <div className="flex flex-wrap items-center gap-sm"><Tag tone={m.intent === "focus" ? "success" : "neutral"}>{m.intent === "focus" ? T.focusMarket : m.intent === "validate" ? T.validateMarket : T.unclassifiedMarket}</Tag>
            {m.status && m.status !== "active" ? <Tag>{STRATEGY_TEXT.segmentStatusLabel[m.status]}</Tag> : null}
            {m.matched !== undefined ? <span className="text-body-small text-muted-foreground">{T.customerCount} {m.matched ?? T.unknown}{m.missing ? ` \u00b7 ${T.missing} ${m.missing}` : ""}</span> : null}
          </div>
        </div>
        {actions?.(m)}
      </div></CardHeader>
      <CardContent><div className="flex flex-col gap-md text-body-small">
        <p className="text-muted-foreground">{m.criteria ? [...m.criteria.industries, ...(m.criteria.sizes ?? []), ...m.criteria.regions].join(" / ") || T.undefined : T.unknown}{m.criteria?.customerNeed ? ` \u00b7 ${m.criteria.customerNeed}` : ""}</p>
        <div className="flex flex-col gap-xs"><span className="text-muted-foreground">{T.marketApproach}</span><p className="whitespace-pre-wrap break-words">{m.approach || T.noMarketApproach}</p></div>
        <div className="flex flex-wrap items-baseline gap-sm"><span className="text-muted-foreground">{T.featuredSolutions}</span>
          {m.solutions === null ? T.unknown : !m.solutions?.length ? T.noPlanSolutions : m.solutions.map(s => <Link key={s.id} href={`/solution?solution=${encodeURIComponent(s.id)}`} className="transition-colors hover:text-primary">{s.name}</Link>)}
        </div>
      </div></CardContent>
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
      <div className="flex items-start gap-sm"><Icon name="package" size="md" className="shrink-0 text-muted-foreground" aria-hidden="true"/>
        <div className="flex min-w-0 flex-col gap-xs"><CardTitle><Link href={`/solution?solution=${encodeURIComponent(s.id)}`} className="break-words transition-colors hover:text-primary">{s.name}</Link></CardTitle>
          <span className="text-body-small text-muted-foreground">{s.solutionCode}{s.status === "retired" ? ` \u00b7 ${T.retiredSolution}` : ""}</span></div>
      </div></CardHeader><CardContent><div className="flex flex-col gap-sm text-body-small">
        {sharedIds?.includes(s.id) ? <span className="text-muted-foreground">{T.sharedScope}</span> : null}
        {markets.filter(m => m.solutionIds?.includes(s.id)).map(m => <span key={m.marketName} className="break-words text-muted-foreground">{T.marketScope} {"\u00b7"} {m.marketName}</span>)}
      </div></CardContent></Card>)}
  </div>;
}
