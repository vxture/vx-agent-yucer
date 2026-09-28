"use client";

import { useMessages } from "../lib/i18n/provider";
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
}: {
  readonly view: ConcessionView;
  readonly names: ReadonlyMap<string, string>;
  readonly currency: string;
  /** The line being signed. */
  readonly highlight: string | null;
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
    </div>
  );
}
