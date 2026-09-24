"use client";

import { useLocale, useMessages } from "../lib/i18n/provider";
import { formatMoneyCompact, formatPercent } from "../lib/view-model";
import { Tag } from "./tag";
import type { DealShare, WalletRollup, WalletRollupLine } from "../../domains/pipeline/lib/wallet-share";

// 钱包份额 (YC-021 L4, business rules §9.6) - three renderings of one rule:
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

/** The deal page: the share, what it rests on, and who said the budget. */
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
  const { WALLET_TEXT } = useMessages();
  const locale = useLocale();
  if (share.state !== "known") {
    const text =
      share.state === "no_budget"
        ? WALLET_TEXT.dealNoBudget
        : share.state === "not_ours"
          ? WALLET_TEXT.dealNotOurs
          : WALLET_TEXT.dealUnpriced;
    return (
      <p className="text-muted-foreground text-body-sm">
        {WALLET_TEXT.title} · {text}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2xs">
      <p className="flex flex-wrap items-center gap-x-sm gap-y-2xs text-body-sm">
        <span className="text-muted-foreground">{WALLET_TEXT.title}</span>
        <span className={`font-bold tabular-nums ${share.exceeds ? "text-(color:--warning-text)" : ""}`}>
          {pct(share.share, locale)}
        </span>
        <span className="text-muted-foreground">{WALLET_TEXT.basis[share.basis]}</span>
        <ManualTag />
        <span className="text-muted-foreground tabular-nums">
          {WALLET_TEXT.ours(formatMoneyCompact(share.ours, currency, locale))} ·{" "}
          {WALLET_TEXT.budget(formatMoneyCompact(share.budget, currency, locale))}
        </span>
        {byName && at ? <span className="text-muted-foreground text-[11px]">{WALLET_TEXT.by(byName, at)}</span> : null}
      </p>
      {share.exceeds ? <p className="text-(color:--warning-text) text-body-sm">{WALLET_TEXT.exceeds}</p> : null}
    </div>
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
