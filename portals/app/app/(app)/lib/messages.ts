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

export const OPPORTUNITY_TEXT = {
  notFound: "商机不存在，或不属于当前工作区",
  amount: "金额",
  probability: "赢率",
  expectedClose: "预计成交",
  owner: "负责人",
  account: "客户",
  campaign: "来源战役",
  closedAt: "成交/关闭时间",
  noAttribution: "无归因（非战役来源）",
  attributionFrozen: "归因键创建后不可修改，更正需走 db-init 数据订正",

  journeyTitle: "阶段轨迹",
  journeyDescription:
    "每一次阶段变更都会写入事件流，速度与转化率由它计算——不从更新时间反推，因为更新时间只记得最后一次写入。",
  journeyEmptyTitle: "还没有阶段变更记录",
  journeyEmptyDescription: "这条商机自创建后还没有推进过。推进一次后，这里会出现完整轨迹。",
  journeyFrom: "由",
  journeyCreated: "创建",
  journeyBy: "操作人",
  journeyByAgent: "智能体",
  journeyReason: "理由",
  journeyDuration: (days: number) => `停留 ${days} 天`,
  journeyCurrent: "当前阶段",
  journeyTotal: (days: number) => `全程 ${days} 天`,

  advanceTitle: "推进阶段",
  advanceDescription: "阶段与状态、成交时间一起变更，并写入一条事件。",
  advanceTo: "推进到",
  advanceSubmit: "确认变更",
  advanceReason: "理由",
  advanceReasonRequired: "回退阶段必须写明理由",
  advanceReasonRequiredReopen: "重开已关闭的商机必须写明理由",
  advanceReasonPlaceholder: "为什么做这次变更",
  advanceReopen: "重开这条商机",
  advanceReopenHint: "重开会改写一个已经上报过的结果，因此需要显式确认并说明理由。",
  advanceClosedTitle: "商机已关闭",
  advanceClosedDescription: "已关闭的商机不能直接改阶段。若确需修正，请勾选「重开」并说明理由。",
  advanceReadOnly: "你没有推进商机的权限。",
  advanceReviewRequired: "该商机已进入终态，请补一份复盘。",
  advanceRegressionHint: (from: string) => `这是从「${from}」回退`,
  advanceTerminalHint: "进入终态会同时写入成交时间，并要求一份复盘",
  advanceOverrideKept: "已有人工赢率，本次变更不会覆盖它",
  advanceOverrideReset: "进入终态时赢率固定为 100% / 0%，人工值不再保留",

  termsTitle: "商务条款",
  termsDescription:
    "金额、赢率、预计成交时间与预测类别。赢率一旦人工设定，后续阶段变更不会再覆盖它——终态除外。",
  termsAmount: "金额",
  termsProbability: "赢率（0-100）",
  termsExpectedClose: "预计成交",
  termsForecast: "预测类别",
  termsSubmit: "保存",
  termsSaved: "已保存",
  termsUnchanged: "没有改动",
  termsTerminalLocked: "商机已关闭，赢率固定，不能再改",
  termsReadOnly: "你没有修改商务条款的权限。",
} as const;

export const OPPORTUNITY_ERROR: Record<string, string> = {
  stage_unchanged: "已经在这个阶段了，不会记录空变更",
  terminal_stage: "商机已关闭；重开需要显式确认",
  reason_required: "这次变更必须写明理由",
  unknown_stage: "未知阶段",
  not_found: "商机不存在，或不属于当前工作区",
  not_authenticated: "登录状态已失效，请重新登录",
  permission_denied: "你没有执行这个操作的权限",
  feature_not_in_tier: "当前档位不含这个能力",
  probability_range: "赢率必须是 0 到 100 之间的整数",
  terminal_probability_fixed: "已关闭的商机赢率固定，不能修改",
  amount_negative: "金额不能为负",
  empty_patch: "没有改动",
  closed_requires_terminal_stage: "未关闭的商机不能标记为「已成交」",
  terminal_requires_closed: "已关闭的商机只能是「已成交」类别",
};

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

export const SIGNAL_TEXT = {
  title: "商机信号收件箱",
  description: "不等销售录入，主动发现的商机线索。评分越高越值得先看。",
  columnSubject: "信号",
  columnType: "类型",
  columnScore: "评分",
  columnAccount: "匹配客户",
  columnDetected: "发现时间",
  columnStatus: "状态",
  unmatchedAccount: "新客户",
  unscored: "未评分",
  emptyTitle: "收件箱是空的",
  emptyDescription: "外部信号源接入后，发现的商机会出现在这里；也可以手工录入信号。",
  promote: "升级为线索",
  dismiss: "忽略",
  markDuplicate: "判重",
  rescore: "重新评分",
  scoreExplain: (base: number, decay: number, bonus: number) =>
    `类型权重 ${base} × 时效 ${decay.toFixed(2)} + 匹配加成 ${bonus}`,
} as const;

export const SIGNAL_TYPE_LABEL: Record<string, string> = {
  intent: "购买意向",
  hiring: "招聘扩张",
  funding: "融资",
  tech_change: "技术变更",
  engagement: "内容互动",
  referral: "转介绍",
  other: "其他",
};

export const SIGNAL_STATUS_LABEL: Record<string, string> = {
  new: "待评分",
  scored: "已评分",
  promoted: "已升级",
  dismissed: "已忽略",
  duplicate: "重复",
};

export const COPILOT_TEXT = {
  title: "销售智能助手",
  description: "问它下一步该做什么。它给出的是建议动作，采纳之后才会执行。",
  placeholder: "例如：这个季度哪些商机最该盯？华东零售集团下一步该找谁？",
  submit: "发送",
  thinking: "正在思考",
  emptyTitle: "还没有对话",
  emptyDescription: "向助手提问。它会结合你的客户、商机和交付数据回答，并在需要改动时提出建议。",
  proposalsFromTurn: (n: number) => `本轮提出了 ${n} 条建议动作，待你裁决`,
  droppedProposals: (n: number) => `另有 ${n} 条建议未记录：当前档位不含「助手主动建议」能力`,
  capabilitiesUsed: (names: string) => `调用了外部能力：${names}`,
  truncated: "本轮工具调用已达上限，回答基于已获取的信息",
  errorPrefix: "助手无法作答：",
  errorNotConfigured: "模型平面尚未接入（需要运营侧完成注册与授权）",
  errorNoGrant: "本产品在模型平面上还没有被授权",
  errorQuota: "模型用量配额已耗尽",
  errorGeneric: "请稍后重试；持续失败请联系运营",
  newSession: "新对话",
} as const;

export const PLAYBOOK_TEXT = {
  title: "作战剧本",
  description:
    "助手回答时会引用这些剧本。放在这里是为了让它们可被看见、被质疑、被修订——你不同意某个回答时，能找到产生它的那句话。",
  emptyTitle: "还没有剧本",
  emptyDescription: "剧本是本工作区自己写的做法。没有剧本时，助手只依据数据回答。",
  version: "版本",
  grounding: (n: number) => `每轮对话最多引用 ${n} 条与主题相关的剧本`,
} as const;

export const PLAYBOOK_SCOPE_LABEL: Record<string, string> = {
  strategy: "战略",
  planning: "目标",
  campaign: "战役",
  account: "客户",
  signal: "信号",
  pipeline: "商机",
  delivery: "交付",
  copilot: "通用",
};

export const ACCOUNT_TEXT = {
  title: "客户管理",
  description: "健康度是派生值，随源数据重算；它用于排序和预警，不作为任何业务判断的唯一依据。",
  columnName: "客户",
  columnIndustry: "行业",
  columnOwner: "负责人",
  columnHealth: "健康度",
  columnStatus: "状态",
  unscored: "未评估",
  emptyTitle: "还没有客户",
  emptyDescription: "线索转化或手工录入后，客户会出现在这里。",
} as const;

export const ACCOUNT_STATUS_LABEL: Record<string, string> = {
  prospect: "潜在",
  active: "活跃",
  dormant: "沉睡",
  churned: "流失",
};

export const DELIVERY_TEXT = {
  title: "项目落地",
  description: "链路终点不是赢单，是钱到账。逾期回款的项目不允许显示为健康。",
  columnName: "项目",
  columnAccount: "客户",
  columnManager: "项目经理",
  columnHealth: "健康度",
  columnContract: "合同额",
  columnStatus: "状态",
  healthOverridden: "已下调",
  emptyTitle: "还没有交付项目",
  emptyDescription: "商机赢单后建立交付项目，会出现在这里。",
} as const;

export const PROJECT_HEALTH_LABEL: Record<string, string> = {
  green: "健康",
  amber: "关注",
  red: "风险",
};

export const PLANNING_TEXT = {
  title: "销售规划",
  description: "目标由本域设定，达成由商机域的预测快照计算——两个域不互相写对方的数据。",
  columnScope: "作用域",
  columnMetric: "指标",
  columnTarget: "目标",
  columnClosed: "已成交",
  columnAttainment: "达成度",
  columnStatus: "状态",
  noSnapshot: "尚无快照",
  noSnapshotHint: "该作用域本期还没有提交过预测快照，这与「达成 0%」不是一回事。",
  emptyTitle: "本期没有目标",
  emptyDescription: "销售运营设定区域与配额后，会出现在这里。",
  scopeWorkspace: "全工作区",
} as const;

export const TARGET_STATUS_LABEL: Record<string, string> = {
  draft: "草稿",
  committed: "已承诺",
  closed: "已关闭",
};

export const STRATEGY_TEXT = {
  title: "市场战略",
  description: "战略是全链路的起点：下游的战役、线索、商机都能回指到它。",
  columnName: "战略",
  columnPeriod: "周期",
  columnOwner: "负责人",
  columnStatus: "状态",
  emptyTitle: "还没有战略规划",
  emptyDescription: "定义本周期打哪个市场、达成什么目标。",
} as const;

export const PLAN_STATUS_LABEL: Record<string, string> = {
  draft: "草稿",
  approved: "已批准",
  active: "执行中",
  closed: "已结束",
  archived: "已归档",
};

export const CAMPAIGN_TEXT = {
  title: "市场执行",
  description: "战役是归因的锚点。回报按赢单收入计，不按管道额——未成交的管道还不是回报。",
  columnName: "战役",
  columnChannel: "渠道",
  columnBudget: "预算",
  columnProgress: "执行进度",
  columnStatus: "状态",
  emptyTitle: "还没有战役",
  emptyDescription: "把战略与细分市场变成具体的触达动作。",
  progress: (done: number, total: number, skipped: number) =>
    skipped > 0 ? `${done}/${total} 完成（${skipped} 跳过）` : `${done}/${total} 完成`,
} as const;

export const CAMPAIGN_STATUS_LABEL: Record<string, string> = {
  draft: "草稿",
  scheduled: "已排期",
  running: "进行中",
  paused: "暂停",
  completed: "已完成",
  cancelled: "已取消",
};

export const LEAD_TEXT = {
  title: "线索",
  description: "线索合格后转化为商机。转化那一刻，来源战役被复制到商机上并冻结——归因不靠事后填写。",
  columnCompany: "公司",
  columnScore: "评分",
  columnSource: "来源",
  columnOwner: "负责人",
  columnStatus: "状态",
  sourceCampaign: "战役",
  sourceSignalCampaign: "信号所属战役",
  sourceSelf: "自拓",
  qualify: "标记合格",
  disqualify: "判定不合格",
  convert: "转化为商机",
  converted: "已转化",
  needAccount: "需先匹配客户",
  emptyTitle: "还没有线索",
  emptyDescription: "信号升级后会出现在这里。",
} as const;

export const LEAD_STATUS_LABEL: Record<string, string> = {
  new: "新线索",
  working: "跟进中",
  qualified: "已合格",
  converted: "已转化",
  disqualified: "不合格",
};

export const WINLOSS_TEXT = {
  title: "待复盘",
  description: "已关闭但还没有复盘的商机。赢丢原因是结构化数据，回流给评分与建议——不写就没有闭环。",
  columnOpportunity: "商机",
  columnOutcome: "结果",
  columnAmount: "金额",
  columnClosed: "关闭时间",
  outcomeWon: "赢单",
  outcomeLost: "丢单",
  record: "写复盘",
  reasonLabel: "主要原因",
  competitorLabel: "竞争对手",
  lessonsLabel: "经验",
  save: "保存",
  cancel: "取消",
  saved: "已记录",
  emptyTitle: "没有待复盘的商机",
  emptyDescription: "商机关闭后会出现在这里，直到复盘写完。",
} as const;

export const WINLOSS_REASON_LABEL: Record<string, string> = {
  price: "价格",
  fit: "方案匹配度",
  timing: "时机",
  competitor: "竞争对手",
  no_decision: "客户未决策",
  other: "其他",
};

export const CHAIN_TEXT = {
  title: "决策链",
  description: "「档案里有经济决策人」和「有人能引荐到他」是两件事。只有后者能推进单子。",
  covered: "已覆盖",
  missing: "缺失角色",
  blockers: "阻碍者",
  coaches: "内线",
  reachable: "经济决策人可达",
  unreachable: "经济决策人不可达",
  unreachableHint: "没有从内线到经济决策人的路径——遍历会跳过对立关系和已离职的联系人。",
  noEconomicBuyer: "档案里还没有经济决策人",
  influence: "影响力",
  emptyTitle: "还没有联系人",
  emptyDescription: "录入联系人并标注决策角色后，这里会给出决策链分析。",
  healthTitle: "客户健康度",
  healthDescription: "派生值，随源数据重算。用于排序和预警，不作为任何业务判断的唯一依据。",
  primaryConcern: "首要问题",
  recompute: "重新计算",
  factorPipeline: "商机",
  factorRecency: "互动时效",
  factorDelivery: "交付",
  factorCollections: "回款",
} as const;

export const DECISION_ROLE_LABEL: Record<string, string> = {
  economic: "经济决策人",
  technical: "技术决策人",
  user: "使用者",
  coach: "内线",
  blocker: "阻碍者",
  unknown: "未知",
};

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
