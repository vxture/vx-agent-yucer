"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "@vxture/design-ui";
import { StrategyInfoCard as Card, StrategyInfoContent as CardContent } from "./strategy-info-card";
import { StrategyDetailLabel, StrategyQuantity } from "./strategy-detail-label";
import layout from "./strategy-info-card.module.css";
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
export function StrategyMarketCards({ markets, actions, detail, attributes }: {
  readonly markets: readonly SelectedMarket[] | null;
  readonly actions?: (market: SelectedMarket) => ReactNode;
  readonly attributes?: (market: SelectedMarket) => ReactNode;
  readonly detail?: boolean;
}) {
  const { MARKET_STRATEGY_TEXT: T } = useMessages();
  if (markets === null || !markets.length) return <p className="text-body-small text-muted-foreground">{markets === null ? T.unknown : T.noPlanMarkets}</p>;
  return <StrategySelectionGrid kind="market" count={markets.length} detail={detail}>
    {markets.map(m => <StrategyMarketCard key={m.segmentId} market={m} actions={actions} attributes={attributes}/>)}
  </StrategySelectionGrid>;
}

export function StrategySolutionCards({ solutions, products = [], markets, sharedIds, sharedProductIds, detail, actions }: {
  readonly products?: readonly ProductReference[] | null;
  readonly sharedProductIds?: readonly string[];
  readonly actions?: (row: {id:string;kind:"product"|"solution"})=>ReactNode;
  readonly solutions: readonly SolutionReference[] | null;
  readonly markets: readonly { marketName: string; solutionIds?: readonly string[]; productIds?: readonly string[] }[];
  readonly sharedIds: readonly string[] | undefined;
  readonly detail?: boolean;
}) {
  const { STRATEGY_RESULT_TEXT:R, MARKET_STRATEGY_TEXT: T } = useMessages();
  const rows = strategyOfferings(solutions, products);
  return <>
    {solutions === null ? <p className="text-body-small text-muted-foreground">{T.solutionOptionsUnavailable}</p> : null}
    {products === null ? <p className="text-body-small text-muted-foreground">{T.productOptionsUnavailable}</p> : null}
    {!rows.length && solutions !== null && products !== null ? <p className="text-body-small text-muted-foreground">{T.noPlanSolutions}</p> : null}
    <StrategySelectionGrid kind="solution" count={rows.length} detail={detail}>
      {rows.map(row => {
        const shared=(row.kind === "product" ? sharedProductIds : sharedIds)?.includes(row.id);
        const scopes=markets.filter(m=>(row.kind === "product" ? m.productIds : m.solutionIds)?.includes(row.id));
        let marketLabel = T.noPlanMarkets;
        if (scopes.length) marketLabel = scopes.map(m => m.marketName).join(" / ");
        if (shared) marketLabel = T.sharedScope;
        return <Card key={row.key} variant="reference" data-strategy-offering={row.kind}><CardContent className="h-full">
          <Link href={row.href} className="inline-flex min-w-0 items-start gap-xs text-body font-medium transition-colors hover:text-primary-text"><Icon name={row.icon} size="sm" className="shrink-0 text-muted-foreground" aria-hidden="true"/><span className="line-clamp-2 break-words">{row.name}</span></Link>
          <div className="flex min-w-0 flex-wrap items-center gap-xs text-body-small text-muted-foreground"><span>{row.kind === "product" ? T.productKind : T.solutionKind}</span><span className="truncate">{row.code}</span>{row.status === "retired" ? <Tag>{T.retiredSolution}</Tag>:null}{row.novelty?<Tag>{R[row.novelty]}</Tag>:null}</div>
          <div className={`mt-auto ${layout.divider}`}><dl data-strategy-offering-market><div className={layout.field}>
            <dt><StrategyDetailLabel>{T.targetMarketsTitle}</StrategyDetailLabel></dt>
            <dd title={marketLabel} className={`line-clamp-2 ${shared || scopes.length ? "" : "text-muted-foreground"}`}>{marketLabel}</dd>
          </div></dl></div>
          {actions?<div className="flex justify-end">{actions(row)}</div>:null}
        </CardContent></Card>;
      })}
    </StrategySelectionGrid>
  </>;
}

function StrategyMarketCard({ market: m, actions, attributes }: {
  readonly market: SelectedMarket;
  readonly actions?: (market: SelectedMarket) => ReactNode;
  readonly attributes?: (market: SelectedMarket) => ReactNode;
}) {
  const { STRATEGY_RESULT_TEXT:R, MARKET_STRATEGY_TEXT:T, STRATEGY_TEXT } = useMessages();
  return <Card key={m.segmentId} variant="reference" data-strategy-target-market><CardContent>
      <div className="flex min-w-0 items-start justify-between gap-sm">
        <Link className="inline-flex min-w-0 items-start gap-xs text-body font-medium transition-colors hover:text-primary-text" href={`/segment/${encodeURIComponent(m.segmentId)}`}><Icon name="globe" size="sm" className="shrink-0 text-muted-foreground" aria-hidden="true"/><span className="line-clamp-2 break-words">{m.marketName}</span></Link>
        <div className="flex shrink-0 flex-wrap items-center gap-xs"><Tag tone={m.intent === "focus" ? "success" : "neutral"}>{marketIntentLabel(m.intent, T)}</Tag>
          {attributes?.(m)}{m.status && m.status !== "active" ? <Tag>{STRATEGY_TEXT.segmentStatusLabel[m.status]}</Tag> : null}
        </div>
      </div>
      <dl className={layout.rows} data-strategy-market-facts>
        <div className={layout.field}><dt><StrategyDetailLabel>{T.criteria}</StrategyDetailLabel></dt><dd className="line-clamp-2">{m.criteria?[...m.criteria.industries,...m.criteria.regions].join(" / ")||T.undefined:T.unknown}</dd></div>
        <div className={layout.field}><dt><StrategyDetailLabel>{R.sizes}</StrategyDetailLabel></dt><dd className="line-clamp-2">{m.criteria?.sizes?.join(" / ")||R.unlimitedSize}</dd></div>
        <div className={layout.field}><dt><StrategyDetailLabel>{T.marketApproach}</StrategyDetailLabel></dt><dd className={`line-clamp-2 ${m.approach?"":"text-muted-foreground"}`}>{m.approach||T.noMarketApproach}</dd></div>
        <div className={layout.field}><dt><StrategyDetailLabel>{T.featuredSolutions}</StrategyDetailLabel></dt><dd className="flex min-w-0 flex-col items-start gap-xs">
          <MarketOfferings market={m}/>
        </dd></div>
        {m.criteria?.customerNeed?<div className={layout.field}><dt><StrategyDetailLabel>{T.customerNeed}</StrategyDetailLabel></dt><dd className="line-clamp-2 break-words text-muted-foreground">{m.criteria.customerNeed}</dd></div>:null}
      </dl>
      <MarketFooter market={m} actions={actions}/>
    </CardContent></Card>;
}
function marketIntentLabel(intent: TargetMarketIntent | null, text: { focusMarket: string; validateMarket: string; unclassifiedMarket: string }) {
  if (intent === "focus") return text.focusMarket;
  if (intent === "validate") return text.validateMarket;
  return text.unclassifiedMarket;
}

function MarketOfferings({ market:m }: { readonly market: SelectedMarket }) {
  const { MARKET_STRATEGY_TEXT:T } = useMessages();
  const rows = strategyOfferings(m.solutions, m.products);
  const unavailable = m.solutions === null || m.products === null;
  const empty = !unavailable && !rows.length;
  return <>
    {rows.slice(0,2).map(row=><Link key={row.key} href={row.kind === "product" ? `/catalog?product=${encodeURIComponent(row.id)}` : `/solution?solution=${encodeURIComponent(row.id)}`} className="inline-flex min-w-0 items-start gap-xs transition-colors hover:text-primary-text" title={row.name}><Icon name={row.icon} size="sm" className="shrink-0 text-muted-foreground"/><span className="line-clamp-1 break-words">{row.name}</span></Link>)}
    {rows.length>2?<Link href={`/segment/${encodeURIComponent(m.segmentId)}`} className="text-body-small text-muted-foreground hover:text-primary-text">+{rows.length-2}</Link>:null}
    {unavailable ? <span className="text-muted-foreground">{T.unknown}</span> : null}
    {empty ? <span className="text-muted-foreground">{T.noPlanSolutions}</span> : null}
  </>;
}

function MarketFooter({ market:m, actions }: { readonly market: SelectedMarket; readonly actions?: (market: SelectedMarket) => ReactNode }) {
  const { MARKET_STRATEGY_TEXT:T, STRATEGY_DETAIL_TEXT:D } = useMessages();
  return m.matched !== undefined || actions ? <div className={`mt-auto flex min-w-0 flex-wrap items-center justify-between gap-sm ${layout.divider}`} data-strategy-market-footer>
        {m.matched !== undefined ? <div className="flex flex-wrap items-baseline gap-x-sm gap-y-xs">
          <span className="inline-flex items-baseline gap-xs"><StrategyDetailLabel>{T.customerCount}</StrategyDetailLabel><StrategyQuantity value={m.matched ?? T.unknown} unit={m.matched==null?undefined:D.customerUnit}/></span>
          {m.missing ? <span className="text-body-small text-muted-foreground">{T.missing} <StrategyQuantity value={m.missing} unit={D.customerUnit}/></span> : null}
        </div> : null}{actions?.(m)}
      </div> : null;
}
