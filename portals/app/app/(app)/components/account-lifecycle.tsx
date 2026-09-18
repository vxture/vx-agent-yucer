"use client";

import Link from "next/link";
import { Icon, PanelCard, PanelItem, PanelList, StatusBadge } from "@vxture/design-ui";
import { useLocale, useMessages } from "../lib/i18n/provider";
import { formatMoney } from "../lib/view-model";
import { Tag } from "./tag";

// 全链条内容 (owner, 2026-09-18: 客户详情页重排) - 商机 / 交付项目 / 回款，
// 三个 tab 共用的展示件. AI 洞察不是编出来的文案: 每条都是 cachedFeed() 已经
// 算好、按 subjectId 命中这条商机/这个账户的真实 Judgement.claim - 这个读此前
// 在页面上被取了却从未渲染 (grep 一遍就能看到), 这里是把已经付过的读用起来,
// 不是新开一次计算.

export interface DealLifecycleRow {
  readonly id: string;
  readonly name: string;
  readonly stageLabel: string;
  readonly amount: number | null;
  readonly currency: string;
  readonly status: "open" | "won" | "lost";
  /** The account's own real-time judgement for this one deal, if any fired. */
  readonly insight: { claim: string; rule: string | null; tone: "danger" | "warning" | "success" | "neutral" } | null;
}

export function DealLifecyclePanel({
  deals,
  defaultCurrency,
}: {
  readonly deals: readonly DealLifecycleRow[];
  readonly defaultCurrency: string;
}) {
  const { ACCOUNT_TEXT } = useMessages();
  const locale = useLocale();

  if (deals.length === 0) {
    return <p className="text-muted-foreground text-body-sm">{ACCOUNT_TEXT.rosterNoDeals}</p>;
  }

  return (
    <PanelList>
      {deals.map((d) => (
        <PanelItem
          key={d.id}
          lead={
            <Icon
              name={d.status === "won" ? "check" : d.status === "lost" ? "x" : "minus"}
              size="sm"
              className={
                d.status === "won"
                  ? "text-success"
                  : d.insight?.tone === "danger"
                    ? "text-destructive"
                    : "text-muted-foreground"
              }
            />
          }
          main={
            <div className="flex min-w-0 flex-col gap-2xs">
              <Link href={`/pipeline/${d.id}`} className="text-foreground min-w-0 truncate text-body-sm font-medium hover:underline">
                {d.name}
              </Link>
              <span className="text-muted-foreground text-body-sm">{d.stageLabel}</span>
              {d.insight ? (
                <p
                  className={
                    "text-body-sm mt-2xs " +
                    (d.insight.tone === "danger"
                      ? "text-destructive"
                      : d.insight.tone === "warning"
                        ? "text-warning"
                        : "text-muted-foreground")
                  }
                >
                  {d.insight.claim}
                </p>
              ) : null}
            </div>
          }
          trail={
            <span className="text-foreground text-body-sm tabular-nums whitespace-nowrap">
              {d.amount != null ? formatMoney(d.amount, d.currency, locale) : "-"}
            </span>
          }
        />
      ))}
    </PanelList>
  );
}

export interface ProjectMilestoneRow {
  readonly id: string;
  readonly name: string;
  readonly statusLabel: string;
  readonly dueAt: string | null;
  readonly overdue: boolean;
  readonly amount: number | null;
  readonly currency: string;
}

export function ProjectLifecyclePanel({
  projectName,
  healthLabel,
  healthTone,
  milestones,
}: {
  readonly projectName: string;
  readonly healthLabel: string;
  readonly healthTone: "success" | "warning" | "danger";
  readonly milestones: readonly ProjectMilestoneRow[];
}) {
  const { ACCOUNT_TEXT } = useMessages();
  const locale = useLocale();
  return (
    <PanelCard title={projectName} action={<Tag tone={healthTone}>{healthLabel}</Tag>}>
      {milestones.length === 0 ? (
        <p className="text-muted-foreground text-body-sm">{ACCOUNT_TEXT.lifecycleNoMilestones}</p>
      ) : (
        <PanelList>
          {milestones.map((m) => (
            <PanelItem
              key={m.id}
              main={<span className="text-foreground text-body-sm">{m.name}</span>}
              trail={
                <span className="flex items-center gap-xs">
                  {m.overdue ? <StatusBadge tone="danger">{m.dueAt}</StatusBadge> : <Tag>{m.dueAt ?? m.statusLabel}</Tag>}
                  {m.amount != null ? (
                    <span className="text-foreground text-body-sm tabular-nums whitespace-nowrap">
                      {formatMoney(m.amount, m.currency, locale)}
                    </span>
                  ) : null}
                </span>
              }
            />
          ))}
        </PanelList>
      )}
    </PanelCard>
  );
}

export interface RevenueRow {
  readonly id: string;
  readonly milestoneName: string;
  readonly statusLabel: string;
  readonly overdue: boolean;
  readonly dueAt: string | null;
  readonly amount: number;
  readonly currency: string;
}

export function RevenueLifecyclePanel({ rows }: { readonly rows: readonly RevenueRow[] }) {
  const { ACCOUNT_TEXT } = useMessages();
  const locale = useLocale();
  if (rows.length === 0) {
    return <p className="text-muted-foreground text-body-sm">{ACCOUNT_TEXT.lifecycleNoInstalments}</p>;
  }
  return (
    <PanelList>
      {rows.map((r) => (
        <PanelItem
          key={r.id}
          main={<span className="text-foreground text-body-sm">{r.milestoneName}</span>}
          trail={
            <span className="flex items-center gap-xs">
              {r.overdue ? <StatusBadge tone="danger">{r.dueAt}</StatusBadge> : <Tag>{r.dueAt ?? r.statusLabel}</Tag>}
              <span className="text-foreground text-body-sm tabular-nums whitespace-nowrap">
                {formatMoney(r.amount, r.currency, locale)}
              </span>
            </span>
          }
        />
      ))}
    </PanelList>
  );
}
