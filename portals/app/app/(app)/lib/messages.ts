/* eslint-disable */
// User-facing strings for the product surfaces.
//
// DELIBERATE, CONTAINED DEVIATION FROM THE ASCII-ONLY SOURCE RULE.
//
// CLAUDE.md requires source files to be ASCII-only. yucer's primary market is
// Chinese enterprise sales organisations (brand.ts sets defaultLocale zh-CN and
// the whole product spec is authored in Chinese), so its interface text cannot
// be ASCII and remain the product it is meant to be.
//
// Rather than spreading that conflict across every component, every user-facing
// string in the product UI lives HERE. The consequence is precise and reviewable:
//   - exactly ONE source file under app/ contains non-ASCII characters;
//   - every other file - rules, gates, clients, view mapping, components -
//     stays ASCII and can be checked mechanically;
//   - swapping this for a real i18n catalog later is a change of import, not a
//     rewrite of the components.
//
// If the owner rules that source must be ASCII without exception, this file is
// the single thing to replace, and nothing else moves. Registered as the reason
// a deviation exists rather than left silent - see the deviation discipline in
// CLAUDE.md.

import type { Stage } from "../../domains/pipeline/lib/stage";
import type { ForecastCategory } from "../../domains/pipeline/lib/forecast";
import type { ActionStatus } from "../../domains/copilot/lib/action";
import type { RevenueStatus } from "../../domains/delivery/lib/revenue";

export const STAGE_LABEL: Record<Stage, string> = {
  qualify: "合格判定",
  discover: "需求挖掘",
  validate: "方案验证",
  propose: "报价投标",
  negotiate: "商务谈判",
  won: "赢单",
  lost: "丢单",
};

export const FORECAST_LABEL: Record<ForecastCategory, string> = {
  pipeline: "管道",
  best_case: "乐观",
  commit: "承诺",
  closed: "已成交",
};

export const ACTION_STATUS_LABEL: Record<ActionStatus, string> = {
  proposed: "待裁决",
  accepted: "已采纳",
  rejected: "已拒绝",
  executed: "已执行",
  failed: "执行失败",
  expired: "已过期",
};

export const REVENUE_STATUS_LABEL: Record<RevenueStatus, string> = {
  planned: "计划中",
  invoiced: "已开票",
  settled: "已回款",
  overdue: "逾期",
  written_off: "坏账",
};

/** Domain navigation labels, keyed by the nav entry key. */
export const DOMAIN_LABEL: Record<string, string> = {
  strategy: "市场战略",
  planning: "销售规划",
  campaign: "市场执行",
  account: "客户管理",
  signal: "商机侦探",
  pipeline: "商机管理",
  delivery: "项目落地",
  copilot: "销售助手",
};

export const SHELL_TEXT = {
  signedOutTitle: "尚未登录",
  signedOutDescription: "请通过 Vxture 账号登录后使用本产品。",
  noAccessTitle: "当前工作区尚未订阅 yucer",
  noAccessDescription: "订阅后即可使用客户管理、商机管道与销售智能助手。",
  subscribeCta: "前往订阅",
  loadFailed: "数据加载失败",
} as const;

export const NAV_TEXT = {
  ariaLabel: "能力域导航",
  requiresTier: (tier: string) => `需要 ${tier} 档位`,
  notSubscribed: "当前工作区尚未订阅本产品",
  upgradeCta: "升级以解锁更多能力",
} as const;

export const PIPELINE_TEXT = {
  title: "商机管道",
  descriptionReadOnly: "只读视图：你可以查看管道，但没有推进商机的权限。",
  description: "预测口径与快照一致，均由同一套规则计算。",
  columnOpportunity: "商机",
  columnStage: "阶段",
  columnForecast: "预测类别",
  columnAmount: "金额",
  columnProbability: "赢率",
  columnExpectedClose: "预计成交",
  probabilityOverridden: (value: number) => `${value}% 人工`,
  probabilityHintOverridden: (fallback: number) => `人工覆盖（阶段默认 ${fallback}%）`,
  probabilityHintDefault: "阶段默认值",
  emptyTitle: "暂无商机",
  emptyDescription: "线索合格转化后会出现在这里。",
  rollupFailedTitle: "无法汇总",
} as const;

export const PROPOSAL_TEXT = {
  title: "智能助手提案",
  description: "智能体提出建议，由人裁决。采纳后才会执行，提案内容本身不可修改。",
  columnAction: "建议动作",
  columnRationale: "理由",
  columnConfidence: "置信度",
  columnStatus: "状态",
  columnDecider: "裁决人",
  confidenceMissing: "未给出",
  autopilotMarker: "自动执行",
  selectAll: "全选待裁决提案",
  selectOne: (actionType: string) => `选择提案 ${actionType}`,
  selectedLabel: (count: number, lowConfidence: number) =>
    lowConfidence > 0 ? `已选 ${count} 条 · 其中 ${lowConfidence} 条低置信度` : `已选 ${count} 条`,
  clearSelection: "取消选择",
  bulkReject: "批量拒绝",
  bulkAccept: "批量采纳",
  emptyTitle: "暂无提案",
  emptyDescription: "智能助手还没有给出建议动作。向它提问，或等待信号评分产出提案。",
  confirmTitle: (verb: string, count: number) => `确认批量${verb} ${count} 条提案`,
  confirmDetail: (opts: {
    actionTypes: string;
    subjectTypes: string;
    meanConfidence: number | null;
    lowConfidenceCount: number;
  }) =>
    `动作类型：${opts.actionTypes}；作用对象：${opts.subjectTypes}。` +
    (opts.meanConfidence == null
      ? "这些提案未给出置信度。"
      : `平均置信度 ${Math.round(opts.meanConfidence)}%。`) +
    (opts.lowConfidenceCount > 0 ? ` 其中 ${opts.lowConfidenceCount} 条低于 60%。` : ""),
  verbAccept: "采纳",
  verbReject: "拒绝",
  cancel: "取消",
  confirm: (verb: string) => `确认${verb}`,
  acceptNote: "每一条都会记录你的裁决人身份；批量不会减少留痕。",
  rejectNote: "拒绝同样需要裁决人落章，被拒绝的提案会保留完整记录。",
} as const;

export const PREVIEW_TEXT = {
  eyebrow: "离线预览",
  title: "yucer 产品界面预览",
  description:
    "无会话、无平台、无数据库的静态预览。切换角色与档位，可以直接看到权益门与权限门各自的作用。",
  roleLegend: "产品职能角色（权限门）",
  tierLegend: "订阅档位（权益门）",
  decisionLog: (count: number, detail: string) => `裁决 ${count} 条：${detail}`,
} as const;

/**
 * Display text for the offline preview's fixtures. It lives here for the same
 * reason as everything else in this file - so the ONE non-ASCII source file
 * stays one. It is demonstration content, not product configuration.
 */
export const PREVIEW_FIXTURES = {
  opportunityNames: [
    "全国零售门店数字化",
    "供应链协同平台一期",
    "客服智能化改造",
    "门店 POS 替换",
  ],
  accountNames: ["华东零售集团", "西南制造股份", "北方通信", "华东零售集团"],
  rationales: [
    "POC 验收报告已由技术决策人签字，且商务已索要正式报价单。",
    "对方预算审批推迟到下季度，本季承诺口径过于乐观。",
    "该客户 62 天无互动，且有一笔逾期回款，健康度已降至 38。",
    "招聘信号衰减后重算。",
    "对方已口头确认选型结果。",
  ],
} as const;
