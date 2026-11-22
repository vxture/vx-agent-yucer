import { createHash } from "node:crypto";
import {
  judgementFeed,
  type JudgementContext,
  type FeedOptions,
} from "./service";
import type { Judgement, Scope } from "./lib/judgement";
import { listTargets, attainment, type AttainmentRow } from "../planning/service";
import { getPlanningStore } from "../shared/registry";
import { periodRange } from "../shared/period";
import { ok } from "../shared/result";

export interface TopicFeed {
  judgements: Judgement[];
  scope: Scope;
  scanned: number;
  dataAvailable: boolean;
}
export const judgementVersion = (j: Judgement) =>
  createHash("sha256").update(JSON.stringify(j)).digest("hex");
export function targetJudgement(
  row: AttainmentRow,
  now: Date,
): Judgement | null {
  const { target: t, measurement: m } = row,
    range = periodRange(t.period);
  if (
    t.status !== "committed" ||
    t.metric !== "revenue" ||
    !range ||
    now < range.start ||
    now >= range.end
  )
    return null;
  const label = t.period,
    unit = t.targetValue.unit === "money" ? t.targetValue.currency : "";
  const days = Math.ceil((range.end.getTime() - now.getTime()) / 86400000);
  if (m.kind !== "measured")
    return {
      id: `target-data:${t.id}`,
      subjectType: "team",
      subjectId: t.id,
      subjectName: label,
      source: "rule",
      urgency: "watch",
      claim: `${label} \u8425\u6536\u76ee\u6807\u7f3a\u5c11\u53ef\u6838\u5bf9\u7684\u5df2\u53d1\u5e03\u8fbe\u6210\u6570\u636e\uff0c\u6682\u4e0d\u5224\u65ad\u7f3a\u53e3\u3002`,
      tags: [],
      facts: [
        {
          label: "\u76ee\u6807",
          value: `${t.targetValue.amount.toLocaleString("zh-CN")} ${unit}`,
        },
      ],
      citations: [
        {
          kind: "metric",
          ref: t.id,
          text: `${t.period} / ${t.metric} / ${m.code}`,
        },
      ],
      rule: "\u5df2\u627f\u8bfa\u7684\u5f53\u671f\u76ee\u6807\u6ca1\u6709\u53ef\u7528\u53d1\u5e03\u53e3\u5f84\uff0c\u672a\u77e5\u4e0d\u4f5c\u4e3a\u96f6\u3002",
      analyses: [],
    };
  const gap = Math.max(0, t.targetValue.amount - m.achieved.amount);
  if (!gap) return null;
  return {
    id: `target-gap:${t.id}`,
    subjectType: "team",
    subjectId: t.id,
    subjectName: label,
    source: "rule",
    urgency: days <= 7 ? "today" : days <= 30 ? "week" : "watch",
    claim: `${label} \u8425\u6536\u76ee\u6807\u5c1a\u5dee ${gap.toLocaleString("zh-CN")} ${unit}\uff0c\u8bf7\u6838\u5bf9\u672c\u671f\u5546\u673a\u4e0e\u627f\u63a5\u52a8\u4f5c\u3002`,
    tags: [],
    facts: [
      {
        label: "\u76ee\u6807",
        value: `${t.targetValue.amount.toLocaleString("zh-CN")} ${unit}`,
      },
      {
        label: "\u5df2\u8fbe\u6210",
        value: `${m.achieved.amount.toLocaleString("zh-CN")} ${unit}`,
      },
      {
        label: "\u5f85\u5b8c\u6210",
        value: `${gap.toLocaleString("zh-CN")} ${unit}`,
        tone: "warning",
      },
    ],
    citations: [
      {
        kind: "metric",
        ref: t.id,
        text: `${t.period}: ${t.targetValue.amount} - ${m.achieved.amount} = ${gap} ${unit}`,
      },
    ],
    rule: "\u5f53\u671f\u8425\u6536\u627f\u8bfa\u76ee\u6807\u51cf\u53bb\u540c\u53e3\u5f84\u5df2\u53d1\u5e03\u8fbe\u6210\uff1b\u4e0d\u5c06\u672a\u7b7e\u7ea6\u5546\u673a\u7b97\u4f5c\u8425\u6536\u3002",
    analyses: [],
  };
}
export async function topicFeed(
  ctx: JudgementContext,
  options: FeedOptions = {},
): Promise<import("../shared/result").RuleResult<TopicFeed>> {
  const feed = await judgementFeed(ctx, options);
  if (!feed.ok) return feed;
  const now = options.now ?? new Date(),
    planning = { ...ctx, store: getPlanningStore() },
    targets = await listTargets(planning);
  const eligible = targets.ok
    ? targets.value.filter(
        (t) =>
          t.status === "committed" &&
          t.metric === "revenue" &&
          (feed.value.scope === "mine" || ctx.allowWorkspaceMetrics === false
            ? t.scopeType === "owner" && t.ownerSub === ctx.sub
            : t.scopeType === "workspace"),
      )
    : [];
  const periods = [...new Set(eligible.map((t) => t.period))].slice(0, 20),
    extra: Judgement[] = [];
  for (const period of periods) {
    const rows = await attainment(planning, period);
    if (rows.ok)
      for (const row of rows.value) {
        if (!eligible.some((t) => t.id === row.target.id)) continue;
        const j = targetJudgement(row, now);
        if (j) extra.push(j);
      }
  }
  const rank = { today: 0, week: 1, watch: 2 };
  return ok({
    judgements: [...extra, ...feed.value.judgements].sort(
      (a, b) => rank[a.urgency] - rank[b.urgency],
    ),
    scope: feed.value.scope,
    scanned: feed.value.scanned,
    dataAvailable: feed.value.scanned > 0 || eligible.length > 0,
  });
}
