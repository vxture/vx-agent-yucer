import type { SignalType } from "../../domains/signal/lib/scoring";
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
  home: "今日判断",
  queue: "待我裁决",
  admin: "成员与角色",
  adoption: "使用情况",
};

export const ROLE_LABEL: Record<string, string> = {
  sales_leader: "销售负责人",
  marketing_manager: "市场经理",
  sales_rep: "销售代表",
  presales: "售前顾问",
  delivery_manager: "交付经理",
  sales_ops: "销售运营",
  viewer: "只读成员",
};

export const MEMBER_TEXT = {
  title: "成员与角色",
  description:
    "角色决定成员能看到什么、能改什么。新成员首次登录后出现在这里，默认没有任何角色——在此为其分配。",
  columnMember: "成员",
  columnRoles: "角色",
  columnActions: "",
  noRoles: "无角色",
  noRolesHint: "该成员当前看不到任何模块",
  assign: "分配",
  revoke: "移除",
  assignPlaceholder: "选择角色",
  emptyTitle: "还没有成员",
  emptyDescription: "成员在首次登录后才会出现在这里。",
  readOnly: "你没有管理成员角色的权限。",
  adminBadge: "可管理成员",
  lastAdminHint: "这是工作区最后一位管理员，移除后将无人能再分配角色",
} as const;

export const MEMBER_ERROR: Record<string, string> = {
  last_admin: "这是工作区最后一位管理员；移除后将无人能再分配角色",
  unknown_role: "角色不在目录中",
  sub_required: "请选择成员",
  not_found: "该成员不属于当前工作区",
  not_authenticated: "登录状态已失效，请重新登录",
  permission_denied: "你没有管理成员角色的权限",
  no_data_access: "当前工作区无权访问",
};

export const SHELL_TEXT = {
  brandName: "Yucer 销售智能体",
  workspaceFallback: "当前工作区",
  signedOutTitle: "尚未登录",
  signedOutDescription: "请通过 Vxture 账号登录后使用本产品。",
  noAccessTitle: "当前工作区尚未订阅 yucer",
  noAccessDescription: "订阅后即可使用客户管理、商机管道与销售智能助手。",
  subscribeCta: "前往订阅",
  noRolesTitle: "还没有为你分配角色",
  noRolesDescription:
    "工作区已订阅，但你还没有任何角色，因此暂时看不到任何模块。请联系工作区管理员为你分配角色。",
  loadFailed: "数据加载失败",
} as const;

/**
 * The signed-out landing page.
 *
 * Separate from SHELL_TEXT's signedOutTitle/Description, which stay for any
 * caller that still wants the terse inline version. This page is the product's
 * front door - opened by typing the domain - so it introduces the product
 * rather than only reporting a missing session.
 */
export const SIGNIN_TEXT = {
  // No exclamation and no welcome: the reader did not choose to be here, they
  // arrived and were stopped. Say what has to happen and why.
  description: "登录以验证您的订阅并访问产品。",
  cta: "登录",
  // Promised because returnTo really does carry the path they asked for - a
  // hint that were not true would be worse than no hint.
  hint: "登录后将自动返回当前页面",
  ariaLabel: "登录",
} as const;

/**
 * The navigation board.
 *
 * Section titles and the LABEL beside each number. The unit belongs to the
 * value, not to the label - "240 万" is one fact and splitting it across two
 * elements makes the reader reassemble it.
 */
export const BOARD_TEXT = {
  // ONE queue, because it is one question: what is waiting on me right now.
  // "今日判断" and "待我裁决" were two cards restating two panels already on
  // screen - the centre's own tier filter and the agent deck's pending list.
  // The verb matches the centre's headline ("今天有 N 件要你定") on purpose:
  // same word for the same act, so the board and the queue read as one product.
  queue: "等你定",
  ledeToday: "今天要定的",
  proposals: "待签提案",
  // The two cards this replaced, kept so the archive rows and the copilot page
  // can still name them.
  today: "今日判断",
  adjudicate: "待我裁决",
  mydeals: "我的商机",
  strategy: "市场战略",
  campaign: "市场执行",
  planning: "销售规划",
  account: "客户管理",
  signal: "商机侦探",
  delivery: "项目落地",

  tierToday: "今天",
  tierWeek: "本周",
  tierWatch: "留意",
  pending: "待裁决",
  /** What the agent is proposing. Split by KIND rather than by confidence: a
   *  confidence threshold would be a number this repo invented, while the
   *  action type is a fact already in the row. */
  actAdvance: "推进阶段",
  actOutreach: "起草外联",
  actPromote: "提升线索",
  actOther: "其他",
  capUnlabelled: "未标注",
  /**
   * Capability labels, keyed by the stored key (ADR-015).
   *
   * Here rather than in the domain module: display text belongs to the UI, and
   * TD-002 contains every non-ASCII string in this file.
   */
  capabilityLabels: {
    "deal.stall_risk": "停滞风险",
    "deal.competition": "竞争态势",
    "account.chain_map": "决策链测绘",
    "account.cadence": "战略客户节奏",
    "signal.triage": "信号分拣",
    "pricing.discount_approval": "折扣审批",
    "delivery.payment_risk": "回款风险",
    "campaign.return": "战役回报",
  } as Record<string, string>,
  dealsOpen: "在办",
  dealsWorth: "金额",
  plans: "计划",
  campaigns: "战役",
  targets: "目标",
  territories: "辖区",
  accounts: "客户",
  signals: "信号",
  leads: "线索",
  projects: "项目",

  /** Ten-thousands, the unit Chinese enterprise sales actually quotes in. */
  wan: (amount: number) => `${Math.round(amount / 10_000)} 万`,
  expand: (title: string) => `展开${title}`,
  collapse: (title: string) => `收起${title}`,
  boardLabel: "板块概览",
  resource: "我的资源",
  productLines: "产品线 · 在办",
  needsApproval: "待批折扣",
  allies: "友军 · 决策链",
  alliesCoaches: "已建内线",
  alliesUnreachable: "决策人未触达",
  alliesBlockers: "有阻力",
  playbooks: "可用剧本",
  quota: (period: string) => `${period} 目标`,
  quotaWon: "已签",
  quotaTarget: "目标",
  quotaOf: "已完成",
  quotaLeft: (pct: number) => `${pct}%`,
  // Pipeline coverage: the open pool against what still has to be closed.
  coverage: "覆盖缺口",
  poolRow: "资源储备",
  coverageOf: (pct: number) => `${pct}%`,
  coverageGap: (v: string) => `缺口 ${v}`,
  coverageThin: (floor: number) => `低于 ${floor}% 警戒线`,
  coverageMet: "目标已达成",
  agent: "智能助手",
  agentScope: (n: number) => `正看着 ${n} 位客户`,
  capture: "记一笔",
  ask: "问参谋",
  attach: "添加附件",
  notWired: "该能力尚未接通",
  reconTitle: "敌情",
  reconEmpty: "尚未侦察。竞争对手目前只出现在跟进原文里，还没有成型情报。",
  reconCta: "发起竞争态势分析",
  reconNote: "分析结果会作为「模型」判断入流。",
  captureSend: "存",
  capturePlaceholder: "刚跟王总通完电话……",
  captureHelp: "三句话、一段微信、一封转发的邮件都算，原文会原样保留。",
  pendingTitle: "今天要定的",
  recentTitle: "最近记的",
  sourceRule: "规则",
  sourceModel: "模型",
  whenToday: "今天",
  whenDaysAgo: (n: number) => `${n} 天前`,
  truncate: (t: string) => `${t}……`,
} as const;

export const NAV_TEXT = {
  ariaLabel: "能力域导航",
  // The sidebar groups are a business statement, not a tidy-up: D1-D7 are a
  // sequence, the copilot cuts across all of them, and administration sits
  // outside the chain.
  groupWork: "工作台",
  groupChain: "档案",
  groupAgent: "智能助手",
  groupAdmin: "管理",
  requiresTier: (tier: string) => `需要 ${tier} 档位`,
  notSubscribed: "当前工作区尚未订阅本产品",
  upgradeCta: "升级以解锁更多能力",
} as const;

export const ASK_ABOUT_TEXT = {
  anchored: (name: string) => `本次对话已锁定客户：${name}`,
  // Says what the model can and cannot see. A grounded answer that looked
  // omniscient would get trusted past what it actually read.
  anchoredHint:
    "助手能读到这个客户下已记录的跟进原文与承诺，回答时会标注它引用了哪一条。读不到的东西它不会替你补——没记下来的事，它也不知道。",
  linkFromAccount: "就这个客户问助手",
} as const;

export const HEADER_TEXT = {
  searchPlaceholder: "搜索客户、商机、跟进记录",
  searchEmpty: "没有匹配的",
  searchLoading: "检索中",
  searchResults: "搜索结果",
  groupAccounts: "客户",
  groupDeals: "商机",

  // THE TIER, WITHOUT THE WORD "档". It read "enterprise 档" - a Chinese
  // measure word bolted onto an English identifier, which is neither. The tier
  // name is the whole label; what it measures is already said by the badge's
  // accessible name.
  //
  // It is also HIDDEN IN PRODUCTION. A build badge and a tier badge are
  // developer-facing: they answer "which build am I looking at" during
  // development and review. On a customer's screen the tier is a commercial
  // fact they did not ask to be reminded of on every page.
  subscription: (tier: string) => tier,
  subscriptionNone: "未订阅",
  subscriptionAria: "订阅档位",
  // Passed through. The "v" prefix used to be added here, which turned the
  // local build label "dev" into "vdev"; a prefix that only fits one of the
  // three shapes this label takes belongs where the label is chosen.
  version: (v: string) => v,

  // The functional-domain control. Placed now, inert until the domains are
  // split - see the note in app-shell.tsx for why an inert control is the
  // honest shape rather than a menu of one.
  scopeAria: "当前功能域",
  scopeUnknown: "功能域",

  // The workspace and tenant, and the panel that explains them.
  workspaceAria: "当前工作区与租户",
  workspacePanelTitle: "工作区",
  workspaceLabel: "工作区",
  tenantLabel: "租户",
  tenantUnknown: "未标识",
  // Said plainly rather than offered as a control that does nothing: the token
  // carries one workspace and one tenant, both chosen upstream at sign-in, and
  // this product has no endpoint that could enumerate alternatives.
  workspaceSwitchHint: "工作区与租户在登录时确定，如需切换请重新登录。",

  // The four tools. Grouped because they are the same KIND of thing - they act
  // on the shell, not on the data - and a reader who has found one has found
  // all four.
  toolsAria: "外壳工具",
  fullscreen: "全屏",
  fullscreenExit: "退出全屏",
  help: "帮助",
  notifications: "通知",
  notificationsWithCount: (n: number) => `通知，${n} 条未读`,
  settings: "设置",

  adminAria: "管理",
  userMenuOpen: "打开用户菜单",
  // The two flank toggles. Named for what the flank IS, not for the direction it
  // moves: "收起左栏" tells you the geometry, "收起战况板" tells you what you
  // stop being able to see, and only the second is a reason to keep it open.
  boardOpen: "展开战况板",
  boardClose: "收起战况板",
  agentDock: "智能助手",
  agentDockWithCount: (n: number) => `智能助手，${n} 件待你裁决`,
  countOverflow: "99+",

  // The language switcher. The DS draws it; these are its names.
  localeSwitch: "切换语言",
  localePanel: "语言",
} as const;

export const ADMIN_TEXT = {
  title: "管理",
  description: "工作区的设置项。不是日常工作，所以不占侧边栏——从右上角进来。",
  emptyTitle: "你没有管理权限",
  emptyDescription:
    "这不是订阅档位的问题，加钱解决不了。需要一位管理员给你分配角色。",
  entryHint: {
    admin: "谁能进这个工作区，各自能做什么",
    adoption: "跟进记录有没有被用起来。判据见 ADR-012",
  } as Record<string, string>,
  // What each card says about the state behind it. The cards used to print
  // their own href as body text - a URL is not something a reader wants and
  // not something they can act on.
  memberCount: (members: number, roles: number) =>
    `${members} 位成员 · ${roles} 个角色在用`,
  // Zero members is the NORMAL state of a fresh workspace, not an error and
  // not a number worth printing. A card reading "0 位成员" reads as broken; the
  // subpage's own empty state says the true thing, so the card says it too.
  memberNone: "还没有成员——首次登录后才会出现",
  memberNoRead: "没有成员读取权限",
  adoptionCriterion: (weeks: number, judge: number) =>
    `按最近 ${weeks} 周判定，连续 ${judge} 周达标才算被用起来`,
  open: "打开",
} as const;

export const HOME_TEXT = {
  title: "今日判断",
  description: (n: number) =>
    `由 ${n} 位客户的已记录跟进推出。同时只展开一条。`,
  emptyTitle: "现在没有要处理的",
  emptyDescription:
    "没有逾期承诺、没有长时间沉默、没有决策人零接触。这不是「暂无数据」——是扫过了，确实没有。",
  emptyNoRecords:
    "还没有任何跟进记录，所以推不出任何判断。判断是从记录里长出来的，第一步是记一笔。",
  scopeMine: "我的",
  scopeAll: "全部",
  urgencyAll: "全部",
  urgencyToday: "今天",
  urgencyWeek: "本周",
  urgencyWatch: "留意",
  sourceRule: "规则",
  sourceModel: "模型",
  // Stated where a reader sees it, because it is the whole reason the two are
  // marked apart.
  sourceRuleHint: "算出来的，你可以自己复核",
  sourceModelHint: "看出来的，只能核对它引用的原文",
  secEvidence: "依据",
  secEvidenceCount: (n: number) => `依据 · ${n} 条`,
  secFacts: "关键事实",
  secSeries: "逐周走势",
  secRule: "触发条件",
  // The agent's own opening sentence. The screen used to open with the label
  // "今日判断" and a grey line of provenance, which is a filing-cabinet drawer
  // tag. This is a colleague who did the reading telling you what they found.
  lead: (n: number) => `今天有 ${n} 件要你定`,
  leadNone: "今天没有要你定的事",
  queueLabel: "待定判断队列",
  leadSub: (accounts: number, judgements: number) =>
    `扫过 ${accounts} 位客户的跟进记录，得出 ${judgements} 条判断`,
  evidenceMore: (n: number) => `还有 ${n} 条依据`,
  evidenceLess: "只看最近一条",
  /** Facts joined into the one line a collapsed card shows. */
  factInline: (label: string, value: string) => `${label} ${value}`,
  factJoin: " · ",
  expand: "展开",
  collapse: "收起",
  analysisRisk: "风险分析",
  analysisCompetition: "竞争态势",
  analysisChain: "决策链分析",
  analysisPolicy: "政策与行业",
  analysisHint: "分析结果会作为「模型」判断入流",
  // The citation attribution, composed HERE rather than in the rule. The rule
  // decides what is cited; how it reads is this layer's problem, and only this
  // layer can reach CHANNEL_LABEL.
  citedBy: (days: number, channel: string) => `${days} 天前 · ${channel}`,
  /** Says what it really does. "忽略" would promise something this control
   *  deliberately does not do - the judgement returns in a week, and sooner if
   *  it gets worse. */
  actDismissHint: "暂缓 7 天；若紧急度升高会提前回到队列",
  actDismiss: "不用管",
  agentTitle: "智能助手",
  agentScope: (n: number) => `正看着：${n} 位客户`,
  agentNote: "记一笔",
  agentAsk: "问助手",
  agentPlaceholder: "刚跟王总通完电话……",
  // Was appended to the placeholder with a blank line, which rendered it as a
  // second paragraph INSIDE the input - it read as text someone had already
  // typed. Guidance about a field belongs beside the field, not in it.
  agentHelp: "三句话、一段微信、一封转发的邮件都算，原文会原样保留。",
  agentSend: "存",
  agentPending: "待我裁决",
  agentPendingCount: (n: number) => `待我裁决 · ${n} 条`,
  /** Source and time, joined. The separator lives here, not in a component. */
  agentPendingWhen: (source: string, when: string) => `${source} · ${when}`,
  /** Truncation is copy too - the ellipsis is a character, and it is Chinese. */
  truncate: (text: string) => `${text}…`,
  agentRecent: "最近记的",
  agentAvatar: "聿",
  agentComposeLabel: "记一笔或问助手",
  scopeLabel: "范围",
  urgencyLabel: "紧要程度",
  // Names the destination, not the gesture. "打开" says a page will appear;
  // "打开阵地" says which page and why - and it is the same word the account
  // detail page titles itself with, so the link and its landing agree.
  openSubject: "打开阵地",
  openTeam: "看采纳看板",
  whenToday: "今天",
  whenDaysAgo: (n: number) => `${n} 天前`,
  pendingFromScan: "今晨扫描",
  pendingFromClick: "你点了分析",
  /** Subject and claim, joined. Kept here so no separator lives in a .tsx. */
  pendingTitle: (subject: string, claim: string) => `${subject} · ${claim}`,
} as const;

export const RECENCY_TEXT = {
  title: "谁是真的联系过的",
  // The distinction this panel exists to hold, stated where a reader sees it.
  description:
    "上面那格看的是组织图——录进来的人和汇报线。这一格看的是跟进记录里真的出现过谁。两者刻意不合并：现在跟进记录的覆盖率还不满，「没记录」不等于「没联系」，把它算进「缺角色」会让记录习惯的缺口冒充关系的缺口。",
  warm: (days: number) => `${days} 天内有跟进`,
  cold: (days: number) => `超过 ${days} 天没跟进`,
  unrecorded: "没有任何跟进记录",
  unrecordedHint: "这与「很久没跟进」是两件事：可能只是没记。",
  warmPathYes: "有一条走得通的、且真的联系过的路径通向决策人",
  warmPathNo: "通向决策人的路径上，有人已经很久没联系过了",
  warmPathUnknown: "这个客户下没有任何跟进记录，无法判断",
  warmPathUnknownHint:
    "答「否」会拿我们自己的记录缺口去陈述一个关于客户关系的事实。",
} as const;

export const ADOPTION_TEXT = {
  navLabel: "使用情况",
  title: "跟进记录的使用情况",
  description:
    "这张表回答的不是「谁干得好」，而是「这套东西有没有被用起来」。二期（智能体基于历史做分析与判断）是否值得建，取决于这里的数字（判据见 ADR-012）——证据表是空的时候，推理层只会产出自信的虚构。",
  // The anti-scoreboard note is user-visible on purpose. If people believe it
  // is a ranking they will record for the ranking, and the number stops
  // measuring the thing it was built to measure.
  notAScoreboard:
    "刻意不按人拆分。一旦这张表能当成绩效看，大家就会为它而记录，它也就不再测量它要测的东西。",
  coverage: "覆盖率",
  coverageHint: "当周有开放商机中，至少被记了一笔跟进的比例",
  rate: "密度",
  rateHint: "当周跟进笔数 / 当周开放商机数，仅作参照",
  week: "周",
  weekInProgress: "本周（进行中，不计入裁定）",
  openDeals: "开放商机",
  touched: "被跟进",
  notes: "跟进笔数",
  noDeals: "无开放商机",
  criterion: (pct: number, weeks: number) =>
    `判据：最近 ${weeks} 周的覆盖率均值达到 ${pct}%。以最近两周而非六周均值判定——问的是习惯现在在不在，不是第一周有没有热情。`,
  verdictAdopted: "已形成记录习惯",
  verdictAdoptedHint: "二期（主张与判断）的前置条件成立。",
  verdictNotAdopted: "未形成记录习惯",
  verdictNotAdoptedHint:
    "按 ADR-012 的判据，此时不应建二期。要改的是采集路径本身，不是在空数据上加推理。",
  verdictTooEarly: "观察期未满",
  verdictTooEarlyHint:
    "尚不构成裁定依据。一个能提前失败的判据，一定会被提前引用。",
  verdictNoData: "尚无开放商机",
  verdictNoDataHint: "没有可记录的对象，这不是失败。",
  darkDeals: "无近期跟进的开放商机",
  darkDealsHint:
    "这些商机在观察窗口内一笔跟进都没有。停在推进阶段的那几条最值得先看。",
  darkDealsEmpty: "所有开放商机在窗口内都有跟进记录。",
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
  probabilityHintOverridden: (fallback: number) =>
    `人工覆盖（阶段默认 ${fallback}%）`,
  probabilityHintDefault: "阶段默认值",
  emptyTitle: "暂无商机",
  emptyDescription: "线索合格转化后会出现在这里。",
  rollupFailedTitle: "无法汇总",
  rowCount: (n: number) => `共 ${n} 条`,
  openDeal: "打开阵地",
  // The period filter. Quarters plus the year, because a forecast is read at
  // both cadences - the quarter is what gets committed, the year is what gets
  // planned against.
  periodLabel: "统计周期",
  periodYear: "Y2026",
  periods: ["2026Q1", "2026Q2", "2026Q3", "2026Q4"] as const,
  // The composition block, which folds away.
  splitCollapse: "收起构成",
  splitExpand: "展开构成",
  splitEmpty: "本周期没有可拆的产品线",
  /** Said only when readings were actually dropped - a window nobody hit is
   *  not worth explaining. */
  trajectoryWindow: (shown: number, total: number) =>
    `最近 ${shown} 次，共 ${total} 次`,
  trajectoryEmptyTitle: "本周期还没有预测快照",
  trajectoryEmptyDescription:
    "提交一次预测后，这里会按时间显示它的变化。轨迹只画已经存下来的快照，不回溯推算。",
  // --- Added for the redesigned page ---------------------------------------
  // The agent's opening sentence, same shape as the home screen's: what the
  // number MEANS this week, not the label "pipeline".
  lead: (commit: string) => `本季承诺 ${commit}`,
  leadDelta: (delta: string, since: number) =>
    `较 ${since} 天前的预测 ${delta}`,
  leadFlat: "与上次预测持平",
  leadNoHistory: "本期尚无预测记录",
  periodOf: (p: string) => `${p} 口径`,

  trajectory: "预测轨迹",
  trajectoryWhy:
    "快照只追加、不可修改——预测准确率是期末实际对期初快照，少一个点就算不出来。",
  tCommit: "承诺",
  tBestCase: "乐观",
  tPipeline: "管道",
  tClosed: "已成交",

  productSplit: "承诺的构成",
  productSplitWhy: "按产品行项拆开。一个总额说不出这笔钱要交付什么。",
  needsApproval: "折扣待批",
  noLines: "尚无产品行项",
} as const;

export const LIFECYCLE_TEXT = {
  moveTo: "变更为",
  apply: "应用",
} as const;

export const LIFECYCLE_ERROR: Record<string, string> = {
  illegal_transition: "当前状态不能直接变更为该状态",
  unknown_status: "未知状态",
  executions_outstanding: "还有未完成的执行项；先完成或跳过它们再结束战役",
  invalid_window: "战役的起止时间不合法",
  not_found: "记录不存在，或不属于当前工作区",
  not_authenticated: "登录状态已失效，请重新登录",
  permission_denied: "你没有执行这个操作的权限",
  feature_not_in_tier: "当前档位不含这个能力",
  no_data_access: "当前工作区无权访问",
};

export const FIELD_TEXT = {
  // Capture. The wording matters as much as the form: this asks for a dump,
  // not a report, because a busy salesperson will do the first and not the
  // second.
  recordTitle: "记一笔跟进",
  recordDescription:
    "把刚才发生的事倒进来就行——三句话、一段微信、一封转发的邮件都算。原文会原样保留,不会被改写。",
  recordNote: "发生了什么",
  recordNotePlaceholder:
    "例:见了王总和陈总监。预算这条线要等 CFO 点头,王总说下周三给答复。",
  recordChannel: "方式",
  recordWhen: "什么时候",
  recordSubmit: "记下",
  recordSaved: "已记下",
  recordEmpty: "还没有跟进记录",
  recordEmptyDescription:
    "记下第一笔之后,客户健康度和决策链就会开始用真实的接触时间,而不是靠商机阶段推算。",

  timelineTitle: "跟进时间线",
  timelineDescription:
    "谁、什么时候、通过什么方式。原文逐字保留——后续所有分析都引用它。",
  timelineBy: "记录人",
  timelineCorrects: "更正了一条更早的记录",

  commitTitle: "承诺",
  commitDescription:
    "有日期的承诺,双向。**完成必须有证据**——指向一次真实的跟进,不能自己说完成了。错过不需要任何操作。",
  commitOverdueTitle: "逾期承诺",
  commitOverdueDescription:
    "已经过期、还没有人面对的承诺。客户连续错过承诺,是停滞最早的信号。",
  commitNew: "新增承诺",
  commitStatement: "承诺了什么",
  commitStatementPlaceholder: "例:回传盖章的技术确认书",
  commitDirection: "谁的承诺",
  commitDue: "何时之前",
  commitCreate: "记下承诺",
  commitClose: "标记完成",
  commitCloseNeedsEvidence: "选一条证明它完成了的跟进",
  commitWaive: "放弃",
  commitWaiveReason: "为什么放弃",
  commitMissed: "标记错过",
  commitEmpty: "还没有承诺",
  commitEmptyDescription:
    "从一次跟进里记下双方答应的事,它到期时系统会替你盯着。",
  commitOverdueEmpty: "没有逾期承诺",
  commitOverdueEmptyDescription: "所有已记录的承诺都还在期限内。",
  commitDaysOverdue: (n: number) => `逾期 ${n} 天`,

  // The overdue row's primary verb.
  //
  // It says GO and it says WORK. "查看" would invite reading, and reading has
  // already happened - this list exists because someone looked. What it cannot
  // say is "close it": settling a promise means deciding whether it was met,
  // missed or waived, and met needs the interaction that proves it. That
  // judgement belongs on the account, beside the history it is judged against,
  // where the promise can also be amended - a date moved, an amount corrected -
  // instead of being forced into met-or-missed by a list row that knows
  // neither.
  commitCount: (n: number) => `${n} 条`,
  commitDueOn: (d: string) => `原定 ${d}`,
  commitOwner: (who: string) => `负责人 ${who}`,
  commitOwnerNone: "未指派负责人",
  commitGoSettle: "去处理",
  commitGoSettleHint: (name: string) => `打开 ${name}，处理这条承诺`,
  commitDueIn: (n: number) => `还有 ${n} 天`,

  evidenceTitle: "关系证据",
  evidenceDescription:
    "全部来自已记录的事实，不是评分。「对方答应的三件事错了两件」是能行动的句子，一个 0-100 的健康分不是。",
  evidenceDaysAgo: (n: number) => `${n} 天前`,
  evidenceLastContact: "最近接触",
  evidenceNever: "从未接触",
  evidenceInteractions: "跟进条数",
  evidenceTheyMissed: "对方错过",
  evidenceWeMissed: "我方错过",
  evidenceKeptRate: "对方守约率",
  evidenceNoHistory: "尚无记录",
} as const;

export const FIELD_ERROR: Record<string, string> = {
  note_required: "写一句发生了什么——只记下它发生过,没有价值",
  occurred_in_future: "跟进不能发生在未来",
  unknown_channel: "未知的跟进方式",
  evidence_required: "完成必须指向一次真实的跟进,不能自己说完成了",
  reason_required: "放弃承诺必须写明理由",
  not_yet_due: "还没到期,不能标记为错过",
  illegal_transition: "当前状态不能这样变更",
  status_unchanged: "状态没有变化",
  statement_required: "写明承诺的内容",
  not_found: "记录不存在,或不属于当前工作区",
  not_authenticated: "登录状态已失效,请重新登录",
  permission_denied: "你没有记录跟进的权限",
  no_data_access: "当前工作区无权访问",
};

export const CHANNEL_LABEL: Record<string, string> = {
  meeting: "会面",
  call: "电话",
  visit: "拜访",
  email: "邮件",
  im: "即时消息",
  event: "活动",
  other: "其他",
};

export const DIRECTION_LABEL: Record<string, string> = {
  we_owe: "我方承诺",
  they_owe: "对方承诺",
};

export const COMMIT_STATUS_LABEL: Record<string, string> = {
  open: "未决",
  met: "已完成",
  missed: "已错过",
  waived: "已放弃",
};

export const RELATION_TYPE_LABEL: Record<string, string> = {
  reports_to: "汇报给",
  peer_of: "平级",
  allied_with: "同盟",
  opposed_to: "对立",
  referred_by: "由其引荐",
};

export const RELATION_TEXT = {
  title: "补录关系",
  description:
    "关系图是追加写的：关系变了就补一条新的边，不会改写旧的——「上季度谁向谁汇报」是决策链分析要读的事实。",
  from: "发起方",
  to: "指向",
  type: "关系",
  submit: "记录",
  saved: "已记录",
  pick: "选择联系人",
  readOnly: "你没有编辑关系图的权限。",
  needTwo: "至少需要两位联系人才能建立关系。",
  hintUnreachable:
    "记录一条通往决策人的路径，可以让上面的判断从「不可达」变成「可达」。",
} as const;

export const RELATION_ERROR: Record<string, string> = {
  self_relation: "同一个人不能和自己建立关系",
  unknown_relation_type: "未知的关系类型",
  not_authenticated: "登录状态已失效，请重新登录",
  permission_denied: "你没有编辑关系图的权限",
  feature_not_in_tier: "当前档位不含关系图能力",
  no_data_access: "当前工作区无权访问",
};

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
  journeyEmptyDescription:
    "这条商机自创建后还没有推进过。推进一次后，这里会出现完整轨迹。",
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
  advanceReopenHint:
    "重开会改写一个已经上报过的结果，因此需要显式确认并说明理由。",
  advanceClosedTitle: "商机已关闭",
  advanceClosedDescription:
    "已关闭的商机不能直接改阶段。若确需修正，请勾选「重开」并说明理由。",
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

/**
 * Subject types, keyed off the database CHECK constraint
 * (chk_agent_action_subject). The proposal table printed the raw value.
 */
export const AGENT_SUBJECT_LABEL: Record<string, string> = {
  account: "客户",
  lead: "线索",
  opportunity: "商机",
  project: "项目",
  campaign: "战役",
  plan: "战略",
};

/**
 * Action types are an OPEN vocabulary - agent_action.action_type is a bare
 * VARCHAR(64) with no CHECK, and the DDL comment says "e.g." - so this map
 * cannot be exhaustive by construction and every caller must fall back to the
 * raw value. Labelling what the product actually emits is still worth doing:
 * `advance_stage` in a Chinese table is not a proposal anyone reads.
 */
export const AGENT_ACTION_LABEL: Record<string, string> = {
  advance_stage: "推进阶段",
  draft_email: "起草邮件",
  draft_outreach: "起草触达",
  promote_signal: "信号升级为线索",
};

export const PROPOSAL_TEXT = {
  title: "智能助手提案",
  description:
    "智能体提出建议，由人裁决。采纳后才会执行，提案内容本身不可修改。",
  // The headline. ADR-003 is this page's whole shape - the agent proposes, a
  // human decides - and it was stated only in a section subtitle below a chat
  // box. A reader who scrolls onto a queue of confident-looking percentages
  // should already know that none of them has happened yet.
  lead: (n: number) => `${n} 条提案等你裁决`,
  leadNone: "没有待裁决的提案",
  leadLowConfidence: (n: number) =>
    `其中 ${n} 条置信度低于 60%，值得先读理由。`,
  leadRule:
    "智能体只提议，采纳由人做出。提案内容本身不可修改——要改就拒绝它，让它重提。",
  rowCount: (n: number) => `${n} 条提案`,
  columnSubject: "作用对象",
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
    lowConfidence > 0
      ? `已选 ${count} 条 · 其中 ${lowConfidence} 条低置信度`
      : `已选 ${count} 条`,
  clearSelection: "取消选择",
  /** BulkActionBar counts for itself now; it needs the unit, not the sentence. */
  selectionNoun: "条提案",
  bulkReject: "批量拒绝",
  bulkAccept: "批量采纳",
  emptyTitle: "暂无提案",
  emptyDescription:
    "智能助手还没有给出建议动作。向它提问，或等待信号评分产出提案。",
  confirmTitle: (verb: string, count: number) =>
    `确认批量${verb} ${count} 条提案`,
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
    (opts.lowConfidenceCount > 0
      ? ` 其中 ${opts.lowConfidenceCount} 条低于 60%。`
      : ""),
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
  emptyDescription:
    "外部信号源接入后，发现的商机会出现在这里；也可以手工录入信号。",
  promote: "升级为线索",
  dismiss: "忽略",
  markDuplicate: "判重",
  rescore: "重新评分",
  scoreExplain: (base: number, decay: number, bonus: number) =>
    `类型权重 ${base} × 时效 ${decay.toFixed(2)} + 匹配加成 ${bonus}`,
  // --- Added for the redesigned inbox --------------------------------------
  // Opens with what came in, not with the word "inbox".
  lead: (n: number) => `${n} 条情报待判`,
  leadNamed: (n: number) => `其中 ${n} 条来自命名客户`,
  leadNone: "暂无待判情报",

  // The two lines of enquiry (ADR-016). Aim decides what to read first, never
  // what is allowed in - so the untargeted group is shown, not hidden.
  groupNamed: "命名客户线",
  groupNamedWhy: "战略客户清单上的公司，持续盯招标、人事、投资。",
  groupDomain: "业务领域线",
  groupDomainWhy: "我们产品能覆盖的标的类型。名单外的新客户从这里进来。",
  groupNone: "未定向",
  groupNoneWhy: "早于定向挖掘的历史信号，保留原样、不回填。",

  // The score, taken apart. It was a bare number until now.
  breakdown: "评分构成",
  bdBase: "类型权重",
  bdDecay: "时效",
  bdBonus: "匹配加成",
  bdAge: "已过天数",
  stale: "评分已过期",
  staleCount: (n: number) => `${n} 条评分已过期，重新评分可对齐`,
  staleWhy: (stored: number, now: number) =>
    `入库时 ${stored} 分，按今天的时效重算是 ${now} 分。评分会随时间衰减，重新评分即可对齐。`,
  detectedOn: (d: string, src: string) => `发现于 ${d} · ${src}`,

  // --- The three-line row --------------------------------------------------
  // Each line reads left to right: what it is, then how it is judged.

  // L1 right - the verdict. A VERBALISATION OF THE SAME SCORE the ring draws,
  // off the same confidenceTone thresholds, so the badge and the arc cannot
  // disagree. The ring says how much, the badge says so what.
  verdictStrong: "强烈推荐",
  verdictWorth: "值得一看",
  verdictLater: "可延后",
  verdictUnknown: "待评分",

  // L2 left - why it scored what it scored. This was buried in the drawer,
  // which made the ring a number nobody could check without a click.
  // L2 right - the objective readings. Deadline and budget live in `payload`,
  // which is untyped and empty in every row today, so the fallback is the two
  // facts that always exist: how old it is, and whether it has drifted.
  fieldDeadline: (d: string) => `截止 ${d}`,
  fieldAmount: (a: string) => `额度 ${a}`,
  fieldAge: (n: number) => `${n} 天前`,
  fieldDrift: (n: number) => `已降 ${n} 分`,

  // L2 left - the project in a sentence. There is no summary field on the
  // record and `payload` is empty on every row today, so this is read
  // defensively and says so plainly when it comes up empty. An absent summary
  // that renders as a blank line teaches a reader that the row is thin; one
  // that says it could not be fetched teaches them the ingestion is.
  summaryUnavailable: "概要信息无法获取",

  // The drawer.
  scoreMethod: "评分方式",

  // L3 right.
  expand: "展开",
  collapse: "收起",
  rowMenu: "更多操作",
  groupCount: (n: number) => `${n} 条`,
  noPermission: "没有处置权限",
  noRescorePermission: "没有重新评分权限",
} as const;

/**
 * Keyed by SignalType rather than by string.
 *
 * It was a Record<string, string>, which meant adding a type without a label
 * compiled fine and rendered the raw key on screen - which is exactly what
 * happened when tender and compliance arrived (ADR-016). Now the omission is a
 * compile error.
 */
export const SIGNAL_TYPE_LABEL: Record<SignalType, string> = {
  tender: "招标公示",
  compliance: "政策合规",
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
  emptyDescription:
    "向助手提问。它会结合你的客户、商机和交付数据回答，并在需要改动时提出建议。",
  proposalsFromTurn: (n: number) => `本轮提出了 ${n} 条建议动作，待你裁决`,
  droppedProposals: (n: number) =>
    `另有 ${n} 条建议未记录：当前档位不含「助手主动建议」能力`,
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
  emptyDescription:
    "剧本是本工作区自己写的做法。没有剧本时，助手只依据数据回答。",
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
  // The headline. The ordering is a product decision - sickest first, never
  // alphabetical - and a claim the page has to make out loud, because a reader
  // who does not know it reads the top of the list as "most important".
  lead: (n: number) => `${n} 家客户在管`,
  leadOverdue: (n: number) => `${n} 条承诺已逾期，先处理它们`,
  leadAtRisk: (n: number) => `${n} 家健康度低于 60，已排在最前`,
  leadOrder: "按健康度升序排列，病得最重的排最前；未评估的排在最后。",
  description:
    "健康度是派生值，随源数据重算；它用于排序和预警，不作为任何业务判断的唯一依据。",
  columnName: "客户",
  columnIndustry: "行业",
  columnOwner: "负责人",
  columnHealth: "健康度",
  columnStatus: "状态",
  unscored: "未评估",
  emptyTitle: "还没有客户",
  emptyDescription: "线索转化或手工录入后，客户会出现在这里。",
  rowCount: (n: number) => `${n} 家客户`,

  // The action column. Both verbs are always listed; the one the member may not
  // use is disabled with the reason, not hidden - a menu whose contents change
  // with the viewer teaches nobody what the product can do.
  openAccount: "打开客户",
  recompute: "重算健康度",
  recomputeHint: "按当前源数据重新计算，结果立即写回",
  recomputeDenied: "没有重算健康度的权限",
  recomputedTitle: "健康度已重算",
  recomputedOn: (name: string, score: number | null) =>
    score === null ? `${name}:数据不足，仍为未评估` : `${name}:${score} 分`,
  recomputeFailed: "重算失败",

  // The owner is a raw subject id and is rendered as one. There is no display
  // name on the record to resolve it against; dressing a machine string as a
  // person is how a UUID ends up in front of someone who then does not chase it.
  ownerNone: "未指派",
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
  // The headline. This page's central claim is the DOWNGRADE RULE, and it lived
  // only in the section subtitle - so a reader could read a green row without
  // ever learning that green here is derived, not reported.
  lead: (n: number) => `${n} 个交付项目`,
  leadContract: (total: string) => `合同额合计 ${total}`,
  leadDowngraded: (n: number) =>
    `${n} 个项目的健康度已被下调——交付说没问题，但钱没到。`,
  leadRule:
    "健康度显示的是派生值，不是交付团队报的值。逾期回款不允许显示为健康。",
  rowCount: (n: number) => `${n} 个项目`,
  managerNone: "未指派",
  columnName: "项目",
  columnAccount: "客户",
  columnManager: "项目经理",
  columnHealth: "健康度",
  columnContract: "合同额",
  columnStatus: "状态",
  healthOverridden: "已下调",
  // The tooltip states the RULE in the product's language, and shows the rule
  // layer's own sentence underneath as the machine's evidence. That sentence is
  // English because deriveProjectHealth lives in a source file the repo requires
  // to be ASCII-only, so it cannot be product copy - see TD-010.
  healthOverriddenWhy:
    "交付团队报的是「健康」。规则不接受：有逾期未收的款项时，项目不允许显示为健康。",
  healthOverriddenEvidence: "判定依据",
  emptyTitle: "还没有交付项目",
  emptyDescription: "商机赢单后建立交付项目，会出现在这里。",
} as const;

/**
 * Keyed off the database's own CHECK constraint (00_baseline.sql
 * chk_project_status), not off what the demo fixtures happen to contain - the
 * fixtures only ever produce "active", so a map built from them would have
 * shipped four holes. The delivery table was rendering the raw enum: `active`,
 * `planning`, `delivered` in English, the one table in the product not
 * labelling its own status column.
 */
export const PROJECT_STATUS_LABEL: Record<string, string> = {
  planning: "筹备",
  active: "进行中",
  on_hold: "已暂停",
  delivered: "已交付",
  closed: "已关闭",
  cancelled: "已取消",
};

export const PROJECT_HEALTH_LABEL: Record<string, string> = {
  green: "健康",
  amber: "关注",
  red: "风险",
};

export const PLANNING_TEXT = {
  title: "销售规划",
  description:
    "目标由本域设定，达成由商机域的预测快照计算——两个域不互相写对方的数据。",
  // The headline. The workspace row is the one number this page exists for, so
  // it is stated rather than left to be found in row one of a table.
  lead: (period: string) => `${period} 销售规划`,
  leadAttained: (closed: string, target: string, pct: string) =>
    `全工作区 ${closed} / ${target} · 达成 ${pct}`,
  leadNoWorkspaceTarget: "本期未设全工作区目标。",
  leadUnforecast: (n: number) =>
    `${n} 个作用域本期还没有提交预测快照——那不是达成 0%。`,
  leadRule:
    "目标由本域设定，达成由商机域的预测快照计算。两个域不互相写对方的数据。",
  rowCount: (n: number) => `${n} 个作用域`,
  ownerScope: (sub: string) => sub,
  scopeUnnamed: "未命名",
  columnScope: "作用域",
  columnMetric: "指标",
  columnTarget: "目标",
  columnClosed: "已成交",
  columnAttainment: "达成度",
  columnStatus: "状态",
  noSnapshot: "尚无快照",
  noSnapshotHint:
    "该作用域本期还没有提交过预测快照，这与「达成 0%」不是一回事。",
  emptyTitle: "本期没有目标",
  emptyDescription: "销售运营设定区域与配额后，会出现在这里。",
  scopeWorkspace: "全工作区",
} as const;

/**
 * Keyed off the database's CHECK constraint (chk_sales_target_metric), not off
 * what the fixtures produce. The planning table printed `row.target.metric`
 * raw, so every row read `revenue` in English.
 */
export const TARGET_METRIC_LABEL: Record<string, string> = {
  revenue: "收入",
  new_logo: "新客户数",
  pipeline: "管道额",
  margin: "毛利",
};

export const TARGET_STATUS_LABEL: Record<string, string> = {
  draft: "草稿",
  committed: "已承诺",
  closed: "已关闭",
};

export const STRATEGY_TEXT = {
  title: "市场战略",
  description: "战略是全链路的起点：下游的战役、线索、商机都能回指到它。",
  // The headline. This page's claim is TRACEABILITY, and a list of two rows
  // asserts it without showing it. The downstream count makes the claim
  // checkable on the page that makes it.
  lead: (n: number) => `${n} 个市场战略`,
  leadTraced: (campaigns: number, orphan: number) =>
    orphan > 0
      ? `${campaigns} 场战役可回指到战略，另有 ${orphan} 场没有归属。`
      : `${campaigns} 场战役全部可回指到战略。`,
  leadNoCampaignRead: "没有战役读取权限，无法统计下游归属。",
  leadRule:
    "战略是全链路的起点。战役、线索、商机都能回指到它——所以「本季有多少来自我们选定要打的细分市场」是一次连接，不是一次人工统计。",
  rowCount: (n: number) => `${n} 个战略`,
  columnCampaigns: "下游战役",
  campaignCount: (n: number) => `${n} 场`,
  noCampaigns: "尚无",
  ownerNone: "未指派",
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
  description:
    "战役是归因的锚点。回报按赢单收入计，不按管道额——未成交的管道还不是回报。",
  // The headline. The page's central claim is the RETURN RULE, and it lived
  // only in a code comment and a section subtitle - so a reader could take the
  // ROI column at face value without ever meeting the caveat that makes it
  // mean something. It goes where the numbers are.
  lead: (n: number) => `${n} 场战役`,
  leadSpend: (budget: string, won: string) => `预算 ${budget} · 已回收 ${won}`,
  leadRule: "回报只计赢单收入。管道额不算回报——未成交的钱还不是钱。",
  rowCount: (n: number) => `${n} 场战役`,
  columnName: "战役",
  columnChannel: "渠道",
  columnBudget: "预算",
  columnProgress: "执行进度",
  columnStatus: "状态",
  columnReturn: "回报",
  emptyTitle: "还没有战役",
  emptyDescription: "把战略与细分市场变成具体的触达动作。",
  progress: (done: number, total: number, skipped: number) =>
    skipped > 0
      ? `${done}/${total} 完成（${skipped} 跳过）`
      : `${done}/${total} 完成`,
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
  description:
    "线索合格后转化为商机。转化那一刻，来源战役被复制到商机上并冻结——归因不靠事后填写。",
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
  // The consequence, written from what the code actually does rather than from
  // what the word suggests. advanceLead only refuses a CONVERTED lead, so the
  // rule would let a disqualified one move again - but this list treats
  // disqualified as terminal and greys every action, so from here it is
  // one-way. The sentence states the interface's behaviour, because that is
  // the one the reader is about to be held to.
  disqualifyConsequence:
    "判定后这条线索的所有动作都会灰掉，无法从这个列表改回。",
  disqualifyTarget: (subject: string) => `线索「${subject}」`,
  convert: "转化为商机",
  converted: "已转化",
  hintTerminal: "线索已经结案，没有可做的动作",
  hintNoTriage: "你没有分拣线索的权限",
  hintNotQualified: "线索还没有判定为合格",
  hintAlreadyQualified: "线索已经判定为合格",
  hintNoConvert: "你没有转化线索的权限",
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
  // Its own section now, so the title names the SUBJECT rather than one of its
  // two states - the pending list is a filter of this, not the whole of it.
  sectionTitle: "总结复盘",
  filterPending: "待复盘",
  filterAll: "全部复盘",
  allEmptyTitle: "还没有关闭的商机",
  allEmptyDescription: "赢单或丢单后，商机会出现在这里等待复盘。",
  columnState: "状态",
  reviewed: "已复盘",
  recordHintDone: "这一单已经复盘过了",
  recordHintDenied: "你没有记录复盘的权限",
  title: "待复盘",
  description:
    "已关闭但还没有复盘的商机。赢丢原因是结构化数据，回流给评分与建议——不写就没有闭环。",
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
  description:
    "「档案里有经济决策人」和「有人能引荐到他」是两件事。只有后者能推进单子。",
  covered: "已覆盖",
  missing: "缺失角色",
  blockers: "阻碍者",
  coaches: "内线",
  reachable: "经济决策人可达",
  unreachable: "经济决策人不可达",
  unreachableHint:
    "没有从内线到经济决策人的路径——遍历会跳过对立关系和已离职的联系人。",
  noEconomicBuyer: "档案里还没有经济决策人",
  influence: "影响力",
  emptyTitle: "还没有联系人",
  emptyDescription: "录入联系人并标注决策角色后，这里会给出决策链分析。",
  healthTitle: "客户健康度",
  healthDescription:
    "派生值，随源数据重算。用于排序和预警，不作为任何业务判断的唯一依据。",
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

/**
 * Health reasons, rendered.
 *
 * The domain used to build these sentences itself, in English, inside a Chinese
 * product. It now emits a code and its numbers; the words live here with every
 * other user-visible string.
 */
export function healthReasonText(r: {
  code: string;
  count?: number;
  days?: number;
  furthestStage?: string;
}): string {
  switch (r.code) {
    case "no_open_deals":
      return "没有开放商机";
    case "open_deals":
      return `${r.count} 个开放商机，最远到 ${(STAGE_LABEL as Record<string, string>)[r.furthestStage ?? ""] ?? r.furthestStage}`;
    case "never_contacted":
      return "没有任何跟进记录";
    case "quiet_days":
      return `已 ${r.days} 天没有接触`;
    case "contacted_days":
      return `${r.days} 天前有过接触`;
    case "projects_red":
      return `${r.count} 个项目红灯`;
    case "projects_amber":
      return `${r.count} 个项目黄灯`;
    case "projects_green":
      return `${r.count} 个项目绿灯`;
    case "overdue_revenue":
      return `${r.count} 笔回款逾期`;
    case "revenue_clean":
      return "回款无逾期";
    default:
      return r.code;
  }
}

/**
 * The position page - an opportunity-led pursuit review.
 *
 * Structured the way a deal review actually runs: whose position this is, what
 * the other side looks like, what our own side looks like, and what we intend
 * to do next. The last part is proposals a human signs, never a free-text memo
 * that becomes a second untended TODO list (ADR-003).
 */
export const POSITION_TEXT = {
  tierStrategic: "战略客户",
  tierKey: "重点客户",
  tierStandard: "普通客户",
  planOf: (period: string) => `${period} 经营计划`,
  planTarget: "计划目标",
  planDeals: "在办商机",

  triangle: "负责团队",
  /** The three owners, joined. The separator is text, so it lives here. */
  triangleOf: (sales: string, presales: string, delivery: string) =>
    `销售 ${sales} · 售前 ${presales} · 交付 ${delivery}`,
  roleOwner: "销售",
  rolePresales: "售前",
  roleDelivery: "交付",
  roleUnset: "未指定",

  external: "敌情 · 外部",
  externalWhy: "对方的决策结构、在交付的项目、以及竞争。",
  chain: "决策链",
  chainCovered: "已覆盖角色",
  chainMissing: "缺失角色",
  chainCoaches: "内线",
  chainBlockers: "阻力",
  chainUnreachable: "决策人不可达",
  chainReachable: "决策人可达",
  projects: "在交付的项目",
  noProjects: "这家客户目前没有在交付的项目",
  /**
   * Words that mark a note as mentioning a rival.
   *
   * Data about Chinese prose, so it lives with the other Chinese strings rather
   * than inside a page module. Crude on purpose: it selects QUOTES for a human
   * to read, never a conclusion, so a false positive costs one extra sentence
   * and a miss costs nothing that was not already invisible.
   */
  rivalWords: ["另一家", "竞争", "对手", "别家", "友商"] as readonly string[],
  competition: "竞争态势",
  competitionNone:
    "尚无结构化的竞争情报。以下是跟进原文里提到对手的片段——这是目前唯一的依据。",
  competitionNoMention:
    "跟进原文里没有出现竞争对手。这不等于没有对手，只等于没人记下来。",
  scout: "发起竞争态势分析",

  internal: "我情 · 内部",
  internalWhy: "我们这边：谁在负责、做过什么、卡在哪。",
  problems: "重点问题",
  problemsWhy: "由规则从已记录的证据推出，不是人工填写的风险清单。",
  noProblems: "规则没有在这个阵地上发现问题。",
  history: "跟进过程",
  historyCount: (n: number) => `${n} 条记录`,

  plan: "下一步作战计划",
  planWhy: "助手提议，人来签字。没有人落章就不会执行。",
  planEmpty: "助手目前没有针对这个阵地的提案。",
  planCommercial: "商务",
  planTechnical: "产品技术",
  planRelation: "关系",
  /**
   * What a proposal would DO, in words.
   *
   * The page printed the raw action_type - the third time a bare key has
   * reached the screen in this repo. Unknown keys fall back to the key rather
   * than to a guess, so a new action type is visible as unlabelled instead of
   * silently mislabelled.
   */
  actionLabels: {
    advance_stage: "推进到下一阶段",
    draft_outreach: "起草一封外联",
    promote_signal: "把信号升级为线索",
    adjust_forecast: "调整预测口径",
    draft_email: "起草邮件",
  } as Record<string, string>,
  approve: "批准",
  reject: "否决",
  confidence: (n: number) => `置信度 ${n}`,
} as const;
