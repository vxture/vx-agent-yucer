"use client";

import Link from "next/link";
import { Button, Icon, PanelCard, PanelItem, PanelList, StatusBadge } from "@vxture/design-ui";
import { useLocale, useMessages } from "../lib/i18n/provider";
import { formatMoney } from "../lib/view-model";
import { Tag } from "./tag";
import { useChainView } from "./decision-chain-switch";

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

// 阶段进度点 (owner, 2026-09-20: mockup 每张商机卡带一条阶段进度条 - 先做，
// 别再等我确认). TD-023 的同一类缺口 (DS 没有步骤条/时间轴件) 的第二处垫片:
// 跟 delivery-plan-flow.tsx 一样只用 Icon 之外的 DS 意图色 token 拼小圆点，不
// 改 DS、不新建一个通用组件 - 这里比那条注册的"有序步骤条"轻得多（无连接线、
// 无节点文案，只是一排点), 复用同一条 TD 而不是另开一条。DS 出了步骤条以后，
// 这几行跟 delivery-plan-flow.tsx 一起换成对它的封装。
function StageTrack({ index, total }: { readonly index: number; readonly total: number }) {
  return (
    <span className="inline-flex items-center gap-2xs" aria-hidden="true">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={
            "h-[0.375rem] w-[0.375rem] rounded-full " +
            (i <= index ? "bg-primary" : "bg-border")
          }
        />
      ))}
    </span>
  );
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
              <div className="flex flex-wrap items-center gap-xs">
                <span className="text-muted-foreground text-body-sm">{d.stageLabel}</span>
                {d.stagePosition ? <StageTrack index={d.stagePosition.index} total={d.stagePosition.total} /> : null}
                {d.daysInStage != null ? (
                  <span className="text-muted-foreground text-body-sm">{ACCOUNT_TEXT.lifecycleStalledDays(d.daysInStage)}</span>
                ) : null}
              </div>
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
  const list = (
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
  if (!outstanding) return list;
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
      {list}
    </PanelCard>
  );
}
