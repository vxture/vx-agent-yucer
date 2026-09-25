"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@vxture/design-ui";
import { useLocale, useMessages } from "../lib/i18n/provider";
import { formatMoneyCompact, formatPercent } from "../lib/view-model";
import { Tag } from "./tag";
import type { DealShare, WalletRollup, WalletRollupLine } from "../../domains/pipeline/lib/wallet-share";

// 商机占比 (renamed from 钱包份额, owner 2026-09-25; YC-021 L4, business rules §9.6) - three renderings of one rule:
// the deal's own line, the 存量收入 card's rollup, and the 单位信息卡's row.
// The customer's total is always a person's estimate, so the 人工填报 tag
// travels with every number that rests on it.

function ManualTag() {
  const { RISK_TEXT } = useMessages();
  return (
    <span className="inline-flex shrink-0" title={RISK_TEXT.sourceHint.manual}>
      <Tag>{RISK_TEXT.source.manual}</Tag>
    </span>
  );
}

const pct = (share: number, locale: string) => (Number.isFinite(share) ? formatPercent(share, locale) : "∞");

/** The deal page's 商机占比 row value: ONE number (owner 2026-09-25: 页面显示
 *  太啰嗦). The row's own label names it and the 客户项目总投入 row above
 *  carries the budget, so the value is the percentage alone; what it rests on
 *  - basis, both amounts, that the total is 人工填报, who entered it - is the
 *  hover. A state with no number says why in two or three words. */
export function DealWalletLine({
  share,
  currency,
  byName,
  at,
}: {
  readonly share: DealShare;
  readonly currency: string;
  readonly byName: string | null;
  /** YYYY-MM-DD, or null. */
  readonly at: string | null;
}) {
  const { WALLET_TEXT, RISK_TEXT } = useMessages();
  const locale = useLocale();
  if (share.state !== "known") {
    return (
      <span className="text-muted-foreground">
        {share.state === "no_budget"
          ? WALLET_TEXT.dealNoBudget
          : share.state === "not_ours"
            ? WALLET_TEXT.dealNotOurs
            : WALLET_TEXT.dealUnpriced}
      </span>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={`cursor-default font-bold tabular-nums ${share.exceeds ? "text-(color:--warning-text)" : ""}`}>
          {pct(share.share, locale)}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <div className="text-body-sm">
          {WALLET_TEXT.dealDetail(
            WALLET_TEXT.basis[share.basis],
            formatMoneyCompact(share.ours, currency, locale),
            formatMoneyCompact(share.budget, currency, locale),
          )}
        </div>
        <div className="text-body-sm opacity-80">
          {RISK_TEXT.source.manual}
          {byName && at ? ` · ${WALLET_TEXT.by(byName, at)}` : ""}
        </div>
        {share.exceeds ? <div className="text-body-sm">{WALLET_TEXT.exceeds}</div> : null}
      </TooltipContent>
    </Tooltip>
  );
}

function RollupRow({ label, line }: { readonly label: string; readonly line: WalletRollupLine }) {
  const { WALLET_TEXT } = useMessages();
  const locale = useLocale();
  return (
    <div className="flex items-center justify-between gap-sm text-body-sm">
      <span className="text-foreground flex min-w-0 items-center gap-sm">
        <span className="truncate">{label}</span>
        <ManualTag />
      </span>
      <span className={`shrink-0 tabular-nums ${line.share > 1 ? "text-(color:--warning-text)" : ""}`}>
        {WALLET_TEXT.ratio(
          pct(line.share, locale),
          formatMoneyCompact(line.ours, line.currency, locale),
          formatMoneyCompact(line.budget, line.currency, locale),
        )}
      </span>
    </div>
  );
}

/** The 存量收入 card: 已承接 and 在谈 apart, per currency, with coverage. */
export function WalletRollupBlock({ rollup }: { readonly rollup: WalletRollup }) {
  const { WALLET_TEXT } = useMessages();
  if (rollup.eligible === 0) return null;
  const known = rollup.committed.length + rollup.quoted.length > 0;
  return (
    <div className="flex flex-col gap-xs">
      <span className="text-muted-foreground text-label-sm font-bold" title={WALLET_TEXT.hint}>
        {WALLET_TEXT.title}
      </span>
      {rollup.committed.map((l) => (
        <RollupRow key={`c-${l.currency}`} label={WALLET_TEXT.committed(l.counted)} line={l} />
      ))}
      {rollup.quoted.map((l) => (
        <RollupRow key={`q-${l.currency}`} label={WALLET_TEXT.quoted(l.counted)} line={l} />
      ))}
      <p className="text-muted-foreground text-[11px]">
        {known ? WALLET_TEXT.coverage(rollup.withBudget, rollup.eligible) : WALLET_TEXT.noneFilled}
      </p>
    </div>
  );
}

/** The 单位信息卡 row's value: the won share, or 未填. Won only - one number
 *  on a card of facts; the split lives on the 存量收入 card. */
export function WalletOrgValue({ rollup }: { readonly rollup: WalletRollup }) {
  const { WALLET_TEXT } = useMessages();
  const locale = useLocale();
  const won = rollup.committed;
  if (won.length === 0) return <span className="text-muted-foreground">{WALLET_TEXT.orgNone}</span>;
  return (
    <span className="tabular-nums" title={WALLET_TEXT.coverage(rollup.withBudget, rollup.eligible)}>
      {won.map((l) => WALLET_TEXT.orgValue(pct(l.share, locale))).join(" / ")}
    </span>
  );
}
