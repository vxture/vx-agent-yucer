"use client";

import { useState, useTransition } from "react";
import { Button, Icon, StatusBadge } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import { explainModelPlaneError, isModelPlaneError } from "../lib/model-plane-error";
import type { PriceAdvice } from "../../domains/copilot/lib/price-advice";
import { formatMoney } from "../lib/view-model";
import type { ConcessionRow } from "../../domains/catalog/lib/pricing";

// 让价对照 (YC-065 R8, YC-069 section 08, deal batch 10a) - what the approver
// signs against, beside the reason box: every line's list, floor and quote,
// the deal's concession in total, and how the deal's amount moved (the claim
// log). SHOWN, NEVER JUDGED - no "approve / reject" suggestion anywhere here.

export interface ConcessionView {
  readonly rows: readonly ConcessionRow[];
  readonly listAmount: number | null;
  readonly concession: number | null;
  readonly rate: number | null;
  readonly unpriced: number;
  /** The deal amount's changes, oldest first, from the claim log. */
  readonly amountHistory: readonly { readonly at: string; readonly from: number | null; readonly to: number | null }[];
}

export function ConcessionSheet({
  view,
  names,
  currency,
  highlight,
  onAdvise,
}: {
  readonly view: ConcessionView;
  readonly names: ReadonlyMap<string, string>;
  readonly currency: string;
  /** The line being signed. */
  readonly highlight: string | null;
  /** 价格参谋 (deal batch 10b); absent when the member may not run it. */
  readonly onAdvise?: () => Promise<{ ok: true; advice: PriceAdvice; cached: boolean } | { ok: false; error: string }>;
}) {
  const { CONCESSION_TEXT: T } = useMessages();
  const money = (n: number | null) => (n === null ? "—" : formatMoney(n, currency));
  return (
    <div className="flex flex-col gap-sm text-body-sm">
      <table className="w-full tabular-nums">
        <thead className="text-muted-foreground">
          <tr className="border-border border-b">
            <th className="py-2xs text-left font-normal">{T.product}</th>
            <th className="py-2xs text-right font-normal">{T.quantity}</th>
            <th className="py-2xs text-right font-normal">{T.list}</th>
            <th className="py-2xs text-right font-normal">{T.floor}</th>
            <th className="py-2xs text-right font-normal">{T.quoted}</th>
            <th className="py-2xs text-right font-normal">{T.belowFloor}</th>
          </tr>
        </thead>
        <tbody>
          {view.rows.map((r) => (
            <tr
              key={r.productId}
              className={`border-border border-b border-dashed last:border-b-0 ${r.productId === highlight ? "bg-muted" : ""}`}
            >
              <td className="text-foreground py-2xs pr-sm">{names.get(r.productId) ?? r.productId}</td>
              <td className="py-2xs text-right">{r.quantity}</td>
              <td className="py-2xs text-right">{money(r.listPrice)}</td>
              <td className="py-2xs text-right">{money(r.floorPrice)}</td>
              <td className="text-foreground py-2xs text-right">{money(r.unitPrice)}</td>
              <td className={`py-2xs text-right ${r.belowFloor > 0 ? "text-warning" : "text-muted-foreground"}`}>
                {r.belowFloor > 0 ? money(r.belowFloor) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-foreground">
        {view.concession === null || view.rate === null
          ? T.totalUnknown
          : T.total(money(view.concession), Math.round(view.rate * 1000) / 10)}
        {view.unpriced > 0 ? <span className="text-muted-foreground"> {T.unpriced(view.unpriced)}</span> : null}
      </p>
      {view.amountHistory.length > 0 ? (
        <div>
          <p className="text-muted-foreground">{T.historyTitle}</p>
          <ol className="mt-2xs flex flex-col gap-2xs">
            {view.amountHistory.map((h, i) => (
              <li key={`${h.at}-${i}`} className="tabular-nums">
                <span className="text-muted-foreground">{h.at}</span> {money(h.from)} → {money(h.to)}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
      {onAdvise ? <PriceAdvisor onAdvise={onAdvise} /> : null}
    </div>
  );
}

/** The advisor's block: one press, the admitted advice, the buyer's own words. */
function PriceAdvisor({
  onAdvise,
}: {
  readonly onAdvise: () => Promise<{ ok: true; advice: PriceAdvice; cached: boolean } | { ok: false; error: string }>;
}) {
  const { PRICE_ADVICE_TEXT: A, PRICE_ADVICE_ERROR, COPILOT_TEXT } = useMessages();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ advice: PriceAdvice; cached: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="border-border flex flex-col gap-xs rounded-md border border-dashed p-sm">
      <div className="flex items-center justify-between gap-sm">
        <span className="text-foreground flex items-center gap-2xs font-medium">
          <Icon name="sparkles" size="xs" />
          {A.title}
        </span>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await onAdvise();
              if (r.ok) {
                setResult({ advice: r.advice, cached: r.cached });
                setError(null);
              } else {
                // The model plane's codes are composed at runtime - one mapping
                // for them (lib/model-plane-error.ts), never the raw code.
                setError(
                  isModelPlaneError(r.error)
                    ? explainModelPlaneError(r.error, COPILOT_TEXT)
                    : (PRICE_ADVICE_ERROR[r.error] ?? PRICE_ADVICE_ERROR.unknown ?? r.error),
                );
              }
            })
          }
        >
          {pending ? A.running : A.run}
        </Button>
      </div>
      {!result && !error ? <p className="text-muted-foreground">{A.why}</p> : null}
      {error ? <StatusBadge tone="warning">{error}</StatusBadge> : null}
      {result ? (
        <div className="flex flex-col gap-xs">
          {result.advice.strategy ? (
            <p>
              <span className="text-muted-foreground">{A.strategy}：</span>
              {result.advice.strategy}
            </p>
          ) : null}
          {result.advice.trades.length > 0 ? (
            <div>
              <p className="text-muted-foreground">{A.trades}</p>
              <ul className="ml-md list-disc">
                {result.advice.trades.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {result.advice.quotes.length > 0 ? (
            <div>
              <p className="text-muted-foreground">{A.quotes}</p>
              <ul className="flex flex-col gap-2xs">
                {result.advice.quotes.map((q) => (
                  <li key={`${q.noteId}-${q.text}`} className="border-border border-l-2 pl-xs">
                    “{q.text}”
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {result.advice.dropped > 0 ? <p className="text-muted-foreground">{A.dropped(result.advice.dropped)}</p> : null}
          {result.cached ? <p className="text-muted-foreground">{A.cached}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
