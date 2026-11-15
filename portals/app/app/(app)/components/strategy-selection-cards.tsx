"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle, Icon } from "@vxture/design-ui";
import type { ProductReference, SolutionReference } from "../../domains/catalog/service";
import type { SegmentCriteria, TargetMarketIntent } from "../../domains/strategy/lib/lifecycle";
import { useMessages } from "../lib/i18n/provider";
import { strategyOfferings } from "../lib/strategy-offerings";
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
  products?: readonly ProductReference[] | null;
}

function StrategySelectionGrid({ children, count, kind, detail }: {
  readonly children: ReactNode;
  readonly count: number;
  readonly kind: "market" | "solution";
  readonly detail?: boolean;
}) {
  // Width controls the first expansion; the shell permits the third column
  // only when the content has the entire workspace to itself.
  const columns = detail
    ? "@2xl:grid-cols-2 @5xl:in-data-workspace-full-width:grid-cols-3"
    : "@xl:grid-cols-2 @3xl:grid-cols-3";
  const slots = kind === "market" || detail;
  const placeholder = { "data-strategy-market-placeholder": kind === "market" ? "" : undefined, "aria-hidden": true as const };
  return <div className={`grid grid-cols-1 gap-lg ${columns}`}
    data-strategy-target-market-grid={kind === "market" ? "" : undefined}
    data-strategy-solution-grid={kind === "solution" ? "" : undefined}>
    {children}
    {slots && count % 2 === 1 ? <div {...placeholder} className={`hidden rounded-md border border-primary/5 ${detail
      ? "@2xl:block @5xl:in-data-workspace-full-width:hidden"
      : "@xl:block @3xl:hidden"}`}/> : null}
    {slots ? Array.from({length:(3-count % 3) % 3},(_,i)=><div key={i} {...placeholder} className={`hidden rounded-md border border-primary/5 ${detail
      ? "@5xl:in-data-workspace-full-width:block"
      : "@3xl:block"}`}/>) : null}
  </div>;
}

// Shared read/draft presentation; mutation controls are supplied only by the editor.
export function StrategyMarketCards({ markets, actions, detail }: {
  readonly markets: readonly SelectedMarket[] | null;
  readonly actions?: (market: SelectedMarket) => ReactNode;
  readonly detail?: boolean;
}) {
  const { MARKET_STRATEGY_TEXT: T, STRATEGY_TEXT } = useMessages();
  if (markets === null || !markets.length) return <p className="text-body-small text-muted-foreground">{markets === null ? T.unknown : T.noPlanMarkets}</p>;
  return <StrategySelectionGrid kind="market" count={markets.length} detail={detail}>
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
            {strategyOfferings(m.solutions, m.products).map(row => <Link key={row.key} href={row.href}
              className="inline-flex min-w-0 items-start gap-xs break-words transition-colors hover:text-primary-text" title={row.kind === "product" ? T.productKind : T.solutionKind}>
              <Icon name={row.icon} size="sm" className="shrink-0 text-muted-foreground" aria-hidden="true"/><span>{row.name}</span>
            </Link>)}
            {m.solutions === null || m.products === null ? <span className="text-muted-foreground">{T.unknown}</span>
              : !m.solutions?.length && !m.products?.length ? <span className="text-muted-foreground">{T.noPlanSolutions}</span> : null}
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
  </StrategySelectionGrid>;
}

export function StrategySolutionCards({ solutions, products = [], markets, sharedIds, sharedProductIds, detail }: {
  readonly products?: readonly ProductReference[] | null;
  readonly sharedProductIds?: readonly string[];
  readonly solutions: readonly SolutionReference[] | null;
  readonly markets: readonly { marketName: string; solutionIds?: readonly string[]; productIds?: readonly string[] }[];
  readonly sharedIds: readonly string[] | undefined;
  readonly detail?: boolean;
}) {
  const { MARKET_STRATEGY_TEXT: T } = useMessages();
  const rows = strategyOfferings(solutions, products);
  return <>
    {solutions === null ? <p className="text-body-small text-muted-foreground">{T.solutionOptionsUnavailable}</p> : null}
    {products === null ? <p className="text-body-small text-muted-foreground">{T.productOptionsUnavailable}</p> : null}
    {!rows.length && solutions !== null && products !== null ? <p className="text-body-small text-muted-foreground">{T.noPlanSolutions}</p> : null}
    <StrategySelectionGrid kind="solution" count={rows.length} detail={detail}>
      {rows.map(row => {
        const shared=(row.kind === "product" ? sharedProductIds : sharedIds)?.includes(row.id);
        const scopes=markets.filter(m=>(row.kind === "product" ? m.productIds : m.solutionIds)?.includes(row.id));
        return <Card key={row.key} className="min-w-0 gap-md py-lg" data-strategy-offering={row.kind}><CardHeader>
          <div className="flex items-start gap-sm"><Icon name={row.icon} size="lg" className="shrink-0 text-muted-foreground" aria-hidden="true"/>
            <div className="flex min-w-0 flex-col gap-xs"><CardTitle><Link href={row.href} className="break-words transition-colors hover:text-primary">{row.name}</Link></CardTitle>
              <span className="text-body-small text-muted-foreground">{row.kind === "product" ? T.productKind : T.solutionKind}{` \u00b7 ${row.code}`}{row.status === "retired" ? ` \u00b7 ${T.retiredSolution}` : ""}</span></div>
          </div></CardHeader><CardContent><div className="flex min-w-0 gap-sm"><span className="size-icon-lg shrink-0" aria-hidden="true"/><div className="flex min-w-0 flex-1 flex-col gap-sm text-body-small">
            {shared ? <span className="text-muted-foreground">{T.sharedScope}</span> : null}
            {scopes.length ? <dl className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-sm">
              <dt className="text-muted-foreground">{T.targetMarketsTitle}</dt><dd className="break-words">{scopes.map(m=>m.marketName).join(" / ")}</dd>
            </dl> : null}
          </div></div></CardContent></Card>;
      })}
    </StrategySelectionGrid>
  </>;
}
