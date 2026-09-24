"use client";

import Link from "next/link";
import { Button, Icon, PanelCard, PanelItem, PanelList, StatusBadge } from "@vxture/design-ui";
import { useLocale, useMessages } from "../lib/i18n/provider";
import { formatMoney } from "../lib/view-model";
import { Tag } from "./tag";
import { SourceMark } from "./source-mark";
import { useChainView } from "./decision-chain-switch";

// 全链条内容 (owner, 2026-09-18: 客户详情页重排) - 商机 / 交付项目 / 回款，
// 三个 tab 共用的展示件. AI 洞察不是编出来的文案: 每条都是 cachedFeed() 已经
// 算好、按 subjectId 命中这条商机/这个账户的真实 Judgement.claim - 这个读此前
// 在页面上被取了却从未渲染 (grep 一遍就能看到), 这里是把已经付过的读用起来,
// 不是新开一次计算.

const INSIGHT_TONE = {
  danger:  "border-destructive-border bg-destructive-muted text-destructive-text",
  warning: "border-warning-border bg-warning-muted text-warning-text",
  success: "border-success-border bg-success-muted text-success-text",
  neutral: "border-border bg-muted text-muted-foreground",
} as const;

function InsightBox({
  tone,
  claim,
  source,
}: {
  readonly tone: keyof typeof INSIGHT_TONE;
  readonly claim: string;
  readonly source: "rule" | "model";
}) {
  return (
    <div className={`mt-2xs flex items-start gap-xs rounded-lg border p-xs text-body-sm ${INSIGHT_TONE[tone]}`}>
      <Icon name="warning" size="xs" className="mt-3xs shrink-0" />
      <span className="min-w-0 flex-1">{claim}</span>
      <SourceMark source={source} />
    </div>
  );
}

export interface DealLifecycleRow {
  readonly id: string;
  readonly name: string;
  readonly opportunityNo: string;
  readonly stageLabel: string;
  readonly ownerName: string | null;
  readonly amount: number | null;
  readonly currency: string;
  readonly status: "open" | "won" | "lost" | "abandoned";
  /** The account's own real-time judgement for this one deal, if any fired. */
  readonly insight: {
    claim: string;
    rule: string | null;
    tone: "danger" | "warning" | "success" | "neutral";
    source: "rule" | "model";
  } | null;
  /** Open-stage position for the progress dots (workspace's own catalog order,
   *  see openStageOrder()); null for a closed deal - a track "position" stops
   *  meaning anything once the deal has left the open funnel. */
  readonly stagePosition: { index: number; total: number } | null;
  /** From the stage-event journal (stageChangeTimestamps() + daysAtStage()),
   *  never from updated_at - null when the journal has no row yet (e.g. a
   *  deal created before this read existed). Not a stored column: see
   *  domains/pipeline/service.ts's stageChangeTimestamps() comment. */
  readonly daysInStage: number | null;
  /** True when decisionChainsByOpportunity() built a chain for this open deal
   *  - lets the row jump straight into it via useChainView() instead of only
   *  栏1's summary list being able to open one (mockup, 2026-09-20). */
  readonly hasChain: boolean;
}

// 阶段进度条 (owner, 2026-09-20 -> 2026-09-21 按设计调整): mockup 是等分
// bar segment, 不是圆点 - 已完成的段 bg-primary, 当前段 bg-primary/45,
// 未来段 bg-border. TD-023 的同一类缺口 (DS 没有步骤条/时间轴件); DS 出了
// 步骤条以后这几行跟 delivery-plan-flow.tsx 一起换成对它的封装。
function StageTrack({ index, total }: { readonly index: number; readonly total: number }) {
  return (
    <span className="mt-2xs flex w-full gap-[3px]" aria-hidden="true">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={
            "h-[4px] flex-1 rounded-[3px] " +
            (i < index
              ? "bg-primary"
              : i === index
                ? "bg-primary/45"
                : "bg-border")
          }
        />
      ))}
    </span>
  );
}

const RAIL_DOT = {
  won:    "border-success bg-success/15",
  danger: "border-destructive bg-destructive/15",
  active: "border-primary bg-primary/15",
  neutral: "border-border-strong bg-card",
} as const;

function railDotClass(d: DealLifecycleRow): string {
  if (d.status === "won") return RAIL_DOT.won;
  if (d.insight?.tone === "danger") return RAIL_DOT.danger;
  if (d.status === "open") return RAIL_DOT.active;
  return RAIL_DOT.neutral;
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
  const { setActiveId } = useChainView();

  if (deals.length === 0) {
    return <p className="text-muted-foreground text-body-sm">{ACCOUNT_TEXT.rosterNoDeals}</p>;
  }

  return (
    <div className="relative flex flex-col gap-md pl-[20px]">
      <span
        className="bg-border absolute bottom-[5px] left-[7px] top-[5px] w-[2px]"
        aria-hidden="true"
      />
      {deals.map((d) => (
        <div key={d.id} className="relative">
          <span
            className={`absolute -left-[20px] top-[2px] grid h-[15px] w-[15px] place-items-center rounded-full border-2 ${railDotClass(d)}`}
            aria-hidden="true"
          />
          <div className="flex flex-col gap-2xs rounded-[10px] border border-border bg-card p-xs">
            <div className="flex items-start justify-between gap-sm">
              <div className="flex min-w-0 flex-col gap-2xs">
                <Link href={`/pipeline/${d.id}`} className="text-foreground min-w-0 truncate text-body-sm font-bold hover:text-primary">
                  {d.name}
                </Link>
                <span className="text-muted-foreground text-[11px]">
                  {[d.opportunityNo, d.stageLabel, d.ownerName ? ACCOUNT_TEXT.headerOwner(d.ownerName) : null].filter(Boolean).join(" · ")}
                </span>
              </div>
              <span className="text-foreground shrink-0 text-body-sm font-extrabold tabular-nums whitespace-nowrap">
                {d.amount != null ? formatMoney(d.amount, d.currency, locale) : "-"}
              </span>
            </div>
            {d.stagePosition ? <StageTrack index={d.stagePosition.index} total={d.stagePosition.total} /> : null}
            {d.daysInStage != null ? (
              <span className={`text-body-sm ${d.insight?.tone === "danger" ? "font-bold text-destructive" : "text-muted-foreground"}`}>
                {ACCOUNT_TEXT.lifecycleStalledDays(d.daysInStage)}
              </span>
            ) : null}
            {d.insight ? <InsightBox tone={d.insight.tone} claim={d.insight.claim} source={d.insight.source} /> : null}
            {d.hasChain ? (
              <Button
                variant="link"
                size="sm"
                className="h-auto self-start p-0"
                onClick={() => setActiveId(d.id)}
              >
                {ACCOUNT_TEXT.lifecycleViewChain}
              </Button>
            ) : null}
          </div>
        </div>
      ))}
    </div>
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
  healthNote,
  milestones,
}: {
  readonly projectName: string;
  readonly healthLabel: string;
  readonly healthTone: "success" | "warning" | "danger";
  /** Why the derived health is lower than the reported one; null when it is not. */
  readonly healthNote?: string | null;
  /** Null: the project's view could not be read - said, not shown as empty. */
  readonly milestones: readonly ProjectMilestoneRow[] | null;
}) {
  const { ACCOUNT_TEXT } = useMessages();
  const locale = useLocale();
  return (
    <PanelCard
      title={projectName}
      description={healthNote ?? undefined}
      action={<Tag tone={healthTone}>{healthLabel}</Tag>}
    >
      {milestones === null ? (
        <p className="text-destructive-text text-body-sm">{ACCOUNT_TEXT.lifecycleMilestonesFailed}</p>
      ) : milestones.length === 0 ? (
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

/** planned - collected, real Money from summarizeCollections() (already read
 *  by projectView() for every project, just not surfaced here before) - never
 *  a total invented from the row list itself. Null when the account's
 *  projects don't share one currency: adding amounts across currencies would
 *  misstate the total, so the summary line is omitted rather than guessed. */
export interface RevenueOutstanding {
  readonly amount: number;
  readonly currency: string;
}

export function RevenueLifecyclePanel({
  rows,
  outstanding,
}: {
  readonly rows: readonly RevenueRow[];
  readonly outstanding?: RevenueOutstanding | null;
}) {
  const { ACCOUNT_TEXT, DELIVERY_TEXT } = useMessages();
  const locale = useLocale();
  if (rows.length === 0) {
    return <p className="text-muted-foreground text-body-sm">{ACCOUNT_TEXT.lifecycleNoInstalments}</p>;
  }
  // 逾期笔数与金额 (YC-021 L3: 逾期笔数与金额一致，币种不混加). Summed per
  // currency in minor units, from the same rows the list marks red - so the
  // count and the amount cannot disagree with what is shown beneath them.
  const overdueByCurrency = new Map<string, { count: number; minor: number }>();
  for (const r of rows) {
    if (!r.overdue) continue;
    const t = overdueByCurrency.get(r.currency) ?? { count: 0, minor: 0 };
    t.count += 1;
    t.minor += Math.round(r.amount * 100);
    overdueByCurrency.set(r.currency, t);
  }
  const overdueLine =
    overdueByCurrency.size > 0 ? (
      <div className="flex flex-wrap items-center gap-xs">
        {[...overdueByCurrency].map(([currency, t]) => (
          <StatusBadge key={currency} tone="danger">
            {ACCOUNT_TEXT.lifecycleOverdueTotal(t.count, formatMoney(t.minor / 100, currency, locale))}
          </StatusBadge>
        ))}
      </div>
    ) : null;
  const list = (
    <PanelList>
      {rows.map((r) => (
        <PanelItem
          key={r.id}
          main={<span className="text-foreground text-body-sm">{r.milestoneName}</span>}
          trail={
            <span className="flex items-center gap-xs">
              {/* The status always, the date beside it - a row with a due date
                  used to hide whether it was planned, invoiced or settled. */}
              <Tag>{r.statusLabel}</Tag>
              {r.dueAt ? (
                r.overdue ? <StatusBadge tone="danger">{r.dueAt}</StatusBadge> : <Tag>{r.dueAt}</Tag>
              ) : null}
              <span className="text-foreground text-body-sm tabular-nums whitespace-nowrap">
                {formatMoney(r.amount, r.currency, locale)}
              </span>
            </span>
          }
        />
      ))}
    </PanelList>
  );
  if (!outstanding) {
    return (
      <div className="flex flex-col gap-sm">
        {overdueLine}
        {list}
      </div>
    );
  }
  return (
    <PanelCard
      title={ACCOUNT_TEXT.lifecycleRevenueOverview}
      action={
        <span className="flex items-center gap-xs">
          <span className="text-foreground text-body-md font-bold tabular-nums">
            {formatMoney(outstanding.amount, outstanding.currency, locale)}
          </span>
          <span className="text-muted-foreground text-body-sm">{DELIVERY_TEXT.rosterOpen}</span>
        </span>
      }
    >
      <div className="flex flex-col gap-sm">
        {overdueLine}
        {list}
      </div>
    </PanelCard>
  );
}
