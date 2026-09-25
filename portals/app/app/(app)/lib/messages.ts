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
import type { MilestoneStatus, RevenueStatus } from "../../domains/delivery/lib/revenue";
import type { PeerBenchmark } from "../../domains/account/lib/benchmark";
import type { IcpDimension, IcpFeatureStatus } from "../../domains/strategy/lib/icp";
import type { FindingSource, RiskFinding, RiskLevel } from "../../domains/account/lib/risk-types";
import type { RenewalRiskBasis, RenewalRiskLevel } from "../../domains/delivery/lib/renewal-risk";

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

export const MILESTONE_STATUS_LABEL: Record<MilestoneStatus, string> = {
  pending: "待开始",
  in_progress: "进行中",
  done: "已完成",
  missed: "已错过",
};

/** Domain navigation labels, keyed by the nav entry key. */
export const DOMAIN_LABEL: Record<string, string> = {
  national: "销售大屏",
  strategy: "市场战略",
  segment: "细分市场",
  solution: "解决方案",
  pricebook: "产品定价",
  // 销售区域 is a SECTION of 销售规划 since 2026-09-08, not a module of its
  // own; the label stays because the section still needs a name.
  territory: "销售区域",
  division: "区域设置",
  namedAccount: "战略客户",
  quote: "报价管理",
  routing: "线索分派",
  renewal: "合同续约",
  // 权限策略 (owner, 2026-09-11): 战果沉淀域新增的占位模块，尚无页面/权限点/
  // 数据表 - 见 PLACEHOLDER_MODULES.
  contract: "合同管理",
  forecastRule: "预测口径",
  attainment: "承诺达成",
  winLossReview: "赢丢复盘",
  collection: "回款管理",
  planning: "销售规划",
  campaign: "营销活动",
  account: "客户管理",
  signal: "商机智探",
  lead: "线索管理",
  funnel: "漏斗全景",
  pipeline: "商机管理",
  delivery: "项目交付",
  copilot: "销售助手",
  catalog: "产品目录",
  home: "今日判断",
  queue: "待我裁决",
  // 配置管理平面的条目 (2026-09-08). 四字为准 (owner)，每个条目一件事。
  // 组织管理（owner 2026-09-10：成员管理改为组织管理，含菜单和页面）。
  members: "组织管理",
  roles: "角色管理",
  // 权限策略（owner 2026-09-10：参考平台治理平面的权限策略页布局改名 -
  // 这页从不新建/编辑权限，"管理" 名不副实；权限的判断权归属和授权在
  // 角色管理里做，这里只读地说明策略本身长什么样）。
  permissions: "权限策略",
  scope: "数据范围",
  orgUnit: "组织架构",
  product: "产品配置",
  winLossReason: "赢丢原因",
  opportunityConfig: "业务配置",
  stage: "商机阶段",
  contracttype: "签约类型",
  businessform: "业务形态",
  // 客户分类 (incr/0040, grown to four vocabularies by incr/0071-0072; renamed
  // from 行业分类, owner 2026-09-16): 行业/客户类型/客户规模/客户性质, four ways
  // of answering "who is this customer", bundled on one page.
  industry: "客户分类",
  reminderThreshold: "提醒阈值",
  forecastThreshold: "预测阈值",
  ageingPolicy: "账龄分档",
  pricingPolicy: "计价规则",
  // 安全审计 (owner, 2026-09-17): 从占位条目变为真实页面 - 记录对配置的操作
  // (成员/角色相关的写操作)，不涉及业务数据。改名自旧的"操作审计"占位标签。
  audit: "安全审计",
  // 待迁路由 (owner, 2026-09-11: 盘点所有未在页面体现的路由，做一个临时域，
  // 先挂到里面) - 不进 5 个 functional domain（那是已经测试锁定的不变量），
  // 挂在 admin 侧栏下单独一页。
  pendingMigration: "待迁路由",
  // 赋能分析 (owner, 2026-09-17): 大屏风格的 AI 使用分析 - 每个人执行了多少
  // 任务、采纳/拒绝了多少建议。取代被否决的"使用分析"页 ("这些是分析吗，
  // 这是统计一下")。
  enablement: "赋能分析",
  // 系统验证 (owner, 2026-09-17): 是否与平台的连接本身是健康的 - 不是配置
  // 改没改（安全审计），也不是业务数据。
  diagnostics: "系统验证",
  strategyDiag: "战略诊断",
};

/**
 * The five functional domains - see functional-domains.ts for why these five
 * and why they speak in this register.
 *
 * THE 域 SUFFIX IS BACK (2026-09-04), and the reason it left is worth keeping,
 * because it was a measurement error rather than a judgement.
 *
 * It came off on the argument that these names are read once, in the launcher,
 * where five parallel columns already say "these are a set". That was checked
 * with a DOM query that filtered for elements with no child nodes - and the
 * label carries an Icon, so the query stepped over the one place the name is
 * actually read constantly. The name renders in THREE places:
 *
 *   the board rail   every page, 12px, muted, above the module cards
 *   the domain home  the h1
 *   the launcher     on open
 *
 * In the rail the suffix earns its two pixels. nav-board.tsx already worried
 * about exactly this - "Not a card: it labels the cards under it, and giving it
 * one would make the domain look like a sixth module" - and solved it visually
 * while the NAME stayed the same four-character shape as 承诺达成 and 客户管理
 * sitting underneath it. 域 is the other half of that fix. On the domain home
 * the page body already says 「这个域此刻」and 「这个域里有什么」, so the h1 was
 * the one line on the page not admitting what it was.
 *
 * Against, honestly: in the launcher the trigger already reads 切换功能域, so
 * five more 域 there are mild redundancy. Two contexts to one, and the cost is
 * nothing - measured in the rail at 68px of text becoming 80px, no wrap, same
 * 28px row, in a 280px column.
 *
 * The uniform four-character grid this breaks was the weakest of the original
 * arguments, and it pointed the wrong way: identical length made a domain and a
 * module look like peers when one contains the other. Five against four is the
 * level difference, spelled.
 *
 * ENGLISH DOES NOT FOLLOW, and that asymmetry is the point rather than an
 * oversight - see messages.en.ts.
 */
export const DOMAIN_GROUP_LABEL: Record<string, string> = {
  armory: "战略武备域",
  deployment: "作战部署域",
  recon: "战场侦察域",
  position: "阵地经营域",
  settlement: "战果沉淀域",
};

/**
 * One line under each domain name, phrased as the QUESTION it answers rather
 * than a summary of its contents. The contents are already listed underneath;
 * a second list of them in prose would be the same information twice, and it
 * is not what a reader hovering over a new word needs.
 */
/** 域首页：跨模块事实的名字。每一条都是两个模块页各持一半、谁都说不全的那件事。 */
export const NAMED_ACCOUNT_TEXT = {
  // 模块叫「战略客户」，收的却是战略级 + 关键级两档（page.tsx 的过滤是
  // tier !== "standard"）。所以这里的文案一律说「已分级」而不是复述模块名：
  // 名册里躺着两档，只报最高那一档的名字会让计数与内容对不上。
  why: "已分级的客户名单。这份名单决定信号定向盯谁，也决定跟进节奏对谁更严。",
  tagNamed: (n: number) => `${n} 家已分级`,
  none: "还没有分级过的客户",
  noneWhy:
    "在客户详情页把一家标为战略级或关键级，它就会出现在这里。分级要在能看到证据的地方做——健康度、决策链、在办商机都在那一页上。",
} as const;

export const ROUTING_TEXT = {
  title: "线索分派",
  why: "先按区域，再按负载（owner 裁定 2026-08-30）。区域决定谁有资格接，负载决定这几个人里该谁接——顺序反过来，闲着的人会拿到他从没打过的地盘。",
  none: "没有待分派的线索",
  noneWhy: "已转化和已判负的线索不在此列——它们的归属已经定了。",
  colLead: "线索",
  colCurrent: "当前归属",
  colSuggested: "规则建议",
  colBasis: "依据",
  colApply: "应用",
  unowned: "无人",
  alreadyThere: "已在规则位置",
  apply: "指给他",
  applied: "已指派",
  denied: "你没有分派线索的权限。",
  unroutable: {
    no_region: "线索未匹配客户，无区域",
    no_territory: "该区域无区域覆盖",
    no_owner: "覆盖区域无负责人",
  } as Record<string, string>,
  basisSole: (region: string, territory: string) => `${region} 由「${territory}」覆盖，这片地只有一个负责人`,
  basisTie: (region: string, n: number, territory: string, load: number) =>
    `${region} 有 ${n} 个负责人覆盖，「${territory}」手上最少（${load} 条）`,
  openAccount: "打开客户档案",
  colRegion: "区域",
  noRegion: "无区域",
  // 智能分配 (owner, 2026-09-06). The strip, the analysis block and their
  // vocabulary were removed with them: the page is a list, the thinking is
  // something you ask for, and its result lives in the assistant.
  // 标题行的标签 (owner, 2026-09-06). The page DOES route on load - the owner
  // was asked and chose it - so these are the router's own counts: how many
  // would move, and how many nothing can place.
  tagOpen: (n: number) => `${n} 条待分派`,
  tagPending: (n: number) => `${n} 条可指派`,
  tagBlocked: (n: number) => `${n} 条分不出去`,
  assignTitle: "智能分配",
  // WHAT THE ANALYSIS COULD NOT PROPOSE, in the same result. A lead nobody can
  // place is not a move to accept - it is a hole somewhere else, and each of
  // the three is a different person's job.
  adviceNoRegion: (n: number) => `${n} 条没有区域：客户还没匹配上，或者档案里区域是空的。规则连第一步都走不了。`,
  adviceNoTerritory: (n: number) => `${n} 条所在的区域没有任何在用的销售区域覆盖——地图缺了一块。`,
  adviceNoOwner: (n: number) => `${n} 条有区域覆盖，但那个区域没有负责人。图是全的，人没定。`,
  adviceImbalance: (who: string, n: number, share: number) =>
    `全部采纳之后，${who} 会拿到 ${n} 条，占 ${share}%。这片地只有他一个人管就没问题，不止一个就值得再看一眼。`,
  blockedTitle: "分不出去的",
  assignIdle: "按区域和负载算一遍，看看哪些线索该换人。算完只是建议，采不采纳你定。",
  assignRun: "智能分配",
  assignAgain: "重新分析",
  assignDiscard: "放弃",
  assignAccept: "采纳",
  assignFound: (n: number) => `${n} 条建议`,
  assignNone: "没有需要换人的线索——现有归属和规则一致。",
  assignAllDone: "建议都处理完了。",
  assignMove: (from: string, to: string) => `${from} → ${to}`,
} as const;

export const RENEWAL_TEXT = {
  title: "合同续约",
  // 提前多少天不再是写死的 90——incr/0066 把它挪进「提醒阈值」页，工作区自己设。
  why: "订阅制项目进入到期前的提醒窗口就出现在这里（窗口天数在「提醒阈值」页配置；owner 裁定 2026-08-30：从项目派生，且只为订阅类）。一次性交付不在此列——它交付完就结束了，替它造一个续约义务是客户从没承诺过的事。",
  none: "没有临近到期的订阅项目",
  noneWhy: "一次性项目不产生续约；订阅项目要进入到期前的提醒窗口才出现在这里，窗口天数在「提醒阈值」页配置。",
  colProject: "项目",
  colEnds: "到期",
  colAmount: "上期金额",
  colAnalysis: "商机分析",
  colVerdict: "结论",
  colOpen: "动作",
  open: "开商机",
  opened: "已创建",
  denied: "你没有创建商机的权限。",
  // 已过期的排在最前，说法也不一样：那不是「还有 -12 天」。
  lapsed: (days: number) => `已过期 ${days} 天`,
  // L4 批二 (§9.1): 这个日期从哪来 - 合同的是「到期日减通知期」, 项目的是结束日。
  anchorContract: (no: string) => `按合同 ${no} 通知期`,
  anchorProject: "按项目结束日",
  // 合同锚点的日期是通知截止日, 不是到期日: 过了它合同仍在期内。
  noticePassed: (days: number) => `通知期已过 ${days} 天`,
  noticeIn: (days: number) => `距通知截止 ${days} 天`,
  tagNoticeMissed: (n: number) => `${n} 个已过通知期`,
  dueIn: (days: number) => `还有 ${days} 天`,
  noEndDate: "未填到期日",
  risk: {
    low: "交付正常",
    // 用的是事实推出来的健康度，不是交付团队自己报的那个。
    watch: "交付有风险，谨慎接触",
  } as Record<string, string>,
  rowCount: (n: number) => `${n} 个待续`,
  searchHint: "项目名、项目号",
  filterAllRisk: "全部续约风险",
  riskLow: "交付正常",
  riskWatch: "交付有风险",
  /** A renewal nobody has assessed - a real answer, and the one somebody
   *  auditing coverage is looking for. */
  riskNone: "无评级",
  narrowedNote: "已按检索条件收窄",
  notDue: {
    not_subscription: "一次性项目，交付即结束",
    no_end_date: "订阅项目缺到期日——续约会悄悄漏掉",
    too_far_out: "还没进入提醒窗口",
    not_delivering: "尚未开始或已终止，没有可续的期限",
    already_renewed: "已有续约商机在跑",
  } as Record<string, string>,

  // --- the module page (2026-09-06) -----------------------------------------
  rosterDue: "待续约",
  rosterDueWhy:
    "订阅项目的合同期快到了。这里只列到期在即的，开启续约是一次对客户的商业接触，一行一行地做。",
  rosterNotDue: "暂不到期",
  rosterNotDueWhy:
    "还没到窗口、已经开过续约、或者不是订阅制的项目。留在这里是因为其中一种原因是缺陷：订阅项目没有结束日期，它的续约永远不会浮出来。",
  tagRenewalDue: (n: number) => `${n} 个待续约`,
  tagRenewalLapsed: (n: number) => `${n} 个已过期`,
  tagRenewalWatch: (n: number) => `${n} 个交付有隐忧`,
  renewalStatDays: (days: number) => `${days} 天后到期`,
  renewalStatLapsed: (days: number) => `已过期 ${days} 天`,
  renewalStatNoDate: "没有结束日期",
  renewalStatEmpty: "当前没有待续约的项目，头部不做拆解。",

  // --- 续约检查 (the dock) ---------------------------------------------------
  renewalAdviceTitle: "续约检查",
  renewalAdviceClear: "这批项目没有需要处理的地方。",
  viewDelivery: "查看交付",
  renewalAdviceOpenAccounts: "查看客户",
  renewalAdviceAct: "开启续约",
  renewalAdviceActed: "已开启续约商机",
  renewalAdviceLapsed: (name: string, days: number) =>
    `「${name}」的合同期已经过去 ${days} 天，还没有开续约。`,
  renewalAdviceWatch: (name: string) =>
    `「${name}」快到期了，但交付本身有隐忧——先看交付，再谈续约。`,
  renewalAdviceNoEndDate: (name: string) =>
    `「${name}」是订阅项目却没有结束日期，它的续约永远不会自己浮出来。`,
  renewalAdviceNoAmount: (name: string) =>
    `「${name}」到期在即，但没有可以带过去的合同金额。`,
  renewalAdviceDueSoon: (name: string, days: number) =>
    `「${name}」还有 ${days} 天到期，可以开续约了。`,
} as const;

export const FORECAST_RULE_TEXT = {
  title: "预测口径",
  why: "规则会把每笔生意归到哪一档，摆在人归的那一档旁边（owner 裁定 2026-08-31：只建议，逐单应用）。分歧本身就是预测评审要谈的东西——以前它只能靠一单一单翻看板才看得见。",
  none: "没有开放中的生意",
  noneWhy:
    "已成交与已判负的生意，档位由阶段定死，不是判断，也就没有第二种意见。",
  colDeal: "生意",
  colFiled: "人归的",
  colSuggested: "规则归的",
  colBasis: "依据",
  colStage: "停留",
  colApply: "应用",
  agrees: "一致",
  apply: "改成这档",
  applied: "已改",
  denied:
    "你可以看见分歧，但没有调整预测档位的权限——这是产品有意的分工：生意归你，预测承诺不归你。",
  // 赢率是谁写的，要说清楚。否则「规则说管道」读起来像规则在凭空反对，
  // 而实际上它引用的正是这位销售自己填的那个数。
  basisHuman: (p: number) => `赢率 ${p}%（本人填的）`,
  basisDefault: (p: number) => `赢率 ${p}%（阶段默认）`,
  stalledFor: (days: number) => `${days} 天没动`,
  neverMoved: "无阶段记录",
  cap: {
    no_close_date: "没写预计成交日——没写哪个周期，就没有可承诺的东西",
    close_date_passed: "预计成交日已过，生意还开着",
    stalled: "停在本阶段过久，降一档",
  } as Record<string, string>,

  // --- the module page (2026-09-06) -----------------------------------------
  rosterDisputed: "有分歧的商机",
  rosterDisputedWhy:
    "口径规则和填报人给出了不同答案的商机。分歧本身就是预测评审要看的东西——先看它偏向哪一边。",
  rosterAgreed: "无分歧",
  rosterAgreedWhy:
    "规则与填报一致，或者已经成交、没有可争的判断。留在这里是因为一份全是分歧的清单读起来像「这些都是问题商机」，而不是「这是我们的预测」。",
  noneDisputed: "口径没有分歧",
  noneDisputedWhy: "规则与每一笔的填报都一致。",
  filedOptimistic: "填报更乐观",
  filedConservative: "填报更保守",
  tagForecastDisputed: (n: number) => `${n} 笔有分歧`,
  tagForecastOptimistic: (n: number) => `${n} 笔偏乐观`,
  forecastStatCount: (n: number) => `${n} 笔`,
  forecastStatEmpty: "还没有可预测的商机，头部不做拆解。",

  // --- 口径分析 (the statistics block) ---------------------------------------
  analysisTitle: "口径分析",
  analysisWhy: "先看整体：预测压在哪一档、分歧偏向哪一边、涉及多少钱。下面的清单是逐笔明细。",
  chartPeak: "峰值",
  analysisEmpty: "还没有可统计的商机。",
  agreementRate: "口径一致率",
  agreementOf: (n: number, total: number) => `${n} / ${total} 笔一致`,
  agreementWhy: (n: number) =>
    `${n} 笔存在分歧。分歧多少要放在总量里看：两百笔里十二笔是几处边角，二十笔里十二笔是一份没人信的预测。`,
  agreementClear: "规则与填报完全一致。",
  byCategoryTitle: "口径分布",
  byCategoryWhy: "按填报口径分档，顺序从最不确定到最确定。",
  directionTitle: "分歧方向",
  directionWhy:
    "填报比规则更乐观，会抬高一个有人要为之负责的数字；更保守，则会藏住正在变好的生意。这是两种不同的对话。",
  directionNone: "没有分歧，这一块暂时不用看。",
  dirOptimistic: "填报更乐观",
  dirConservative: "填报更保守",

  // --- 口径检查 (the dock) ---------------------------------------------------
  adviceTitle: "口径检查",
  adviceClear: "这批商机的口径没有分歧。",
  adviceOpenDeal: "打开商机",
  adviceOptimistic: (name: string, filed: string, suggested: string) =>
    `「${name}」填的是${filed}，按规则只到${suggested}——这一笔在抬高承诺。`,
  adviceConservative: (name: string, filed: string, suggested: string) =>
    `「${name}」填的是${filed}，按规则可以到${suggested}——这一笔的进展被低估了。`,
  rowCount: (n: number) => `${n} 条分歧`,
  searchHint: "商机名、商机号",
  /** 归口 as FILED, not as suggested: this page reviews what people have
   *  committed to, and the machine's opinion is what it is being reviewed
   *  against. */
  filterAllFiled: "全部归口",
  narrowedNote: "已按检索条件收窄",
} as const;

export const ATTAINMENT_TEXT = {
  title: "承诺达成",
  why: "本期承诺了多少、已经落了多少、后面还有多少接得住——三件事放在一起才是一句话。它们此前分散在导航板上，各自是一张不属于任何模块的卡。",
  attained: "达成",
  won: "已成交",
  target: "目标",
  noTarget: "本期没有已承诺的工作区目标",
  noTargetWhy:
    "没有目标就没有分母。达成率不是零，是算不出来——把它显示成 0% 会把「还没定目标」说成「一件没做成」。",
  pool: (period: string) => `${period} 资源池`,
  poolWhy:
    "承诺要有东西接得住。这里是缺口后面还压着多少，按信心从高到低拆开——承诺的 881 万和早期管道的 881 万不是同一个 881 万。",
  thin: "接不住当前缺口",
  composition: "承诺的构成",
  compositionWhy:
    "这笔钱是由哪些产品线组成的。总额一样而构成不同，要打的仗就不同。",
  noComposition: "开放商机还没有行项，所以拆不出构成",
} as const;

export const AUTONOMY_TEXT = {
  title: "智能助手授权",
  why: "这个助手在没有问你之前，可以做到哪一步。改的是「哪些决定还要一条条过你的手」，不是「它能不能提议」——它始终只提议，采纳才动数据（ADR-003）。",
  modeLabel: "授权档位",
  modes: {
    ask_high_risk: "高风险问我",
    ask_always: "每条都问我",
    autonomous: "全自动值守",
  } as Record<string, string>,
  modeWhy: {
    // 这一句原来自己数了一遍能自动执行的动作（还写着「信号升级为线索」，而它
    // 2026-09-01 就已经从清单里拿掉了），于是设置页和上面的提案队列互相矛盾。
    // 现在名单由面板从 EXECUTABLE_ACTIONS 现算现填，句子不可能再说错。
    ask_high_risk:
      "能走回头路的它自己做；收不回的和它自己都没把握的，仍然问你。",
    ask_always:
      "每一条都等你裁决。没有设置过的工作区就是这一档——没设置不等于已授权。",
    autonomous: "包括对外触达在内，全部自动执行。记录里会写明「无人签字」。",
  } as Record<string, string>,
  // 风险的两条理由，界面上要分开说：把「不可逆」显示成「置信度低」会让人以为
  // 调高置信度就能放行。
  risk: {
    irreversible: "收不回",
    low_confidence: "置信度不足",
  } as Record<string, string>,
  /** 当前真正会自动执行的动作，由 EXECUTABLE_ACTIONS 现算，不手写。 */
  modeCanDo: (actions: string) => `现在会自己做的：${actions}。`,
  modeCanDoNone: "现在没有任何一种动作会自己做。",
  riskWhy: (floor: number) =>
    `收不回 = 对客户发出去的动作。置信度不足 = 低于 ${floor}%，或助手没给出置信度。两者有其一就问你。`,
  unset: "尚未设置",
  setBy: (who: string) => `由 ${who} 设置`,
  save: "改成这一档",
  saved: "已生效",
  denied:
    "你没有调整助手授权的权限——裁决一条提案，和决定提案不再需要裁决，是两件事。",
} as const;

export const QUOTE_TEXT = {
  tagCount: (n: number) => `${n} 份报价`,
  title: "报价",
  why: "每笔商机当前报出去的是什么。行项、底价和签字本来就都在，只是从没有一处把它们放在一起——「我们给这家报过什么价」以前只能一单一单翻。",
  none: "还没有报价",
  noneWhy: "给商机加上行项，这里就会出现它当前的报价。",
  colDeal: "商机",
  colAccount: "客户",
  colStage: "阶段",
  colLines: "行项",
  colAmount: "报价金额",
  colSignature: "待签字",
  awaiting: (n: number) => `${n} 行待签`,
} as const;

export const DOMAIN_FACT_LABEL: Record<string, string> = {
  // armory
  activePlans: "进行中的战略计划",
  segments: "细分市场",
  emptySegments: "无人匹配的细分",
  products: "在售产品",
  solutions: "解决方案",
  unpricedProducts: "未定价的产品",
  // recon
  runningCampaigns: "进行中的战役",
  untriagedSignals: "待分诊的信号",
  stalledLeads: "已合格未转化的线索",
  // position
  activeAccounts: "活跃客户",
  openDeals: "开放商机",
  overdueCommitments: "逾期未兑现的承诺",
  pendingReviews: "待复盘的商机",
};

export const DOMAIN_HOME_TEXT = {
  factsTitle: "这个域此刻",
  factsWhy:
    "只列跨模块的事实——每一条都要把两个模块页对着读才看得见，而那正是没人会做的阅读。",
  factsDeniedTitle: "你无权查看这个域的汇总",
  factsDeniedWhy:
    "这里的每一项都走各自模块页同一道门；一项也没通过，所以什么都不显示。",
  needsAttention: "待处理",
  modulesTitle: "这个域里有什么",
  modulesWhy: "域内的模块。已建的可以进去，未建的照实说未建。",
} as const;

export const DOMAIN_GROUP_QUESTION: Record<string, string> = {
  armory: "打什么仗，拿什么打",
  deployment: "打谁，谁去打，背多少",
  recon: "怎么把火力变成线索",
  position: "这一仗怎么拿下",
  settlement: "赢了之后钱怎么到账",
};

/**
 * Labels for modules that have no page yet.
 *
 * EMPTY, AND THAT IS THE CORRECT STATE TODAY: every module in the launcher is
 * built. The `planned` kind itself stays - a greyed row answers "does this
 * product do quoting" with "yes, not yet", where an absent row answers it with
 * "no" - and this is where a future planned module's label goes.
 *
 * The invariant is the sentence this comment used to carry: a built module
 * never appears in both tables. It was TRUE AS A CLAIM and false as data. Ten
 * entries sat here naming modules that had all since shipped, and because a
 * label that can never render is a label nobody reads, four had quietly drifted
 * away from the live ones - 价目折扣 against 产品定价, 战略客户 against the
 * then-live 重点客户 (the module is called 战略客户 again since 2026-09-17,
 * which is a rename, not a reversal - the tier labels moved to 战略级 /
 * 关键级 / 普通级 to keep the word from meaning two things), 线索分配 against
 * 线索分派, and 回款计划 against 回款管理, that last
 * one opened by the rename one commit ago. A third copy of the module names,
 * rotting in the dark.
 *
 * functional-domains.test.ts now checks the invariant instead of stating it.
 */
export const PLANNED_MODULE_LABEL: Record<string, string> = {};

export const LAUNCHER_TEXT = {
  buttonLabel: "切换功能域",
  panelLabel: "功能域",
  crosscutting: "贯穿全局",
  /** On a module whose page is not built yet. */
  planned: "开发中",
  // A module that IS built but lives inside another page. Not "开发中" - that
  // said a shipped feature did not exist - and not silent either, because the
  // reader needs to know the click leaves for another page.
  section: "在其他页面",
  /**
   * On a built module the workspace has not bought.
   *
   * NAMES THE TIER. "需升级" alone tells a reader they cannot have it and not
   * what would change that - an upsell nobody can act on. The tier is already
   * in the capability matrix (`minTierFor`); it was simply never handed to
   * anything that renders.
   */
  locked: (tier: string) => `需 ${tier}`,
  /** When no tier grants it at all - nothing to upgrade to. */
  lockedNoTier: "不可用",
};

/**
 * Tier names as a buyer sees them on the price list, not as the enum spells
 * them. `pro` is a key; PRO is what somebody bought.
 */
// Shortened (owner, 2026-09-17): business -> BIZ, enterprise -> ENT. The five
// tier identifiers themselves are the platform's own (40-capability-matrix.md
// - "档位五值来自平台... 产品不得新增或改名"); this is only the on-screen
// abbreviation of that same five, not a renamed tier.
export const TIER_LABEL: Record<string, string> = {
  free: "FREE",
  starter: "STARTER",
  pro: "PRO",
  business: "BIZ",
  enterprise: "ENT",
};

/**
 * The copy this product hands to the design system.
 *
 * IT LIVES IN THE DICTIONARY, and was moved here on 2026-08-26 from its own
 * module of `as const` objects. That module had the same defect the sixteen
 * detail-page components had - a module constant is evaluated on import, so it
 * freezes whichever locale loaded first. Five components pass these to
 * DataTable, ActionMenu and BulkActionBar, so an English reader was getting
 * Chinese confirm dialogs and row menus regardless of the rest of the page.
 *
 * WHY A SHARED GROUP AND NOT A STRING AT EACH CALL SITE. As of design-ui 5.0
 * every DS copy outlet falls back to ENGLISH, and its changelog is explicit
 * about what that means: the fallback exists so a missed prop renders
 * something legible instead of `undefined`, not so anyone can rely on it. An
 * English default reaching a production screen means someone forgot to pass
 * one. The DS ships no locale context and does not intend to, so passing is
 * the product's job - and the compiler cannot help, because every one of these
 * props is optional. That leaves two failure modes, and one group answers
 * both: the same 「取消」 growing three different spellings across three pages,
 * and nobody being able to say which outlets are still unpassed.
 *
 * VERIFIED AGAINST THE SHIPPED BUNDLE, not against the .d.ts. The type's own
 * doc comment still claims titleTemplate defaults to the Chinese
 * `"{verb}{target}？"`; the compiled default is `"{verb} {target}?"`. The
 * comment is stale and a product that trusted it would ship
 * 「判定不合格 线索？」 with a half-width question mark and a stray space.
 */
export const DS_LABELS = {
  /**
   * Confirmation dialogs for destructive actions.
   *
   * Chinese word order and full-width punctuation, passed explicitly. The DS
   * used to compose `${verb}${target}？` itself and 4.1 opened this prop
   * precisely to hand word order back to the caller. 5.0 finished the job by
   * making the fallback neutral, which means a Chinese product must now say so.
   */
  confirmTitleTemplate: "{verb}{target}？",
  confirmCancel: "取消",
  confirmPending: "处理中…",
  /** DialogForm's submit fallback (its default is "Save"). */
  dialogSave: "保存",

  /** The row-level action trigger. Its default accessible name is English. */
  actionMenu: "更多操作",

  /** The list toolbar. */
  filterReset: "重置筛选",
  filterViewMode: "视图模式",

  /**
   * Bulk selection. The template and the noun MUST move together - the
   * changelog calls this out by name, because passing only one yields
   * 「已选择 3 items」.
   */
  bulkToolbar: "批量操作",
  bulkSelectionTemplate: "已选择 {count} {noun}",

  /** Toasts. Both outlets are accessible names a reader never sees but hears. */
  toastRegion: "通知",
  toastDismiss: "关闭通知",

  /** Pagination footer (owner, 表格列宽新一轮规则: 规则 5). Its defaults are
   *  English ("15 records"/"Previous page") - every table's `<Pagination>`
   *  needs these passed explicitly, the same reason `actionMenu` above does. */
  paginationCount: (n: number) => `共 ${n} 条记录`,
  paginationFilteredCount: (shown: number, total: number) => `共 ${total} 条记录，当前筛选 ${shown} 条`,
  paginationPrevious: "上一页",
  paginationNext: "下一页",
  paginationPageSizeLabel: "每页条数",
  paginationPageSizeOptionTemplate: "每页 {size} 条",
  paginationPageSizeAuto: "每页条数自适应",
} as const;

/**
 * 表单页旁的助手 - owner 裁定 2026-09-05：新建/编辑是独立页面，页面旁边站着助手。
 *
 * 每条建议都带理由（label 说建议什么，reason 说凭什么），一键应用、从不默认应用——
 * ADR-003 的边界在表单尺度上的复述：助手提议，人裁决。
 */
export const ASSIST_TEXT = {
  title: "智能填写",
  description: "根据工作区里已有的数据给出建议。每条都写明依据，点了才生效。",
  nothing: "暂时没有可建议的内容。",
  apply: "采用",
  newEntry: "新建",
  titleKnown: (t: string) => `已有职务写法:${t}`,
  departmentKnown: (d: string) => `已有部门:${d}`,
  vocabularyWhy: "沿用这家客户名册里已有的写法,按职务/部门汇总时不会分家。",
  codeNext: (code: string) => `编码建议：${code}`,
  codeNextWhy: "延续你们现有编码序列的下一个号。",
  categoryKnown: (c: string) => `已有类目：${c}`,
  categoryKnownWhy: "沿用已有类目，报表按类目汇总时不会因写法不同而分家。",
  unitKnown: (u: string) => `常用单位：${u}`,
  unitKnownWhy: "目录里最常用的单位。",
  bundleAdd: (name: string) => `加入 ${name}`,
  bundleAddWhy: "在售且尚未加入本方案的产品。",
  unpriced: (name: string) => `${name} 还没有定价`,
  unpricedWhy: "没有价格的产品无法报价——这正是本页要补的缺口。",
  floorRatio: (floor: string) => `底价建议：${floor}`,
  floorRatioWhy: (pct: number) =>
    `按你们已有定价的中位底价率（约列表价的 ${pct}%）推算。底价是商业决定，这里只是填上数字，签字的仍是你。`,
  // 战略域（#185 批次）
  periodKnown: (p: string) => `期间沿用：${p}`,
  periodKnownWhy: "沿用已有期间的写法。同一期间两种写法，按期间汇总的报表就会分家。",
  industryKnown: (v: string) => `客户里有的行业：${v}`,
  regionKnown: (v: string) => `客户里有的地区：${v}`,
  criteriaWhy: "细分是对真实市场的切分——条件用客户实际携带的值，切出来的才不是空集。",
  // 部署域（#185 批次）
  uncoveredRegion: (region: string, n: number) => `${region} 有 ${n} 家客户，尚无区域覆盖`,
  uncoveredRegionWhy: "线索按区域路由（先区域后负载）。没有区域覆盖的地面，每一条线索都无处可派。",
  metricUnset: (label: string) => `本期还没有「${label}」的全工作区目标`,
  metricUnsetWhy: "没有目标的口径，承诺达成页无从判断——分母缺席。",
  territoryUnset: (name: string) => `${name} 本期还没有任何目标`,
  territoryUnsetWhy: "没有目标的区域在达成页上是「未设定」，不是零——先把空格点出来，数字由你定。",
  // 战场侦察域 / 战果沉淀域 / 阵地经营域（#186 批次）
  campaignEmpty: (name: string) => `${name} 还没有任何执行项`,
  campaignEmptyWhy: "执行项是战役的血肉：完成要靠它们清零，回报也按它们计。进行中却没有一项，是还没拆成活的动作。",
  assigneeKnown: (v: string) => `常用负责人：${v}`,
  assigneeKnownWhy: "沿用已有写法，按人汇总时不会分家。",
  projectUnchecked: (name: string) => `${name} 还没有里程碑`,
  projectUncheckedWhy: "没有里程碑的项目，健康度只剩自报——没有任何事实能反驳它。",
  sequenceNext: (n: number) => `序号建议：${n}`,
  sequenceNextWhy: "该项目现有里程碑的下一个号。空洞不补——跳过的序号通常是故意的。",
  accountNoDeal: (name: string) => `${name} 没有在办商机`,
  accountNoDealWhy: "在经营、没在卖——走廊里听来的单子往往先发生在这样的客户身上。",
  territoryCovers: (name: string, region: string) => `${name} 覆盖 ${region}`,
  territoryCoversWhy: "与线索路由同一套区域匹配——按此归档，商机落在它的线索本会去的地方。",
} as const;

/**
 * The assistant surface's own words - the frame, not the content.
 *
 * Every page supplies its own sentences; these are the three words the frame
 * itself says, and they live in one place so 忽略 means the same thing in the
 * price book as in the solution check.
 */
export const ASSISTANT_TEXT = {
  // Used only when an act carries no dictionary of its own - a refusal is
  // still said, just without a module's vocabulary to say it in.
  actFailed: "这一步没有执行成功。",
  ignore: "忽略",
  ignored: (n: number) => `已忽略 ${n} 条`,
  accept: "采纳",
} as const;

export const CATALOG_TEXT = {
  // 三个新建页 - owner 裁定 2026-09-05：新建从列表页拆出，独立成页。
  newProduct: "新建产品",
  newProductWhy: "产品是目录的最小单位：报价的行项、方案的组成都指向它。",
  newSolution: "新建方案",
  newSolutionWhy: "方案是一组产品的打包卖法。空方案只是个名字，至少放进一个产品。",
  newPrice: "设定价格",
  newPriceWhy: "列表价是对外的说法，底价是内部的纪律——低于底价的行项会被标记待批。",
  newEntry: "新建",
  description:
    "目录是被所有域引用的维度：商机、合同、交付、信号匹配都读它，而它谁都不写。",
  lead: (n: number) => `${n} 个在售产品`,
  leadWhy:
    "不知道自己卖什么，就没法卖任何东西——所以目录不按档位售卖，全档可读。",

  products: "产品",
  productsWhy:
    "单品或服务。单位不是装饰：每条行项都是数量乘单价，没有单位的「10 × 1000」是十个坐席、十天还是十个站点，那是三笔不同的生意。",
  colCode: "编码",
  colName: "名称",
  colCategory: "类别",
  colUnit: "单位",
  colStatus: "状态",
  statusActive: "在售",
  statusRetired: "已退役",
  statusDev: "在研",
  noCategory: "未分类",
  addProduct: "新增/更新产品",
  saveProduct: "保存产品",
  productSaved: "已保存",
  codeHint: "按编码更新：同一个编码再保存一次是修改，不是新增一条",

  // 模块页（owner 裁定 2026-09-05）：展示为主，行操作靠右锁定，配置独立成页。
  tagActive: (n: number) => `${n} 产品在售`,
  tagDev: (n: number) => `${n} 在研产品`,
  settingsLink: "产品配置",
  byTypeCollapse: "收起分类统计",
  byTypeExpand: "展开分类统计",
  byTypeEmpty: "还没有产品，分类统计从第一个产品开始",
  typeStat: (active: number, dev: number) =>
    dev > 0 ? `${active} 在售 · ${dev} 研发` : `${active} 在售`,
  rosterLive: "产品清单",
  rosterLiveWhy: "在售与在研。顺序即门面——客户看到的目录顺序在这里决定。",
  rosterRetired: "退役产品",
  rosterRetiredWhy:
    "退役是搁置，不是删除：被报价行或方案引用过的产品不能删，退到这里历史仍然可读。",
  colType: "产品类型",
  colUnitPrice: "计价单位",
  colOps: "操作",
  opEdit: "修改",
  // 行菜单的 XX（ROW_OPS）：产品配置 / 删除产品，方案配置 / 删除方案。
  productNoun: "产品",
  solutionNoun: "方案",
  statusNoun: "状态",
  typeNoun: "类型",
  unitNoun: "单位",
  opLaunch: "上线",
  opRetire: "退役",
  opReinstate: "恢复在售",
  opDelete: "删除",
  opUp: "上移",
  opDown: "下移",
  deleteConsequence: "删除不可恢复，价目历史一并清除。被引用的产品会被拒绝——那种情况请改用退役。",
  editProduct: "修改产品",
  editHint: "编码是身份，不可修改；状态变更走清单页的行操作，不在这里改",
  newStatus: "初始状态",
  newStatusWhy: "在研的产品真实存在但不可报价；上线之后才进入可售清单",
  sortTitle: "当前目录顺序",
  sortWhy: "新产品排在末位。用上移/下移把它放到该在的位置——这里的顺序就是客户看到的顺序。",

  // 配置页（owner 裁定 2026-09-05 第二轮）：次级配置页，不摆模块页头——
  // 返回 + 面包屑一行，小标题一行，不带描述。
  settingsTitle: "产品配置",
  // 计价单位 (0037) - 产品配置的第三段
  unitsTitle: "计价单位",
  unitsWhy: "产品按什么卖：套、人天、年。报价行按它计量。",
  addUnit: "新建单位",
  renameUnit: "重命名",
  saveUnit: "保存单位",
  unitCode: "单位代码",
  unitCodeHint: "创建后不可更改，作为这个单位的锚。用英文小写，如 set / month。",
  colUnitName: "单位名称",
  unitDeleteConsequence: "还有产品按这个单位计价时会被拒绝——先把它们改成别的单位。",
  back: "返回",
  typesTitle: "产品类型",
  typesWhy: "产品是哪一类。被引用时不可删除，可停用。",
  typeCode: "类型编码",
  typeName: "类型名称",
  typeCodeHint: "编码是本工作区的业务锚点，创建后不可改；内部关联走 uuid，从不显示",
  addType: "新增类型",
  renameType: "重命名",
  saveType: "保存类型",
  typeDeleteConsequence: "删除不可恢复。仍有产品挂在这个类型时会被拒绝——那种情况请改用停用。",
  // 两张配置表同构（owner 定列 2026-09-05）：
  // 序号｜类型名称｜关联产品｜类型状态｜操作 / 序号｜状态名称｜关联产品｜状态描述｜操作
  colTypeName: "类型名称",
  colTypeStatus: "类型状态",
  colStatusName: "状态名称",
  colStatusDesc: "状态描述",
  colLinkedProducts: "关联产品",
  linkedCount: (n: number) => `${n} 个`,
  typeEffectiveBadge: "生效中",
  typeRetire: "停用",
  typeReinstate: "启用",
  typeRetiredBadge: "已停用",
  typeInUse: (n: number) => `${n} 个产品`,
  statusesTitle: "产品状态",
  statusesWhy: "产品处于什么阶段：在研、在售、已退役。",
  addStatus: "新增状态",
  renameStatus: "重命名",
  saveStatus: "保存状态",
  statusCode: "状态编码",
  statusCodeHint: "编码是本工作区的业务锚点，创建后不可改；内部关联走 uuid，从不显示",
  moveToStatus: (label: string) => `转入「${label}」`,
  statusDeleteConsequence: "删除不可恢复。内置三个状态不可删；仍有产品处于该状态时会被拒绝。",

  // 方案模块页（owner 裁定 2026-09-05）：解决方案 = 产品组合 + 业务定制。
  tagSolutionActive: (n: number) => `${n} 个在售方案`,
  tagSolutionRetired: (n: number) => `${n} 个已停用`,
  solutionStat: (inSolution: number, outside: number) =>
    outside > 0 ? `${inSolution} 已入方案 · ${outside} 未入` : `${inSolution} 已入方案`,
  solutionStatEmpty: "还没有在售产品，方案覆盖统计从第一个产品开始",
  rosterSolution: "方案清单",
  rosterSolutionWhy:
    "一个方案 = 产品组合 + 业务定制。顺序即门面；组合与定制在方案自己的页面里改。",
  rosterSolutionRetired: "已停用方案",
  rosterSolutionRetiredWhy: "停用的方案不再用于报价，但它记录着过去是怎么卖的，所以保留。",
  colSolutionName: "方案名称",
  colComposition: "产品组合",
  colScenario: "适用场景",
  compositionCount: (standard: number, optional: number) =>
    optional > 0 ? `${standard} 标配 · ${optional} 可选` : `${standard} 标配`,
  noScenario: "未填写",
  solutionRetire: "停用",
  solutionReinstate: "启用",
  solutionDeleteConsequence:
    "删除不可恢复，组合与定制一并删除。已按此方案报过的商机不受影响——报价行引用的是产品。",
  newSolutionEntry: "新建方案",
  editSolution: "修改方案",
  colOptional: "标配/可选",
  optionalYes: "可选",
  optionalNo: "标配",
  colItemNote: "定制说明",
  scenarioHint: "这个方案是为什么样的客户与场景准备的",
  summaryHint: "一句话说明这个方案解决什么问题",
  itemNoteHint: "这一项按什么定制：数量怎么算、含不含二次开发",
  standardCoreHint: "至少留一项标配——全是可选的不是方案，是菜单",
  // 侧栏：方案检查
  solutionAdviceTitle: "方案检查",
  solutionAdviceClear: "在售方案没有需要处理的地方。",
  solutionAdviceRetired: (s: string, p: string) => `「${s}」里的「${p}」已不再在售，报价会报到一个下架品。`,
  solutionAdviceUnquotable: (s: string, p: string) => `「${s}」里的「${p}」目前不可报价，按此方案报价会缺一行。`,
  solutionAdviceUnpriced: (s: string, p: string) => `「${s}」里的「${p}」还没有价格，按此方案报价会缺一行。`,
  solutionAdviceNoScenario: (s: string) => `「${s}」没有写适用场景——没有场景的组合是打包，不是方案。`,
  solutionAdviceUncovered: (p: string) => `「${p}」在售，但没有任何方案带它出去卖。`,
  solutionAdviceOpen: "打开方案",
  solutionAdviceOpenCatalogue: "前往产品目录",
  solutions: "解决方案",
  solutionsWhy:
    "组合模板。行项从不引用它做计算（ADR-014 §4）——模板是起点，不是权威。",
  solutionItems: (n: number) => `${n} 个产品`,
  noSolutions: "还没有解决方案",
  emptyBundle: "一个不装产品的方案只是个名字",

  pricebookLink: "前往产品定价",
  pricebookWhy:
    "底价是这张表存在的理由：低于它的报价需要签字。价格只追加不改写——被取代的那一行解释了今天这个数字是怎么来的。",
  // 定价模块页（owner 裁定 2026-09-05：全面按产品目录的模式与布局）
  tagPriced: (n: number) => `${n} 已定价`,
  tagUnpriced: (n: number) => `${n} 未定价`,
  priceStat: (priced: number, unpriced: number) =>
    unpriced > 0 ? `${priced} 已定价 · ${unpriced} 未定价` : `${priced} 已定价`,
  priceStatEmpty: "还没有产品，定价统计从第一个产品开始",
  priceCurrent: "当前价目",
  priceCurrentWhy: "每个产品此刻生效的那一行。底价是内部纪律：低于它的报价需要签字。",
  priceHistory: "历史价目",
  priceHistoryWhy: "被取代的价格。它们解释了今天这个数字是怎么来的，所以保留而不删除。",
  reprice: "重新定价",
  repriceWhy: "价格只追加不改写：保存后成为该产品的当前价目，旧价目转入历史。",
  colProduct: "产品",
  // 智能定价评估（owner 裁定 2026-09-05）：评估在侧栏，每条建议自带采纳/忽略。
  adviceTitle: "智能定价评估",
  adviceScopeAll: "全部在售价目",
  adviceScopeSelection: "已选行",
  adviceClear: "这批价目没有需要处理的地方。",
  adviceRunAll: "评估全部价目",
  adviceAccept: "采纳",
  adviceIgnore: "忽略",
  adviceIgnored: (n: number) => `已忽略 ${n} 条`,
  adviceApplied: "已按建议追加新价目",
  adviceUnpriced: (name: string) => `「${name}」在售但没有价格，无法进入报价。`,
  adviceOverridden: (name: string, n: number) =>
    `「${name}」已有 ${n} 次低于底价的签字——底价可能定高了。`,
  adviceOutlier: (name: string, actualPct: number, medianPct: number) =>
    `「${name}」底价是标价的 ${actualPct}%，工作区其余产品的中位是 ${medianPct}%。`,
  adviceEqual: (name: string) => `「${name}」底价等于标价，即不打折——确认这是立场而非漏填。`,
  adviceApplyFloor: (floor: string) => `按中位比例，底价 ${floor}`,
  adviceNoNumber: "这条没有可直接采纳的数字",
  adviceNoNumberWhy: "需要人来定标价与底价，分析只能指出缺口",
  adviceOpenCatalogue: "前往产品目录",
  adviceOpenHistory: "查看历史价目",
  // 两件不同的事，名字分开（owner 裁定 2026-09-05）：
  // 「智能定价评估」按规则给出建议并可一键采纳；
  // 「定价变化分析」看价格随时间怎么走，开发中——incr/0030 的继承链就是它的数据基础。
  assessSelected: "智能定价评估",
  analyzeSelectedHint: "先在左侧勾选要评估的价目",
  priceTrend: "定价变化分析",
  priceTrendSoon: "定价变化分析开发中：继承链数据已在记录，界面还没有接通",
  priceInForceHint: "当前生效的价格不能删除——请用「重新定价」追加一条新的",
  priceDeleteConsequence: "删除不可恢复。被折扣签字引用过的价格会被拒绝——那条记录是签字的依据。",
  listHint: "对外报出的价格",
  floorHint: "可成交的下限。底价等于标价表示此产品不打折。",
  colList: "标价",
  colFloor: "底价",
  colCurrency: "币种",
  colEffective: "生效时间",
  colSuperseded: "退役时间",
  noPrices: "还没有价目",
  setPrice: "保存价格",
  priceSaved: "已记入",
  floorEqualsList: "底价等于标价 = 此产品不打折，这是一个立场，不是笔误",
  priceDenied: "你没有定价权限——能移动底价的人等于能批准每一笔折扣",
  writeDenied: "你没有维护目录的权限",
  solutionSummary: "一句话说明",
  solutionProduct: "产品",
  solutionQuantity: "数量",
  pickProduct: "选择产品",
  addItem: "加一行",
  removeItem: "移除",
  saveSolution: "保存方案",
  solutionSaved: "已保存",
  productCount: (n: number) => `${n} 个产品`,
  productSearchHint: "产品名、产品编码",
  solutionCount: (n: number) => `${n} 个方案`,
  /** 适用场景 is in the search, and that is the point of the box: the scenario
   *  is a sentence somebody says to a customer, not something a name column
   *  can be scanned for. */
  solutionSearchHint: "方案名、编码、适用场景",
  filterAllTypes: "全部分类",
  narrowedNote: "已按检索条件收窄",
  priceCount: (n: number) => `${n} 条价格`,
} as const;

/**
 * The three codes that come from the GATE rather than from any domain.
 *
 * `can()` produces exactly these, so every domain dictionary carried its own
 * copy - eight, ten and five copies of one sentence each. A wording change had
 * to be made in every one of them, and SonarCloud flagged the block as
 * duplication once a twelfth dictionary arrived.
 *
 * Spread FIRST in each dictionary, so a domain that has something more specific
 * to say - "you cannot record follow-ups", "you cannot edit the relationship
 * graph" - still overrides it. The shared default is the floor, not a ceiling.
 */
const GATE_ERROR = {
  not_authenticated: "登录状态已失效，请重新登录",
  permission_denied: "你没有执行这个操作的权限",
  feature_not_in_tier: "当前档位不含这个能力",
  // 通用兜底。一个没登记的 code 显示这句，而不是把裸 code 摆给用户——
  // 少一句翻译是缺陷，泄露内部代号是同一个缺陷换个样子（TD-010）。
  denied: "操作被拒绝",
} as const;

/**
 * 读取失败时页面显示什么。
 *
 * 页面此前把 `violation.message` 直接渲染出来，那是规则层写给自己看的英文散文，
 * 而它所在的文件必须 ASCII-only —— 所以它永远不可能是产品文案（TD-010）。
 * 被拒的加载因此会显示 `missing permission strategy.read`：英文，还把内部权限码
 * 摆给了终端用户。
 *
 * `unknown` 是刻意的兜底：一个没有登记的 code 显示一句通用的话，而不是退回散文。
 * 少一句翻译是缺陷，泄露一句英文规则自述是同一个缺陷换个样子。
 */
export const LOAD_ERROR: Record<string, string> = {
  ...GATE_ERROR,
  unknown: "数据加载失败，请稍后重试",
};

export const REVENUE_ERROR: Record<string, string> = {
  ...GATE_ERROR,
  actual_amount_required: "标记为已回款必须写明实际收到多少",
  amount_negative: "金额不能为负",
  currency_mismatch: "币种与计划不一致",
  illegal_transition: "当前状态不能这样变更",
  unknown_status: "未知状态",
  not_found: "记录不存在，或不属于当前工作区",
  denied: "操作被拒绝",
};

/**
 * 合同 (incr/0076, L4 批一) 的违规码。planContract / planContractLine /
 * service.ts 合同段能发出的每一个码都在这里 (reachable-codes.test.ts 静态核对)。
 */
export const CONTRACT_ERROR: Record<string, string> = {
  ...GATE_ERROR,
  contract_no_required: "合同必须有编号",
  contract_no_too_long: "合同编号过长（最多 64 个字符）",
  contract_no_taken: "这个合同编号已经登记过了",
  name_required: "合同必须有名称",
  name_too_long: "合同名称过长",
  unknown_status: "未知的合同状态",
  notice_out_of_range: "通知期必须是 0 到 365 之间的整天数",
  amount_negative: "金额不能为负",
  term_inverted: "到期日早于起始日",
  term_required: "生效中的合同必须写明起止日期——没有到期日，续约窗口永远扫不到它",
  frozen_field: "合同编号、客户、来源商机和明细的产品在登记后不能改",
  illegal_transition: "已终止的合同不能重新打开，生效中的合同不能退回草稿",
  currency_mismatch: "合同已有明细，不能再改币种",
  contract_closed: "已终止的合同不再接受修改",
  product_required: "明细必须选择产品",
  quantity_not_positive: "数量必须大于零",
  line_outside_term: "明细的到期日必须落在合同期限之内",
  // L4 批二 (incr/0078)
  already_renewed: "这份合同已经续约过了——一份合同只能续约一次",
  contract_not_renewable: "只有生效中的合同能续约；草稿合同没有续约结果可记",
  renewal_before_original: "续约合同的起始日不能早于原合同",
  unknown_event_type: "未知的续约结果",
  reason_required: "请写明原因——没有原因的结果记录审计不了任何事",
  reason_too_long: "原因过长（最多 255 个字符）",
  invalid_date: "日期格式不对",
  not_found: "记录不存在，或不属于当前工作区",
  unknown: "合同读取失败，请稍后重试",
};

export const ACCOUNT_ERROR: Record<string, string> = {
  ...GATE_ERROR,
  plan_required:
    "战略客户必须配计划——节奏规则读的是它，没有计划这次定级什么都不改变",
  period_required: "计划必须写明周期",
  cadence_positive: "零天的节奏不是节奏",
  unknown_tier: "未知的客户分级",
  not_found: "客户不存在，或不属于当前工作区",
  parent_self: "上级公司不能是它自己",
  parent_not_found: "选的上级公司不存在，或不属于当前工作区",
  parent_cycle: "这样设置会形成循环归属——比如两家公司互为对方的上级",
  // 联系人排序四元组 (incr/0073) - 跟其他可排序词表共用同一对措辞。
  move_at_edge: "已经在这一端了",
  not_movable: "这一条不能移动",
  // 基础信息表单 (owner, 2026-09-20)。
  name_required: "客户名称不能为空",
  province_unknown: "不是有效的省级行政区划",
  employee_count_invalid: "员工数必须是不小于 0 的整数",
  account_not_empty: "这家客户已经有业务记录了，只能删除建错、还没用过的空壳客户",
  credit_code_taken: "这个统一社会信用代码已经是另一家客户的——同一家企业不建两份档案，先在客户列表里搜一下",
  // 关联联系人 / 关联协作人 (owner, 2026-09-20)。
  already_linked: "这个人不存在，或已经是这个客户的联系人",
  member_required: "请先选一位同事",
};

export const ACCOUNT_PARENT_TEXT = {
  label: "上级公司",
  none: "无上级公司",
  change: "应用",
  // 只读的单位信息卡片上不再有"+关联上级公司"这个空态 CTA (owner, 2026-09-20:
  // 死死记住设计文件 - mockup 原话在 scratchpad/account-detail-v2-wrapped.html
  // 里说得很清楚: "the whole row (and its own change-button) is absent...a
  // dossier card states facts, it does not carry an empty-state CTA for every
  // fact that could exist"). 之前留了一个"轻量的关联入口"是没查 mockup 文件
  // 凭印象判断的结果 - 真实的编辑入口一直都在, 就是"编辑单位信息"抽屉
  // (account-basics-form.tsx), 这里的 sectionTitle/field/change 现在是
  // org-relations-editor.tsx 里那张内嵌"上下级关联"卡的文案。
  sectionTitle: "上下级关联",
  dialogWhy: "选一个上级公司；不能选它自己或它的下级。",
  field: "上级公司",
  submit: "确定",
  cancel: "取消",
  done: (name: string) => `已设置上级公司为「${name}」`,
  doneNone: "已清除上级公司",
  // 下级单位增删 (owner, 2026-09-20: mockup 编辑单位信息 - "+关联下级单位").
  // 同一条 setAccountParent 动词, 只是这次改的是"另一家公司自己的上级公司"
  // 这一格, 不是这家公司自己的 - 从"编辑单位信息"抽屉发起, 落到那一行。
  // 计数文案复用 ACCOUNT_TEXT.orgUnitChildren, 不在这里重复一份。
  addChild: "+ 关联下级单位",
  addChildTitle: "关联下级单位",
  addChildWhy: "选一家公司，把它的上级公司设为这家客户；不能选它自己或它的上级。",
  addChildField: "下级单位",
  addChildPick: "选择一家公司",
  removeChild: "移除",
  removeChildVerb: "移除",
  removeChildConsequence: "只是解除这条上下级关系，两家客户各自的记录都不会被删除。",
};

/**
 * 信号与线索的行操作。
 *
 * `signal-queue` 与 `lead-list` 此前对失败**毫无反应**——`.then` 只处理成功分支，
 * 用户点了「转商机」失败，界面一动不动。比裸码更糟的一类（TD-010 巡检发现）。
 */
export const RENEWAL_ERROR: Record<string, string> = {
  // incr/0034 - the deal entry gate. Both are refused by planNewOpportunity
  // and by the database, so both can reach a person.
  owner_required: "商机必须有负责人",
  requirement_required: "商机必须写清客户要什么",
  ...GATE_ERROR,
  renewal_not_due: "这个项目现在不该续约——页面可能已经过时，刷新后再看",
  name_required: "商机需要名称",
  account_required: "商机必须挂在客户下",
  amount_negative: "金额不能为负",
  not_found: "项目不存在，或不属于当前工作区",
};

export const FORECAST_RULE_ERROR: Record<string, string> = {
  ...GATE_ERROR,
  category_reason_required: "把类别调得比规则建议更乐观，需要写一句理由",
  // Shares updateCommercialTerms with the deal page, so its codes are
  // reachable in principle; this surface never sends a budget.
  customer_budget_negative: "客户项目总投入不能为负",
  category_settled: "已成交或已判负的生意，档位由阶段定死，改不了",
  category_already_agrees: "这单已经就在规则建议的档位上",
  closed_requires_terminal_stage: "生意还没结束，不能归到已成交",
  terminal_requires_closed: "已结束的生意只能归在已成交",
  unknown_forecast_category: "未知的预测档位",
  empty_patch: "没有任何改动",
  not_found: "生意不存在，或不属于当前工作区",
  // 这三条本页的按钮送不出来——它只送 forecastCategory。但守卫按动词算可达性，
  // 而 updateCommercialTerms 确实会吐它们：哪天有人往这次调用里加一个字段，
  // 缺的就是句子而不是防线。这正是那道守卫存在的理由，所以照它说的补。
  probability_range: "赢率必须是 0 到 100 之间的整数",
  terminal_probability_fixed: "已关闭的商机赢率固定，不能修改",
  amount_negative: "金额不能为负",
};

export const AUTONOMY_ERROR: Record<string, string> = {
  ...GATE_ERROR,
  unknown_autonomy_mode: "未知的授权档位",
};

export const SIGNAL_ACTION_ERROR: Record<string, string> = {
  ...GATE_ERROR,
  not_found: "记录不存在，或不属于当前工作区",
  illegal_transition: "当前状态不能这样变更",
  unknown_status: "未知状态",
  signal_closed: "信号已关闭，不能再操作",
  score_required: "先评分，才能推进",
  company_required: "信号必须先关联公司",
  unknown_signal_type: "未知的信号类型",
  account_required: "转商机必须先匹配客户",
  conversion_incomplete: "转化信息不完整",
  lead_converted: "这条线索已经转成商机了",
  lead_not_qualified: "线索还没有通过资格判定",
  owner_required: "分派必须指到具体的人",
  signal_resolved: "这条信号已经判过了，不能再改匹配的客户",
  unknown_stage: "未知的漏斗环节",
  outcome_not_of_stage: "这个结局不属于该环节",
  unknown_reason: "未知的结束原因",
  note_required: "选了「其他」就必须写清楚发生了什么",
  decider_required: "结束记录需要写明是谁决定的",
  lead_unowned: "这条线索还没有归属，先分派给人再判定",
};

/** 参谋提案的裁决。`proposal-queue` 此前对失败毫无反应。 */
export const PROPOSAL_ERROR: Record<string, string> = {
  exit_unmet_reason_required: "本阶段还有退出条件未满足，请在商机页推进并写明理由",
  // Accepting a 证据抽取 proposal writes an evidence version (deal batch 4b).
  evidence_citation_foreign: "这条提案引用的不是本单的跟进，不予写入",
  evidence_slot_unknown: "提案给出的证据项不存在",
  evidence_too_long: "提案内容超过 2000 字，不予写入",
  // 4c: a role / stance or a promise from 证据抽取.
  contact_not_on_account: "提案里的人不在这家客户的联系人里，不予写入",
  unknown_decision_role: "提案给出的角色不存在",
  unknown_stance: "提案给出的立场不存在",
  influence_range: "影响力要在 0 到 100 之间",
  statement_required: "提案没有说清承诺了什么",
  unknown_direction: "提案没有说清是谁的承诺",
  // A proposal that moves a deal runs the stage machine (YC-065 R6).
  abandoned_closed: "这一单已放弃,提案不能推进它;请先重开",
  exit_reason_required: "把商机改成丢单需要原因,提案里没有,请在商机页操作",
  exit_reason_invalid: "提案给出的丢单原因不适用",
  exit_note_required: "选「其他」时请写一句具体原因",
  ...GATE_ERROR,
  /* incr/0035 CHECK-constrains this column, so an unknown province fails at
     the database with an error nobody can act on. Said in the product's own
     terms instead, naming what the value has to be. */
  province_unknown: "省份必须是全国 34 个省级行政区之一，请从列表中选择",
  /* incr/0040 的同一件事：行业也是词表了，写进来的值必须是本工作区已有的一条。
     code_required / name_required 跟着行业词表的规则一起到达这条路径。 */
  industry_unknown: "这不是本工作区的行业，先在行业分类里加上",
  code_required: "行业代码不能为空",
  name_required: "行业名称不能为空",
  not_found: "提案不存在，或不属于当前工作区",
  not_pending: "这条提案已经被裁决过了",
  decider_required: "接受提案必须落到一个具体的人",

  // 自 2026-09-01 起，采纳会真实执行业务动作，于是商机域的拒绝理由也会走到这里来。
  // 这些句子不是复制过来的装饰：读到它们的人刚刚点了「采纳」，需要知道自己签了字
  // 而事情没有发生，以及为什么。
  human_decision_required: "这条提案需要人来决定，当前授权不允许自动执行",
  already_decided: "这条提案已被别人处理，你的操作没有生效",
  not_executable: "这条提案的状态无法执行（已执行、已失败或已过期）",
  accepted_without_decider: "这条提案没有签字人，拒绝执行一份没人负责的批准",
  not_executable_type: "系统还不会执行这种类型的动作，已标记为失败",
  subject_mismatch: "提案的动作与对象对不上，不予执行",
  payload_invalid: "提案没有说清楚要改成什么，不予执行",

  // 商机阶段机的拒绝，原样转达而不改写——同一条规则在商机页说的是同一句话。
  note_required: "跟进记录必须写清楚发生了什么",
  occurred_in_future: "跟进不能发生在未来",
  unknown_channel: "未知的跟进方式",
  stage_unchanged: "商机已经在这个阶段了，重复推进不会记入轨迹",
  reason_required: "回退或重开商机必须写明原因",
  terminal_probability_fixed: "已关闭的商机不再调整赢率",
  probability_range: "赢率是 0 到 100 之间的整数",
  closed_requires_terminal_stage: "预测归入「已结案」必须配已关闭的阶段",
  terminal_requires_closed: "赢单/丢单必须同时落下结案时间",
  terminal_stage: "商机已经关闭，重开会改写已上报的结果，需要明确的重开意图",
  unknown_stage: "提案给出的阶段不存在",
  unknown_forecast_category: "提案给出的预测分类不存在",
  // 助手补齐客户信息时的拒绝理由（2026-09-01）。payload 是模型写的 JSON，
  // 所以字段名和值都要在这一层被挡住，而不是让列锁在数据库上抛 500。
  field_not_fillable: "这个字段不在助手可填写的范围内",
  value_required: "填写需要一个值——空白不是填写",
  nothing_to_ask: "这条记录没有需要问助手的缺口",
  // 模型面的三种拒绝。它们第一次能走到客户页上，是因为这一页现在会花一次 turn。
  no_active_tenant: "当前会话没有租户，模型面无法调用",
  tenant_required: "当前会话没有租户，模型面无法调用",
  empty_question: "没有可问的内容",
  turn_failed: "助手这次没能答上来——可以稍后再试；这条记录没有任何改动",
  quota_exceeded: "本工作区的参谋对话轮次配额已用完",
};

/** 复盘记录。`pending-reviews` 此前把裸 code 当句子显示。 */
export const REVIEW_ERROR: Record<string, string> = {
  // 0039: the reason is a vocabulary row now, so a review can fail on the row
  // rather than on the deal.
  reason_not_found: "找不到这个原因，可能刚被删掉，刷新后重选",
  reason_in_use: "已有复盘引用这条原因，不能删除——复盘记录的是当时的结论",
  move_at_edge: "已经在这一端了",
  not_movable: "这一条不能移动",
  reason_wrong_outcome: "这个原因不适用于当前结果（赢/丢）",
  code_required: "原因代码不能为空",
  name_required: "原因名称不能为空",
  outcome_required: "至少要选一种适用结果：赢、丢，或两者",

  ...GATE_ERROR,
  not_found: "商机不存在，或不属于当前工作区",
  not_closed: "只有已关闭的商机才能复盘——过程未定，结论还不存在",
};

/** 行业分类的写入回执 (0040)。与目录词表同一套说法。 */
export const INDUSTRY_ERROR: Record<string, string> = {
  ...GATE_ERROR,
  code_required: "行业代码不能为空",
  name_required: "行业名称不能为空",
  industry_in_use: "还有客户归在这个行业下，先把他们改到别处",
  industry_unknown: "这不是本工作区的行业，先在行业分类里加上",
  move_at_edge: "已经在这一端了",
  not_movable: "这一条不能移动",
  not_found: "找不到这个行业，可能刚被删掉，刷新后重试",
};

/** 商机阶段目录的写入回执 (incr/0057-0059)。 */
export const STAGE_ERROR: Record<string, string> = {
  ...GATE_ERROR,
  code_required: "阶段代码不能为空",
  name_required: "阶段名称不能为空",
  probability_range: "默认赢率必须是 0-100 之间的整数",
  won_must_be_terminal: "赢单阶段必须是终态",
  won_probability_fixed: "赢单阶段的默认赢率固定为 100%",
  lost_probability_fixed: "终态、非赢单阶段的默认赢率固定为 0%",
  stage_in_use: "还有商机停在这个阶段，先把它们移到别处",
  last_won_stage: "工作区至少要保留一个赢单阶段",
  last_lost_stage: "工作区至少要保留一个非赢单的终态阶段",
  move_at_edge: "已经在这一端了",
  not_movable: "这一条不能移动",
  not_found: "找不到这个阶段，可能刚被删掉，刷新后重试",
};

/** 签约类型目录的写入回执 (incr/0067)。 */
export const CONTRACT_TYPE_ERROR: Record<string, string> = {
  ...GATE_ERROR,
  code_required: "类型代码不能为空",
  name_required: "类型名称不能为空",
  contract_type_in_use: "还有商机归在这个签约类型下，先把它们改到别处",
  move_at_edge: "已经在这一端了",
  not_movable: "这一条不能移动",
  not_found: "找不到这个签约类型，可能刚被删掉，刷新后重试",
};

/** 业务形态目录的写入回执 (incr/0067)。 */
export const BUSINESS_FORM_ERROR: Record<string, string> = {
  ...GATE_ERROR,
  code_required: "形态代码不能为空",
  name_required: "形态名称不能为空",
  business_form_in_use: "还有商机归在这个业务形态下，先把它们改到别处",
  move_at_edge: "已经在这一端了",
  not_movable: "这一条不能移动",
  not_found: "找不到这个业务形态，可能刚被删掉，刷新后重试",
  stall_override_out_of_range: "停滞天数要在 1 到 365 天之间",
};

/** 预测阈值的回执 (0041)。 */
export const FORECAST_PARAM_ERROR: Record<string, string> = {
  ...GATE_ERROR,
  commit_out_of_range: "承诺阈值要在 1 到 100 之间",
  best_case_out_of_range: "最好情况阈值要在 1 到 100 之间",
  bands_cross: "最好情况要低于承诺，否则两档分不开",
  stall_out_of_range: "停滞天数要在 1 到 365 天之间",
};

export const FORECAST_PARAM_TEXT = {
  title: "预测阈值",
  why: "概率到多少算承诺、算最好情况，以及停多久算停滞。",
  ladder: (best: number, commit: number) => `最好情况 ${best}% · 承诺 ${commit}%`,
  save: "保存",
  discard: "放弃",
  saved: "已保存，预测口径页立即按新阈值给建议",
  percent: "%",
  days: "天",
  thresholdsLabel: "最好情况 / 承诺起算（概率）",
  thresholdsHint: "最好情况必须低于承诺，两个都是 1 到 100 之间的整数百分比。",
  commitLabel: "承诺起算",
  bestCaseLabel: "最好情况起算",
  stallLabel: "停滞天数",
  stallHint: "在同一阶段停这么久，建议下调一档。这不是「多久没联系客户」——那是另一把尺子，在「提醒阈值」页单独配置。业务形态也可以单独设置停滞天数，覆盖这里的默认值。",
};

/** `SUPPORTED_CURRENCIES` (catalog/lib/pricing-policy.ts) 的显示名，同一组
 *  代码作 key - 域层只认代码，名字是这里的事。 */
export const CURRENCY_LABEL: Record<string, string> = {
  CNY: "人民币",
  USD: "美元",
  HKD: "港币",
  TWD: "新台币",
};

/** 同一组代码的符号 - 不是中文，en 字典原样复用这份值。 */
export const CURRENCY_SYMBOL: Record<string, string> = {
  CNY: "¥",
  USD: "$",
  HKD: "HK$",
  TWD: "NT$",
};

/** 计价规则的回执 (0044)。 */
export const PRICING_ERROR: Record<string, string> = {
  ...GATE_ERROR,
  currency_invalid: "币种只能是人民币、美元、港币、新台币之一",
};

export const PRICING_TEXT = {
  title: "计价货币",
  why: "报价、价目与汇总默认按哪个币种。行上另有币种时以行为准。",
  save: "保存",
  discard: "放弃",
  saved: "已保存，之后新建的商机与报价行按新币种计",
  currencyLabel: "默认币种",
  currencyHint: "已有的价目与商机不改，只影响之后新写的。",
};

/** 账龄分档的回执 (0042)。 */
export const AGEING_ERROR: Record<string, string> = {
  ...GATE_ERROR,
  cutoff_count: "分档点要有 1 到 5 个",
  cutoff_range: "分档点是整天数，1 到 3650 之间",
  cutoffs_unordered: "分档点必须从小到大，否则两档会抢同一天",
};

export const AGEING_TEXT = {
  title: "账龄分档",
  why: "逾期多少天切一档。未到期和未填到期日永远单独成档。",
  bandCount: (n: number) => `${n} 个逾期档`,
  save: "保存",
  discard: "放弃",
  saved: "已保存，回款页的账龄图立即按新分档来切",
  cutoffsLabel: "分档点（天）",
  cutoffsHint: "从小到大的整数天数，1 到 3650 之间，最多 5 个。",
  cutoffAdd: "加一档",
  cutoffRemove: "删除",
  bandPlaceholder: "—",
  confirmAdd: (days: number) => `添加 ${days} 天的分档点？`,
  confirmRemove: (days: string) => `删除 ${days} 天的分档点？`,
  confirmYes: "确认",
  confirmNo: "取消",
};

/** 联系提醒阈值的回执 (0065)。 */
export const CONTACT_RECENCY_ERROR: Record<string, string> = {
  ...GATE_ERROR,
  quiet_out_of_range: "多久算轻度沉默是 1 到 365 之间的整数天",
  stale_out_of_range: "多久算严重停滞是 1 到 365 之间的整数天",
  recency_bands_cross: "严重停滞的天数必须大于轻度沉默，否则轻度沉默永远升不了级",
  chain_warm_out_of_range: "决策链温度窗口是 1 到 365 之间的整数天",
};

export const CONTACT_RECENCY_TEXT = {
  title: "联系提醒阈值",
  why: "多久算轻度沉默、多久算严重停滞，以及决策链联系人多久没接触算冷。",
  save: "保存",
  discard: "放弃",
  saved: "已保存，首页判断流与决策链温度立即按新阈值来算",
  days: "天",
  quietLabel: "轻度沉默",
  quietHint: "开放商机超过这么久没跟进记录，首页出现一张较轻的提醒卡。",
  staleLabel: "严重停滞",
  staleHint: "超过这么久，轻度沉默卡升级；叠加对方逾期承诺时单独出现一张更重的卡。必须大于轻度沉默天数。",
  chainWarmLabel: "决策链温度窗口",
  chainWarmHint: "决策链联系人超过这么久没有记录跟进，判定为冷。",
};

/** 续约提醒窗口的回执 (0066)。 */
export const RENEWAL_POLICY_ERROR: Record<string, string> = {
  ...GATE_ERROR,
  window_out_of_range: "提前预警天数是 1 到 365 之间的整数天",
};

export const RENEWAL_POLICY_TEXT = {
  title: "续约提醒窗口",
  why: "合同到期前提前多少天，续约候选开始出现在续约页。",
  save: "保存",
  discard: "放弃",
  saved: "已保存，续约页立即按新窗口来算",
  days: "天",
  windowLabel: "提前预警天数",
  windowHint: "合同到期日往前数这么多天，开始出现在续约候选里。已到期的合同永远算数，不受这个窗口限制。",
};

export const INDUSTRY_TEXT = {
  // 行业分类的配置面 (0040)。
  configTitle: "行业分类",
  noun: "行业",
  configWhy: "客户归档用的行业。有客户在用时不能删。",
  count: (n: number) => `${n} 个行业`,
  add: "新建行业",
  edit: "编辑",
  save: "保存",
  code: "行业代码",
  codeHint: "创建后不可更改。已存在的代码表示改名。",
  name: "行业名称",
  colName: "行业",
  colFiled: "客户数",
  deleteConsequence: "该行业将从客户归档中移除。归在它下面的客户不受影响——有人在用就删不掉。",
  opUp: "上移",
  opDown: "下移",
  opDelete: "删除",
};

/** 客户类型目录的写入回执 (incr/0071)。 */
export const CUSTOMER_TYPE_ERROR: Record<string, string> = {
  ...GATE_ERROR,
  code_required: "客户类型代码不能为空",
  name_required: "客户类型名称不能为空",
  customer_type_in_use: "还有客户归在这个类型下，先把他们改到别处",
  move_at_edge: "已经在这一端了",
  not_movable: "这一条不能移动",
  not_found: "找不到这个客户类型，可能刚被删掉，刷新后重试",
};

export const CUSTOMER_TYPE_TEXT = {
  // 客户类型的配置面 (0071) - 客户分类的第二个 section。
  configTitle: "客户类型",
  noun: "类型",
  configWhy: "客户归档用的类型——直销、渠道、代理商等。有客户在用时不能删。",
  add: "新建类型",
  edit: "编辑",
  save: "保存",
  code: "类型代码",
  codeHint: "创建后不可更改。已存在的代码表示改名。",
  name: "类型名称",
  colName: "类型",
  colFiled: "客户数",
  deleteConsequence: "该类型将从客户归档中移除。归在它下面的客户不受影响——有人在用就删不掉。",
  opUp: "上移",
  opDown: "下移",
  opDelete: "删除",
};

/** 客户规模目录的写入回执 (incr/0071)。 */
export const CUSTOMER_SIZE_ERROR: Record<string, string> = {
  ...GATE_ERROR,
  code_required: "客户规模代码不能为空",
  name_required: "客户规模名称不能为空",
  customer_size_in_use: "还有客户归在这个规模下，先把他们改到别处",
  move_at_edge: "已经在这一端了",
  not_movable: "这一条不能移动",
  not_found: "找不到这个客户规模，可能刚被删掉，刷新后重试",
};

export const CUSTOMER_SIZE_TEXT = {
  // 客户规模的配置面 (0071) - 客户分类的第三个 section。不是员工数：员工数是
  // 客户自己报的头数，规模是工作区自己拿来定打法、定审批人的档位。
  configTitle: "客户规模",
  noun: "规模",
  configWhy: "客户归档用的规模档位——集团、大型、中型等。有客户在用时不能删。",
  add: "新建规模",
  edit: "编辑",
  save: "保存",
  code: "规模代码",
  codeHint: "创建后不可更改。已存在的代码表示改名。",
  name: "规模名称",
  colName: "规模",
  colFiled: "客户数",
  deleteConsequence: "该规模将从客户归档中移除。归在它下面的客户不受影响——有人在用就删不掉。",
  opUp: "上移",
  opDown: "下移",
  opDelete: "删除",
};

/** 客户性质目录的写入回执 (incr/0072)。 */
export const CUSTOMER_NATURE_ERROR: Record<string, string> = {
  ...GATE_ERROR,
  code_required: "客户性质代码不能为空",
  name_required: "客户性质名称不能为空",
  customer_nature_in_use: "还有客户归在这个性质下，先把他们改到别处",
  move_at_edge: "已经在这一端了",
  not_movable: "这一条不能移动",
  not_found: "找不到这个客户性质，可能刚被删掉，刷新后重试",
};

export const CUSTOMER_NATURE_TEXT = {
  // 客户性质的配置面 (0072) - 客户分类的第四个 section。跟客户类型（怎么卖给
  // 它）、行业（它是干什么的）都不是一回事：政府机构的采购流程、预算周期、
  // 资质要求，跟其他两个维度无关。
  configTitle: "客户性质",
  noun: "性质",
  configWhy: "客户归档用的性质——政府机构、国企、民营企业等。有客户在用时不能删。",
  add: "新建性质",
  edit: "编辑",
  save: "保存",
  code: "性质代码",
  codeHint: "创建后不可更改。已存在的代码表示改名。",
  name: "性质名称",
  colName: "性质",
  colFiled: "客户数",
  deleteConsequence: "该性质将从客户归档中移除。归在它下面的客户不受影响——有人在用就删不掉。",
  opUp: "上移",
  opDown: "下移",
  opDelete: "删除",
};

export const CATALOG_ERROR: Record<string, string> = {
  ...GATE_ERROR,
  code_required: "需要填写编码",
  name_required: "需要填写名称",
  unit_required: "需要填写单位——没有单位的数量说不出卖的是什么",
  items_required: "一个不装产品的方案只是个名字",
  all_optional: "至少留一项标配——全是可选的不是方案，是菜单",
  product_not_found: "找不到这个产品，页面可能已过期，请刷新",
  quantity_positive: "数量必须大于零",
  duplicate_product: "同一个产品出现了两次，请合并成一行",
  product_required: "需要选择产品",
  currency_required: "需要币种",
  amount_negative: "价格不能为负",
  floor_above_list: "底价高于标价会让每一笔都需要签字，等于没有底价",
  // 生命周期与排序（incr/0028）
  status_unchanged: "已经是这个状态了",
  development_is_birth_state: "在研是出生行为：只能创建时进入，之后回不去",
  product_in_use: "有报价行或方案还引用着这个产品，不能删除——请改用退役",
  move_at_edge: "已经在清单的这一端了",
  not_found: "找不到这条记录，页面可能已过期，请刷新",
  not_movable: "这一行不在可排序的清单里",
  price_in_force: "这是产品当前报价所依据的价格，不能删除——请改用重新定价",
  price_signed: "有折扣签字引用了这条价格的底价，删掉会让签字失去依据",
  // 词表（incr/0029）
  type_in_use: "还有产品挂在这个类型上，不能删除——请改用停用",
  type_not_found: "找不到这个产品类型，页面可能已过期，请刷新",
  status_not_found: "找不到这个状态，页面可能已过期，请刷新",
  born_shelved: "产品不能一出生就是已退役",
  system_status: "内置三个状态不可删除——可以改名、改描述、排序",
  status_in_use: "还有产品处于这个状态，先把它们转走",
  // 0037 计价单位
  unit_not_found: "找不到这个计价单位，页面可能已过期，请刷新",
  unit_in_use: "还有产品按这个单位计价，先把它们改成别的单位",
};

export const ROLE_LABEL: Record<string, string> = {
  sales_leader: "销售负责人",
  marketing_manager: "高级市场经理",
  sales_rep: "销售代表",
  presales: "售前顾问",
  delivery_manager: "交付经理",
  sales_ops: "高级运营经理",
  viewer: "只读成员",
  // 0021 的两级（owner 2026-09-01 裁定）。
  //
  // 「总经理」没有单独的角色码——`sales_leader` 已经持有它会持有的一切
  // （admin.manage / copilot.autopilot / strategy.approve）。两个码一套权限，
  // 是一份假装自己做了区分的目录。要org 头衔上屏，那是改这里的标签，不是加角色。
  sales_manager: "销售经理",
  regional_director: "大区销售总监",
  // 0047 - the group-scale presets. Display names come from the workspace's
  // own row since 0046; these are the fallback for a code with no row.
  executive: "高管",
  finance: "财务管理员",
  workspace_admin: "系统管理员",
  senior_sales_manager: "高级销售经理",
  regional_general_manager: "大区总经理",
  channel_manager: "渠道经理",
  senior_channel_manager: "高级渠道经理",
  senior_delivery_manager: "高级交付经理",
  senior_presales: "高级售前顾问",
  marketing_specialist: "市场专员",
  sales_ops_specialist: "运营专员",
  key_account_manager: "大客户经理",
  sdr: "商机开发代表",
  deal_desk: "商务专员",
  customer_success: "客户成功经理",
  // 0049.
  branch_general_manager: "分公司总经理",
  sales_director: "销售总监",
  channel_head: "渠道负责人",
  delivery_head: "交付负责人",
  presales_head: "售前负责人",
  marketing_head: "市场负责人",
  ops_head: "运营负责人",
};

/** 权限的中文说明。25 条，与 authz/catalog.ts 的 PERM_CODES 一一对应；
 *  catalog.test.ts 比对种子与镜像，permission-label.test.ts 比对镜像与这里。 */
export const PERMISSION_LABEL: Record<string, string> = {
  "strategy.read": "查看战略与细分市场",
  "strategy.write": "编辑战略与细分市场",
  "strategy.approve": "批准战略计划——计划由此变成承诺",
  "planning.read": "查看销售规划",
  "planning.write": "编辑销售区域与目标",
  "campaign.read": "查看营销活动",
  "campaign.write": "编辑活动与执行项",
  "account.read": "查看客户",
  "account.write": "编辑客户、联系人与关系图",
  "account.record": "记录互动与承诺——记发生了什么，不是改客户主档",
  "signal.read": "查看信号",
  "signal.triage": "信号分诊——评分、匹配、升级、判重",
  "pipeline.read": "查看商机",
  "pipeline.write": "编辑商机与推进阶段",
  "pipeline.forecast": "提交预测快照",
  "pipeline.discount": "批准低于底价的报价",
  "pipeline.opportunityConfig": "维护业务配置——签约类型、业务形态、商机阶段、赢丢原因、预测阈值、账龄分档、计价货币",
  "delivery.read": "查看交付项目",
  "delivery.write": "编辑里程碑、任务与回款计划",
  "copilot.use": "使用销售助手——发起会话与提问",
  "copilot.decide": "裁决助手提出的动作",
  "copilot.autopilot": "授权助手自主执行",
  "catalog.read": "查看产品目录、方案与价目表",
  "catalog.write": "维护产品与解决方案",
  "catalog.price": "设定标价与底价——底价决定哪些折扣需要签字",
  "admin.manage": "配置管理——成员角色与各类目录",
};

/** 数据范围的四档 (incr/0022, unit 见 incr/0052)。 */
export const SCOPE_LABEL: Record<string, string> = {
  workspace: "整个工作区",
  territory: "所辖区域",
  own: "仅自己",
  unit: "本单位",
};

export const ADMIN_PAGE_TEXT = {
  rolesTitle: "角色管理",
  rolesWhy: "九个角色，各自能做什么。只读。",
  rolesColumnRole: "角色",
  rolesColumnPerms: "权限数",
  rolesColumnMembers: "成员数",
  rolesColumnList: "持有的权限",
  rolesMembers: (n: number) => `${n} 人`,
  rolesNoMember: "暂无成员",
  permissionsTitle: "权限管理",
  permissionsWhy: "二十五条权限，各自被哪些角色持有。只读。",
  permissionsColumnCode: "权限码",
  permissionsColumnName: "说明",
  permissionsColumnRoles: "持有的角色",
  permissionsNoRole: "无角色持有",
  permissionsCount: (perms: number, roles: number, grants: number) =>
    `${perms} 条权限 · ${roles} 个角色 · ${grants} 条授权`,
  scopeTitle: "数据范围",
  scopeWhy: "谁能看到哪些数据。范围在成员管理里改。",
  scopeColumnMember: "成员",
  scopeColumnScope: "范围",
  scopeColumnDetail: "覆盖",
  scopeTerritories: (n: number) => `${n} 个区域`,
  // 精简 (owner, 表格列宽新一轮规则: 零值/警示文案要简化，大面积重复文字要
  // 弱化 - 这条本来是整句塞进一个醒目 warning 徽章; tone="warning" 的强调
  // 保留，只是文字本身缩到跟徽章配的短语)。
  scopeNoTerritory: "未指定区域",
  scopeCount: (n: number) => `${n} 位成员`,
  // 待迁路由 (owner, 2026-09-11: 盘点所有未在页面体现的路由) - a holding
  // list, not a table: every page导航和站内都没有入口，只能靠手打 URL 到达
  // 的，先记在这里，等对应的功能整体处理时再决定去留。
  pendingMigrationTitle: "待迁路由",
  pendingMigrationWhy: "全应用没有任何导航或站内链接指向的页面 - 代码还在，先记在这里，等各自的功能整体处理时再决定去留。",
  pendingMigrationCount: (n: number) => `${n} 条`,
  pendingMigrationEmpty: "目前没有找到孤儿路由。",
  pendingMigrationAccountComplete: "客户资料批量补全 - 功能完整，代码库里没有任何入口指向它",
} as const;

export const MEMBER_TEXT = {
  title: "组织管理",
  description: "谁在哪个单位，各自的关联区域、数据范围与角色。",
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
  // 人员更替（2026-09-01 裁定）。平台决定谁能用、有多少席位；产品决定启用/停用，
  // 以及历史怎么留。
  columnLifecycle: "在岗状态",
  inactive: "已停用",
  inactiveHint:
    "已离岗。这一行永久保留——审计记录里的签字人靠它才认得出是谁，删掉不会破外键，只会让签名变成一串没人认识的 id。",
  deactivate: "停用",
  deactivateHint: "收回全部角色并标记为已停用。这一行不会被删除。",
  reactivate: "恢复在岗",
  reactivateHint: "只恢复在岗状态，不恢复任何角色——角色需要重新授予一次。",
  /** 邀请是平台的事：席位和谁能登录都由平台决定，这里只能跳出去。 */
  invite: "邀请成员",
  // 转交。只对已停用的成员出现——在岗成员的记录换负责人，是在各自页面上一条条做的
  // 决定，不该被批量扫过去。
  handoverTo: "转交给",
  handover: "转交",
  handoverHint:
    "把在办的客户、商机、线索转给这个人。已成交/已丢单的商机不动（那是谁打赢的，属于历史），销售目标和预测快照也不动（目标是给具体人定的，快照是当天说过的话）。",
  handoverDone: (accounts: number, deals: number, leads: number) =>
    `已转交：客户 ${accounts}、商机 ${deals}、线索 ${leads}。`,
  handoverPartial: (skipped: number) =>
    `其中 ${skipped} 条未能转交，规则拒绝了它们。`,
  // 数据范围（incr/0022，owner 2026-09-01 裁定）。决定权在主管理员，不在角色。
  // 所属单位（incr/0051；0053 起一人可在多个单位）。组织架构页维护单位本身。
  columnUnit: "所属单位",
  unitNone: "未归属",
  // 两个视图（owner 2026-09-10：清单视图、组织视图；组织视图只显示主名称）。
  viewAria: "视图",
  viewList: "清单视图",
  viewOrg: "组织视图",
  orgHeadcount: (n: number) => `${n} 人`,
  orgNoMembers: "暂无成员",
  orgUnplaced: "未归属单位",
  orgUnplacedWhy: "还没有归入任何单位的成员。到成员配置里勾选单位。",
  // 组织视图是树状表，各单位行内可添加、移出成员（owner 2026-09-10）。
  // 展开到 Ln (owner, 2026-09-12: 参考权限策略的展开到【模块】【页面】模式) -
  // 全部展开/全部收起两个按钮换成按层级展开，深度不是固定几档，所以是函数
  // 不是词表，见 org-unit-icon.ts 同一批改动的 ORG_TEXT.levelLabel。
  orgExpandTo: "展开到",
  orgLevelLabel: (depth: number) => `L${depth}`,
  orgCollapseAll: "全部收起",
  orgColUnit: "单位",
  orgColMembers: "成员",
  orgAdd: "添加成员",
  orgAddTitle: (unit: string) => `把成员加入「${unit}」`,
  orgAddWhy: "勾选要加入本单位的在岗成员。一人可同时在多个单位。",
  orgAddNone: "在岗成员都已在本单位里。",
  orgRemove: "移出成员",
  orgRemoveTitle: (unit: string) => `从「${unit}」移出成员`,
  orgRemoveWhy: "勾选要移出本单位的成员。只解除与本单位的归属，其他单位不受影响。",
  orgConfirm: "确认",
  // 人各一行（owner 2026-09-10）：成员行的操作，与工具行右侧的添加成员。
  orgColName: "名称",
  // 列（owner 2026-09-10）：选择｜序号｜名称｜关联区域｜数据范围｜角色｜操作。
  orgColTerritories: "关联区域",
  orgColScope: "数据范围",
  orgTerritoriesNone: "无区域",
  // 多选后的表头操作行：移除原单位、移动到单位、复用到单位。
  // 已停用人员单独一表，在组织之下，默认收起（owner 2026-09-10）。
  orgInactiveTitle: (n: number) => `已停用人员 · ${n} 人`,
  orgInactiveWhy: "已离岗的人不再出现在组织树里。行永久保留；恢复在岗后角色需重新授予。",
  orgSelectionNoun: "人",
  orgClearSelection: "取消选择",
  orgBulkRemove: "移除原单位",
  orgBulkRemoveTarget: (n: number) => `选中的 ${n} 人（各自所在单位）`,
  orgBulkRemoveWhy: "只解除这些人与所选行所在单位的归属；其他单位和角色不受影响。",
  orgBulkMove: "移动到单位",
  orgBulkMoveTitle: (n: number) => `把选中的 ${n} 人移动到`,
  orgBulkMoveWhy: "各自从所选行所在的单位移到目标单位；其他单位不变。",
  orgBulkCopy: "复用到单位",
  orgBulkCopyTitle: (n: number) => `把选中的 ${n} 人复用到`,
  orgBulkCopyWhy: "在保留现有归属的前提下，再加入目标单位（一人多单位）。",
  orgBulkDone: (n: number, unit: string) => `已处理 ${n} 人：${unit}。`,
  orgBulkRemoved: (n: number) => `已把 ${n} 人移出原单位。`,
  orgExpand: (name: string) => `展开 ${name}`,
  orgCollapse: (name: string) => `收起 ${name}`,
  orgTargetUnit: "目标单位",
  orgPickUnit: "选择单位",
  orgMoveTo: "移动到单位",
  orgMoveTitle: (name: string, from: string) => `把 ${name} 从「${from}」移到`,
  orgMoveWhy: "只改这一条归属；此人在其他单位的归属不变。",
  orgAddTo: "添加到单位",
  orgAddToTitle: (name: string) => `把 ${name} 添加到更多单位`,
  orgAddToWhy: "勾选要加入的单位，可多选；此人已在的单位保持不变。也可同时授予新角色。",
  orgAddToRoles: "同时授予角色",
  orgAddToNoUnit: "已在所有单位里。",
  orgRemoveOne: "移出本单位",
  orgRemoveOneTarget: (name: string, unit: string) => `「${name}」从「${unit}」`,
  orgRemoveOneWhy: "只解除与本单位的归属，其他单位和角色不受影响。",
  orgMoved: (name: string, unit: string) => `已把 ${name} 移到「${unit}」。`,
  orgAddedTo: (name: string, units: number, roles: number) => `已把 ${name} 添加到 ${units} 个单位${roles > 0 ? `，授予 ${roles} 个角色` : ""}。`,
  orgRemovedOne: (name: string, unit: string) => `已把 ${name} 从「${unit}」移出。`,
  orgPlaced: (n: number, unit: string) => `已把 ${n} 人加入「${unit}」。`,
  orgRemoved: (n: number, unit: string) => `已从「${unit}」移出 ${n} 人。`,
  columnScope: "可见范围",
  scopeTerritory: "选择销售区域",
  scopeLabels: {
    workspace: "全工作区",
    territory: "本区域",
    own: "仅本人",
    // 按组织（incr/0052）：本单位子树成员持有的，加子树区域覆盖的客户。
    unit: "本单位",
  } as Record<string, string>,
  // 精简 (owner, 表格列宽新一轮规则)：warning 语气（text-warning）保留，
  // 文字缩短，不带后半句的推论。
  scopeUnitUnplaced: "未归属单位",
  // 展示页 / 配置页分离（owner, 2026-09-10：展示信息和编辑、新建混合在一个页面，大bug）。
  noun: "成员",
  count: (active: number, inactive: number) => `${active} 人在岗${inactive > 0 ? ` · ${inactive} 人已停用` : ""}`,
  active: "在岗",
  detailsTitle: (name: string) => `${name} · 成员详情`,
  detailsDone: "关闭",
  detailsEdit: "编辑成员",
  territoriesNone: "还没有勾选销售区域。",
  deactivateMenu: "停用成员",
  deactivateTarget: (name: string) => `「${name}」`,
  handoverMenu: "转交客户",
  handoverTitle: (name: string) => `转交 ${name} 的客户`,
  handoverConfirm: "确认转交",
  handoverNoHeir: "没有其他在岗成员可以接收。",
  destructiveTitle: "{verb}{target}？",
  cancel: "取消",
  formTitle: "成员设置",
  formWhy: "角色、所属单位与可见范围。",
  rolesField: "角色",
  rolesHint: "勾选这个成员持有的角色；权限随角色而来。",
  rolesNone: "工作区还没有角色。先到角色管理里建一个。",
  unitField: "所属单位",
  unitConfigure: "配置",
  unitsHint: "可勾选多个单位；一人可同时归入多个单位，本单位范围按各单位的子树合并。",
  unitsNone: "组织架构里还没有单位。先到组织架构里建一个。",
  scopeField: "可见范围",
  territoriesField: "销售区域",
  territoriesHint: "本区域范围：勾选能看到的区域，含其下级区域。",
  save: "保存成员",
  discard: "放弃",
  saveFailed: "保存失败",
} as const;

export const MEMBER_ERROR: Record<string, string> = {
  ...GATE_ERROR,
  last_admin: "这是工作区最后一位管理员；移除后将无人能再分配角色",
  unknown_role: "角色不在目录中",
  sub_required: "请选择成员",
  not_found: "该成员不属于当前工作区",
  permission_denied: "你没有管理成员角色的权限",
  no_data_access: "当前工作区无权访问",
  // 所属单位（incr/0051）。
  unit_unknown: "这个单位不存在，可能刚被删掉，刷新后重试",

  // 转交带来的拒绝理由。域规则会逐条拒，这些句子是它们在成员页上的读法——
  // 而不是把裸 code 丢给读的人（TD-010）。
  same_owner: "转出和转入是同一个人",
  owner_required: "转交需要指定一个接收人",
  recipient_not_a_member: "接收人不是这个工作区的成员",
  recipient_inactive:
    "接收人自己也已停用——转过去只会让这些工作对第二个人也不可见",
  lead_converted: "这条线索已经转成商机，商机上已经有负责人了",
  empty_patch: "没有需要改动的内容",
  amount_negative: "金额不能小于零",
  probability_range: "赢率是 0 到 100 之间的整数",
  terminal_probability_fixed: "已关闭的商机不再调整赢率",
  terminal_requires_closed: "赢单/丢单必须同时落下结案时间",
  closed_requires_terminal_stage: "预测归入「已结案」必须配已关闭的阶段",
  unknown_forecast_category: "这条商机的预测分类不在目录中",
  unknown_scope: "未知的可见范围",
  territory_required: "本区域范围至少要勾选一个销售区域",
};

// 客户信息补齐（2026-09-01 owner 提出）。分两组，因为它们的代价不同：
// 数据已经知道的（免费、确定、一键），和只有模型能答的（一次 turn，走提案队列）。
export const COMPLETENESS_ERROR: Record<string, string> = {
  ...GATE_ERROR,
  /* incr/0035 CHECK-constrains this column, so an unknown province fails at
     the database with an error nobody can act on. Said in the product's own
     terms instead, naming what the value has to be. */
  province_unknown: "省份必须是全国 34 个省级行政区之一，请从列表中选择",
  /* incr/0040 的同一件事：行业也是词表了，写进来的值必须是本工作区已有的一条。
     code_required / name_required 跟着行业词表的规则一起到达这条路径。 */
  industry_unknown: "这不是本工作区的行业，先在行业分类里加上",
  code_required: "行业代码不能为空",
  name_required: "行业名称不能为空",
  not_found: "这条客户记录不存在，或不属于当前工作区",
  field_not_fillable: "这个字段不在助手可填写的范围内",
  value_required: "填写需要一个值——空白不是填写",
  nothing_to_ask: "这条记录没有需要问助手的缺口",
  // 模型面的三种拒绝。它们第一次能走到客户页上，是因为这一页现在会花一次 turn。
  no_active_tenant: "当前会话没有租户，模型面无法调用",
  tenant_required: "当前会话没有租户，模型面无法调用",
  empty_question: "没有可问的内容",
  turn_failed: "助手这次没能答上来——可以稍后再试；这条记录没有任何改动",
  quota_exceeded: "本工作区的参谋对话轮次配额已用完",
};

export const COMPLETENESS_TEXT = {
  title: "这份客户资料还缺什么",
  description:
    "缺的信息分两种：本工作区的数据已经能推出来的，和需要问助手的。推出来的会写明依据——一次说不出来路的填写，等于机器替你在客户档案上签字。",
  fill: "填入",
  fields: {
    province: "所在省份",
    region: "所在区域",
    industry: "行业",
    segmentCode: "细分市场",
    ownerSub: "负责人",
  } as Record<string, string>,
  askable: (fields: string) =>
    `${fields} 数据里推不出来——这类是关于这家公司本身的事实，交给助手去查，它会作为提案进入待裁决队列，采纳后才写入。`,
  ask: "让助手去查",
  askedNote:
    "已经问了助手。它的答案会作为提案进入待裁决队列——采纳之后才写进这条记录。",
  /** 字段名的连接符。标点也是文案，中英文不同，所以不留在组件里（TD-002）。 */
  joinFields: (fields: readonly string[]) => fields.join("、"),
  notFilled: (field: string) => `${field} 未填写`,
  goFill: "去填写",
  structuralFix: "去区域规划 →",
  structuralFixHref: { regionUnplaced: "/planning" } as Record<string, string>,
  structural: {
    regionUnplaced:
      "这个区域没有被任何销售区域覆盖（未分区）。资料本身是填好的，但因为没人认领这块地，这家客户对所有区域成员都可见——修的是区域划分，不是这条记录。",
  } as Record<string, string>,
} as const;

export const BATCH_COMPLETE_ERROR: Record<string, string> = {
  ...GATE_ERROR,
  /* incr/0035 CHECK-constrains this column, so an unknown province fails at
     the database with an error nobody can act on. Said in the product's own
     terms instead, naming what the value has to be. */
  province_unknown: "省份必须是全国 34 个省级行政区之一，请从列表中选择",
  /* incr/0040 的同一件事：行业也是词表了，写进来的值必须是本工作区已有的一条。
     code_required / name_required 跟着行业词表的规则一起到达这条路径。 */
  industry_unknown: "这不是本工作区的行业，先在行业分类里加上",
  code_required: "行业代码不能为空",
  name_required: "行业名称不能为空",
  not_found: "这条客户记录不存在，或不属于当前工作区",
  field_not_fillable: "这个字段不在批量补齐的范围内",
  value_required: "这一条建议是空的，跳过",
};

export const BATCH_COMPLETE_TEXT = {
  title: "批量补齐",
  description:
    "把「这份客户资料还缺什么」的规则跑一遍全部客户——只是数据已经能推出来的那半，不问助手，不花模型。逐条勾选、批量应用，写入时仍按各条记录单独判断权限。",
  columnAccount: "客户",
  columnField: "字段",
  columnSuggestion: "建议值",
  columnBasis: "依据",
  selectionNoun: "条建议",
  apply: "批量应用",
  applying: "应用中",
  clearSelection: "取消选择",
  emptyTitle: "没有能推出来的缺口",
  emptyDescription: "本工作区可见的客户资料，数据已能推出的字段都已经填好。",
  /** applied, failed */
  result: (applied: number, failed: number) =>
    failed > 0
      ? `已应用 ${applied} 条，${failed} 条失败——多半是别人已经先填了，或范围变了`
      : `已应用 ${applied} 条`,
} as const;

export const SHELL_TEXT = {
  // Full spoken form, for contexts that need one string (the tab title, its
  // aria-label, the meta description) - see metadata.ts.
  brandName: "聿策销售智能体",
  // The two-segment lockup used everywhere the name is actually DRAWN (the
  // header brand mark, the gate screens' product identity): the name itself,
  // and the descriptive tagline after it, in that visual order. Split so the
  // caller can weight and separate them (owner, 2026-09-17: 聿策 ｜ 销售智能体，
  // 两段颜色区分) instead of one flat string with no seam to style.
  brandMark: "聿策",
  brandTagline: "销售智能体",
  website: "官网",
  workspaceFallback: "当前工作区",
  signedOutTitle: "尚未登录",
  signedOutDescription: "请通过 Vxture 账号登录后使用本产品。",
  noAccessTitle: "当前工作区未订阅",
  subscribeCta: "前往订阅",
  noRolesTitle: "还没有为你分配角色",
  // Names WHO, because "an administrator" is not a person anybody can go and
  // find. Opening the subscription makes you this product's super
  // administrator (auth/lib/claims.ts: the platform's workspace:owner is the
  // first-login super-admin), so the reader knows exactly whom to ask.
  noRolesDescription: "请联系开通订阅的管理员为你分配角色。",
  loadFailed: "数据加载失败",
  /** 面包屑前的返回按钮：纯图标，可访问名在这里。 */
  backUp: "返回上一级",
  /* DS 侧栏导航（ShellSidebarNav）四个控件的无障碍名。件的默认值是英文，
     双语产品必须自己传，否则中文档下读屏念的是英文。 */
  expandNav: "展开导航",
  collapseNav: "收起导航",
  expandAllGroups: "展开全部分组",
  collapseAllGroups: "收起全部分组",
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
  cta: "登录",
  ariaLabel: "登录",
  // Every gate screen is a title and a line under it; the door had only the
  // line, which left its middle band looking unfinished (owner, 2026-09-15).
  // A greeting rather than an instruction: the button says what to do.
  title: "欢迎使用",
  // ONE LINE, under the product name. It was the headline until 2026-09-15,
  // when the owner cut the door back to what a door is: the product's name,
  // what it does in a sentence, and the way in. The eyebrow, the paragraph and
  // the three proposition cards are gone - this address exists to let somebody
  // sign in, not to sell to them. The sentence is still the spec's own
  // (docs/20-specs/10-product-definition.md), not written for the page.
  description: "把战略到回款，串成一条可追溯的链路",

  // THE CHAIN, in the order the product moves through it, shown rather than
  // described. Every stop is four characters (owner, 2026-09-15) so the row
  // reads as one measure instead of eight ragged ones; 商机管理 and 回款到账
  // are the long forms of the two that were short. Labels track the domain
  // vocabulary in 20-capability-domains.md - renaming a domain renames a stop.
  chainLabel: "全链路",
  chain: ["市场战略", "销售规划", "市场战役", "商机信号", "销售线索", "商机管理", "交付项目", "回款到账"],
} as const;

/**
 * The workspace that has not subscribed.
 *
 * A DIFFERENT PAGE FROM THE FRONT DOOR, because the reader is different: they
 * are signed in, the product knows who they are, and the one thing they cannot
 * do is the one thing the page asks for - subscribing happens in the console
 * and needs an administrator. So the page names who is signed in, says where
 * the purchase happens, and offers a way out. A reader who can neither buy nor
 * leave is stranded, which is what a bare EmptyState left them.
 */
export const NO_SUBSCRIPTION_TEXT = {
  badge: "未订阅",
  // The one line under the title. Both halves are load-bearing: subscribing is
  // the way forward, and it happens in the console under an administrator's
  // rights - so a reader who does not have them learns it here rather than
  // after a round trip.
  description: "请先完成订阅，或联系工作区管理员订阅。",
  ariaLabel: "当前工作区尚未订阅",
  identityLabel: "登录身份",
  workspaceLabel: "当前工作区",
  signOut: "退出登录",
} as const;

/**
 * After signing out.
 *
 * Reached by the IdP's post-logout redirect, which lands on the product root -
 * the same address as the front door. Without this the product answered a
 * deliberate sign-out with "登录", which reads as if the sign-out failed.
 */
export const SIGNED_OUT_TEXT = {
  ariaLabel: "已退出登录",
  title: "已退出登录",
  // The product ended its own session and can do nothing about the browser's.
  // One line, and an instruction rather than a reassurance.
  description: "公用电脑上，请一并退出浏览器账号。",
  signInAgain: "重新登录",
  toConsole: "前往账号中心",
} as const;

/**
 * A member with no role, in a workspace that HAS subscribed.
 *
 * The one gate screen whose reader can do nothing about it themselves - which
 * is why it says who can, by name of position rather than by the word
 * "administrator". Whoever opened the subscription is this product's super
 * administrator; everyone else waits for them.
 */
export const NO_ROLES_TEXT = {
  // Short, because it hangs off the corner of the title as a label - the same
  // shape and the same length as the sibling screen's, which is what "the same
  // format" means here.
  badge: "无角色",
  ariaLabel: "还没有为你分配角色",
  identityLabel: "登录身份",
  workspaceLabel: "当前工作区",
  recheck: "重新检查",
  signOut: "退出登录",
} as const;

/**
 * The gate-screen preview (demo route only).
 *
 * Its own constant rather than strings in the page: the docs and the message
 * dictionary are the two places copy is allowed to live, and a preview route
 * is still a route somebody reads.
 */
export const GATE_PREVIEW_TEXT = {
  ariaLabel: "选择要预览的页面",
  signIn: "未登录引导页",
  noSubscription: "未订阅",
  noRoles: "无角色",
  signedOut: "已退出",
  // Obviously a sample, so nobody mistakes the preview for a real session.
  sampleUser: "示例成员",
  sampleWorkspace: "示例工作区",
  sampleOrg: "示例组织",
  samplePhone: "138 0000 0000",
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
  //
  // "待你裁决" since 2026-08-31, by the owner. It drops the verb echo the
  // previous wording had with the centre's headline ("今天有 N 件要你定"),
  // which was deliberate and is worth stating rather than quietly losing:
  // 裁决 is the heavier word, and this card is the one place that says what
  // the whole left flank is for. If the echo is wanted back it is the
  // HEADLINE that moves - the card is the standing label and the headline is
  // the sentence.
  queue: "待你裁决",
  ledeToday: "今天要定的",
  proposals: "待签提案",
  // The two cards this replaced, kept so the archive rows and the copilot page
  // can still name them.
  today: "今日判断",
  adjudicate: "待我裁决",
  mydeals: "我的商机",
  strategy: "市场战略",
  campaign: "营销活动",
  catalog: "产品目录",
  pipelineArchive: "商机管理",
  deals: "商机",
  catalogProducts: "产品",
  planning: "销售规划",
  account: "客户管理",
  signal: "商机智探",
  delivery: "项目交付",

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
    "account.upsell": "增购机会",
    "account.consistency": "说法核对",
    "deal.evidence": "证据抽取",
    "deal.plan": "推进计划生成",
    "strategy.segment_coverage": "细分市场覆盖趋势",
    "strategy.territory_attainment": "区域达成趋势",
  } as Record<string, string>,
  dealsOpen: "在办",
  dealsWorth: "金额",
  plans: "计划",
  campaigns: "战役",
  targets: "目标",
  territories: "区域",
  accounts: "客户",
  signals: "信号",
  leads: "线索",
  projects: "项目",
  // Per-module figures for the navigation cards. Each is the number that gives
  // a reason to open that module, not a row count for its own sake - "3 待分派"
  // is why you click 线索分派; "12 条线索" is trivia.
  segments: "细分",
  solutions: "方案",
  pricedProducts: "已定价",
  namedAccounts: "已分级",
  forecastDisagreements: "有分歧",
  unrouted: "待分派",
  quoteApprovals: "待签",
  unreviewed: "待复盘",
  renewalsDue: "临近到期",
  contractValue: "在交付合同额",
  openDeals: "开放",

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
  // Named after the TARGET's period, like `quota` above. It said "本季" while
  // the figure follows whichever period the committed target is for - which
  // is the same period the card's own title names, and is not always this one.
  poolRow: (period: string) => `${period} 资源储备`,
  coverageOf: (pct: number) => `${pct}%`,
  coverageGap: (v: string) => `缺口 ${v}`,
  coverageThin: (floor: number) => `低于 ${floor}% 警戒线`,
  coverageMet: "目标已达成",
  agent: "智能助手",
  agentScope: (n: number) => `正看着 ${n} 位客户`,
  capture: "记一笔",
  ask: "问参谋",
  // Icon-only, so this is the whole label. It names the destination rather
  // than the action ("完整对话" not "打开") because the button sits beside a
  // box you can already type into - the question it answers is what is over
  // there, not what will happen.
  openThread: "完整对话",
  attach: "添加附件",
  notWired: "该能力尚未接通",
  pendingEmpty: "此刻没有等你裁决的事。",
  // 会前准备 (L6 批五) 快捷指令。
  meetingTitle: "会前准备",
  meetingHint: "见客户前一键汇总：谁到场、答应了还没做的、悬着的钱、这次该拿什么结论。",
  reconTitle: "敌情",
  reconEmpty: "尚未侦察。竞争对手目前只出现在跟进原文里，还没有成型情报。",
  reconCta: "发起竞争态势分析",
  // SHARED, and named for the fact rather than for one caller. The same
  // sentence lived twice - here and on the home screen as
  // HOME_TEXT.analysisHint - stating the same rule for two different sets of
  // analysis buttons. Two keys holding one sentence is two chances to reword
  // half of it, which is the drift the GATE_ERROR consolidation exists to stop.
  analysisNote: "分析结果会作为「模型」判断入流。",
  captureSend: "存",
  capturePlaceholder: "刚跟王总通完电话……",
  captureHelp: "三句话、一段微信、一封转发的邮件都算，原文会原样保留。",
  pendingTitle: "今天要定的",
  sourceRule: "规则",
  sourceModel: "模型",
  truncate: (t: string) => `${t}……`,
} as const;

export const ASK_ABOUT_TEXT = {
  anchored: (name: string) => `本次对话已锁定客户：${name}`,
  // Says what the model can and cannot see. A grounded answer that looked
  // omniscient would get trusted past what it actually read.
  anchoredHint:
    "助手能读到这个客户下已记录的跟进原文与承诺，回答时会标注它引用了哪一条。读不到的东西它不会替你补——没记下来的事，它也不知道。",
  linkFromAccount: "就这个客户问助手",
} as const;

/** The platform login account_status values that have a sentence (not the customer-account table below); the rest show as-is. */
const LOGIN_ACCOUNT_STATUS_LABEL: Record<string, string> = { active: "账户正常" };

export const HEADER_TEXT = {
  searchPlaceholder: "搜索客户、商机、跟进记录",
  searchEmpty: "没有匹配的",
  searchLoading: "检索中",
  searchResults: "搜索结果",
  groupAccounts: "客户",
  groupDeals: "商机",

  // THE TIER IS THE VERSION (owner, 2026-09-10: 版本需要从订阅获取，五档，使用英文
  // 显示). It comes from the entitlement, never from a build label, and it is
  // shown on every screen, production included - the earlier "hidden in
  // production" rule is withdrawn by that ruling. English on purpose, in both
  // languages: the five names are the platform's own identifiers, and a
  // translated tier would not match the one on the invoice.
  subscription: (tier: string) => TIER_LABEL[tier] ?? tier,
  subscriptionNone: "未订阅",
  subscriptionAria: "订阅档位",

  // The functional-domain control. Placed now, inert until the domains are
  // split - see the note in app-shell.tsx for why an inert control is the
  // honest shape rather than a menu of one.
  // The launcher's accessible name. Icon-only on screen, so this is the ONLY
  // place the current domain is still stated - which is why it names it rather
  // than saying "功能域" and losing the information entirely.
  scopeAria: (domain: string) => `功能域：${domain}`,
  scopeAriaUnknown: "功能域",

  // The workspace and tenant, and the panel that explains them.
  workspaceAria: "当前工作区与租户",
  workspacePanelTitle: "工作区",
  workspaceLabel: "工作区",
  tenantLabel: "租户",
  tenantUnknown: "未标识",

  // The four tools. Grouped because they are the same KIND of thing - they act
  // on the shell, not on the data - and a reader who has found one has found
  // all four.
  toolsAria: "外壳工具",
  fullscreen: "全屏",
  fullscreenExit: "退出全屏",
  help: "帮助",
  notifications: "通知",
  notificationsWithCount: (n: number) => `通知，${n} 件待处理`,
  notificationsEmpty: "没有等你处理的事",
  notificationLabel: {
    overdue: "逾期未兑现的承诺",
    reviews: "已关闭待复盘的商机",
    downgraded: "健康度被下调的项目",
  } as Record<string, string>,
  settings: "设置",

  adminAria: "管理",
  userMenuOpen: "打开用户菜单",
  // The user panel (DS complete panel, owner 2026-09-10).
  accountStatus: (status: string | null) =>
    status === null ? "状态未知" : (LOGIN_ACCOUNT_STATUS_LABEL[status] ?? status),
  accountCentre: "账户中心",
  switchUser: "切换用户",
  logout: "退出登录",
  // The two flank toggles. Named for what the flank IS, not for the direction it
  // moves: "收起左栏" tells you the geometry, "收起战况板" tells you what you
  // stop being able to see, and only the second is a reason to keep it open.
  boardOpen: "展开战况板",
  boardClose: "收起战况板",
  agentDock: "智能助手",
  agentDockWithCount: (n: number) => `智能助手，${n} 件待你裁决`,

  // The preference panel, inside the user menu. Language lives HERE and not in
  // the header: it is set once and then never again, and a permanent control
  // for a once-a-lifetime decision spends header width every session to serve
  // the first one.
  prefTitle: "偏好设置",
  prefLocale: "语言",
  prefTheme: "主题",
  prefThemeLight: "浅色",
  prefThemeDark: "深色",
  prefThemeSystem: "跟随系统",
  prefDensity: "密度",
  prefDensityCompact: "紧凑",
  prefDensityDefault: "标准",
  prefDensityComfortable: "宽松",
  prefFontSize: "字号",
  prefFontSmall: "小",
  prefFontDefault: "标准",
  prefFontLarge: "大",
  logoAlt: "Vxture",
} as const;

/** 配置管理的分组名。四字，与条目同一把尺子。 */
export const ADMIN_GROUP_LABEL: Record<string, string> = {
  org: "组织架构",
  access: "成员权限",
  params: "业务参数",
  // 高级管理 (owner, 2026-09-17): merged from two separate groups (安全审计,
  // 系统验证) into one, last - both answer "is something wrong, and where do
  // I check", not day-to-day workspace setup.
  advanced: "高级管理",
};

export const ADMIN_TEXT = {
  tagMembers: (n: number) => `${n} 位成员`,
  title: "配置管理",
  description: "工作区怎么配置。设一次，各处生效。",
  emptyTitle: "你没有管理权限",
  emptyDescription:
    "这不是订阅档位的问题，加钱解决不了。需要一位管理员给你分配角色。",
  planned: "未建",
  // /admin/opportunity 合并保存栏用的通用文案（incr/0063）——预测阈值/账龄
  // 分档/计价货币三块共用一个保存栏之后，这是页面级的文案，不再借用某一块
  // 自己的 save/discard 键。
  save: "保存",
  discard: "放弃",
  entryHint: {
    members: "谁在哪个单位，各自的关联区域、数据范围与角色",
    roles: "九个角色各自能做什么",
    permissions: "权限如何分组、谁持有它",
    scope: "工作区 / 区域 / 仅自己，谁在哪一档",
    product: "产品的类型、状态与计价单位",
    winLossReason: "复盘时可选的赢丢原因",
    opportunityConfig: "签约类型、业务形态、商机阶段、赢丢原因、预测阈值、账龄分档、计价货币——跟商机推进相关的配置，都在这一页",
    stage: "商机推进经过的阶段，改名/排序/默认赢率/增删",
    contracttype: "交易性质——新签/续签/增购",
    businessform: "卖的是什么——项目定制类/标化产品类/咨询服务类",
    industry: "客户按行业、类型、规模与性质归档，一处改，处处改",
    reminderThreshold: "多久算联系冷淡、决策链温度窗口，以及续约提前多少天提醒",
    forecastThreshold: "承诺、最好情况从多少概率起算",
    ageingPolicy: "逾期多少天算一档",
    pricingPolicy: "报价默认用什么币种",
    audit: "谁在什么时候改了配置——成员、角色相关的操作记录",
    division: "全国怎么切成区域，每个区域管哪些省",
    orgUnit: "总部、大区、团队怎么搭，谁归哪个单位",
    diagnostics: "与平台的对接是否健康——身份、权益、用量三条通道",
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
  rolesFact: (roles: number, perms: number) => `${roles} 个角色 · ${perms} 条权限`,
  divisionCount: (divisions: number, placed: number, total: number, noun: string) =>
    placed === total
      ? `${divisions} 个区域 · ${total} 个${noun}都已归入`
      : `${divisions} 个区域 · 还有 ${total - placed} 个${noun}没有归入`,
  divisionNoRead: "没有区域读取权限",
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

/**
 * 安全审计 (owner, 2026-09-17): a browsable, filtered log of CONFIGURATION
 * changes only - member/role writes. Explicitly NOT business data;
 * copilot.ask rides the same append-only table for an unrelated reason
 * (X-3 cost tracing) and never appears here.
 */
export const AUDIT_TEXT = {
  title: "安全审计",
  description: "记录对配置的操作——成员、角色相关的变更。不涉及业务数据。系统被改了，这里说谁改的，什么时间，改了什么。",
  colTime: "时间",
  colActor: "操作人",
  colAction: "操作",
  colObject: "对象",
  colOutcome: "结果",
  count: (n: number) => `共 ${n} 条`,
  empty: "还没有配置变更记录",
  emptyWhy: "成员、角色相关的操作会记在这里。",
  searchHint: "按操作人或对象搜索",
  filterAllActions: "全部操作",
  filterAllOutcomes: "全部结果",
  outcomeLabel: {
    success: "成功",
    denied: "被拒绝",
    error: "出错",
  } as Record<string, string>,
  actionLabel: {
    "admin.member.role.assign": "分配角色",
    "admin.member.role.revoke": "撤销角色",
    "admin.member.deactivate": "停用成员",
    "admin.member.reactivate": "恢复成员",
    "admin.member.scope": "调整可见范围",
    "admin.role.upsert": "新增或修改角色",
    "admin.role.remove": "删除角色",
  } as Record<string, string>,
} as const;

/**
 * 系统验证 (owner, 2026-09-17): is the product's own end of the platform
 * connection healthy - C1 identity, C2 entitlement, C3 usage/provisioning.
 * Built as SECTIONS (diagnostics-panel.tsx) with exactly one today, 平台对接,
 * because the owner asked to reserve room for other kinds of system
 * verification without redesigning the page when the second one arrives.
 */
export const DIAGNOSTICS_TEXT = {
  title: "系统验证",
  description: "产品这一端与平台的对接是否健康。只读探测，会花钱的动作各自单独标出。",
  refresh: "重新探测",
  probedAt: (time: string) => `探测时间 ${time}`,
  readOnlyNote: "以下探测全部只读，不产生任何费用",
  sectionPlatform: "平台对接",
  sectionPlatformHint: "身份（C1）、权益（C2）、用量与供给（C3）三条通道",
  probe: {
    c1: "C1 - 身份发现与密钥",
    tokenMint: "C1 换票 - 工作台代持换票",
    c2: "C2 - 实时权益读取",
    c3Up: "C3 上行 - 用量上报",
    c3Down: "C3 下行 - webhook 验签与投递",
    atlas: "模型面（Atlas）",
    runos: "能力面（Runos）",
    arda: "共享数据面（arda）",
  } as Record<string, string>,
  replayTitle: "C3 重放校验（清单第 5 项）",
  replayHint:
    "会花钱的探测之一：把同一条用量记录上报两次，核实平台是否按幂等键去重而不是重复计费。每个工作区每天最多算一次。",
  replayButton: "运行重放校验",
  replayConfirmTitle: "确认运行重放校验？",
  replayConfirmBody: "这会向平台实际发送一条用量记录（今天第一次点击才会真的产生费用，重复点击命中同一个幂等键）。",
  replayConfirmAction: "确认运行",
  cancel: "取消",
  replayRunning: "运行中…",
  replayForbidden: "没有运行这项探测的权限——需要另一位管理员授权",
  // Atlas 活体探测 (owner, 2026-09-17): "连接并消耗一点 atlas 的 token，按
  // 逻辑 atlas 会上报" - 只探测可达性不够，得真的打一次通话才能验证上报链路。
  atlasProbeTitle: "Atlas 活体探测",
  atlasProbeHint:
    "会花钱的探测之一：发一条最短的对话给 Atlas，验证连接真的能走完一次完整调用。消耗由 Atlas 自行按其计量口径上报，不经过本仓的用量指标。",
  atlasProbeButton: "运行 Atlas 探测",
  atlasProbeConfirmTitle: "确认运行 Atlas 探测？",
  atlasProbeConfirmBody: "这会向 Atlas 实际发起一次模型调用，产生真实的模型用量费用。",
  atlasProbeConfirmAction: "确认运行",
  atlasProbeRunning: "运行中…",
  atlasProbeForbidden: "没有运行这项探测的权限——需要另一位管理员授权",
  badgeOk: "正常",
  badgeFail: "异常",
  badgeUnconfigured: "未配置",
} as const;

/**
 * 赋能分析 (owner, 2026-09-17): a big-screen reading of the copilot's actual
 * use, per person - tasks executed, suggestions adopted/rejected - plus one
 * workspace-wide lapsed count. Replaces the rejected 使用分析 admin page
 * ("这些是分析吗，这是统计一下，页面到处都有，还要专门分析") with rankings
 * and ratios instead of a bare per-user number table.
 */
export const ENABLEMENT_TEXT = {
  title: "赋能分析",
  subtitle: "AI Enablement Analysis",
  home: "平台首页",
  windowLabel: (days: number) => `近 ${days} 天`,
  panelExecuted: "任务执行排行",
  panelExecutedWhy: "谁在通过副驾实际执行任务",
  panelAdoption: "建议采纳情况",
  panelAdoptionWhy: "副驾提出的建议，被谁采纳、被谁拒绝",
  colUser: "成员",
  colExecuted: "执行次数",
  colAdopted: "已采纳",
  colRejected: "已拒绝",
  heroExecuted: "任务执行总数",
  heroAdopted: "已采纳建议",
  heroRejected: "已拒绝建议",
  heroExpired: "未处理即失效",
  heroExpiredHint: "工作区整体计数，不可归因到个人——agent_action 没有「给谁看过」这一列",
  donutTitle: "建议去向构成",
  donutAdopted: "已采纳",
  donutRejected: "已拒绝",
  donutExpired: "未处理",
  rankEmpty: "窗口内还没有副驾执行记录",
  noAdoption: "窗口内还没有建议被裁决",
  unit: (n: number) => `${n} 次`,
} as const;

export const STRATEGY_DIAG_TEXT = {
  title: "战略诊断",
  subtitle: "Strategy Diagnostics",
  home: "平台首页",
  windowLabel: (days: number) => `近 ${days} 天快照`,
  deniedTitle: "无法显示诊断屏",
  deniedDescription: "需要战略查看权限。",
  panelSegmentCoverage: "细分市场覆盖趋势",
  panelSegmentCoverageWhy: "哪些细分市场的覆盖客户数在变化",
  panelAttainment: "区域达成对比",
  panelAttainmentWhy: "各区域当前达成率与目标对比",
  panelFalseFat: "虚胖预警",
  panelFalseFatWhy: "管道金额在涨但覆盖客户数不涨的细分市场",
  heroSegments: "在用细分",
  heroTerritories: "有指标区域",
  heroAvgCoverage: "平均覆盖",
  heroAvgAttainment: "平均达成",
  noSnapshots: "还没有快照数据，调度任务运行后会自动生成",
  noSegments: "还没有细分市场快照",
  noTerritories: "还没有区域快照",
  noFalseFat: "没有虚胖信号",
  falseFatHint: (name: string, pipelinePct: string, countDelta: number) =>
    `${name}：管道 ${pipelinePct}，客户数 ${countDelta >= 0 ? "+" : ""}${countDelta}`,
  coverageUnit: (n: number) => `${n} 家`,
  attainmentPct: (v: number) => `${v.toFixed(1)}%`,
  deltaUp: (n: number) => `+${n}`,
  deltaDown: (n: number) => `${n}`,
  deltaFlat: "---",
  pipelineLabel: "管道额",
  countLabel: "客户数",
  targetLabel: "目标",
  attainedLabel: "达成",
  moneyYi: (v: number) => `${(v / 1e8).toFixed(1)}亿`,
  moneyWan: (v: number) => `${(v / 1e4).toFixed(1)}万`,
} as const;


export const PIPELINE_TEXT = {
  tagOpen: (n: number) => `${n} 个在推进`,
  tagNoDate: (n: number) => `${n} 个没有预计成交日`,
  tagUnowned: (n: number) => `${n} 个无负责人`,
  title: "商机管道",
  descriptionReadOnly: "只读视图：你可以查看管道，但没有推进商机的权限。",
  description: "预测口径与快照一致，均由同一套规则计算。",
  columnOpportunity: "商机",
  // Two merged headers (2026-09-04). Stage and forecast category stack in
  // one cell, amount and win rate in another - the pair is what a reader
  // actually reads, and the opportunity cell beside them was already two
  // lines tall, so the stacking costs no row height.
  columnAccount: "客户",
  columnStageForecast: "阶段 / 预测",
  columnPriority: "优先级",
  priorityUnranked: "未定级",
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
  // The composition block, which folds away.
  splitCollapse: "收起构成",
  splitExpand: "展开构成",
  splitEmpty: "本周期没有可拆的产品线",
  /** Said only when readings were actually dropped - a window nobody hit is
   *  not worth explaining. */
  trajectoryWindow: (shown: number, total: number) =>
    `最近 ${shown} 次，共 ${total} 次`,
  // 两个数，两个问题，不能互相替代。
  //   已兑现 = 期末实际 / 期初承诺。超额会大于 100%，本该如此。
  //   准确率 = 承诺得准不准，两个方向都算错。只在周期结束后才配用这个词——
  //           季度中每份预测都「不准」，只因为季度还没过完。
  // 曾经这两件事是同一个数，标着「准确率」：承诺 1000、成交 3000 显示
  // 「准确率 300%」。少承诺就能让数字变好看，这正是按人算的预测指标绝不能有的。
  // 快照口径。三个口径领域层从批次 1 就支持，缺的一直是这个控件。
  scopeLabel: "快照口径",
  scopeWorkspace: "全工作区",
  scopeTerritory: (name: string) => `销售区域 · ${name}`,
  /** 没有通讯录，所以这里就是 sub 本身——标成机器文本，不假装是人名。 */
  scopeOwner: (sub: string) => `负责人 · ${sub}`,
  accuracySettled: (r: number) => `准确率 ${Math.round(r * 100)}%`,
  accuracySoFar: (r: number) => `已兑现期初承诺的 ${Math.round(r * 100)}%`,
  /** 没有期初快照——算不出来，不是算出来是 0。 */
  accuracyNoOpening: "无期初快照，准确率算不出",
  /** 期初承诺为零，没有分母。 */
  accuracyNoCommit: "期初未承诺，无从对照",
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

  // The fact that used to be a board card, now beside the deal it applies to.
  buyerUnreachable: "决策人未触达",
  trajectory: "预测轨迹",
  trajectoryWhy:
    "快照只追加、不可修改——预测准确率是期末实际对期初快照，少一个点就算不出来。",
  tCommit: "承诺",
  tBestCase: "乐观",
  tPipeline: "管道",
  tClosed: "已成交",

  // The snapshot control. "存快照" rather than "保存": a snapshot is appended
  // and can never be edited or removed (UPDATE is revoked on the table), and
  // "保存" implies an undo this action does not have.
  snapshot: "存一次快照",
  snapshotPending: "记录中…",
  snapshotTaken: "已记入轨迹",
  snapshotFailed: "快照没有存成",
  snapshotDenied: "你没有提交预测的权限——读预测的人常常不是对它承诺的人",
  newTitle: "新建商机",
  newWhy:
    "不是每一笔生意都从线索来。自己挖到的、别人转介的、客户直接找上门的，都从这里进。",
  newName: "商机名称",
  newAccount: "客户",
  newPickAccount: "选择客户",
  newTerritory: "销售区域",
  newNoTerritory: "不指定",
  newRequirement: "客户需求",
  newRequirementHint: "客户要解决什么问题",
  newRequirementWhy: "没坐在那场会里的人，靠这句话判断该不该投入。之后可以改。",
  newAmount: "金额（可后补）",
  newExpectedClose: "预计成交",
  newSave: "建立商机",
  newMade: (no: string) => `已建立 ${no}`,
  newSelfSourced:
    "从这里建立的商机归因为「自拓」，且创建后不可更改——归因键没有 UPDATE 授权。战役来源的商机应当由线索转化产生。",
  productSplit: "承诺的构成",
  productSplitWhy: "按产品行项拆开。一个总额说不出这笔钱要交付什么。",
  needsApproval: "折扣待批",
  undatedExcluded: (n: number) =>
    `${n} 笔在办商机没有预计成交时间，未计入本期任何一档——没有日期就不属于任何一个周期`,
  noLines: "尚无产品行项",
} as const;

export const LIFECYCLE_TEXT = {
  moveTo: "变更为",
  apply: "应用",
} as const;

export const LIFECYCLE_ERROR: Record<string, string> = {
  ...GATE_ERROR,
  illegal_transition: "当前状态不能直接变更为该状态",
  unknown_status: "未知状态",
  executions_outstanding: "还有未完成的执行项；先完成或跳过它们再结束战役",
  invalid_window: "战役的起止时间不合法",
  window_inverted: "结束时间不能早于开始时间",
  start_required: "写了结束时间就必须写开始时间",
  not_found: "记录不存在，或不属于当前工作区",
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
  recordWho: "对方谁在场（选填）",
  recordWhoHint: "选上的人，最近接触时间会更新为这一次",
  recordWhen: "什么时候",
  recordSubmit: "记下",
  recordSaved: "已记下",
  recordEmpty: "还没有跟进记录",
  recordEmptyDescription:
    "记下第一笔之后,客户健康度和决策链就会开始用真实的接触时间,而不是靠商机阶段推算。",

  // The bounded timeline. A detail page shows the recent few and opens the
  // rest in place - the alternative was dumping every note on a page that
  // already carries seven other dimensions.
  timelineShown: (shown: number, total: number) =>
    `最近 ${shown} 条，共 ${total} 条`,
  timelineExpand: "展开全部",
  timelineCollapse: "只看最近",
  timelineTitle: "跟进时间线",
  timelineDescription:
    "谁、什么时候、通过什么方式。原文逐字保留——后续所有分析都引用它。",
  timelineBy: "记录人",
  timelineCorrects: "更正了一条更早的记录",
  timelineToday: "今天",
  timelineDaysAgo: (n: number) => `${n} 天前`,
  timelineParticipantSep: "、",

  commitTitle: "承诺",
  commitDescription:
    "有日期的承诺,双向。完成必须有证据——指向一次真实的跟进,不能自己说完成了。错过不需要任何操作。",
  commitOverdueTitle: "逾期承诺",
  commitOverdueDescription:
    "已经过期、还没有人面对的承诺。客户连续错过承诺,是停滞最早的信号。",
  commitNew: "新增承诺",
  commitStatement: "承诺了什么",
  commitStatementPlaceholder: "例:回传盖章的技术确认书",
  commitDirection: "谁的承诺",
  commitDue: "何时之前",
  commitCreate: "记下承诺",
  // 统一录入(2026-09-05 整合):承诺行长在跟进表单里,记的是「这次谈话里谁答应了什么」。
  commitAdd: "这次有承诺?加一条",
  captureTitle: (name: string) => `记一次接触 · ${name}`,
  /** 面包屑末段：这一页本身叫什么，不带客户名——客户名已经是上一段。 */
  captureCrumb: "记一次接触",
  captureWhy:
    "发生了什么照原样倒进来;这次谈话里谁答应了什么,顺手加在下面——承诺会记住它出自哪一次接触。",
  commitRemove: "去掉",
  directionOurs: "我方承诺",
  directionTheirs: "对方承诺",
  commitClose: "标记完成",
  commitCloseNeedsEvidence: "选一条证明它完成了的跟进",
  commitWaive: "放弃",
  commitWaiveReason: "为什么放弃",
  commitHandle: "处理",
  commitHandleClose: "收起",
  commitMissed: "标记错过",
  commitEmpty: "还没有承诺",
  commitEmptyDescription:
    "从一次跟进里记下双方答应的事,它到期时系统会替你盯着。",
  commitComplianceRate: "守约率",
  commitPartyTheirs: "对方",
  commitPartyOurs: "我方",
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

  pasteNotesButton: "粘贴会议纪要",
  pasteNotesTitle: "粘贴会议/通话纪要",
  pasteNotesDescription:
    "把会议记录或通话纪要粘贴进来，助手会提取结构化的跟进记录供你确认。",
  pasteNotesPlaceholder:
    "把会议纪要、通话记录或聊天内容粘贴到这里……",
  pasteNotesSubmit: "交给助手",
  pasteNotesSubmitting: "正在分析……",
  pasteNotesCancel: "取消",
  pasteNotesDone: (n: number) =>
    `已生成 ${n} 条跟进建议，请到助手队列确认`,
  pasteNotesEmpty: "请先粘贴内容",
  pasteNotesFailed: "分析失败，请稍后重试",
} as const;

export const FIELD_ERROR: Record<string, string> = {
  ...GATE_ERROR,
  // 统一录入的部分成功:笔记是证据、只追加,落了就不回滚;某条承诺被拒时如实说。
  commitment_partial: "跟进已记下,但有承诺没记上——到承诺列表补一条",
  contact_not_on_account: "选的联系人不在这家客户名下——刷新页面再选",
  evidence_not_found: "作证据的那条跟进找不到了——刷新后重新选一条",
  evidence_other_account: "作证据的跟进不是这家客户的——承诺只能由跟这家客户的往来来证明",
  note_required: "写一句发生了什么——只记下它发生过,没有价值",
  occurred_in_future: "跟进不能发生在未来",
  unknown_channel: "未知的跟进方式",
  evidence_required: "完成必须指向一次真实的跟进,不能自己说完成了",
  reason_required: "放弃承诺必须写明理由",
  not_yet_due: "还没到期,不能标记为错过",
  illegal_transition: "当前状态不能这样变更",
  status_unchanged: "状态没有变化",
  statement_required: "写明承诺的内容",
  unknown_evidence_kind: "未知的凭据类型",
  unknown_status: "未知状态",
  waiver_required: "放弃承诺必须写明理由",
  unknown_direction: "未知的承诺方向",
  feature_not_in_tier: "当前档位不含这个能力",
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

// The same edge read from its OBJECT's row (placeRelations: the subject is not
// in the table). Symmetric types read the same both ways and are not listed.
export const RELATION_TYPE_LABEL_REVERSED: Record<string, string> = {
  reports_to: "下属",
  referred_by: "引荐了",
};

export const RELATION_TEXT = {
  // owner, 2026-09-20: 设计图严格对齐 - mockup 原词"记录一次关系"; 这个标题
  // 之前定义了但从没真的用上 (LinkContacts 自己不带 Section, 一直是裸的
  // <div>), 这次挪进决策链详情视图, 变成自己独立的一张卡, 才第一次用到它。
  title: "记录一次关系",
  description:
    "关系图是追加写的：关系变了就补一条新的边，不会改写旧的——「上季度谁向谁汇报」是决策链分析要读的事实。",
  from: "发起方",
  to: "指向",
  type: "关系",
  submit: "记录",
  saved: "已记录",
  pick: "选择联系人",
  hintUnreachable:
    "记录一条通往决策人的路径，可以让上面的判断从「不可达」变成「可达」。",
} as const;

// 关联联系人 (owner, 2026-09-20: mockup - 把系统里已有的人接到这个客户名下,
// 不会新建一条联系人记录). "+新增" 之外的第二条路 - 新建是造一个新人,
// 这个是把已有的人接上来。
export const LINK_CONTACT_TEXT = {
  linkButton: "关联",
  title: "关联联系人",
  why: "把系统里已有的人接到这个客户名下，不会新建一条联系人记录。",
  searchLabel: "搜索姓名 / 手机 / 邮箱",
  searchPlaceholder: "输入关键字搜索已有联系人",
  empty: "没有找到匹配的联系人",
  hint: "至少输入两个字符开始搜索",
  // 已经是别的客户的联系人 - 真实事实，不是拒绝理由：一个人本来就可以同时
  // 是好几家客户的联系人（比如集团内的共用职能）。
  alsoAt: (accountName: string, title: string | null) =>
    title ? `${accountName} 的联系人 · ${title}` : `${accountName} 的联系人`,
  unaffiliated: "目前不是任何客户的联系人",
  confirm: "确认关联",
  cancel: "取消",
  linked: "已关联",
  // 取消关联 - 行菜单项，及其确认框（DS ConfirmDestructive 的三段式）。
  unlink: "取消关联",
  unlinkVerb: "取消关联",
  unlinkConsequence: "这个人和TA的所有跟进记录、决策链角色都会保留，只是不再是这个客户名下的联系人。",
} as const;

// 关联协作人 (incr/0074, owner 2026-09-20: mockup - "内部同事可以有多个协作
// 人，但主负责人始终只有一个，这里关联的都是协作人，不是替换主负责人").
// 销售负责人 (owner, 2026-09-20: 死死记住设计文件 - mockup 把这张卡叫
// "销售负责人", 不是"协作人") - 名单里主负责人和协作人同框, title 现在是
// 卡片/抽屉的标题, editButton 是 header 里那个小触发器的文案, primary/tag
// 是名单里两种角色各自的标签。
export const COLLABORATOR_TEXT = {
  title: "销售负责人",
  editButton: "编辑销售负责人",
  primary: "主负责人",
  tag: "协作人",
  linkButton: "+ 关联",
  drawerTitle: "关联协作人",
  why: "加一位内部同事参与跟进，不会替换主负责人身份。",
  searchLabel: "搜索同事姓名",
  searchPlaceholder: "输入关键字搜索内部同事",
  empty: "没有找到匹配的同事",
  hint: "至少输入两个字符开始搜索",
  confirm: "确认关联",
  cancel: "取消",
  none: "还没有协作人",
  remove: "移除",
  removeVerb: "移除",
  removeConsequence: "移除后可以随时重新关联。",
} as const;

export const RELATION_ERROR: Record<string, string> = {
  ...GATE_ERROR,
  self_relation: "同一个人不能和自己建立关系",
  unknown_relation_type: "未知的关系类型",
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
  // 丢单与放弃 (YC-065 R6): both write their reason to funnel_exit.
  advanceExitReason: "丢单原因",
  advanceExitNote: "补充说明",
  advanceExitNoteRequired: "选「其他」时请写一句具体原因",
  abandonOpen: "放弃这一单",
  abandonTitle: "放弃这一单",
  abandonHint: "放弃是我方不再追。阶段保留在当前位置,这一单不再计入任何预测与汇总;之后可以重开。",
  abandonReason: "放弃原因",
  abandonSubmit: "确认放弃",
  abandonCancel: "取消",
  abandonExempt: "放弃前必须先选原因,这一步就是确认",
  abandonedTitle: "已放弃",
  abandonedDescription: "这一单已放弃。若要继续跟进,请勾选「重开」并说明理由。",
  exitRecorded: (reason: string) => `退出原因:${reason}`,
  advanceRegressionHint: (from: string) => `这是从「${from}」回退`,
  advanceTerminalHint: "进入终态会同时写入成交时间，并要求一份复盘",
  advanceOverrideKept: "已有人工赢率，本次变更不会覆盖它",
  advanceOverrideReset: "进入终态时赢率固定为 100% / 0%，人工值不再保留",

  termsTitle: "商务条款",
  termsOpen: "调整条款",
  termsDescription:
    "金额、赢率、预计成交时间与预测类别。赢率一旦人工设定，后续阶段变更不会再覆盖它——终态除外。",
  termsAmount: "金额",
  termsProbability: "赢率（0-100）",
  termsExpectedClose: "预计成交",
  termsForecast: "预测类别",
  termsSubmit: "保存",
  // A select's empty choice (polish, 2026-09-24): a bare "-" read as broken.
  selectNone: "未选择",
  termsSaved: "已保存",
  termsUnchanged: "没有改动",
  termsTerminalLocked: "商机已关闭，赢率固定，不能再改",
  termsReadOnly: "你没有修改商务条款的权限。",

  // --- product lines (batch 6b-3, ADR-014 section 2) ------------------------
  linesTitle: "产品行项",
  linesPageTitle: (deal: string) => `行项 · ${deal}`,
  linesEdit: "编辑行项",
  linesWhy:
    "行项存在时，行项是权威——商机金额等于行项之和，由服务层在写行项的同一次调用里重算。一个总额说不出这笔钱要交付什么。",
  lineProduct: "产品",
  lineQty: "数量",
  linePrice: "单价",
  lineAmount: "小计",
  lineAdd: "加一行",
  lineRemove: "删除",
  lineSave: "保存行项并重算金额",
  lineSaved: (n: number, amount: string) => `${n} 行，金额已重算为 ${amount}`,
  lineNone: "还没有行项——金额是手填的总额",
  lineNoneWhy: "这是合法的旧形态：没有行项时，总额独立成立。",
  lineBelowFloor: "低于底价，需要签字",
  lineFloorHint: (floor: string) => `底价 ${floor}`,
  lineDenied: "你没有修改商机的权限",
  lineClosedHint: "已关闭的商机不能重新定价——它的行项是卖出了什么的记录",
  lineApprovalHeader: "折扣",
  lineApprove: "批准",
  lineApproved: "已批准",
  lineAwaiting: "待批",
  lineApproveTitle: "批准低于底价的报价",
  lineApproveWhy: (product: string) =>
    `${product} 的单价低于底价。签字记录的是这个价格，改价后签字自动失效。`,
  lineApproveReason: "为什么值得破这个底价",
  lineApproveCancel: "取消",
  advanceExitUnmet: (n: number) => `本阶段还有 ${n} 条退出条件未满足——可以推进，但要写理由`,
  advanceReasonRequiredExit: "推进过未满足的退出条件，需要写一句理由",
  termsReason: "变更理由（可选）",
  termsReasonRequired: "变更理由（必填）",
  termsReasonWhy: (suggested: string) => `规则建议「${suggested}」，调得更乐观需要写一句理由`,
  lineNote: "本单定制说明",
  lineNotePlaceholder: "本单定制(可选),如:含 ERP 接口开发约 6 周",
} as const;

/**
 * 角色管理 (incr/0046, owner 2026-09-09)。按区域设定的思路：预置角色可改可删可
 * 重置，也可以新建；清单只给一句说明和权限数（owner：不显示所有权限名称），
 * 权限详情走抽屉，树状展开。
 */
export const ROLE_TEXT = {
  title: "角色管理",
  why: "工作区自己的角色：九个预置角色可改可重置，也可以新建；角色持有哪些权限，决定成员能做什么。",
  coverage: (roles: number, custom: number, perms: number) =>
    `${roles} 个角色${custom > 0 ? `，其中 ${custom} 个自定义` : ""} · ${perms} 条权限`,
  colRole: "角色",
  colSource: "来源",
  // 0047: the two groups, the workspace's own words for them.
  colLine: "业务线",
  colRank: "层级",
  lineField: "业务线",
  rankField: "层级",
  groupUnset: "请选择",
  ungrouped: "未分组",
  groupsButton: "分组管理",
  groupConfigure: "配置",
  colDescription: "说明",
  colPerms: "权限数",
  colMembers: "成员数",
  preset: "系统预置",
  custom: "自定义",
  members: (n: number) => `${n} 人`,
  noMember: "暂无成员",
  noDescription: "未填写说明",
  permCount: (n: number, total: number) => `${n} / ${total}`,
  // 行菜单里成对读：权限详情 ｜ 查看成员 ｜ 角色配置 ｜ 关联成员 ｜ 上移 …
  // （owner, 2026-09-09；查看成员/关联成员 2026-09-16 补上）
  edit: "角色配置",
  details: "权限详情",
  viewMembers: "查看成员",
  linkMembers: "关联成员",
  moveUp: "上移",
  moveDown: "下移",
  moveTop: "移到顶部",
  moveBottom: "移到底部",
  newRole: "新建角色",
  remove: "删除角色",
  removeWhy: "只有没有成员持有的角色才能删除。先在成员管理里移除，再删。",
  removeTarget: (name: string) => `「${name}」`,
  removeConsequence: "角色及其权限配置会被删除，不可撤销。",
  removeHeldHint: (n: number) => `还有 ${n} 人持有，先在成员管理里移除`,
  // --- 权限详情抽屉 ---
  detailsTitle: (name: string) => `${name} · 权限详情`,
  detailsWhy: (n: number, total: number) => `持有 ${n} / ${total} 条权限。打勾的操作可以执行。`,
  detailsGranted: "可执行",
  detailsNotGranted: "不可执行",
  detailsOnlyGranted: "只看可执行",
  detailsAll: "显示全部",
  detailsDone: "关闭",
  detailsEmpty: "这个角色没有任何权限，持有它的成员看不到任何模块。",
  detailsColHeld: "持有",
  detailsEdit: "编辑",
  // --- 查看成员抽屉 ---
  membersTitle: (name: string) => `${name} · 成员`,
  membersWhy: (n: number) => `共 ${n} 人持有这个角色。`,
  membersEmptyWhy: "还没有人持有这个角色。",
  membersSearchPlaceholder: "搜索成员姓名",
  membersSearchEmpty: "没有匹配的成员",
  // --- 关联成员抽屉 ---
  linkMembersTitle: (name: string) => `${name} · 关联成员`,
  linkMembersWhy: "勾选应当持有这个角色的成员，保存后立即生效。",
  linkMembersCount: (n: number) => `已选 ${n} 人`,
  linkMembersDone: (n: number) => `已更新，现在 ${n} 人持有`,
  linkMembersSave: "保存",
  // --- 表单 ---
  formTitle: "配置角色",
  formWhy: "代码、名称、一句说明，以及这个角色持有的权限。",
  code: "角色代码",
  codeHint: "小写字母、数字和下划线，字母开头，如 channel_manager。创建后不可更改。",
  codeLocked: "创建后不可更改。",
  nameLabel: "角色名称",
  descriptionLabel: "角色说明",
  descriptionHint: "一句话说明这个角色做什么。清单和成员管理里会显示。",
  permsConfig: "权限配置",
  pick: "选择权限",
  applyPreset: "应用预置",
  // 重置预置改名应用模版 (owner, 2026-09-11): 按钮做的事没变 - 按这个角色的
  // 代码恢复到预置形状 - 名字换成跟其余四处同一件事一致的说法。
  resetPreset: "应用模版",
  clear: "清空选择",
  applyPresetTitle: "应用预置",
  applyPresetWhy: (isNew: boolean): string =>
    isNew
      ? "选一个预置角色，代码、名称、说明与权限自动填好，可再改。"
      : "选一个预置角色，名称、说明与权限套用到当前角色；代码是锚，保持不变。",
  applyConfirm: "应用",
  presetOption: (name: string, n: number) => `${name} · ${n} 条权限`,
  resetHint: (name: string) => `按预置「${name}」恢复名称、说明与权限`,
  resetNone: "当前代码没有对应的预置",
  destructiveTitle: "{verb}{target}？",
  resetTarget: (name: string) => `为预置「${name}」`,
  resetConsequence: (n: number) => `当前名称、说明和已选的 ${n} 条权限会被预置覆盖；未保存前可以「放弃」。`,
  clearTarget: (n: number) => `已选的 ${n} 条权限`,
  clearConsequence: "清单会清空，需要重新选择；未保存前可以「放弃」。",
  cancel: "取消",
  // --- 右栏：持有的权限 ---
  includes: "持有的权限",
  pickEmpty: "尚未选择权限",
  pickEmptyWhy: "用左侧「选择权限」加入，或应用预置。",
  colIndex: "序号",
  colCode: "权限码",
  colName: "说明",
  colUnlocks: "解锁操作",
  colOps: "操作",
  removePerm: "移除",
  unlocks: (n: number) => `${n} 项`,
  // --- 选择权限抽屉 ---
  pickTitle: "选择权限",
  pickWhy: "按模块勾选。每条权限后面是它解锁的操作数。",
  pickDone: "完成",
  pickClear: "清空",
  search: "搜索权限码或说明",
  pickNone: "没有匹配的权限",
  chosen: (n: number) => `已选 ${n} 条权限`,
  save: "保存角色",
  discard: "放弃",
  saveFailed: "保存失败",
  // --- 清单页的应用模版：两步，第二步危险确认（与区域一致）---
  resetAllButton: "应用模版",
  resetAllTitle: "应用角色模版",
  resetAllWhy: "把九个预置角色恢复为系统配置。自定义角色不受影响。",
  resetAllDangerTitle: "这是不可撤销的覆盖",
  resetAllWarn: (changed: number, missing: number) =>
    changed + missing === 0
      ? "预置角色当前与系统配置一致，重置不会改变任何东西。"
      : `${changed > 0 ? `${changed} 个预置角色被改过，名称、说明与权限会被覆盖` : ""}${changed > 0 && missing > 0 ? "；" : ""}${missing > 0 ? `${missing} 个被删除的预置角色会恢复` : ""}。持有这些角色的成员，权限随之变化。`,
  resetAllConfirm: "确认重置",
  resetAllVerb: "重置",
  resetAllTarget: "九个预置角色",
  resetAllConsequence: (changed: number, missing: number) =>
    `${changed} 个改过的预置角色会被覆盖，${missing} 个被删除的会恢复；保存即生效，不可撤销。`,
  resetDone: (restored: number) => `已恢复 ${restored} 个预置角色`,
  emptyTitle: "还没有角色",
  emptyWhy: "工作区尚未生成预置角色。新建一个，或应用模版。",
  // --- 工具栏：count / 批量操作（与组织架构、区域设置同一套形状）---
  toolbarCount: (n: number) => `共 ${n} 个角色`,
  selectionNoun: "个角色",
  clearSelection: "取消选择",
  bulkRemove: "删除",
  bulkRemoveTarget: (n: number) => `已选的 ${n} 个角色`,
  bulkRemoveConsequence: "角色及其权限配置会被删除，不可撤销。",
  bulkRemoveDone: (removed: number) => `已删除 ${removed} 个角色`,
  bulkRemoveSkipped: (n: number) => `${n} 个仍有成员持有，未删除`,
  // 搜索/筛选 (owner: 表头操作行参照 /admin/permissions 补齐, 筛选组的补齐)。
  toolbarFilteredCount: (shown: number, total: number) => `筛选出 ${shown} / 共 ${total} 个角色`,
  searchPlaceholder: "搜索角色名称或代码",
  searchLabel: "搜索",
  resetFilters: "重置筛选",
  lineFilterLabel: "按业务线筛选",
  filterAllLines: "全部业务线",
  rankFilterLabel: "按层级筛选",
  filterAllRanks: "全部层级",
  filterEmpty: "没有匹配的角色",
} as const;

/**
 * 角色分组 (incr/0047)：业务线与层级两套词表，工作区自己的，参考区域设置——
 * 预置八条业务线、六级层级，可增删改排；有角色在用的删不掉。
 */
/**
 * 行操作面板的统一词汇 (owner, 2026-09-09: 各操作面板尽量统一，可以保留特色操作):
 *   XX详情 / XX配置 ｜ 上移 / 下移 / 移到顶部 / 移到底部 ｜ 删除XX.
 * Every configuration roster builds its menu from these; a module's own
 * verbs (生命周期、状态流转) sit between the first group and the moves.
 */
export const ROW_OPS = {
  details: (noun: string) => `${noun}详情`,
  configure: (noun: string) => `${noun}配置`,
  up: "上移",
  down: "下移",
  top: "移到顶部",
  bottom: "移到底部",
  remove: (noun: string) => `删除${noun}`,
  // 词表面板 (vocabulary-config.tsx) 共用的工具行文案 - 八张表同一套措辞，
  // 不必每张表各自造一份 (owner: 表头操作行参照 /admin/permissions 补齐)。
  toolbarCount: (n: number, noun: string) => `共 ${n} 个${noun}`,
  toolbarFilteredCount: (shown: number, total: number, noun: string) => `筛选出 ${shown} / 共 ${total} 个${noun}`,
  searchPlaceholder: "搜索名称或代码",
  searchLabel: "搜索",
} as const;

export const ROLE_GROUP_TEXT = {
  pageTitle: "分组管理",
  pageWhy: "角色按业务线和层级归类。预置的可以改名、排序，也可以新增；有角色在用的分组不能删。",
  count: (lines: number, ranks: number) => `${lines} 条业务线 · ${ranks} 级层级`,
  edit: "编辑",
  save: "保存",
  codeHint: "小写字母、数字和下划线，字母开头。创建后不可更改；已存在的代码表示改名。",
  opUp: "上移",
  opDown: "下移",
  opDelete: "删除",
  colRoles: "角色数",
  line: {
    title: "业务线",
    why: "角色服务的业务条线：销售、渠道、交付、售前、市场、运营、客户，以及集团与通用。",
    add: "新建业务线",
    code: "业务线代码",
    name: "业务线名称",
    colName: "业务线",
    deleteConsequence: "该业务线将从角色分组中移除。有角色归在它下面就删不掉。",
  },
  rank: {
    title: "层级",
    why: "角色所在的职级：专员、经理、高级经理、总监、总经理、高管。",
    add: "新建层级",
    code: "层级代码",
    name: "层级名称",
    colName: "层级",
    deleteConsequence: "该层级将从角色分组中移除。有角色归在它下面就删不掉。",
  },
} as const;

/** 组织架构（incr/0051）。 */
export const ORG_TEXT = {
  title: "组织架构",
  why: "公司怎么搭：总部、大区、团队，谁归哪个单位、谁负责。预置三套模版可选，之后随便改。",
  count: (units: number, placed: number) => `${units} 个单位 · ${placed} 人已归属`,
  noun: "单位",
  // 新建部门 (owner, 2026-09-11: 把新建单位，全面改为新建部门) - the create
  // doorway's own label; the tree's rows are still 单位 everywhere else on
  // this page (list column, detail drawer, delete copy) - only the ACTION
  // that starts one changed name.
  newUnit: "新建部门",
  // 层级设置 (owner, 2026-09-11: 头部按钮改为 层级设置/应用模版/三方接入) -
  // 单位类型就是这棵树的层级词表（总部/事业部/大区/分公司/团队），改名对齐
  // 新增的 L0/L1 层级列；页面本身（/admin/org/kinds）不动，见 ORG_KIND_TEXT.title。
  kindsButton: "层级设置",
  // 三方接入 (owner, 2026-09-11): 头部第三个按钮，先占位，禁用。
  thirdParty: "三方接入",
  thirdPartyHint: "即将推出",
  // 展开到 Ln (owner, 2026-09-12: 参考权限策略的展开到【模块】【页面】模式) -
  // 全部展开/全部收起两个按钮换成按层级展开；Ln 是 depth 不是固定四档
  // （同一条注释见上面 colTier），所以是函数不是词表。最深一档本身就相当于
  // 全部展开（再深也没有分支了），不用再留一个单独的全部展开按钮。
  expandTo: "展开到",
  levelLabel: (depth: number) => `L${depth}`,
  collapseAll: "全部收起",
  childCount: (n: number) => `${n} 个下级`,
  // 工具行 (owner, 2026-09-11: 增加表格头，list/card 模式切换，共xx个机构):
  // 与权限策略页同一个 FilterBar 位置 - count 在 count，展开/收起挪进 scope。
  toolbarCount: (n: number) => `共 ${n} 个单位`,
  colUnit: "单位",
  // 层级 / 下属单位 (owner, 2026-09-11: 增加层级展示列 L0，L1，独立下属单位
  // 列，模式参考权限策略表格) - Ln 就是 depth，不是固定四档，所以只给一个
  // 语气，不像权限树那样分四色；下属单位数从名称列的 titleSuffix 里拉出来
  // 单独成列，同一个理由：堆在标题后面太乱。
  colTier: "层级",
  colChildren: "下属单位",
  colKind: "类型",
  colLeader: "负责人",
  colMembers: "成员数",
  kindNone: "未指定类型",
  leaderNone: "未指定",
  noMember: "无成员",
  members: (n: number) => `${n} 人`,
  // 成员数汇总 (owner, 2026-09-13: 成员数统计只统计了直属人员，没有汇集下属
  // 部门人员，这个应该是递归的 - 圆圈{直属人数}, tag {icon 总人数}) - the
  // circle is direct headcount, the icon tag beside it is the whole subtree's.
  directMembersTooltip: (n: number) => `直属成员 ${n} 人`,
  totalMembersTooltip: (n: number) => `含下属部门共 ${n} 人`,
  /** A flat select showing a tree: the indent is the depth. */
  optionIndent: (depth: number, name: string) => `${"　".repeat(depth)}${depth > 0 ? "└ " : ""}${name}`,
  detailsTitle: (name: string) => `${name} · 单位详情`,
  detailsWhy: (kind: string, leader: string) => `${kind} · 负责人 ${leader}`,
  detailsMembers: (n: number) => `成员 · ${n} 人`,
  detailsNoMembers: "还没有成员归属到这个单位。到成员管理里，把成员的所属单位改到这里，或者用这个单位的「添加成员」。",
  detailsChildren: (n: number) => `下级单位 · ${n} 个`,
  detailsNoChildren: "没有下级单位。",
  detailsDone: "关闭",
  detailsEdit: "编辑单位",
  // --- 查看成员抽屉 (owner, 2026-09-16: 从单位详情拆出，纵向清单式排列) ---
  viewMembers: "查看成员",
  membersTitle: (name: string) => `${name} · 成员`,
  membersSearchPlaceholder: "搜索成员姓名",
  membersSearchEmpty: "没有匹配的成员",
  noRole: "未分配角色",
  // --- 添加成员抽屉 ---
  addMembers: "添加成员",
  addMembersTitle: (name: string) => `${name} · 添加成员`,
  addMembersWhy: "勾选应当归属这个单位的成员；保存后立即生效，不影响他们在其他单位的归属。",
  addMembersCount: (n: number) => `已选 ${n} 人`,
  addMembersDone: (n: number) => `已更新，现在 ${n} 人归属`,
  addMembersSave: "保存",
  remove: "删除单位",
  removeTarget: (name: string) => `「${name}」`,
  removeConsequence: (members: number) =>
    members > 0 ? `${members} 位成员将变为未归属。不可撤销。` : "单位将被删除，不可撤销。",
  removeChildrenHint: (n: number) => `还有 ${n} 个下级单位，先删掉它们`,
  removeDone: (unplaced: number) => `${unplaced} 位成员已变为未归属`,
  destructiveTitle: "{verb}{target}？",
  cancel: "取消",
  // 部门设置 (owner, 2026-09-11: 新建部门 - 单位设置，改名成部门设置) -
  // 跟随 newUnit 的改名，配上表单本身这一节的标题；表单里的字段名
  // （上级单位/单位类型/单位代码/单位名称）不动，改的只是这一节的标题。
  // 极简，用户视角，标题与板块各说各的 (owner, 2026-09-11: icon-title-desc
  // 全面简化) - formWhy 是页头一句"这是干什么的"，formSectionWhy 是板块
  // 标题下那句"这里填什么"；两句说同一件事就是重复，所以是两个不同的句子，
  // 不是同一句抄两遍。
  formTitle: "部门设置",
  formWhy: "配置这个部门的归属、类型与负责人。",
  formSectionWhy: "上级单位、单位类型、代码、单位名称与负责人。",
  parentField: "上级单位",
  parentNone: "无（顶层）",
  parentHint: "不能选它自己或它的下级。",
  kindField: "单位类型",
  kindUnset: "请选择",
  kindConfigure: "配置",
  code: "单位代码",
  codeHint: "小写字母、数字和下划线，字母开头，如 south_team1。创建后不可更改。",
  codeLocked: "创建后不可更改。",
  nameLabel: "单位名称",
  leaderField: "负责人",
  leaderHint: "从成员里选一位；可以先不指定。",
  save: "保存单位",
  discard: "放弃",
  saveFailed: "保存失败",
  // 关联区域 (incr/0055, owner 2026-09-11: 组织到大区应该直连，不绕销售
  // 区域一跳 - 域，与部门设置同级标题，提供icon title；按钮放在标题的区，
  // 居右显示) - 两个 mode 名是按钮文字，直接借用下面表格同一套徽标词做
  // 内容区占位（noTerritory），不用再造一套长句 - 同一件事只该有一种
  // 说法。选择区域（原手动选择改名，放第一个）合并了"切到手动"和"打开
  // 抽屉"两步。
  formDivisionTitle: "关联区域",
  divisionModeAggregate: "向下聚合",
  divisionModeInherited: "向上继承",
  divisionModeNone: "无区域",
  formDivisionChoose: "选择区域",
  formDivisionDone: "已更新关联区域。",
  // 内容区空态 (owner, 2026-09-11: 内容区空时显示请选择，选择后展示关联
  // 区域或描述) - NEW 在点过按钮之前都是这句；EDIT 永远有真实答案，用不
  // 上它。
  formDivisionUnset: "请选择",
  // 已设定/已选择 (owner, 2026-09-11: 设定向下聚合/向上继承不能一直显示为
  // 无范围 - 应该先给标签「已设定：X」，再显示结果：范围名称或无范围) -
  // 向下聚合/向上继承共用 divisionSetLabel，套上各自的模式名；无区域套上
  // noTerritory 的说法而不是 divisionModeNone，跟结果行说的是同一个词。
  // 选择区域不叫"设定"，是"选择"。
  divisionSetLabel: (mode: string) => `已设定：${mode}`,
  divisionChosenLabel: "已选择",
  formDivisionDrawerTitle: "选择关联区域",
  formDivisionDrawerWhy: "勾选这个部门直接归属的大区；一个大区可以挂多个部门。全部不选就是暂不关联，跟着组织架构自动聚合或继承。",
  formDivisionDrawerEmpty: "还没有可选的大区。先到区域设置里创建。",
  // 重置预置改名应用模版 (owner, 2026-09-11)。
  templateReset: "应用模版",
  templateTitle: "应用模版",
  templateWhy: "选一套预置组织模版作为起点，之后随便改；也可以同步把区域设置一起套上。",
  templateOption: (name: string, units: number) => `${name} · ${units} 个单位`,
  templateDefault: "默认",
  templateDangerTitle: "这是不可撤销的替换",
  templateWarn: (units: number, placed: number, divisionName: string | null, currentDivisions: number) => {
    const org = units === 0
      ? "当前没有单位，直接套用模版。"
      : `当前 ${units} 个单位将全部删除；${placed} 位成员的所属单位将清空，需要重新归属。`;
    if (!divisionName) return org;
    const division = currentDivisions === 0
      ? `同时会应用「${divisionName}」区域设置模版。`
      : `同时会用「${divisionName}」替换当前 ${currentDivisions} 个大区。`;
    return `${org}${division}`;
  },
  templateConfirm: "确认替换",
  templateVerb: "替换",
  templateTarget: (name: string, divisionName: string | null) => divisionName ? `为「${name}」+「${divisionName}」` : `为「${name}」`,
  templateDone: (units: number, unplaced: number, detached: number, divisions: number, territories: number, linkedUnits: number) => {
    const org = `已套用模版：${units} 个单位；${unplaced} 位成员待重新归属${detached > 0 ? `；${detached} 个销售区域已解除挂靠` : ""}`;
    if (divisions === 0) return org;
    return `${org}；同步套用 ${divisions} 个大区，新建 ${territories} 个销售区域${linkedUnits > 0 ? `，自动关联 ${linkedUnits} 个机构` : ""}`;
  },
  // 应用模版选择面板优化 (owner, 2026-09-11: 应用模版选择面板需要优化了 -
  // 组织架构模版三选一不变；区域设置模版可选，选了就同步在区域设置应用同一
  // 套（五分法/七分法），并按大区逐个新建同名销售区域；自动关联现在是独立
  // 的第三节（owner: 把关联选项作为第三个标题），没同步区域设置就没有新
  // 销售区域可关联，禁用并说明原因。
  templateOrgLabel: "组织架构模版",
  templateDivisionLabel: "区域设置模版",
  templateDivisionWhy: "同步选一套预置的大区划分；不选就不动区域设置。",
  templateDivisionUnavailable: "小规模简单团队没有大区这一层，选它就不能同步区域设置。",
  templateDivisionNone: "不同步",
  templateDivisionOption: (name: string, divisions: number) => `${name} · ${divisions} 个大区`,
  templateAssociateLabel: "自动关联",
  templateAutoAssociate: "按名称自动关联机构与新建的销售区域",
  templateAutoAssociateHint: "机构名字里带着销售区域的名字才会关联，例如「华北大区」机构关联「华北」销售区域。",
  templateAutoAssociateDisabled: "先在上面选一套区域设置模版，才有新建的销售区域可以关联。",
  // 关联区域（incr/0052）：单位这一侧的关系。四态名称统一改短（owner，
  // 2026-09-11）：全范围/已聚合/已继承/无范围 - 表格里显示的是第一个关联
  // 区域的实际名称（=区域设置里的名称）加圈数字，这四个词现在只出现在
  // tooltip 和详情抽屉里，标记"这是哪一种"。
  colTerritories: "区域",
  noTerritory: "无范围",
  fullTerritory: "全范围",
  fullTerritoryHint: "这个单位的下属子树覆盖了全部销售区域。",
  aggregateTerritory: "已聚合",
  // 已继承（owner，2026-09-11：下级没有设置区域，应该显示继承上级）：这个
  // 单位自己的子树没有关联任何销售区域，效力上跟着最近一个有区域的上级走 -
  // 不是真的没有权限，是这一级没单独配置。
  inheritedTerritory: "已继承",
  inheritedTerritoryHint: (ancestorName: string) => `这个单位自己没有关联区域，继承了「${ancestorName}」的区域范围。`,
  detailsTerritories: (n: number) => `关联区域 · ${n} 个`,
  detailsNoTerritories: "还没有销售区域挂在这个单位。到销售区域的表单里勾选所属单位。",
  territoryCovers: (regions: string) => `覆盖 ${regions}`,
  territoryCoversNone: "未覆盖任何大区",
  removeDetached: (n: number) => `${n} 个销售区域已解除挂靠`,
  emptyTitle: "还没有单位",
  emptyWhy: "新建一个，或应用模版。",
  // 迁到… (owner, 2026-09-11: 操作面板增加 [迁到...] - 点点也是菜单名构成) -
  // 换一个上级单位，不改代码、名称、类型或负责人；跟 /admin/org/{id} 的完整
  // 编辑表单是同一个写入路径（saveOrgUnitAction），只是这里只问"迁到哪"。
  moveTo: "迁到…",
  moveTitle: (name: string) => `迁到 - ${name}`,
  moveWhy: "选一个新的上级单位；不能选它自己或它的下级。",
  moveField: "新的上级单位",
  moveConfirm: "迁移",
  moveDone: (name: string) => `已迁移「${name}」`,
  // 批量删除 (owner, 2026-09-11: 删除（选择后红色-需二次确认）) - BulkActionBar
  // 自己的两步：点了先弹确认，onConfirm 落锤。仍有下级单位的不在这批里删,
  // 跳过并如实说跳过了几个 - 沉默地少删几个，比报一个笼统的失败更诚实。
  selectionNoun: "个单位",
  clearSelection: "取消选择",
  bulkRemove: "删除",
  bulkRemoveTarget: (n: number) => `已选的 ${n} 个单位`,
  bulkRemoveConsequence: "所选单位会被删除，归属其中的成员将变为未归属；仍有下级单位的不会被删除。不可撤销。",
  bulkRemoveDone: (removed: number, unplaced: number) =>
    `已删除 ${removed} 个单位${unplaced > 0 ? `；${unplaced} 位成员已变为未归属` : ""}`,
  bulkRemoveSkipped: (n: number) => `${n} 个仍有下级单位，未删除`,
  // 搜索/筛选 (owner: 表头操作行参照 /admin/permissions 补齐, 筛选组的补齐)。
  toolbarFilteredCount: (shown: number, total: number) => `筛选出 ${shown} / 共 ${total} 个单位`,
  searchPlaceholder: "搜索单位名称或代码",
  searchLabel: "搜索",
  resetFilters: "重置筛选",
  kindFilterLabel: "按类型筛选",
  filterAllKinds: "全部类型",
} as const;

export const ORG_KIND_TEXT = {
  // 层级设置 (owner, 2026-09-11): 页面标题跟 ORG_TEXT.kindsButton 的按钮名
  // 保持一致 - 点了"层级设置"落地页却叫"单位类型"，是同一件事两种说法。
  title: "层级设置",
  why: "组织里有哪些层级的单位：总部、事业部、大区、分公司、团队。可改名、排序、新增；有单位在用的类型不能删。",
  count: (n: number) => `${n} 种类型`,
  noun: "类型",
  add: "新建类型",
  save: "保存",
  codeLabel: "类型代码",
  codeHint: "小写字母、数字和下划线，字母开头。创建后不可更改；已存在的代码表示改名。",
  nameLabel: "类型名称",
  colName: "类型",
  colUnits: "单位数",
  deleteConsequence: "该类型将被删除。有单位属于它就删不掉。",
} as const;

export const ORG_ERROR: Record<string, string> = {
  ...GATE_ERROR,
  code_required: "代码不能为空",
  code_shape: "代码只能是小写字母、数字和下划线，且以字母开头",
  name_required: "名称不能为空",
  kind_unknown: "请选择一个单位类型；没有合适的，先在单位类型里加上",
  parent_not_found: "上级单位不存在，可能刚被删掉，刷新后重试",
  parent_cycle: "上级不能是它自己或它的下级",
  unit_has_children: "还有下级单位，先删掉它们",
  unit_unknown: "这个单位不属于当前工作区",
  template_unknown: "找不到这套预置模版",
  kind_in_use: "还有单位属于这个类型，先把它们改到别的类型",
  move_at_edge: "已经在这一端了",
  not_movable: "这一条不能移动",
  not_found: "找不到这个单位，可能刚被删掉，刷新后重试",
};

export const ROLE_GROUP_ERROR: Record<string, string> = {
  ...GATE_ERROR,
  code_required: "代码不能为空",
  code_shape: "代码只能是小写字母、数字和下划线，且以字母开头",
  name_required: "名称不能为空",
  line_in_use: "还有角色归在这条业务线下，先把它们改到别处",
  rank_in_use: "还有角色归在这个层级下，先把它们改到别处",
  move_at_edge: "已经在这一端了",
  not_movable: "这一条不能移动",
  not_found: "找不到这个分组，可能刚被删掉，刷新后重试",
};

/** 角色管理的拒绝理由。规则层给 code，句子在这里（TD-010）。 */
export const ROLE_ERROR: Record<string, string> = {
  ...GATE_ERROR,
  code_required: "角色代码不能为空",
  code_shape: "角色代码只能是小写字母、数字和下划线，且以字母开头",
  name_required: "角色名称不能为空",
  description_too_long: "角色说明最多 500 个字符",
  permission_unknown: "权限不在目录中，请从列表中选择",
  line_unknown: "请选择一个业务线；没有合适的，先在角色分组里加上",
  rank_unknown: "请选择一个层级；没有合适的，先在角色分组里加上",
  role_unknown: "这个角色不属于当前工作区",
  role_in_use: "还有成员持有这个角色，先在成员管理里移除，再删",
  last_admin: "这是工作区管理员持有的唯一管理角色；去掉配置管理权限后将无人能再改回来",
  move_at_edge: "已经在这一端了",
  not_movable: "这一条不能移动",
  not_found: "这个角色不存在，或不属于当前工作区",
  // 关联成员走 assignRole/revokeRole（authz/admin.ts），错误码和上面几条角色自
  // 己的校验不是一套 - unknown_role 是那边的 role_unknown，sub_required 理论上
  // 不会触发（sub 总来自已加载的成员行），保留是不把裸码露给读者。
  unknown_role: "这个角色不属于当前工作区",
  sub_required: "缺少成员标识",
};

export const TERRITORY_ERROR: Record<string, string> = {
  ...GATE_ERROR,
  // incr/0036 的两个：省份词表与大区归属，都由数据库约束，说人话而不是抛约束名。
  province_unknown: "省份必须是全国 34 个省级行政区之一",
  division_unknown: "这个大区不属于当前工作区",
  // incr/0043-0045：框架与代码、预置、范围本身、成员。
  template_unknown: "找不到这套预置方案，或它切的不是当前市场范围",
  scope_not_open: "这个市场范围还没开放，先用中国市场",
  scope_code_required: "省级市场要指定是哪个省",
  scope_province_not_open: "这个省还没开放省级市场",
  member_unknown: "成员必须在当前市场范围之内，请从列表中选择",
  code_prefix: "区域代码必须带当前市场范围的前缀",
  code_shape: "区域代码只能是字母、数字和下划线；省级市场下不带前缀",
  move_at_edge: "已经在这一端了",
  not_movable: "这一条不能移动",
  not_found: "这个区域不存在，或不属于当前工作区",
  code_required: "区域代码不能为空",
  name_required: "区域名称不能为空",
  unknown_status: "未知的区域状态",
  parent_not_found: "上级区域不存在",
  parent_cycle: "区域不能直接或间接地成为自己的上级",
  // 可达是 2026-08-31 才成立的：校验器一直存在，但写路径从没调用过它。
  region_too_long: "区域名最多 64 个字符——超过这个长度的多半是粘错了列",
  // incr/0052：挂靠的单位必须是当前工作区的。
  unit_unknown: "这个单位不属于当前工作区",
};

/**
 * 销售目标。
 *
 * 此前 `set-target` 把服务端动作的 `error` 直接渲染出来，既没有字典也没有兜底 ——
 * 于是屏幕上出现的是规则层的英文自述。TD-010。
 */
export const TARGET_ERROR: Record<string, string> = {
  ...GATE_ERROR,
  name_required: "目标需要一个名称",
  period_required: "目标必须写明周期",
  unknown_metric: "未知的指标类型",
  unknown_status: "未知的目标状态",
  count_not_integer: "计数类指标必须是整数——家数、个数不存在小数",
  unit_mismatch: "单位与该指标不符",
  amount_negative: "金额不能为负",
  currency_mismatch: "币种与上级目标不一致",
  scope_incomplete: "这个口径还缺必填项，无法确定它指向谁",
  scope_overspecified: "这个口径同时指定了互相排斥的对象",
  scope_immutable: "目标的口径建好后不能改——换口径等于换一个目标",
  duplicate_scope: "同一周期同一口径已经有一个目标了",
  target_closed: "这个目标已收尾，它是当期据以考核的记录",
  status_regression: "目标状态不能倒退",
  parent_not_found: "上级目标不存在",
  parent_cycle: "目标不能直接或间接地成为自己的上级",
  not_found: "目标不存在，或不属于当前工作区",
};

/**
 * 预测快照。同上：`submit-forecast` 也是直接渲染 `error`。
 */
export const FORECAST_ERROR: Record<string, string> = {
  ...GATE_ERROR,
  period_required: "快照必须写明它服务的周期",
  period_unparsed: "无法识别这个周期的写法",
  currency_mismatch: "币种与商机不一致",
  unknown_forecast_category: "未知的预测类别",
  unknown_scope_type: "未知的口径类型",
  scope_incomplete: "这个口径还缺必填项，无法确定它指向谁",
  scope_overspecified: "这个口径同时指定了互相排斥的对象",
  closed_requires_terminal_stage: "未关闭的商机不能标记为「已成交」",
  terminal_requires_closed: "已关闭的商机只能是「已成交」类别",
};

export const OPPORTUNITY_ERROR: Record<string, string> = {
  // YC-065 R1 未满足推进须理由 (deal batch 5b).
  exit_unmet_reason_required: "本阶段还有退出条件未满足，推进需要写一句理由",
  // YC-065 R9 偏离规则须理由.
  category_reason_required: "把类别调得比规则建议更乐观，需要写一句理由",
  // incr/0082 - 本单定制说明 on a line.
  custom_note_too_long: "定制说明最多 255 个字",
  // incr/0080 - 钱包份额's denominator.
  customer_budget_negative: "客户项目总投入不能为负",
  customer_budget_invalid: "客户项目总投入要填数字",
  // incr/0034 - the deal entry gate. Both are refused by planNewOpportunity
  // and by the database, so both can reach a person.
  owner_required: "商机必须有负责人",
  requirement_required: "商机必须写清客户要什么",
  ...GATE_ERROR,
  stage_unchanged: "已经在这个阶段了，不会记录空变更",
  abandoned_closed: "这一单已放弃;要继续推进,请先勾选「重开」并说明理由",
  exit_reason_required: "请选择原因",
  exit_reason_invalid: "这个原因不适用于此处",
  exit_note_required: "选「其他」时请写一句具体原因",
  not_open: "只有进行中的商机才能放弃",
  terminal_stage: "商机已关闭；重开需要显式确认",
  reason_required: "这次变更必须写明理由",
  unknown_stage: "未知阶段",
  not_found: "商机不存在，或不属于当前工作区",
  probability_range: "赢率必须是 0 到 100 之间的整数",
  terminal_probability_fixed: "已关闭的商机赢率固定，不能修改",
  amount_negative: "金额不能为负",
  empty_patch: "没有改动",
  closed_requires_terminal_stage: "未关闭的商机不能标记为「已成交」",
  terminal_requires_closed: "已关闭的商机只能是「已成交」类别",
  name_required: "商机需要一个名称",
  account_required: "商机必须挂在一个客户下",
  unknown_forecast_category: "未知的预测类别",
  quantity_positive: "数量必须大于零",
  not_below_floor: "这一行没有低于底价，没有需要批准的东西",
  already_approved: "这个价格已经签过字了",
  not_priced: "这个产品没有价格表条目，无法说明在批准什么",
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
  propose_upsell: "推荐增购",
  flag_conflict: "疑似说法不一致",
  record_evidence: "写入购买证据",
  set_buying_role: "标注本单角色 / 立场",
  add_commitment: "记下一条承诺",
  plan_step: "推进计划的一步",
  promote_signal: "信号升级为线索",
};

export const PROPOSAL_TEXT = {
  why: "参谋提出的动作，由人裁决。机器只提议，采纳与否你定（ADR-003）。",
  // 客户详情页 (owner, 2026-09-18): 采纳/忽略不在本页内联执行——按 ADR-003，
  // 真正的裁决只在队列页发生，这里的按钮只是把人带过去。分析仅在有理由文本
  // 时出现：没有 rationale 就没有值得深挖的东西。
  viewInQueue: "去队列裁决",
  analyze: "分析",
  analyzeQuestion: (title: string, rationale: string) =>
    `再深入分析一下这条建议：「${title}」。理由是：${rationale}`,
  tagAwaiting: (n: number) => (n === 0 ? "没有待裁决的" : `${n} 条待裁决`),
  tagLowConfidence: (n: number) => `${n} 条把握不高`,
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
  // The expanded row (DataTable's own `expandedContent`). These three are not
  // on the row at any width: payload is what the action would actually DO, and
  // capability is which capability proposed it (ADR-015) - both frozen at
  // creation and both invisible until now.
  detailRationale: "完整理由",
  detailPayload: "变更内容",
  detailCapability: "提出能力",
  detailProposedAt: "提出时间",
  detailExpand: "展开",
  detailCollapse: "收起",
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
  /** 采纳成功、但业务动作真的试过并被拒。说清楚「签了字，事情没发生」这一种情况。 */
  executionFailed: (count: number, reason: string) =>
    `已采纳，但其中 ${count} 条没能执行：${reason}。这些提案已标记为失败，重试需要新的提案。`,
  /** 采纳成功，但产品还不会自动做这种事——没试过，所以不算失败。 */
  acceptedForManual: (count: number) =>
    `已采纳。其中 ${count} 条产品还不能自动执行，需要人去做；这些提案保持「已采纳」，没有被判为失败。`,
  /** 行内标记：这条采纳了也不会自动发生。 */
  manualBadge: "需人工执行",
  /** 枚举标签的连接符。标点也是文案，中英文不同，所以不留在组件里（TD-002）。 */
  joinLabels: (labels: readonly string[]) => labels.join("、"),
  acceptManualNote: (manual: number, total: number) =>
    `这 ${total} 条里有 ${manual} 条产品不会自动执行（例如对外触达——发出去的消息收不回来）。采纳表示你认可这个判断，事情仍需要人去做。`,
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
  /** The rationale is the only free text on a proposal row: the action type
   *  is what the filter is for, and the subject is a uuid. */
  searchHint: "判断理由",
  filterAllStatus: "全部状态",
} as const;

/**
 * Copy this product hands to the DS's DataTable.
 *
 * It lives in messages.ts rather than in ds-labels.ts because it is COPY, and
 * copy now follows the request's locale. ds-labels.ts is a plain module frozen
 * at import time - fine before there were two languages, wrong the moment
 * there were.
 *
 * The shipped default for `rowActions` is "Actions", not the 「操作」 the type's
 * doc comment claims. That one English word sat in an otherwise Chinese header
 * row - and it was NOT a DS gap, which is what it looked like at first: the
 * prop exists, this product simply was not passing it.
 */
export const DATA_TABLE_LABELS = {
  expand: "展开",
  selectAll: "全选本页",
  deselectAll: "取消本页全选",
  selectRow: "选择本行",
  rowActions: "操作",
} as const;

/**
 * 表格工具行的公共文案 - the three strings every FilterBar needs.
 *
 * `searchHint` is deliberately NOT here. It names the fields the box actually
 * searches ("公司、线索号、联系人、负责人"), which differs per table and is the
 * only thing telling a reader what a keyword will and will not match - a
 * generic "搜索" placeholder would be the same word ten times and would say
 * nothing.
 */
/** 全国销售态势屏 - the situation screen's own copy. */
export const SCREEN_TEXT = {
  title: "市场态势图",
  subtitle: "National Sales Situation Screen",
  deniedTitle: "无法显示态势屏",
  /** Says WHICH gate, without naming permissions a reader cannot act on. */
  deniedDescription:
    "态势屏汇总线索、商机、合同、副驾、交付与回款六个面，需要同时具备客户、商机、交付、线索与副驾五项查看权限。缺少其中任意一项时不做部分展示——少算的全国数字比不展示更糟。",
  home: "平台首页",
  provinceCount: "覆盖省份",
  openDeals: "在跑商机",
  unplacedNote: (n: number) => `${n} 家客户未填省份，计入全国合计但不落图`,
  // 面包屑与下钻
  nation: "全国",
  regionDefault: "默认",
  drillHint: "点击省份下钻 · 右键或点击空白返回",
  backHint: "右键 / 点击空白返回上一级",
  back: "返回上一级",
  // 指标
  metricContract: "合同额",
  metricPipeline: "商机额",
  metricInDelivery: "在交付",
  metricHealth: "健康度",
  // 漏斗
  funnelAccounts: "客户",
  funnelPipeline: "商机",
  funnelContract: "合同",
  funnelDelivery: "在交付",
  noReading: "暂无",
  /** Money units. COPY, not constants - the English locale says 100M, not 亿元. */
  unitYi: "亿元",
  unitWan: "万元",
  unitYuan: "元",
  accountsUnit: (n: number) => `${n} 家`,
  // 六个板块 (D1-D7 的态势切面). 每个板块一个主数字 + 两个副数字。
  panelLeads: "线索供给",
  panelPipeline: "商机储备",
  panelContract: "签约合同",
  panelCopilot: "智能副驾",
  panelDelivery: "交付履约",
  panelCollection: "回款兑现",
  // 线索供给. 「新线索」而非「本期新增」: 线索表的 created_at 没有出现在
  // LeadRecord 上, 按状态取 new 是数据真正支持的口径, 不假造一个时间窗。
  cellLeadsNew: "新线索",
  cellLeadsUnclaimed: "待认领",
  cellLeadConversion: "转商机率",
  // 商机储备. 「均单值」是商机额 / 在跑商机, 由现有数据直接得出。
  cellPipelineValue: "商机金额",
  cellOpenDeals: "在跑商机",
  cellAvgDeal: "均单值",
  // 签约合同
  cellContractValue: "合同额",
  cellWonDeals: "签约数",
  cellWinRate: "赢率",
  // 智能副驾
  cellAdoption: "提案采纳率",
  cellAdoptionSub: (a: number, n: number) => `${a} / ${n} 已采纳 · 近 30 天提案`,
  cellPending: "待裁决队列",
  // 交付履约
  cellInDelivery: "在交付合同额",
  cellProjectsLive: "在建项目",
  cellHealth: "健康度",
  // 回款兑现
  cellCollected: "已回款",
  cellReceivable: "应收余额",
  cellOverdue: "逾期",
  cellWeighted: "加权预测",
  cellOnTime: "里程碑准点",
  cellInfluenced: "影响金额",
  qualExpected: "预期",
  qualLate: "延期",
  adoptionSuffix: "已采纳 · 近 30 天提案",
  chartLeads: "近 12 期新增线索",
  chartSign: "近 12 期签约额",
  chartAdoption: "采纳率 · 近 30 天",
  chartCash: "近 7 期回款率",
  cashCollected: (p: string) => `已回款 ${p}`,
  cashOverdue: (p: string) => `逾期 ${p}`,
  stageLabels: ["初步接洽", "方案验证", "商务谈判", "决策签批"],
  healthLabels: ["健康", "有隐忧", "高风险"],
  healthCentre: "健康占比",
  funnelLeads: "线索",
  funnelCollected: "回款",
  leadsUnit: "条",
  enterFullscreen: "全屏显示",
  exitFullscreen: "退出全屏",
  switchLocale: (to: string): string => (to === "en-US" ? "切换到 English" : "切换到中文"),
  settingsSoon: "设置（暂未开放）",
  periodResolving: "读取时钟中…",
  periodAll: "全部",
  periodYear: (y: number) => `${y} 年度`,
  periodQuarter: (y: number, q: number) => `${y}Q${q}`,
  emptyPeriod: (p: string): string => `${p} 没有记录：换一个统计周期看看`,
  enter: "进入",
  uncovered: "未覆盖",
  viewerRole: "销售运营 · 全国",
  foldTitle: "收起标题",
  unfoldTitle: "展开标题",
  foldRails: "收起两侧",
  unfoldRails: "展开两侧",
  dealsUnit: (n: number) => `${n} 个`,
} as const;

export const TABLE_TOOLBAR_TEXT = {
  searchLabel: "检索",
  resetFilters: "清空筛选",
  /** Beside a narrowed list. Both numbers, because "6 条" alone reads as the
   *  whole list to somebody who has forgotten a filter is on. */
  filteredCount: (n: number, total: number) => `${n} / ${total} 条`,
  noMatch: "没有匹配的记录",
  noMatchWhy: "换个关键词，或把筛选条件放宽。",
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
  // 标题行的标签 (owner, 2026-09-06). Counts of what this page HOLDS, so a
  // badge and the queue beneath it are the same arithmetic.
  dismissWhy: "记下为什么忽略。否则同一条信号下周再进来，没人分得清是看过否掉的，还是根本没看。",
  dismissReason: "原因",
  dismissReasonPick: "选择原因",
  dismissNote: "补充说明",
  dismissNoteRequired: "选了「其他」就必须写清楚",
  dismissNoteOptional: "可留空",
  scoutTitle: "智探判断",
  scoutQuiet: "没有可提的：没有重复，没有能对上的客户，也没有扎堆的公司。",
  scoutDuplicate: (n: number) =>
    n === 0 ? "同一天还有一条同类信号，像是同一件事报了两次" : `${n} 天前还有一条同类信号，像是同一件事报了两次`,
  scoutMatch: (account: string) => `信号里提到了客户档案中的「${account}」`,
  scoutMatchAccept: "匹配到这家",
  scoutClusters: "扎堆的公司",
  scoutCluster: (subject: string, n: number, kinds: number) =>
    `${subject}：${n} 条待判信号，${kinds} 种类型——一条线，不是 ${n} 件事`,
  tagSignals: (n: number) => `${n} 条情报待判`,
  tagNamed: (n: number) => `${n} 条命名客户`,
  tagStale: (n: number) => `${n} 条已衰减`,
  tagLeads: (n: number) => `${n} 条线索`,
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
  proposalsFromTurn: (n: number) => `本轮提出了 ${n} 条建议动作，待你裁决`,
  droppedProposals: (n: number) =>
    `另有 ${n} 条建议未记录：当前档位不含「助手主动建议」能力`,
  capabilitiesUsed: (names: string) => `调用了外部能力：${names}`,
  truncated: "本轮工具调用已达上限，回答基于已获取的信息",
  errorPrefix: "助手无法作答：",
  errorNotConfigured: "模型平面尚未接入（需要运营侧完成注册与授权）",
  errorNoGrant: "本产品在模型平面上还没有被授权",
  errorQuota: "模型用量配额已耗尽",
  errorTurnQuota: "本工作区的参谋对话轮次配额已用完",
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
  tagTotal: (n: number) => `${n} 家客户`,
  tagAtRisk: (n: number) => `${n} 家健康度告警`,
  tagOverdue: (n: number) => `${n} 家跟进逾期`,
  tagCompletable: (n: number) => `${n} 家资料可补全`,
  // The fact that used to be a board card, now beside the customer it is about.
  buyerUnreachable: "决策人未触达",
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
  // Two merged headers (2026-09-04), same reasoning as PIPELINE_TEXT:
  // industry and segment are both how this customer is FILED, health and
  // status are both what CONDITION it is in. The name cell beside them
  // already runs two lines, so stacking costs no row height.
  columnIndustrySegment: "行业 / 细分",
  columnOwner: "负责人",
  columnHealthStatus: "健康度 / 状态",
  unscored: "未评估",
  emptyTitle: "还没有客户",
  emptyDescription: "线索转化或手工录入后，客户会出现在这里。",
  rowCount: (n: number) => `${n} 家客户`,

  // The action column. Both verbs are always listed; the one the member may not
  // use is disabled with the reason, not hidden - a menu whose contents change
  // with the viewer teaches nobody what the product can do.
  // The way back. A detail page reached from a list owes the reader the list -
  // it is the most common next action, and with the board gone the shell no
  // longer offers it.
  // The theatre command post. This page is not a record card - it is where a
  // multi-year relationship is commanded from, and its two new blocks are the
  // two things it could not previously say: what is being fought here, and
  // what to do next.
  roster: "阵地清单",
  rosterNoDeals: "没有在办商机",
  rosterNoProjects: "没有交付项目",
  // header 第二行, 跟 ACC-0001 并列 (owner, 2026-09-20: 死死记住设计文件 -
  // mockup 原话: `<span>销售负责人 王涛</span>`, 纯文本, 不是按钮, 不在
  // 单位信息卡片里). 之前把这个字段错放进了单位信息的 DetailList, 用的还是
  // "负责人"这个通用词 - mockup 自己解释了为什么要叫"销售负责人": 客户联系人
  // 里也有真人姓名, 光说"负责人"分不清是对方的人还是我方的人。
  headerOwner: (name: string) => `销售负责人 ${name}`,
  collaboratorsLine: (names: readonly string[]) => `协作人 ${names.join("、")}`,
  dossier: "战区档案",
  dossierOwner: "负责人",
  dossierIndustry: "行业",
  dossierRegion: "区域",
  dossierContacts: "联系人",
  dossierCoaches: "已建内线",
  dossierBlockers: "有阻力",
  dossierUnreachable: "决策人未触达",
  plan: "战区作战方案",
  planWhy:
    "关系层面的下一步，不是某一单怎么推——那属于阵地。智能体提议，你裁决。",
  planEmpty: "暂无待裁决的方案",
  planEmptyWhy:
    "没有提案时不是没有问题，是还没有人问。向参谋提问会产出建议动作。",
  planCounselorOverview: "参谋能力概览",
  planSilentCaps: (n: number) => `其余 ${n} 项暂无提案`,
  planCounselorCount: (n: number) => `${n} 项参谋能力`,
  planProposalSummary: (n: number) =>
    `共 ${n} 条待裁决提案，已在右侧副驾面板展示`,
  planMemo: "随手记",
  planMemoPlaceholder:
    "在这里记录对该客户的直觉、备忘、策略想法...",

  // 单位信息 (owner, 2026-09-18: 客户详情页重排): 上级 + 下级，同一张图的两半。
  // 上级/下级的编辑现在都在 org-relations-editor.tsx (挂在"编辑单位信息"
  // 抽屉里) - 这张只读卡片只用 orgUnitChildren 显示计数。从 accountRows 按
  // parentId 过滤即可，不需要新的读接口。
  orgUnitTitle: "单位信息",
  orgUnitWhy: "这家客户在集团结构里的位置——谁在它上面，谁挂在它下面。",
  orgUnitChildren: (n: number) => `下级单位（${n}）`,
  // 行业/区域从 header 搬过来 (owner, 2026-09-20: 严格按照设计实施) - 这些是
  // 客户固有属性，属于栏1的档案，不是 header 该扛的身份识别信息。
  orgUnitIndustry: "行业",
  orgUnitRegion: "区域",
  orgUnitScale: "规模",
  orgUnitNature: "性质",
  orgUnitType: "类型",
  // 更多资料 (YC-021 L1: 字段可读可改) - 设计图卡面只放五项, 其余收在这里,
  // 跟"下级单位"同一种展开方式。
  orgUnitMore: "更多资料",
  orgUnitProvince: "省份",
  orgUnitCreditCode: "信用代码",
  orgUnitWebsite: "官网",
  orgUnitEmployees: "员工数",
  orgUnitNotFilled: "未填写",

  // 决策链图谱弹窗：同一份 coverage/people 数据的图形化视图，不是新的读——
  // 缺失的角色直接来自 coverage.missing，不是编出来的「未识别」占位。
  graphTitle: "决策链图谱",
  graphWhy: (dealName: string) => `「${dealName}」的决策链——若商机未单独定义，展示客户级默认决策链`,
  graphMissingRole: "缺失，未识别到人",
  graphUnreachable: "经济决策人未触达",
  graphOpen: "查看决策链图谱",
  // 关系图例的两条 (owner, 2026-09-21: 人际及利益博弈关系) - 线的图例, 跟
  // 上面角色(点)的图例分开列。
  graphRelationConnected: "有关系记录",
  graphRelationOpposed: "对立关系",

  // 全链条内容的四个分区（商机/交付项目/回款/跟进记录），复用 AnalysisTabs。
  lifecycleDeals: "商机",
  lifecycleProjects: "交付项目",
  lifecycleRevenue: "回款",
  lifecycleInteractions: "跟进记录",
  lifecycleNoMilestones: "还没有里程碑",
  lifecycleNoInstalments: "还没有回款计划",
  lifecycleMilestonesFailed: "这个项目的里程碑没读到——不是没有，刷新再看",
  lifecycleOverdueTotal: (n: number, amount: string) => `逾期 ${n} 笔 · ${amount}`,
  // 应收总览: summarizeCollections() 早就在算 planned/collected (projectView()
  // 已经把它读出来给了页面, 只是没接到这张卡上) - 待回款 = planned - collected,
  // 两个真实 Money 相减, 不是新造的数。多个项目、货币不同时不硬加总, 宁可不
  // 显示这行, 也不把不同币种的数字加在一起充当一个总数。
  lifecycleRevenueOverview: "应收总览",
  // 商机卡跳到自己那条决策链 (owner, 2026-09-20: mockup 每张商机卡都有一个
  // "本商机的决策链"链接) - 真实数据里每个开放商机本来就有自己的一条链
  // (decisionChainsByOpportunity), 不是 mockup demo 里"没单独定义就读企业
  // 默认"那种回退, 所以措辞直接是"查看", 不用"未单独定义"这类免责声明。
  lifecycleViewChain: "查看本商机的决策链",
  lifecycleStalledDays: (n: number) => `停留 ${n} 天`,

  backToList: "客户管理",
  openAccount: "打开客户",
  recompute: "重算健康度",
  recomputeHint: "按当前源数据重新计算，结果立即写回",
  recomputeDenied: "没有重算健康度的权限",
  recomputedTitle: "健康度已重算",
  recomputedOn: (name: string, score: number | null) =>
    score === null ? `${name}:数据不足，仍为未评估` : `${name}:${score} 分`,
  recomputeFailed: "重算失败",

  batchCompleteBanner: (n: number) =>
    `${n} 家客户资料数据能推出来，可以批量补齐`,
  batchCompleteLink: "去处理",

  contactsTitle: "联系人",
  contactsWhy:
    "客户内部的人，以及每个人对这笔生意是什么角色。上面那张决策链图和首页的「决策人未触达」都是从这里的角色算出来的。",
  contactsNone: "还没有联系人",
  contactsNoneWhy: "先把见过的人记下来，决策链才有东西可算。",
  contactName: "姓名",
  contactTitle: "职务",
  contactDepartment: "部门",
  contactRole: "决策角色",
  contactInfluence: "影响力 0-100",
  // incr/0024. 手机排在最前:决策链上真正会被用到的是它。
  contactFormTitle: (name: string) => `联系人 · ${name}`,
  contactFormWhy:
    "这个人是谁、在哪个部门、怎么联系得上。他在某一单里扮演什么角色,在那一单的页面上定。",
  contactMobile: "手机",
  contactEmail: "邮箱",
  contactWechat: "微信",
  // 邮箱/微信 presence 列的表头 (owner, 2026-09-20: 设计图严格对齐).
  contactChannels: "联系方式",
  contactStatus: "状态",
  // 同类对标 (YC-021 L5): a percentile only with enough peers, else why not.
  benchmark: (b: PeerBenchmark): string =>
    b.kind === "ok"
      ? `同行业同规模 ${b.peers} 家客户中，健康度高于 ${b.percentile}% 的客户（按各自最近一次评估）`
      : b.kind === "thin"
        ? `同行业同规模只有 ${b.peers} 家有健康分，不足 ${b.needed} 家，不给分位`
        : b.kind === "unclassified"
          ? `未设置${b.missing.map((m) => (m === "industry" ? "行业" : "规模")).join("和")}，没有可对标的同类客户`
          : "还没有健康分，无法对标",
  contactStatusLabel: {
    active: "在职",
    left: "已离职",
    invalid: "信息作废",
  } as Record<string, string>,
  contactEditing: "编辑谁",
  contactNew: "新建联系人",
  // 卡头按钮, 比 contactNew 短 (owner, 2026-09-20: mockup 原话 "+ 新增").
  contactAddButton: "+ 新增",
  contactSave: "保存联系人",
  contactViewDetail: "查看详情",
  contactSaved: "已保存",
  contactsDenied: "你没有维护联系人的权限",
  // The owner is a raw subject id and is rendered as one. There is no display
  // name on the record to resolve it against; dressing a machine string as a
  // person is how a UUID ends up in front of someone who then does not chase it.
  ownerNone: "未指派",
  // 只做 aria-label/tooltip 用 (owner, 2026-09-21: 联系人数量简化为一个数字，
  // tag 放到标题后面) - 卡头的数字标签本身只显示 contacts.length 这一个
  // 数, 这句完整的话挪到无障碍朗读/hover 上, 不在屏幕上常驻。
  contactCount: (n: number) => `${n} 位联系人`,
  // 联系人截断 (owner, 2026-09-20: 联系人截断+排序四元组) - 栏1 只有 18rem
  // 宽, 一张全量表格在这里比一句"还有几位"更占地方。
  contactsShowAll: (n: number) => `查看全部（${n}）位联系人`,
  contactsCollapse: "收起",
  // 精准显示最近联系天数 (owner, 2026-09-21: "90天内有跟进"表达很差，应该
  // 精准显示（nn天）前联系，非常简短显示; 补充: tag 显示只有（nn天），不要
  // 啰嗦，全是同样的字很难看) - tag 本身只放数字+"天", 不带"前"/"联系"这类
  // 每一行都重复的字; 完整的那句话("某某在12天前联系")挪进 tooltip, 见
  // contactRecencyTooltip。
  contactRecencyDays: (days: number) => `${days} 天`,
  contactRecencyTooltip: (name: string, days: number) => `${name} 在 ${days} 天前联系`,
  contactRecencyUnrecorded: "未联系",
  contactRecencyTooltipUnrecorded: (name: string) => `${name} 还没有联系记录`,
  // header 的商机数量维度 (owner, 2026-09-20: 严格按照设计实施) - 圆圈里的
  // 数字之外，还要有一句"N 个进行中"。
  openDealsCount: (n: number) => `${n} 个进行中`,
} as const;

export const ACCOUNT_STATUS_LABEL: Record<string, string> = {
  prospect: "潜在",
  active: "活跃",
  dormant: "沉睡",
  churned: "流失",
};

/** 阵地清单「合同」tab (incr/0076, L4 批一, owner 2026-09-22: 单卡)。 */
export const CONTRACT_TEXT = {
  tab: "合同",
  empty: "还没有登记合同",
  // 三分法 (设计 Q2.3): 权限不足 / 读失败 / 确实没有, 各是各的话。
  readFailed: "合同读取失败，稍后刷新重试——这不代表这家没有合同",
  add: "录入合同",
  edit: "编辑",
  addLine: "添加明细",
  removeLine: "移除",
  removeConsequence: "这条明细会从合同里删掉，已购态随之更新。",
  drawerCreate: "录入合同",
  drawerEdit: "编辑合同",
  drawerLine: "合同明细",
  save: "保存",
  saved: "已保存",
  removed: "已移除",
  fieldNo: "合同编号",
  fieldNoFrozen: "编号登记后不能改",
  fieldName: "合同名称",
  fieldStatus: "状态",
  fieldAmount: "合同金额",
  fieldCurrency: "币种",
  fieldTermStart: "起始日",
  fieldTermEnd: "到期日",
  fieldNotice: "通知期（天）",
  fieldSigned: "签署日",
  fieldDeal: "来源商机",
  fieldDealNone: "不关联",
  fieldDealFrozen: "来源商机登记后不能改",
  fieldProduct: "产品",
  fieldQty: "数量",
  fieldUnitPrice: "单价",
  fieldLineEnd: "明细到期日（留空＝随合同）",
  statusDraft: "草稿",
  statusActive: "生效",
  statusTerminated: "已终止",
  phaseDraft: "草稿",
  phasePending: "未开始",
  phaseInForce: "生效中",
  phaseLapsed: "已到期未续",
  phaseTerminated: "已终止",
  // L4 批二: 续约世系与续约事件 (incr/0078)
  phaseRenewed: "已续约",
  renew: "续约",
  drawerRenew: "续约为新合同",
  renewHint: (no: string) => `新合同记为 ${no} 的续约。一份合同只能续约一次，登记后不能改指。`,
  renewedFrom: (no: string) => `续自 ${no}`,
  renewedTo: (no: string) => `已续为 ${no}`,
  // 续约风险评分 (YC-021 L4, owner 2026-09-24: 规则分级 高/中/低).
  renewalRisk: (level: RenewalRiskLevel) => `续约风险 ${level === "high" ? "高" : level === "medium" ? "中" : "低"}`,
  renewalRiskNone: "没有命中任何风险信号",
  linesHeading: "合同明细",
  renewalRiskBasis: (b: RenewalRiskBasis): string => {
    switch (b.code) {
      case "notice_passed":
        return `通知截止已过 ${b.days} 天，没有在办的续约商机（+3）`;
      case "in_window":
        return `距通知截止还有 ${b.days} 天，已进续约窗口，没有在办的续约商机（+2）`;
      case "delivery_red":
        return `交付项目「${b.project}」红灯（+2）`;
      case "delivery_amber":
        return `交付项目「${b.project}」黄灯（+1）`;
      case "revenue_overdue":
        return `${b.count} 笔回款逾期（+1）`;
      case "quiet":
        return b.days < 0 ? "从没有接触记录（+1）" : `${b.days} 天没有接触记录（+1）`;
      case "prior_downgrade":
        return "上一份合同续约时降级（+1）";
      case "renewal_deal_open":
        return "已有在办的续约商机，通知期不计分";
    }
  },
  // 续约世系 (YC-021 L4): the whole chain, so a third-year contract reads as one.
  lineage: (position: number, total: number, chain: readonly string[]) =>
    `续约链 第 ${position}/${total} 份 · ${chain.join(" → ")}`,
  recordOutcome: "记录结果",
  drawerOutcome: "记录续约结果",
  fieldOutcome: "结果",
  outcomeLost: "流失（不再续约）",
  outcomeDowngraded: "降级续约",
  fieldReason: "原因",
  outcomeAppendOnly: "续约记录只能追加，保存后不能修改或删除；更正请再记一条。",
  eventRenewed: (no: string) => `续约为 ${no}`,
  eventDowngraded: "降级续约",
  eventLost: "流失",
  term: (start: string, end: string) => `${start} 至 ${end}`,
  termOpen: "期限未定",
  daysLeft: (n: number) => `${n} 天后到期`,
  noticeBy: (d: string) => `${d} 前须通知`,
  lineTotal: "明细合计",
  noLines: "还没有明细",
  lineUntil: (d: string) => `至 ${d}`,
  revenueTitle: "存量收入",
  revenueHint: "年化合同额按生效合同各自期限折算到一年；产品目录未区分订阅与一次性，故不称 ARR",
  revenueAnnualized: (n: number) => `年化合同额（生效中 ${n} 份）`,
  revenueLifetime: (n: number) => `历史合同总额（共 ${n} 份）`,
  revenueUnpriced: (n: number) => `另有 ${n} 份已签合同未填金额，未计入`,
  revenueNone: "还没有已签且填了金额的合同",
  ownedTitle: "已购态",
  ownedHint: "生效合同上未到期的明细",
  ownedEmpty: "当下没有在用的产品",
  // L4 批六: 白地 = 可售 − 已购态。目录读不到时说「未知」, 不说「全是白地」。
  whitespaceTitle: "白地",
  whitespaceHint: "在售、这家当下还没在用的产品；增购推荐由每日巡检按同行业已购率提出，进作战方案裁决",
  whitespaceUnknown: "产品目录读取失败或没有在售产品，白地未知——这不代表这家什么都没买，也不代表都能卖",
  whitespaceNone: "在售产品这家都在用了",
  qty: (n: string) => `× ${n}`,
  unknownProduct: "（目录中已不存在）",
} as const;

/** 每个板块自己的「⋮」菜单 (owner, 2026-09-23: 按需各板块一个, 至少查看、编辑)。
 *  没有去处的项灰显并说明原因, 不隐藏。 */
export const PANEL_MENU_TEXT = {
  view: "查看",
  edit: "编辑",
  noEditRight: "你没有编辑这块内容的权限",
  derived: "分数由规则自动算出，不能直接编辑；可以用「重新评估」按当前数据重算",
  noListPage: "这类记录还没有单独的列表页",
  noEntryHere: "这个 tab 在这里没有录入入口",
  useViewSwitch: "用标题行的「表格 / 图谱」切换查看",
  noChain: "还没有开放商机，没有决策链可看",
} as const;

/** 板块收起后的一行重点 (owner, 2026-09-23: 彻底收起 + 一行重点)。
 *  只说收起后仍需关注的事; 没有要关注的就不显示这一行。 */
export const COLLAPSE_TEXT = {
  contactsCold: (n: number) => `${n} 位联系人久未接触`,
  chainsUnreached: (n: number) => `${n} 个商机的经济决策人未触达`,
  gaps: (n: number) => `${n} 项档案待补`,
  health: (score: number) => `健康 ${score}`,
  concern: (text: string) => `首要问题：${text}`,
  dealsOpen: (n: number) => `${n} 个开放商机`,
  revenueOverdue: (n: number) => `${n} 笔回款逾期`,
  contractDue: (days: number) => `合同 ${days} 天后到期`,
  contractLapsed: "有合同已到期未续",
  planPending: (n: number) => `${n} 条待裁决提案`,
  // 规范: 没有警示时也要有一行关键信息, 不留空 (owner, 2026-09-23)。
  planNone: "暂无待裁决提案",
  contactsAllWarm: (n: number) => `${n} 位联系人，近期都有接触`,
  contactsNone: "还没有联系人",
  chainsAllReachable: (n: number) => `${n} 条决策链，经济决策人均可触达`,
  chainsNone: "没有开放商机，暂无决策链",
  chainDetail: (covered: number, total: number, reachable: boolean) =>
    `覆盖 ${covered}/${total} 个角色 · ${reachable ? "经济决策人可触达" : "经济决策人未触达"}`,
  rosterQuiet: "暂无开放商机、逾期回款或临期合同",
  conflictsPending: (n: number) => `${n} 处说法待确认`,
  separator: " · ",
  // 收起摘要行前统一挂 AI 图标 (owner, 2026-09-23), 悬停注明实际来源。
  aiHint: "智能助手按当前数据归纳；本行由规则按当前数据算出",
} as const;

/** 说法核对 (L2 批七 b, owner 2026-09-22: 手动按钮 / 复用提案 / 最近 20 条同一事实)。 */
export const CONSISTENCY_TEXT = {
  button: "核对说法",
  checking: "核对中…",
  never: "还没核对过这家的跟进说法是否一致",
  checkedOn: (d: string) => `${d} 核对过最近的跟进，没有发现说法不一致`,
  pending: (n: number) => `发现 ${n} 处疑似说法不一致，待你确认`,
  found: (n: number) => `发现 ${n} 处疑似说法不一致，已进裁决队列`,
  clean: (n: number) => `核对了最近 ${n} 条跟进，没有发现说法不一致`,
  tooFew: "跟进记录少于两条，没有可比的说法",
  // Same notes as last time: the earlier answer, no new model call (incr/0083).
  unchanged: (n: number) =>
    n > 0 ? `跟进没有变化，沿用上次核对：${n} 处疑似不一致已在裁决队列` : "跟进没有变化，沿用上次核对：没有发现说法不一致",
  modelMark: "模型推断 · 疑似冲突",
  modelHint: "模型比较两条跟进原文得出，原文摘句已逐字核验；是否真的冲突由你确认。",
  decide: "去裁决队列确认",
  quote: (q: string) => `「${q}」`,
} as const;

export const CONSISTENCY_ERROR: Record<string, string> = {
  ...GATE_ERROR,
  no_active_tenant: "当前工作区没有接入平台租户，暂时不能调用模型",
  not_found: "客户不存在，或不属于当前工作区",
  quota_exceeded: "本工作区的副驾调用额度已用完",
  empty_question: "核对请求为空",
  tenant_required: "当前工作区没有接入平台租户，暂时不能调用模型",
  turn_failed: "这次核对没完成（模型暂不可用），稍后再试——这不代表没有冲突",
  advisor_not_admitted: "平台暂未放行本工作区的参谋调用，这次没有核对",
  unknown: "这次核对没完成，稍后再试——这不代表没有冲突",
};

/** 证据新鲜度 (L2 批七, owner 2026-09-22: 所有判断都标)。 */
export const EVIDENCE_TEXT = {
  stale: (days: number) => `这条判断依据的是 ${days} 天前的事实`,
  staleHint: "规则算出：这条判断引用的最新证据已超过时效阈值（跟进 60 天、承诺 90 天）。",
} as const;

/** 会前准备 (L6 批五): 与会人由人勾选, 不读日历。 */
export const MEETING_TEXT = {
  open: "会前准备",
  title: "会前准备",
  pickHint: "勾选这次会到场的人。系统不读你的日历，与会人由你选。",
  pickedNote: "与会人是你刚才勾选的，不是系统识别的。",
  build: "生成准备包",
  repick: "重新选人",
  noContacts: "这家客户还没有联系人，先去联系人卡片里加。",
  attendees: "谁会到场",
  noRole: "未在任何开放商机的决策链里",
  commitments: "答应了还没做的",
  commitmentsNone: "没有逾期、错过或 14 天内到期的承诺。",
  missed: "已错过",
  overdue: (n: number) => `逾期 ${n} 天`,
  dueIn: (n: number) => `${n} 天后到期`,
  money: "悬着的钱",
  moneyNone: "没有逾期或 30 天内到期的回款。",
  moneyOverdue: "逾期",
  conclusion: "这次该拿什么结论",
  health: (score: number) => `健康分 ${score}`,
  healthUnavailable: "健康分当前不可用。",
  proposalsNone: "没有待裁决的提案。",
  partRefused: "你没有查看这部分的权限，或当前档位不含。",
  partFailed: "这部分读取失败，稍后重试——这不代表没有内容。",
} as const;

export const MEETING_ERROR: Record<string, string> = {
  ...GATE_ERROR,
  attendees_required: "至少勾选一位与会人",
  currency_mismatch: "回款币种与计划不一致",
  not_found: "客户不存在，或不属于当前工作区",
};

/** 采纳后成效回看 (L6 批四, owner 2026-09-22: 只列事实不显示分数)。 */
export const OUTCOME_TEXT = {
  title: "采纳后回看",
  // 列的是"之后发生了什么", 不是"因此发生了什么"。
  notCausation: "采纳之后 14 天内这家客户发生的事实。是时间上的先后，不代表因果。",
  acceptedOn: (d: string) => `${d} 采纳`,
  windowOpen: (end: string) => `观察中，至 ${end}`,
  nothingFollowed: "14 天内暂无后续动作：没有阶段推进、没有跟进记录、没有承诺到期。",
  readFailed: "后续记录读取失败，稍后刷新重试——这不代表没有后续。",
  deal: "商机",
  stageMove: (from: string, to: string) => (from ? `${from} → ${to}` : `进入 ${to}`),
  met: "承诺兑现",
  missed: "承诺错过",
  // incr/0079: the RECORDED score either side of the decision.
  health: (before: number | null, after: number | null) =>
    before === null
      ? after === null
        ? "健康分：这段时间还没有记录"
        : `健康分：采纳时还没有记录，现在 ${after}`
      : after === null || after === before
        ? `健康分：${before}，没有变化`
        : `健康分：采纳时 ${before} → ${after}（${after > before ? "+" : ""}${after - before}）`,
} as const;

export const DELIVERY_TEXT = {
  title: "项目交付",
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
  /** Names the fields, not the act. A reader who types a manager's name and
   *  gets nothing should be able to see from the placeholder that manager was
   *  never one of the fields. */
  searchHint: "项目名、项目号、客户",
  filterAllHealth: "全部健康度",
  narrowedNote: "已按检索条件收窄",
  managerNone: "未指派",
  columnNameAccount: "项目 / 客户",
  columnManager: "项目经理",
  // Merged (2026-09-04), the third table to take this shape: a delivery
  // health signal and the project status are one reading, not two columns.
  columnHealthStatus: "健康度 / 状态",
  columnContract: "合同额",
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

  // --- reconciling reported health (batch 6a-3a) ----------------------------
  reconcile: "重算健康度",
  reconcileHint: "按这个项目自己的里程碑与分期重新推导，覆盖人工填报的值",
  // Three outcomes, three sentences. "已重算" for all of them would hide the
  // one that matters: the report and the rows AGREED, which is a different
  // fact from having just corrected a lie.
  reconcileAgreed: "填报与推导一致，未改动",
  reconcileChanged: (health: string) => `已改为 ${health}`,
  reconcileWhy: (because: string) => `原因：${because}`,
  reconcileDenied: "你没有修改交付项目的权限",

  // --- collections (batch 6a-3b) --------------------------------------------
  collections: "回款管理",
  collectionsWhy:
    "链路终点不是赢单，是钱到账。分期只能按迁移表走，已回款与坏账是终态——钱到了就是到了，坏账要靠新排期纠正，不靠改这一行。",
  colProject: "项目",
  colSeq: "期次",
  colPlanned: "计划金额",
  colActual: "实收",
  colDue: "到期",
  colRevStatus: "状态",
  noInstalments: "还没有回款计划",
  overdueCount: (n: number) => `${n} 笔逾期`,
  settleAsk: "实际收到多少？短收是常态，写实收才有意义",
  moveTo: "变更为",
  moved: (s: string) => `已变更为 ${s}`,
  milestonesTitle: "交付计划",
  milestonesWhy:
    "项目按什么节点交付。里程碑一直被读出来却没有地方显示，也没有地方写——所以交付计划此前只能是 db-init 放进去的样子。",
  milestonesNone: "还没有里程碑",
  milestonesNoneWhy: "先把节点排出来，上面那张表的健康度才有据可依。",
  milestoneProject: "项目",
  milestonePickProject: "选择项目",
  milestoneSequence: "序号",
  milestoneName: "节点名称",
  milestoneDue: "计划完成",
  milestoneCompleted: "实际完成",
  newMilestoneEntry: "新建里程碑",
  milestoneNoDate: "未排期",
  milestoneStatus: "状态",
  milestoneStatusLabel: {
    pending: "未开始",
    in_progress: "进行中",
    done: "已完成",
    missed: "已错过",
  } as Record<string, string>,
  milestoneSave: "保存里程碑",
  milestoneSaved: "已保存",
  milestonesDenied: "你没有维护交付计划的权限",
  milestoneSlippedLate: (n: number) => `晚于承诺 ${n} 天`,
  milestoneSlippedEarly: (n: number) => `早于承诺 ${n} 天`,
  milestoneAcceptedByName: (who: string) => `客户已验收 · ${who}`,
  milestoneChanged: (n: number) => (n === 1 ? "改期 1 次" : `改期 ${n} 次`),
  milestoneAwaitingAcceptance: "待客户验收",
  milestoneAcceptedBy: "客户验收人",
  milestoneAcceptedByHint: "客户方签字确认的人",
  milestoneAcceptedAt: "验收日期",
  milestoneChangeReason: "变更原因",
  milestoneChangeReasonHint: "为什么要改这个关口",
  milestoneChangeWhy:
    "这个关口已经承诺过，上面挂着回款。改期会记一条只增不改的变更记录，承诺日本身不会被改掉。",
  milestoneAffectsHealth:
    "序号在一个项目内唯一且不可改，它就是这个节点的身份——同一序号再存一次是修改那一条。一个「已错过」的里程碑会推翻上面表里项目经理上报的绿色。",
  moveDenied: "你没有修改回款的权限",

  // --- the collections module page (2026-09-06) -----------------------------
  instalmentSeq: (n: number) => `第 ${n} 期`,
  instalmentCount: (n: number) => `${n} 期`,
  /** The collections table searches the project name only - an instalment has
   *  no name of its own, it is 第 N 期 of a project. */
  collectionSearchHint: "项目名",
  filterAllRevenueStatus: "全部回款状态",
  rosterOpen: "待回款",
  rosterOpenWhy:
    "已经承诺、还没到账的钱。到期日过了而状态还没跟上，是这张表最该被看见的一种。",
  rosterClosed: "已了结",
  rosterClosedWhy:
    "已回款和坏账都留在这里。到账的就是到账了；坏账的翻案靠新的回款计划，不靠改这一行。",
  settleShort: "登记",
  colDueStatus: "到期与状态",
  noDueDate: "未填到期日",
  overdueBy: (n: number) => `已逾期 ${n} 天`,
  dueIn: (n: number) => `还有 ${n} 天`,
  settleTitle: "登记回款",
  settleAmount: "实际收到",
  settleConfirm: "确认已回款",
  tagCollectDue: (n: number) => `${n} 笔待回款`,
  tagCollectOverdue: (n: number) => `${n} 笔逾期`,
  tagCollectShort: (n: number) => `${n} 笔短收`,
  collectStatCount: (n: number) => `${n} 期`,

  // --- 回款概览 (the statistics block, 2026-09-06) ---------------------------
  overviewTitle: "回款分析",
  overviewWhy: "先看整体：钱压在哪一段账龄、集中在谁身上。下面的清单是逐笔明细。",
  overviewEmpty: "没有未收的钱，这一块暂时不用看。",
  collectedRate: "回款达成",
  collectedOf: (got: string, promised: string) => `已收 ${got} / 承诺 ${promised}`,
  ageingTitle: "账龄分布",
  ageingWhy: "按逾期天数分档。未到期是健康的那一档，留着才看得出尾巴是例外还是常态。",
  byProjectTitle: "未收集中度",
  byProjectWhy: "未收金额最高的前八个项目。",
  /* 只剩两头 (incr/0042)：中间几档由工作区自己定的天数拼出来，见下面两个函数。 */
  ageingBand: {
    not_due: "未到期",
    no_due_date: "未填到期日",
  } as Record<string, string>,
  ageingBetween: (from: number, to: number) => `逾期 ${from}-${to} 天`,
  ageingOver: (days: number) => `逾期 ${days} 天以上`,
  collectOnlyAccount: (name: string) => `只看「${name}」的回款计划。`,
  collectShowAll: "看全部 →",
  collectStatEmpty: "当前没有待回款的项目，头部不做拆解。",

  // --- 回款检查 (the dock) ---------------------------------------------------
  collectAdviceTitle: "回款检查",
  collectAdviceClear: "这批回款没有需要处理的地方。",
  collectAdviceOpenDelivery: "查看交付",
  collectAdviceFlag: "标记为逾期",
  collectAdviceFlagged: "已标记逾期",
  collectAdviceOverdue: (name: string, days: number) =>
    `「${name}」有一笔回款逾期 ${days} 天了。`,
  collectAdviceDueNotFlagged: (name: string, days: number) =>
    `「${name}」有一笔回款到期日已经过去 ${days} 天，状态还停在开票前后。`,
  collectAdviceShort: (name: string, gap: string) =>
    `「${name}」有一笔回款短收 ${gap}，差额没有人跟。`,
  collectAdviceNoDueDate: (name: string) =>
    `「${name}」有一笔回款没有到期日，它永远不会出现在逾期统计里。`,
  collectAdviceNothing: (name: string) => `「${name}」的回款一期都还没到账。`,
  // --- the delivery module page (2026-09-06) --------------------------------
  rosterRunning: "在建项目",
  rosterRunningWhy:
    "筹备、进行中、已暂停的项目。健康度显示的是事实推出来的那一个；交付团队自己报的更好看时，这里会说出来。",
  rosterFinished: "结题项目",
  rosterFinishedWhy: "已交付、已关闭、已取消的项目留在这里，它们没有计划可以晚，也没有健康度需要纠正。",
  columnProgress: "项目进展",
  progressNoPlan: "未排计划",
  progressPlanDone: "计划已走完",
  progressPlanOpen: "里程碑未记完",
  noProjects: "还没有交付项目",
  reportedAs: (h: string) => `自报「${h}」`,
  reconciledChanged: "已按事实重算健康度",
  reconciledSame: "自报与事实一致，无需更正",
  tagDeliveryRunning: (n: number) => `${n} 个在建`,
  tagDeliveryDowngraded: (n: number) => `${n} 个自报偏好`,
  tagDeliveryRed: (n: number) => `${n} 个高风险`,
  deliveryStatCount: (n: number) => `${n} 个项目`,
  deliveryStatEmpty: "当前没有在建项目，头部不做拆解。",

  // --- 交付分析 (the statistics block) ---------------------------------------
  analysisTitle: "交付分析",
  analysisWhy: "先看整体：工作压在哪一段、风险集中在哪里、合同额落在谁身上。下面的清单是逐个明细。",
  chartPeak: "峰值",
  analysisEmpty: "没有在建项目，这一块暂时不用看。",
  downgradeScope: (n: number, total: number) => `自报偏好 ${n}/${total}`,
  downgradeRate: "自报偏好比例",
  downgradeOf: (n: number, total: number) => `${n} / ${total} 个在建项目`,
  downgradeWhy: "「我们没事」挨着「他们还没付款」，是一个失败的交付一直保持绿色直到成为危机的最常见方式。",
  byStageTitle: "阶段分布",
  byStageWhy: "按项目状态分档，顺序就是工作推进的顺序。",
  byHealthTitle: "健康度分布",
  byHealthWhy: "按事实推出的健康度，只看在建项目。已交付的健康度是历史，不是现况。",
  byProjectTitleDelivery: "合同额集中度",
  byProjectWhyDelivery: "在建项目中合同额最高的前八个。",
  contractTotal: (amount: string, currency: string) => `合同总额 ${amount} ${currency}`,

  // --- 交付检查 (the dock) ---------------------------------------------------
  adviceTitle: "交付检查",
  adviceClear: "这批项目没有需要处理的地方。",
  adviceOpenCollection: "查看回款",
  adviceDowngraded: (name: string) =>
    `「${name}」自报的健康度比事实好——先重算，再决定要不要跟交付团队对一次。`,
  adviceMilestoneLate: (name: string, n: number) => `「${name}」有 ${n} 个里程碑已经过期未完成。`,
  adviceNoManager: (name: string) => `「${name}」在建，但没有指派负责人。`,
  adviceNoMilestones: (name: string) => `「${name}」在建，却一个里程碑都没有——没有计划就无所谓延误。`,
  adviceNoContract: (name: string) => `「${name}」在建，但没有合同金额，交付没有可衡量的标的。`,
} as const;

/**
 * Keyed off the database's own CHECK constraint (00_baseline.sql
 * chk_project_status), not off what the demo fixtures happen to contain - the
 * fixtures only ever produce "active", so a map built from them would have
 * shipped four holes. The delivery table was rendering the raw enum: `active`,
 * `planning`, `delivered` in English, the one table in the product not
 * labelling its own status column.
 */
export const HEALTH_LABEL: Record<string, string> = {
  green: "健康",
  amber: "有隐忧",
  red: "高风险",
};

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
  tagPeriod: (period: string) => `${period}`,
  tagScopes: (n: number) => `${n} 个口径`,
  tagUnforecast: (n: number) => `${n} 个未预测`,
  tagTerritories: (n: number) => `${n} 个区域`,
  tagNoOwner: (n: number) => `${n} 个没有负责人`,
  title: "销售规划",
  description:
    "目标由本域设定，达成由商机域的预测快照计算——两个域不互相写对方的数据。",
  // The headline. The workspace row is the one number this page exists for, so
  // it is stated rather than left to be found in row one of a table.
  lead: (period: string) => `${period} 销售规划`,
  leadAttained: (closed: string, target: string, pct: string) =>
    `全工作区 ${closed} / ${target} · 达成 ${pct}`,
  leadNoWorkspaceTarget: "本期未设全工作区目标。",
  // The target exists but has no measurement yet - the gap's own reason, never
  // a 0%.
  leadNotMeasured: (target: string, reason: string) =>
    `全工作区目标 ${target} · ${reason || "尚无达成数据"}`,
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

  // --- setting a quota (batch 6a-2) -----------------------------------------
  // A FORM, not a row menu. A target needs a period, a scope, a metric and an
  // amount, and none of them exist until someone types them - see the note in
  // planning-table.tsx for why a three-dot menu is the wrong doorway.
  setTarget: "设定目标",
  setTargetWhy:
    "目标的作用域元组就是它的身份：同一周期、同一作用域、同一指标只能有一个目标。要改数字，调整已有的那一条，不要再加一条。",
  setScope: "作用域",
  // Their own keys. Reusing columnScope ("作用域", a COLUMN HEADER) as the
  // territory option rendered the word "作用域" inside a scope picker, and
  // ownerScope is `(sub) => sub` so it rendered an empty option. Borrowing a
  // key because the word looks right is how a label ends up describing the
  // wrong thing.
  scopeTerritory: "销售区域",
  scopeOwner: "我自己",
  setMetric: "指标",
  // --- 大区 (incr/0036; 成员随市场范围而定, incr/0045) ---
  /* 区域装的是什么，由市场范围决定：全国市场装省，省级市场装市。文案里那个
     名词跟着范围走，所以下面凡是提到「省份」的句子都拿名词做参数。 */
  memberNoun: {
    global: "国家",
    china: "省份",
    province: "市",
  } as Record<string, string>,
  /* 省级市场里一个区域装的是什么：省装市，直辖市装区。 */
  unitNoun: {
    city: "市",
    district: "区",
  } as Record<string, string>,
  divisionName: "区域",
  divisionMemberCount: (noun: string) => `${noun}数`,
  divisionScope: (noun: string) => `覆盖${noun}`,
  divisionFormTitle: "配置区域",
  divisionFormWhy: (noun: string) => `选择这个区域覆盖的${noun}。一个${noun}只属于一个区域。`,
  divisionCode: "区域代码",
  divisionCodeHint: "创建后不可更改。已存在的代码表示改名。",
  divisionNameLabel: "区域名称",
  /* 辖区配置 (owner, 2026-09-09): 手动选择只是一种方式，不能当 label。四个动作
     并排：选择辖区（抽屉）、应用预置（任选一个预置区域套上来）、应用模版
     （按当前代码对应的预置恢复，owner 2026-09-11 由"重置预置"改名）、清空
     选择。 */
  divisionMembersConfig: "辖区配置",
  divisionPickMembers: "选择辖区",
  divisionApplyPreset: "应用预置",
  divisionResetPreset: "应用模版",
  divisionClearMembers: "清空选择",
  divisionApplyPresetTitle: "应用预置",
  divisionApplyPresetWhy: (isNew: boolean): string =>
    isNew
      ? "选一个预置区域，代码、名称与辖区自动填好，可再改。"
      : "选一个预置区域，名称与辖区套用到当前区域；代码是锚，保持不变。",
  divisionApplyConfirm: "应用",
  divisionResetPresetHint: (from: string, name: string) => `按「${from}-${name}」恢复名称与辖区`,
  /* 两个危险动作的确认框（owner）：动词、对象、后果，DS 的契约。标题句式由产品
     定：「应用模版 陕西三分法-关中？」 */
  destructiveTitle: "{verb}{target}？",
  divisionResetTarget: (from: string, name: string) => `为「${from}-${name}」`,
  divisionResetConsequence: (n: number, noun: string) =>
    `当前名称和已选的 ${n} 个${noun}会被预置覆盖；未保存前可以「放弃」。`,
  divisionClearTarget: (n: number, noun: string) => `已选的 ${n} 个${noun}`,
  divisionClearConsequence: "清单会清空，逐个勾选的辖区需要重新选；未保存前可以「放弃」。",
  divisionResetPresetNone: "当前代码没有对应的预置",
  divisionResetPresetAmbiguous: (n: number) => `这个代码在 ${n} 套预置里都有，点击后选一套`,
  // --- 成员选择抽屉 ---
  divisionPick: (noun: string) => `选择${noun}`,
  divisionPickTitle: (noun: string) => `选择${noun}`,
  divisionPickWhy: (noun: string) => `勾选${noun}。后缀是内置切法的归属，供参考。`,
  divisionPickDone: "完成",
  divisionPickClear: "清空",
  divisionPickEmpty: (noun: string) => `尚未选择${noun}`,
  divisionPickNone: (noun: string) => `没有匹配的${noun}`,
  divisionSearch: (noun: string) => `搜索${noun}、代码或简称`,
  divisionChosen: (n: number, noun: string) => `已选 ${n} 个${noun}`,
  divisionHintPreset: (from: string, name: string) => `${from} ${name}`,
  divisionTakenFrom: (p: string, from: string) => `${p} 原属 ${from}，将移入当前区域`,
  divisionSave: "保存区域",
  divisionDiscard: "放弃",
  divisionSource: "来源",
  divisionSystem: "系统配置",
  divisionCustom: "自定义",
  divisionEdit: "配置",
  // 行菜单里的四个排序操作（owner, 2026-09-09）。顺序是全局的：菜单、态势屏、
  // 汇总都按它来。
  divisionMoveUp: "上移",
  divisionMoveDown: "下移",
  divisionMoveTop: "移到顶部",
  divisionMoveBottom: "移到底部",
  divisionNew: "新建区域",
  divisionRemove: "删除区域",
  divisionRemoveWhy: (noun: string) => `只有不含任何${noun}的区域才能删除。先把${noun}移走，再删。`,
  // 行菜单的 删除区域（owner, 2026-09-09: 统一面板）: 确认框与灰掉的理由。
  divisionRemoveTarget: (name: string) => `「${name}」`,
  divisionRemoveConsequence: "区域会被删除，不可撤销。它覆盖的范围需要先移到别的区域。",
  divisionRemoveHeldHint: (n: number, noun: string) => `还覆盖 ${n} 个${noun}，先移走再删`,
  // 区域详情抽屉：这个区域覆盖的范围，按清单四列。
  divisionDetailsTitle: (name: string) => `${name} · 区域详情`,
  divisionDetailsWhy: (n: number, noun: string) => `覆盖 ${n} 个${noun}。`,
  divisionDetailsDone: "关闭",
  // 谁在干这块地（incr/0052）：区域详情列出覆盖它的销售区域与单位。
  divisionCoveredBy: (n: number) => `覆盖它的销售区域 · ${n} 个`,
  divisionCoveredNone: "还没有销售区域覆盖这个大区。到销售区域的表单里勾选它。",
  divisionCoveredUnits: (units: string) => `单位：${units}`,
  divisionCoveredNoUnits: "未挂单位",
  divisionRemoveCoverage: (n: number) => `${n} 个销售区域将失去这块覆盖。`,
  // 表格工具行 (owner, 2026-09-11: 添加表操作行，模式按照组织架构，包括按钮
  // 调整) - 新建区域从页头移进面板自己的工具行，跟组织架构同一个规范：
  // FilterBar 的 count/view/actions，勾选后单独出现 BulkActionBar。
  divisionToolbarCount: (n: number) => `共 ${n} 个区域`,
  divisionSelectionNoun: "个区域",
  divisionClearSelection: "取消选择",
  divisionBulkRemove: "删除",
  divisionBulkRemoveTarget: (n: number) => `已选的 ${n} 个区域`,
  divisionBulkRemoveConsequence: (noun: string) =>
    `所选区域会被删除，不可撤销。仍覆盖${noun}的区域不会被删除。`,
  divisionBulkRemoveDone: (removed: number) => `已删除 ${removed} 个区域`,
  divisionBulkRemoveSkipped: (n: number, noun: string) => `${n} 个仍覆盖${noun}，未删除`,
  // 搜索/筛选 (owner: 表头操作行参照 /admin/permissions 补齐, 筛选组的补齐)。
  divisionToolbarFilteredCount: (shown: number, total: number) => `筛选出 ${shown} / 共 ${total} 个区域`,
  divisionSearchPlaceholder: "搜索区域名称或代码",
  divisionSearchLabel: "搜索",
  divisionResetFilters: "重置筛选",
  divisionSourceFilterLabel: "按来源筛选",
  divisionFilterAllSources: "全部来源",
  divisionFilterEmpty: "没有匹配的区域",
  // 重置预置改名应用模版 (owner, 2026-09-11)。
  templateTitle: "应用划分模版",
  templateWhy: "选一套预置切法作为起点，之后随便改。",
  templateReset: "应用模版",
  templateConfirm: "确认替换",
  templateCancel: "取消",
  /* 两步：对话框里选方案并用 danger Banner 说明代价；「确认替换」再弹危险确认
     （owner, 2026-09-09），落锤在确认框里。 */
  templateDangerTitle: "这是不可撤销的替换",
  templateConfirmVerb: "替换",
  templateConfirmTarget: (carve: string) => `为「${carve}」`,
  templateConsequence: (current: number, custom: number) =>
    `当前 ${current} 个区域及其辖区归属全部按预置重排${custom > 0 ? `，其中 ${custom} 个自定义区域会被丢弃` : ""}；保存即生效，不可撤销。`,
  templateReplaceWarn: (current: number, custom: number) =>
    custom > 0
      ? `会替换当前 ${current} 个大区，其中 ${custom} 个是你自己配置的，将被丢弃。`
      : `会替换当前 ${current} 个大区。`,
  /* 预置的名字只是名字（owner, 2026-09-09）：下拉里读「五分法-中部」，不再拖着
     一串「东南西北中」。这一串在重置对话框里才有意义，那里单独列。 */
  /* A carve's NAME is a column of yucer_ref.market_carve (incr/0045), not
     copy: 五分法 / 陕西三分法 / 北京各区独立 print as the table has them. */
  presetOption: (from: string, name: string) => `${from}-${name}`,
  templateRef: "引用系统配置",
  templateRefNone: "不引用，自己填",
  templateRefWhy: "选一个预置区域，代码、名称与成员自动填好，可再改。",
  // 市场范围 (incr/0043)：区域在哪个框架里切。
  scopeLabel: {
    global: "全球市场",
    china: "中国市场",
    province: "省级市场",
  } as Record<string, string>,
  scopeIncludes: {
    global: "全球市场 · 包括为国家级",
    china: "全国市场 · 包括为省级",
    province: "省级市场 · 包括为市级",
  } as Record<string, string>,
  scopePlanned: "未建",
  scopeLabelTitle: "市场范围",
  scopeButton: (current: string) => `市场范围 · ${current}`,
  /* 省级市场 · 陕西 —— 按钮和「包括范围」都要连省一起说，范围才算定了。 */
  scopeProvinceFrame: (label: string, province: string) => `${label} · ${province}`,
  scopeIncludesProvince: (province: string, noun: string) => `${province} · 包括为${noun}级`,
  scopeProvinceLabel: "哪个省",
  scopeProvinceOpen: (n: number) => `${n} 个省级行政区可选；台湾、香港、澳门暂无下级区划数据。`,
  scopeConfirm: "确认",
  scopeCancel: "取消",
  scopeWhy: "区域在哪个框架里切：全球按国家，全国按省，一省按市。范围定了，区域能装什么才有基础。",
  scopeSaved: "市场范围已更新",
  divisionIncludes: "包括范围",
  // 右栏清单的五列（owner, 2026-09-09）。简称代号是国标的两个字母，省有市无。
  colIndex: "序号",
  colAbbr: "简称代号",
  colName: "名称",
  colAdcode: "行政区划代码",
  colOps: "操作",
  divisionRemoveMember: "移除",
  divisionPickEmptyWhy: (noun: string) => `用左侧「选择${noun}」加入，或引用系统配置。`,
  divisionCodePrefixHint: "前缀由市场范围决定，只填后半段，如 EAST。",
  // 省级市场下不带前缀：行政区划代码按国标裸用，或自定义一个词。
  divisionCodeUnitHint: "填行政区划代码（如 610100）或自定义代码（如 GUANZHONG），不带省份前缀。",
  divisionMovedTitle: (n: number, noun: string) => `${n} 个${noun}将从其他区域迁入`,
  divisionMovedWhy: "保存后它们会离开原区域。原区域的汇总口径随之变化。",
  divisionSaveFailed: "保存失败",
  // 这页不再和销售区域同屏，所以不能再说「上面的销售区域……」。两个维度的
  // 区别要在这里自己说清楚。范围是什么就说什么：全国 / 陕西省。
  divisionWhy: (frame: string, noun: string) => `${frame}怎么切成区域，每个区域管哪些${noun}。`,
  divisionEmptyTitle: "这个工作区还没有区域",
  divisionEmptyWhy: "新建一个，或引用系统内置的划分。",
  divisionNone: "未归入",
  divisionHoldsNothing: (noun: string) => `这个区域目前不含任何${noun}`,
  moveProvince: (p: string) => `把 ${p} 改到其他大区`,
  provinceCount: (n: number) => `${n} 个省`,
  /* 页头徽标的一句话（owner, 2026-09-09）：「34 个省份已归入 5 个区域」，有未
     归入的才接一句「，3 个省份未归入任何区域」。 */
  divisionCoverage: (placed: number, divisions: number, unplaced: number, noun: string) =>
    `${placed} 个${noun}已归入 ${divisions} 个区域`
    + (unplaced > 0 ? `，${unplaced} 个${noun}未归入任何区域` : ""),
  // 表格底部的结论：全部归入一句话；有未归入的，点名，后面跟标签。
  divisionAllPlaced: (noun: string) => `全部${noun}都已归入区域。`,
  divisionUnplacedLead: (n: number, noun: string) => `${n} 个${noun}未归入任何区域：`,
  // 名册页读的那句：区域是什么、为什么先有它。
  territoryWhy:
    "谁扛哪一片市场。区域是目标的作用域之一——没有区域，就设不了区域目标。",
  // 表单页读的那句。「代码是身份」讲的是这张表单的行为，名册页上没有表单，
  // 却跟着显示了这句话，是页面拆分时留下的。
  territoryFormWhy:
    "区域代码是身份：输入已有的代码是编辑那一条，输入新的是新建。先选覆盖的大区，路由才认得它。",
  territoryNone: "还没有销售区域",
  territoryNoneWhy: "先建一个区域，才能给它设目标、把商机归到它名下。",
  // 两个入口同处一页（区域名册 + 指标表），所以各自说清楚建的是什么。
  territoryNewEntry: "新建区域",
  targetNew: "新建目标",
  territoryFormTitle: "新建 / 编辑销售区域",
  territoryEditing: "编辑已有区域",
  territoryNew: "新建一个区域",
  territoryRegions: "覆盖大区",
  territoryRegionsHint: "勾选这个区域负责的大区。一个大区可以由多个区域共同负责；不勾选任何一个，路由就当它谁也不覆盖。",
  territoryRegionsNone: "这个工作区还没有大区。先去「新建大区」建一个，或引用一套预置划分。",
  territoryRegionGone: "已不在当前划分中",
  // 所属单位（incr/0052）：一个区域可挂多个单位。
  territoryUnits: "所属单位",
  territoryUnitsHint: "勾选负责这块区域的单位。一个区域可以由多个单位共同负责；不勾选，就只是一块没人负责的地。",
  territoryUnitsNone: "还没有单位。先到组织架构里建单位。",
  territoryNoUnit: "未挂单位",
  territoryCode: "区域代码",
  territoryName: "名称",
  territoryParent: "上级区域",
  territoryNoParent: "顶级区域",
  territoryOwner: "负责人",
  territoryNoOwner: "未指派",
  territoryStatus: "状态",
  territoryActive: "在用",
  territoryRetired: "已停用",
  territorySave: "保存区域",
  territorySaved: "已保存",
  territoryDenied: "你没有维护销售区域的权限",
  setAmount: "目标金额",
  setCount: "目标客户数",
  // The unit a count target is measured in. Money gets a currency symbol from
  // formatMoney; a count needs the noun instead, or "10" says nothing.
  countUnit: (n: string) => `${n} 家`,
  // Why a target has no attainment number. Three different situations, three
  // different things for the reader to do about them.
  gapLabel: {
    no_snapshot: "尚无快照",
    no_cost_data: "需补充成本",
    not_counted: "未统计",
  } as Record<string, string>,
  gapHint: {
    no_snapshot: "这个作用域本期还没有提交预测快照——那不是达成 0%",
    no_cost_data:
      "毛利需要成本，而成本目前还没有进入模型。这不是本期没达成，也不是这个指标算不了——补上成本它就能算",
    not_counted:
      "这条快照没有新客计数——它早于该字段，或者它的周期标签无法解析成日期",
  } as Record<string, string>,
  setSubmit: "建立目标",
  setSaved: "已建立",
  setDenied: "你没有设定目标的权限",
  // Row-level adjustment. This one IS a row gesture: the number is on screen.
  adjust: "调整金额",
  adjustSaved: "已调整",
  commit: "提交为承诺",
  commitWhy: "提交后不能退回草稿——已经报上去的数字撤不回来",
  closeTarget: "关闭本期",
  closeWhy:
    "关闭后冻结。它记录的是一个已结束周期上承诺过什么，改它等于把没达成的季度改成达成",
  rowDenied: "你没有调整目标的权限",
  metricRevenue: "收入",
  metricNewLogo: "新客",
  metricPipeline: "管道",
  metricMargin: "毛利",
  statusDraft: "草稿",
  statusCommitted: "已承诺",
  statusClosed: "已关闭",
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
  // 行菜单的 XX（ROW_OPS）。
  segmentNoun: "细分市场",
  planNoun: "战略方案",
  // 细分模块页（按产品模式重建 2026-09-05）
  tagSegmentActive: (n: number) => `${n} 个在用细分`,
  tagSegmentShelved: (n: number) => `${n} 个已停用`,
  segmentStatCovered: (assigned: number, matched: number) =>
    assigned === matched ? `${assigned} 家在册` : `${assigned} 在册 · ${matched} 命中`,
  segmentStatEmpty: "还没有细分，统计从第一个细分开始",
  rosterSegment: "细分清单",
  rosterSegmentWhy:
    "一个细分 = 定义 + 在册客户。两个数字不一致，就是有人按定义之外发了码，或定义找到了没人认领的客户。",
  rosterSegmentShelved: "已停用细分",
  rosterSegmentShelvedWhy: "暂停或退役的细分不再驱动活动，但历史归属仍然可读，所以保留。",
  colSegmentName: "细分名称",
  colSegmentPlan: "所属计划",
  colSegmentCriteria: "定义",
  colSegmentCriteriaPlan: "定义 · 所属计划",
  colSegmentCounts: "在册 / 命中",
  segmentNoCriteriaYet: "未定义",
  segmentPause: "暂停",
  segmentResume: "启用",
  segmentRetire: "退役",
  segmentDeleteConsequence:
    "删除不可恢复。仍有活动指向它、或仍有客户挂着这个码时会被拒绝——那种情况请改用退役。",
  newSegmentEntry: "新建细分",
  editSegment: "修改细分",
  // 侧栏：细分检查
  segmentAdviceTitle: "细分检查",
  segmentAdviceClear: "在用的细分没有需要处理的地方。",
  segmentAdviceAssigned: (name: string, n: number) =>
    `「${name}」有 ${n} 家客户挂着这个码，却不符合它的定义。`,
  segmentAdviceMatching: (name: string, n: number) =>
    `「${name}」的定义命中了 ${n} 家客户，但没人给他们挂码。`,
  segmentAdviceStale: (name: string, n: number) =>
    `「${name}」已停用，却仍有 ${n} 家客户挂着它的码。`,
  segmentAdviceNoCriteria: (name: string) => `「${name}」没有定义，谁都不会被它命中。`,
  segmentAdviceNoPlan: (name: string) => `「${name}」没有挂到任何计划——没有人在为它花钱。`,
  segmentAdviceOpen: "打开细分",
  segmentAdviceOpenAccounts: "去客户管理",
  segmentsTitle: "细分市场",
  segmentsWhy:
    "把要打的市场切成有名字的块，按优先级排。客户身上的细分代码指向这里，战役也可以瞄准其中一块——在此之前这些指向都是悬空的。",
  segmentsNone: "还没有细分市场",
  segmentsNoneWhy:
    "客户档案里已经在用细分代码了，但它们还没有对应的定义。在下面建一个，代码对上就能连起来。",
  segmentsDenied: "你没有编辑细分市场的权限。",
  segmentFormTitle: "新建 / 编辑细分",
  segmentEditing: "编辑哪一块",
  segmentNew: "新建细分市场",
  segmentNoPlan: "不挂在计划下",
  segmentCodeHeader: "细分代码",
  segmentNameHeader: "名称",
  segmentPlanHeader: "所属计划",
  segmentPriorityHeader: "优先级",
  segmentAccountsHeader: "在册客户",
  segmentMatchedHeader: "条件命中",
  segmentCriteriaHeader: "条件",
  segmentIndustries: "行业条件",
  segmentRegions: "地域条件",
  // 规模 joined the criteria for ICP 拟合度 (owner, 2026-09-24).
  segmentSizes: "规模条件",
  segmentListHint: "逗号分隔，可留空",
  segmentStatusHeader: "状态",
  segmentSave: "保存细分市场",
  segmentSaved: "已保存",
  segmentStatusLabel: {
    active: "进行中",
    paused: "已暂停",
    retired: "已停用",
  },
  newPlanTitle: "新建战略计划",
  newPlanWhy:
    "计划是全链路的起点——目标和战役都挂在它下面。此前只能推进计划的状态，不能新建一个。",
  newPlanNo: "计划编号",
  newPlanName: "名称",
  newPlanPeriod: "周期",
  newPlanOwner: "负责人",
  newPlanObjective: "目标陈述",
  newPlanSave: "建立计划",
  newPlanSaved: "已建立",
  newPlanAnchor:
    "编号在工作区内唯一且创建后不可修改——它是这个计划的身份。新计划一律是草稿，审批等状态变更由下面的表负责，审批时间戳只有那条路径会写。",
  title: "市场战略",
  description: "战略是全链路的起点：下游的战役、线索、商机都能回指到它。",
  leadNoCampaignRead: "没有战役读取权限，无法统计下游归属。",
  columnCampaigns: "下游战役",
  ownerNone: "未指派",
  columnName: "战略",
  columnPeriod: "周期",
  columnOwner: "负责人",
  emptyTitle: "还没有战略规划",
  emptyDescription: "定义本周期打哪个市场、达成什么目标。",

  // --- the module page (2026-09-05) -----------------------------------------
  tagPlanRunning: (n: number) => `${n} 个执行中`,
  tagPlanSettled: (n: number) => `${n} 个已收口`,
  tagPlanOrphan: (n: number) => `${n} 场战役无归属`,
  planStatCampaigns: (period: string) => `${period} · 下游战役`,
  planStatEmpty: "当前没有执行中的计划，头部不做拆解。",
  rosterPlan: "战略计划",
  rosterPlanWhy:
    "本周期打哪个市场、要达成什么。计划按周期排列，不做人工排序——周期本身就是顺序。",
  rosterPlanSettled: "已收口的计划",
  rosterPlanSettledWhy:
    "已结束和已归档的计划留在这里。它们不再接受修改，下游数据仍然指向它们。",
  newPlanEntry: "新建计划",
  planMoveTo: (status: string) => `转为${status}`,
  planSave: "保存修改",
  planNoFixed: "编号是这个计划的身份，创建后不可修改。",
  editPlanTitle: "修改战略计划",
  editPlanWhy:
    "可以改的是名称、周期、负责人和目标陈述。编号是下游引用的锚点，状态由生命周期负责。",

  // --- 计划检查 (the dock) ---------------------------------------------------
  planAdviceTitle: "计划检查",
  planAdviceClear: "这批计划没有需要处理的地方。",
  planAdviceOpen: "打开计划",
  planAdviceOpenCampaigns: "查看战役",
  planAdviceOpenSegments: "查看细分",
  planAdviceApprove: "批准",
  planAdviceApproved: "已批准",
  planAdviceOverdue: (name: string) => `「${name}」的周期已经结束，但它还在执行中。`,
  planAdviceDraftStarted: (name: string) => `「${name}」的周期已经开始，它还是草稿。`,
  planAdviceNotActive: (name: string) => `「${name}」已批准，周期也开始了，但一直没有启用。`,
  planAdviceEarlyWork: (name: string, n: number) =>
    `「${name}」还没有启用，底下已经挂了 ${n} 场战役。`,
  planAdviceNoCampaign: (name: string) => `「${name}」在执行中，底下一场战役都没有。`,
  planAdviceNoSegment: (name: string) => `「${name}」在执行中，但没有任何细分市场指向它。`,
  planAdviceNoObjective: (name: string) => `「${name}」没有写目标陈述。`,
  segmentCount: (n: number) => `${n} 个分层`,
} as const;

export const PLAN_STATUS_LABEL: Record<string, string> = {
  draft: "草稿",
  approved: "已批准",
  active: "执行中",
  closed: "已结束",
  archived: "已归档",
};

export const CAMPAIGN_TEXT = {
  tagCount: (n: number) => `${n} 个战役`,
  tagSpend: (budget: string, won: string) => `投入 ${budget} · 赢回 ${won}`,
  executionsTitle: "战役执行项",
  executionsWhy:
    "一场战役由哪些动作构成。上面那列「N/M 完成」就是从这里数出来的——而且还有未完成项时，战役无法标记完成。",
  executionsNone: "还没有执行项",
  executionsNoneWhy: "先把要做的动作列出来，战役才能被推进和收尾。",
  executionCampaign: "战役",
  executionPickCampaign: "选择战役",
  executionTitle: "动作",
  executionType: "类型",
  executionTypeLabel: {
    outreach: "外呼触达",
    content: "内容投放",
    event: "活动",
    nurture: "培育",
    handoff: "转交销售",
  } as Record<string, string>,
  executionAssignee: "负责人",
  executionDue: "计划完成",
  executionStatus: "状态",
  executionStatusLabel: {
    pending: "未开始",
    in_progress: "进行中",
    done: "已完成",
    skipped: "已跳过",
  } as Record<string, string>,
  executionEditing: "编辑哪一项",
  executionNew: "新建执行项",
  executionSave: "保存执行项",
  executionSaved: "已保存",
  executionsDenied: "你没有维护战役执行项的权限",
  executionBlocks:
    "「未开始」和「进行中」都算未完成——只要还有一项，这场战役就不能标记为已完成。做完或跳过它，两者都算结清。已完成的战役其执行项被冻结：它们正是这场战役据以收尾的记录。",
  title: "营销活动",
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

/** 漏斗退出原因 (incr/0033). Nine codes, one vocabulary, read at every stage. */
export const EXIT_REASON_LABEL: Record<string, string> = {
  duplicate: "重复记录",
  not_a_fit: "需求不匹配",
  no_budget: "没有预算",
  no_decision: "迟迟没有决策",
  lost_to_competitor: "输给竞争对手",
  timing: "时机不对",
  customer_withdrew: "客户取消了项目",
  unreachable: "联系不上",
  other: "其他",
};

export const FUNNEL_TEXT = {
  title: "漏斗全景",
  why: "每一段的数字都是各自模块里那些行的计数。「没有记录原因」有两种来路：商机、项目、回款三段还没有录入入口；信号和线索有入口，但更早结束的行本来就没留下原因。",
  moduleWhy: "信号 → 线索 → 商机 → 项目 → 回款。这是唯一一个讲整条链的页面——其余每个模块只讲自己那一段。",
  stage: {
    signal: "信号",
    lead: "线索",
    opportunity: "商机",
    project: "项目",
    revenue: "回款",
  } as Record<string, string>,
  part: {
    advanced: "已推进",
    open: "在手上",
    exited: "已终止",
  } as Record<string, string>,
  passed: (pct: number, reached: number) => `${pct}% 推进 · 共到达 ${reached}`,
  nothingReached: "还没有东西走到这一段",
  byStage: "分段明细",
  // SAYS THE FACT, NOT A CAUSE. A row can be unexplained because the stage has
  // no surface that asks (商机/项目/回款 today) or because it ended before the
  // reason was ever recorded - and the count cannot tell those apart.
  unexplained: (n: number) => `${n} 条终止没有记录原因`,
  blind: (stages: string) => `你没有权限看：${stages}。这些段不显示，而不是显示为 0。`,
  listSeparator: "、",
  tagEntered: (n: number) => `${n} 条进入`,
  tagLive: (n: number) => `${n} 条在手上`,
  tagLeak: (stage: string, n: number) => `${stage}漏最多：${n} 条`,
} as const;

export const LEAD_TEXT = {
  title: "线索",
  // 模块头部 (design_yucer_110). `description` above is the SECTION's line and
  // stays with the table; this one explains the module.
  moduleWhy:
    "信号升级成线索，线索合格后转化为商机。「智能分配」按区域和负载给出该谁接的建议，采纳与否由你定——无人认领的线索无法判定合格。",
  addLead: "添加线索",
  addLeadWhy: "展会、电话、转介绍来的线索——它们背后没有信号。填了就进线索池，由「智能分配」决定谁接。",
  formContact: "联系人",
  formNoAccount: "暂不匹配",
  formAccountWhy: "没有客户就没有区域，分派和转商机都走不了。也可以之后在行操作里补。",
  formOwnerNote: "负责人和评分这里不填：谁接由「智能分配」按区域和负载给建议；评分是信号的算法，手工录入的线索没有信号。",
  formSave: "保存线索",

  searchLabel: "检索",
  resetFilters: "清空筛选",
  searchHint: "公司、线索号、联系人、负责人",
  filterAllStatus: "全部状态",
  filterAllOwners: "全部负责人",
  filterUnowned: "无人认领",
  filteredCount: (n: number, total: number) => `${n} / ${total} 条`,
  noMatch: "没有匹配的线索",
  noMatchWhy: "换个关键词，或把筛选条件放宽。",
  startWork: "开始跟进",
  convertWhy: (company: string) => `把「${company}」转成商机。转化这一刻来源战役被复制到商机上并冻结，之后改不了。`,
  convertRequirement: "客户需求",
  convertRequirementHint: "客户要解决什么问题",
  convertRequirementWhy: "商机必须说清客户要什么——没坐在那场会里的人，靠这句话判断该不该投入。之后可以改。",

  terminate: "终结线索",
  terminateConsequence: "这条线索是真的，但机会没了。记录会保留，并计入漏斗的分母——原因会被记下来，之后能按原因看漏在哪一段。",
  hintTerminateWhy: "机会曾经真实存在，但黄了——与「判定不合格」是两回事",
  exemptAsksReason: "这个动作会先问原因，比确认框更强",
  endSubmit: "确认结束",
  endReason: "原因",
  endReasonPick: "选择原因",
  endNote: "补充说明",
  endNoteRequired: "选了「其他」就必须写清楚",
  endNoteOptional: "可留空",

  hintAlreadyWorking: "已经在跟进或已有判定了",
  claim: "认领线索",
  assign: "分派线索",
  handOver: "转让负责人",
  matchAccount: "匹配客户",
  matchWhy: (company: string) => `把「${company}」连到客户档案。没有客户就没有区域，分派和转商机都走不了。`,
  matchSubmit: "匹配",
  matchPick: "选择客户",
  columnAccount: "客户",
  openAccount: "打开客户档案",
  remove: "删除线索",
  removeConsequence: "删除后不可恢复。这条线索将不再出现在任何漏斗统计里——如果它是真实存在过的机会，应该用「判定不合格」保留记录。",
  hintAlreadyOwned: "已经有负责人了——要换人请用「转让负责人」",
  hintAlreadyMatched: "已经匹配过客户了",
  hintAssignOpensPanel: "打开右侧「智能分配」，按区域和负载给建议",
  hintConvertedKept: "已转商机的线索不能删除——它是那个商机来源的唯一记录",
  bulkRefused: (n: number) => `有 ${n} 条没有删除`,

  deleteSelected: (n: number) => `删除 ${n} 条`,
  columnRegion: "区域",
  noRegion: "无区域",
  tagOpen: (n: number) => `${n} 条在跟`,
  tagQualified: (n: number) => `${n} 条已合格`,
  tagUnowned: (n: number) => `${n} 条无人认领`,
  tagConverted: (n: number) => `${n} 条已转商机`,
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
  hintNoOwner: "还没有归属——先「认领」或用「智能分配」指给人，再做判定",
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
  // 行菜单的 XX（ROW_OPS）：原因配置 / 删除原因。
  reasonNoun: "原因",
  // 赢丢原因的配置面 (0039)。
  reasonConfigTitle: "赢丢原因",
  reasonCount: (n: number) => `${n} 条原因`,
  reasonConfigWhy: "复盘时可选的原因。被复盘引用后不能删除。",
  addReason: "新建原因",
  editReason: "编辑",
  saveReason: "保存",
  reasonCode: "原因代码",
  reasonCodeHint: "创建后不可更改。已存在的代码表示改名。",
  reasonName: "原因名称",
  colReasonName: "原因",
  colApplies: "适用结果",
  colCited: "被引用",
  appliesWon: "赢单",
  appliesLost: "丢单",
  appliesBoth: "赢丢皆可",
  appliesHint: "至少选一种。像「客户未决」这样只解释丢单的，就只勾丢单。",
  reasonDeleteConsequence: "该原因将从复盘表单中移除。已引用它的复盘不受影响——引用中的原因删不掉。",
  opUp: "上移",
  opDown: "下移",
  opDelete: "删除",

  tagPending: (n: number) => (n === 0 ? "没有待复盘的" : `${n} 单待复盘`),
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
  outcomeAbandoned: "放弃",
  // 作战页上的结局与复盘 (YC-065 R7).
  dealReviewTitle: "结局与复盘",
  dealReviewOwed: "待复盘",
  dealReviewLocked: "复盘需要商务版",
  dealReviewEdit: "修改复盘",
  dealReviewExit: (reason: string) => `退出原因:${reason}`,
  record: "写复盘",
  reasonLabel: "主要原因",
  reasonNone: "未选择",
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

/** 商机阶段目录的配置面 (incr/0057-0059)。 */
export const STAGE_CONFIG_TEXT = {
  noun: "阶段",
  title: "商机阶段",
  stageCount: (n: number) => `${n} 个阶段`,
  why: "商机推进经过的阶段。可以改名称、调顺序、改默认赢率，或增删阶段——赢单/终态阶段的默认赢率由系统固定，不可编辑。",
  add: "新建阶段",
  save: "保存",
  codeLabel: "阶段代码",
  codeHint: "创建后不可更改。已存在的代码表示改名。",
  nameLabel: "阶段名称",
  colName: "阶段",
  deleteConsequence: "该阶段将从阶段目录中移除。仍有商机停留在这个阶段，或它是工作区最后一个赢单/终态阶段时，删不掉。",
  colFlags: "标记",
  colProbability: "默认赢率",
  colUsed: "商机数",
  flagWon: "赢单",
  flagLost: "终态",
  probabilityLabel: "默认赢率",
  probabilityHint: "0-100 之间的整数。",
  probabilityFixedWon: "固定 100%",
  probabilityFixedLost: "固定 0%",
  probabilityFixedHint: "赢单/终态阶段的默认赢率由系统固定，不可编辑。",
} as const;

/** 签约类型 / 业务形态两张目录的配置面 (incr/0067)。 */
export const CONTRACT_TYPE_TEXT = {
  noun: "类型",
  title: "签约类型",
  count: (n: number) => `${n} 个类型`,
  why: "这笔交易的性质——新签/续签/增购，可改名、调顺序、增删。新建商机时按客户历史自动给一个默认值，销售可以改。",
  add: "新建类型",
  save: "保存",
  codeLabel: "类型代码",
  codeHint: "创建后不可更改。已存在的代码表示改名。",
  nameLabel: "类型名称",
  colName: "类型",
  colFiled: "商机数",
  deleteConsequence: "该类型将从签约类型目录中移除。归在它下面的商机不受影响——有商机在用就删不掉。",
} as const;

export const BUSINESS_FORM_TEXT = {
  noun: "形态",
  title: "业务形态",
  count: (n: number) => `${n} 个形态`,
  why: "卖的是什么——项目定制类/标化产品类/咨询服务类，可改名、调顺序、增删。停滞天数也按形态设。",
  add: "新建形态",
  save: "保存",
  codeLabel: "形态代码",
  codeHint: "创建后不可更改。已存在的代码表示改名。",
  nameLabel: "形态名称",
  colName: "形态",
  colFiled: "商机数",
  deleteConsequence: "该形态将从业务形态目录中移除。归在它下面的商机不受影响——有商机在用就删不掉。",
  colStallOverride: "停滞天数",
  stallOverrideLabel: "停滞天数覆盖",
  stallOverrideHint: "留空表示沿用工作区的默认停滞天数。定制项目通常比标品谈得久，这里按形态单独设。",
  stallOverrideDefault: (n: number) => `默认 ${n} 天`,
} as const;

/** incr/0027：唯一能写入采购角色的控件，它只存在于商机上。 */
export const BUYING_ROLE_TEXT = {
  title: "这一单的采购角色",
  description:
    "谁签字、谁评估、谁能引荐——都是相对这一笔采购而言的。同一个人在另一单里可以是另一个角色。",
  person: "联系人",
  pickPerson: "选择联系人",
  role: "在本单的角色",
  // 立场是独立于角色的第二个维度 (owner, 2026-09-21: 对我方的立场态度), 跟
  // "role" 分开两个 Field, 不是同一个下拉的另一组选项。
  stance: "对我方的立场",
  stanceNotStated: "还没表过态",
  influence: "在本单的影响力 0-100",
  save: "保存角色",
  saved: "已保存",
} as const;

/**
 * 商机作战室 - owner 裁定 2026-09-05:判决 → 建议 → 动作。
 *
 * 判决条五格是规则层的裁定;行动卡只提供产品本来就允许人刻意去做的事,
 * 每张卡带依据 —— 没有依据的推荐是命令。
 */
export const WAR_ROOM_TEXT = {
  // 客户上下文, read-only (YC-070 S1): links to the customer page.
  accountHealth: (n: number) => `客户健康 ${n}`,
  accountSingleThread: "客户单线程",
  title: "态势判决",
  allClear: (n: number) => `${n} 项检查全部通过。没有需要处理的发现。`,
  findings: (n: number) => `${n} 项需要注意,可执行的动作按轻重排在下面。`,
  cell: {
    stage: "阶段",
    forecast: "预测",
    chain: "决策链",
    commitment: "承诺",
    price: "价格",
  } as Record<string, string>,
  // 判决条各格的句子
  stageMoving: (stage: string, days: number | null) =>
    days === null ? "在推进" : `本阶段第 ${days} 天`,
  stageStalled: (stage: string, days: number, line: number) => `已停 ${days} 天,超过 ${line} 天停滞线`,
  stageTerminal: (status: string): string =>
    status === "won" ? "已成交" : status === "abandoned" ? "已放弃" : status === "lost" ? "已丢单" : "已关闭",
  // 阶段停滞诊断 - who a stalled deal is waiting on (brief.ts stallHolder).
  stallOnUs: (statement: string, days: number) => `卡在我方：答应的「${statement}」已逾期 ${days} 天`,
  stallOnThem: (who: string | null, statement: string, days: number) =>
    `卡在对方${who ?? ""}：答应的「${statement}」已逾期 ${days} 天`,
  stallOnBuyer: (who: string, days: number | null) =>
    days === null ? `卡在决策人${who}：从未有过接触记录` : `卡在决策人${who}：${days} 天没有接触，比停在本阶段还久`,
  stallUnknown: "看不出卡在谁身上：双方没有逾期承诺，决策人在本阶段内也有接触",
  forecastAgrees: (c: string) => "与规则判断一致",
  forecastDisagrees: (filed: string, suggested: string) => `人填与规则不一致`,
  forecastSettled: "档位由阶段定死",
  forecastWhy: (caps: readonly string[], p: number, human: boolean) => {
    const capText = caps
      .map((c) =>
        c === "stalled" ? "停滞" : c === "no_close_date" ? "无成交日" : "成交日已过",
      )
      .join("、");
    return `${human ? "自报" : "阶段默认"}概率 ${p}%${capText ? `,降档因素:${capText}` : ""}`;
  },
  chainHealthy: (coaches: number) => `角色齐备,${coaches} 名内线`,
  chainMissing: (roles: readonly string[]) => `缺 ${roles.length} 个必需角色`,
  chainUnreachable: "无人能引荐到决策人",
  chainUnstated: "本单尚未确定任何采购角色",
  commitmentClear: (open: number) => (open === 0 ? "无未结承诺" : `${open} 条在办,均未逾期`),
  commitmentOverdue: (ours: number, theirs: number) =>
    ours > 0 && theirs > 0
      ? `我方逾期 ${ours} 条、对方 ${theirs} 条`
      : ours > 0
        ? `我方逾期 ${ours} 条`
        : `对方逾期 ${theirs} 条`,
  priceClean: (lines: number): string => (lines === 0 ? "尚无行项" : "无待批折扣"),
  pricePending: (n: number) => `${n} 行低于底价待批`,
  // 行动卡
  applyCategory: (label: string) => `按规则改为「${label}」`,
  applyCta: "采用规则档位",
  applied: "已应用",
  applyCategoryReason: (basis: string) => `规则依据:${basis}。服务端会复核,事实变了会拒绝。`,
  settleTitle: (statement: string) => `了结承诺:${statement}`,
  settleReason: (direction: string, days: number) =>
    direction === "we_owe"
      ? `我方承诺已逾期 ${days} 天 —— 它在扣可靠度,也在客户那边挂着。`
      : `对方承诺已逾期 ${days} 天 —— 该问一句了。`,
  settleMet: "已兑现",
  settleMissed: "未兑现",
  settled: "已了结",
  stateRolesTitle: "确定这一单的采购角色",
  stateRolesReason: "谁签字、谁能引荐,是这一单的问题 —— 判断层的每条规则都从这里读。",
  stateRolesCta: "去确定",
  approveTitle: (n: number) => `${n} 行低于底价,等待签字`,
  approveReason: (n: number) => "底价存在的意义是约束正在成交的人;签字要看着具体行项做。",
  approveCta: "去逐行审批",
  adjudicateReason: (n: number) => "采纳即执行(ADR-003:参谋提议,人裁决)。逐条看,逐条定。",
  acceptAndExecute: "采纳并执行",
  accepted: "已采纳",
  toQueue: "到裁决队列看全部",
  adjudicateFailed: "裁决失败,到队列页看原因",
  analyseTitle: "分析这一单",
  analyseReason: "把本单的阶段、决策链、承诺、行项交给参谋做一次深度复盘。",
  analyseCta: "带上下文去问参谋",
  analyseQuestion: (deal: string, findings: number) =>
    `请复盘商机「${deal}」:当前判决条有 ${findings} 项发现。结合该客户的接触记录与承诺,给出下一步建议和风险点。`,
} as const;

export const CHAIN_TEXT = {
  title: "决策链",
  // A person the chain knows by id but the roster cannot name (not on this
  // customer any more). Never the id itself.
  unnamedPerson: "未知联系人",
  // 账户级覆盖聚合 (YC-021 L2) - read only; roles are edited on each deal.
  rollupTitle: (deals: number, people: number) => `${deals} 个在办商机合计 · 涉及 ${people} 人`,
  rollupCovered: "至少一单已覆盖",
  rollupMissingOn: (role: string, deals: number) => `${deals} 单缺${role}`,
  rollupSeparator: "；",
  editOnDeal: "去商机编辑角色",
  // 变化归因 (YC-021 L5, incr/0079).
  reasonLabel: "依据",
  reasonItem: (factor: string, text: string) => `${factor}：${text}`,
  changeLabel: "变化",
  changeTag: (since: string, delta: number) => `较 ${since} ${delta < 0 ? "↓" : "↑"}${Math.abs(delta)}`,
  benchmarkTag: (percentile: number) => `高于同类 ${percentile}%`,
  benchmarkLabel: "对标",
  changeSince: (from: number, to: number, date: string) => `较 ${date} 的 ${from} 分变为 ${to} 分`,
  changeFactor: (factor: string, delta: number) => `${factor} ${delta > 0 ? "+" : ""}${delta}`,
  changeSeparator: "，",
  // incr/0027：一单一条链。标题必须带上是哪一单，否则同一客户下的两条
  // 委员会读起来像一条自相矛盾的答案。
  forDeal: (deal: string) => `决策链 · ${deal}`,
  noOpenDealTitle: "没有在办商机",
  noOpenDealDescription:
    "采购角色是相对某一笔采购而言的。等这家客户有在办商机，再在那一单上确定谁是决策人、谁是内线。联系人和职务在上方的名册里。",
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
  // 从"健康拆解"改名"客户评估" (owner, 2026-09-20: 补充 - 中部区域从这张卡
  // 开始, 原健康拆解). mockup 本来一直叫这张卡"健康拆解"(健康评估是header
  // 的环, 是不同的 key/healthShort) - 这次是内容区重排时 owner 直接给的新
  // 名字, 不是照抄设计图, 记录在案。
  healthTitle: "客户评估",
  healthDescription:
    "派生值，随源数据重算。用于排序和预警，不作为任何业务判断的唯一依据。",
  // header 上放不下"客户健康度"这五个字的读数卡，短标题给 header 用
  // (owner, 2026-09-18: header 三维度顺序 - 健康评估改名四个字)。
  healthShort: "健康评估",
  primaryConcern: "首要问题",
  // owner, 2026-09-20: 设计图严格对齐 - mockup 用词是"重新评估"，"重新计算"
  // 这个措辞这次才发现一直没跟上（早前只在 mockup 里改过）。
  recompute: "重新评估",
  // 客户评估整卡可收起 (owner, 2026-09-21: 梳理全景图中心区域 - 客户评估
  // 收起来应该收到一行).
  collapse: "收起",
  expand: "展开",
  factorPipeline: "商机",
  factorRecency: "互动时效",
  factorRecencyShort: "时效",
  factorDelivery: "交付",
  factorCollections: "回款",
  // 第五因子 (L4 批三, 业务规则 §5)。
  factorRenewal: "续约",
  // 决策链主从视图 (owner, 2026-09-20: 设计图严格对齐 - 先做，别再等我确认) -
  // 栏1 只放摘要行, 点开在栏2 展开详情, 这些是详情视图自己的措辞。
  coverageCount: (n: number, total: number) => `已覆盖 ${n}/${total} 角色`,
  viewTable: "表格",
  viewGraph: "图谱",
  reachFlagYes: "可达",
  reachFlagNo: "未触达",
  detailBack: "返回全链条内容",
  // 摘要行的一句话小结 - 可达性 + (有阻碍者且未触达时) 未触达人数。人数来自
  // 真实的 recency 数据(该阻碍者是否在 warm 名单里), 不是编出来的。
  blockersUnreached: (n: number) => `${n} 位阻碍者未触达`,
  showAllChains: (n: number) => `查看全部（${n}）`,
  collapseChains: "收起",
  // 决策链表格的六列 (owner, 2026-09-21: 决策链非常重要，重点完善 - 组织内
  // 角色分类、立场、影响力权重、人际关系四个维度都要有, 应该表格化，不要
  // 信息堆积)。
  colPerson: "联系人",
  colRole: "角色",
  colStance: "立场",
  colStanceInfluence: "立场 · 影响力",
  colInfluence: "影响力",
  colRelationship: "关系",
  colReachable: "可达",
} as const;

export const CONTACT_ERROR: Record<string, string> = {
  ...GATE_ERROR,
  name_required: "联系人需要一个姓名",
  unknown_decision_role: "未知的决策角色",
  unknown_stance: "未知的立场",
  unknown_status: "未知的联系人状态",
  influence_range: "影响力是 0 到 100 之间的整数",
  not_found: "这个联系人不在该客户名下",
};

export const EXECUTION_ERROR: Record<string, string> = {
  ...GATE_ERROR,
  title_required: "执行项需要一个动作名称",
  unknown_action_type: "未知的动作类型",
  unknown_status: "未知的执行状态",
  campaign_completed: "这场战役已完成，它的执行项是它据以收尾的记录，不能再改",
  not_found: "战役不存在，或这一项不属于它",
};

export const SEGMENT_ERROR: Record<string, string> = {
  ...GATE_ERROR,
  segment_code_required: "细分市场需要一个代码",
  name_required: "细分市场需要一个名称",
  unknown_status: "未知的细分状态",
  priority_out_of_range: "优先级是 0 到 9999 之间的整数",
  plan_closed: "这个计划已收尾，它的市场切分是当期据以执行的记录，不能再改",
  not_found: "找不到这条记录，页面可能已过期，请刷新",
  status_unchanged: "已经是这个状态了",
  segment_in_use: "仍有活动指向它、或仍有客户挂着这个码，不能删除——请改用退役",
  move_at_edge: "已经在清单的这一端了",
  not_movable: "这一行不在可排序的清单里",
};

export const PLAN_ERROR: Record<string, string> = {
  ...GATE_ERROR,
  plan_no_required: "计划需要一个编号",
  name_required: "计划需要一个名称",
  period_required: "计划需要一个周期",
  plan_no_taken: "这个编号已经被占用了",
  not_found: "计划不存在，或不属于当前工作区",
  unknown_status: "未知的计划状态",
  illegal_transition: "当前状态不能这样变更",
  plan_settled: "已结束或已归档的计划不再修改——它的周期已经过去，下游数据是按当时的说法记的",
};

/**
 * 项目健康度重算。`delivery-table` 的行操作 toast 此前直接显示 `error`。
 */
export const PROJECT_ERROR: Record<string, string> = {
  ...GATE_ERROR,
  not_found: "项目不存在，或不属于当前工作区",
  name_required: "项目需要一个名称",
  unknown_status: "未知的项目状态",
  illegal_transition: "当前状态不能这样变更",
  sequence_immutable: "分期的序号是这一行的身份，调序意味着写新行而不是改旧行",
  sequence_invalid: "分期序号不合法",
};

export const MILESTONE_ERROR: Record<string, string> = {
  ...GATE_ERROR,
  name_required: "里程碑需要一个名称",
  sequence_invalid: "序号是从零开始的整数",
  unknown_status: "未知的里程碑状态",
  done_needs_completion: "标记为已完成的里程碑必须写明何时完成",
  completion_needs_done:
    "实际完成时间只属于已完成的里程碑——错过的那个并没有发生",
  acceptance_needs_done: "客户验收的关口，状态应当是已完成",
  acceptor_required: "请写下客户方是谁签字确认的",
  recorder_required: "验收记录需要写明是谁录入的",
  change_reason_required: "改动已承诺的关口，需要写明原因",
  changer_required: "变更记录需要写明是谁改的",
  not_found: "项目不存在，或不属于当前工作区",
};

export const DECISION_ROLE_LABEL: Record<string, string> = {
  economic: "经济决策人",
  technical: "技术决策人",
  user: "使用者",
  coach: "内线",
  blocker: "阻碍者",
  unknown: "未知",
};

// EB/UB/TB/Coach (owner, 2026-09-21: 组织内角色分类) - buying_role 早就是这
// 四个值(economic/user/technical/coach, 只是这四个都还留着 blocker/unknown 做
// 向后兼容), 这里只补上英文缩写, 不是重新发明一套角色。分开成自己的字典而不是
// 改写 DECISION_ROLE_LABEL 本身, 因为后者已经有好几处消费者(标签、tooltip、
// 表单下拉), 有的地方要缩写、有的地方要全名, 两个字典各自专心一件事。
export const DECISION_ROLE_ABBR: Partial<Record<string, string>> = {
  economic: "EB",
  user: "UB",
  technical: "TB",
};

// 拥护者/支持者/中立者/反对者 (owner, 2026-09-21: 对我方的立场态度) - 独立于
// buying_role 的第二个维度, incr/0075。null 表示没有人表过态, 不在字典里
// (调用方自己判断 null 走哪条分支, 不该有一个"未表态"的假标签)。
export const STANCE_LABEL: Record<string, string> = {
  champion: "拥护者",
  supporter: "支持者",
  neutral: "中立者",
  antagonist: "反对者",
};

// 核心圈/关键圈/边缘圈 (owner, 2026-09-21: 实际影响力权重) - domains/account/
// lib/health.ts 的 influenceTier() 算出属于哪一档, 这里只管怎么念。
export const INFLUENCE_TIER_LABEL: Record<string, string> = {
  high: "核心圈",
  medium: "关键圈",
  low: "边缘圈",
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
/**
 * 项目健康度为什么被下调。
 *
 * 规则层给的是 `{ code, count }`，句子在这里。此前规则层直接拼一句英文散文，
 * 而它所在的文件必须 ASCII-only —— 于是中文产品的提示框里出现了
 * `1 overdue instalment(s): a project with unpaid instalments cannot be green`。
 * TD-010 的原始症状。
 */
export function healthOverrideText(
  r: { code: string; count: number } | null,
): string {
  if (!r) return "";
  switch (r.code) {
    case "overdue_instalment":
      return `${r.count} 期逾期未回款——有欠款的项目不能是健康`;
    case "missed_milestone":
      return `${r.count} 个里程碑已错期`;
    default:
      return "";
  }
}

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
    case "renewal_lost":
      return `${r.days} 天前记录了续约流失`;
    case "renewal_downgraded":
      return `${r.days} 天前降级续约`;
    case "renewal_due_unopened":
      return (r.days ?? 0) < 0
        ? `通知期已过 ${-(r.days ?? 0)} 天，还没有续约商机`
        : `距通知截止 ${r.days} 天，还没有续约商机`;
    case "renewal_in_hand":
      return "临期合同的续约已在推进";
    case "renewal_not_due":
      return "合同未进入续约窗口";
    case "renewal_no_contract":
      return "没有合同数据";
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
  // 档位带「级」，模块名不带（owner, 2026-09-17：模块改名为「战略客户」）。
  // 三档是 account.tier 的显示名，模块是收两档的名册——同一屏上两者都会
  // 出现（商机详情页的档位标 + 左栏的模块名），词面必须分得开，否则
  // 「战略客户」既像一档又像一张名单。库里的值 strategic/key/standard 不动，
  // 改的只是显示名，所以不需要新增量。
  tierStrategic: "战略级",
  tierKey: "关键级",
  tierStandard: "普通级",
  // 定级抽屉的三张奖牌卡各自一句 (owner, 2026-09-20: mockup 三档各带一句
  // tc-desc) - 跟下面 designateWhy/planRequired 说的是同一件事, 只是拆成
  // 每档一句, 不用打开抽屉细读大段说明就知道选哪档意味着什么。
  tierStandardDesc: "默认档位，不改变任何规则",
  tierKeyDesc: "重点关注，暂不需要经营计划",
  tierStrategicDesc: "需要一份经营计划，节奏规则据此判断",
  // header 商机数量/客户级别/健康评估三维度里, "客户级别"这个维度自己的标签
  // (owner, 2026-09-20: 严格按照设计实施) - tierStrategic/tierKey/tierStandard
  // 是三档的VALUE，这个是维度自己的NAME，两者不是一回事。
  tierDimensionLabel: "客户级别",
  planOf: (period: string) => `${period} 经营计划`,
  planTarget: "计划目标",
  // header 三维度里"商机数量"这个维度自己的标签 (owner, 2026-09-20: 逐个
  // 板块对照设计图核实 - mockup 原话: 标签明确写"开放商机"而不是笼统的
  // "商机数量", 圆圈里的数字是"状态为 open 的商机数"). 中文之前写成"在办
  // 商机", 跟这个 key 自己的英文翻译("Open deals")对不上, 也跟设计图对不上。
  planDeals: "开放商机",
  // 徽章区第一块补充的第二行 (owner, 2026-09-21: 补充一些信息， 商机数 /
  // 累计合同额). 只统计 status=open 的商机, 跟商机数本身同一个口径 - 不是
  // 这个客户全部历史成交额。
  openDealsAmountLabel: "累计合同额",
  amountUnit: (unit: string, currency: string) => (unit ? `单位：${unit} · 币种：${currency}` : `币种：${currency}`),

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
  planAccountLevel: (n: number) => `另有 ${n} 条客户级（关系类）提案，在客户页 →`,
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
    propose_upsell: "推荐增购",
    flag_conflict: "确认两条记录说法不一致",
    record_evidence: "写入购买证据",
    set_buying_role: "标注本单角色 / 立场",
    add_commitment: "记下一条承诺",
    plan_step: "推进计划的一步",
    adjust_forecast: "调整预测口径",
    draft_email: "起草邮件",
  } as Record<string, string>,
  approve: "批准",
  reject: "否决",
  confidence: (n: number) => `置信度 ${n}`,

  // --- designating a strategic account (batch 6c) ---------------------------
  designate: "定级",
  // header 里的 medal 徽标本身不再可点 (owner, 2026-09-20: 死死记住设计文件 -
  // mockup 原话: "定级: a BADGE...not a button - modifying it moved to the
  // ··· menu"), 这是那个共享菜单里的一项文案，不是徽标自己的标签。
  designateMenu: "定级 / 计划",
  designateWhy:
    "战略客户走的是另一套判断：其余规则都由事件触发、都需要一条开放商机，而战略客户最该报的恰恰是「没有开放商机却安静下来」——没有任何事件会为此触发。节奏规则是那时唯一会响的东西，而它读的是计划。",
  planRequired: "战略客户必须配计划，否则定级只是一个标签",
  planPeriod: "计划周期",
  cadenceContact: "接触节奏（天）",
  cadenceExec: "高层节奏（天）",
  designateSubmit: "确认定级",
  designated: (tier: string) => `已定为${tier}`,
  designateDenied: "你没有修改客户的权限",
} as const;

// 基础信息表单 (owner, 2026-09-20: 设计图严格对齐 - 先做基础信息表单，智能
// 采集先跳过). 字段全部对应 updateAccountBasics() 已经能写的真实列 - 没有
// 一个是这张表单发明的新事实。
/** 删除空壳客户 (owner, 2026-09-23: 只删空壳客户). */
export const ACCOUNT_DELETE_TEXT = {
  menu: "删除客户",
  verb: "删除",
  consequence: "只有还没有任何业务记录的客户能删（建错了的那种）。删除后不再出现在任何列表里，同一家企业以后可以重新建档。",
  condition: {
    deals: "没有商机",
    contracts: "没有合同",
    projects: "没有交付项目",
    interactions: "没有跟进记录",
    commitments: "没有承诺",
    contacts: "没有联系人",
    leads: "没有线索",
    children: "没有下级单位",
  } as Record<string, string>,
  checking: "正在核对…",
  present: (n: number) => `现有 ${n} 条`,
  done: "已删除",
  titleTemplate: "{verb}{target}？",
};

export const ACCOUNT_BASICS_TEXT = {
  editButton: "编辑单位信息",
  title: "编辑单位信息",
  why: "客户的固有属性 - 名称、分类、联系入口。谁负责跟进、决策链这些另有自己的卡片。",
  name: "客户名称",
  accountNo: "客户编号",
  accountNoOnSave: "保存后自动生成",
  createCrumb: "新建客户",
  createTitle: "新建客户",
  createWhy: "只有名称必填。其余能填就填，不知道的留空——建好后客户页的「档案完整度」会列出还缺什么，随时补。你是这家客户的负责人，之后可以转给别人。",
  createSubmit: "创建",
  createCancel: "取消",
  createButton: "新建客户",
  region: "销售大区",
  province: "省份",
  provincePick: "未标注",
  industry: "行业",
  industryPick: "未标注",
  segment: "细分市场",
  segmentPick: "未标注",
  customerType: "客户类型",
  customerTypePick: "未标注",
  customerSize: "客户规模",
  customerSizePick: "未标注",
  customerNature: "客户性质",
  customerNaturePick: "未标注",
  creditCode: "统一社会信用代码",
  website: "官网",
  employeeCount: "员工规模",
  save: "保存",
  cancel: "取消",
  saved: "已保存",
} as const;

/* 权限管理 - the tree's own copy (owner, 2026-09-09: 业务域-模块-页面-操作 四级).
   The 业务域 and 模块 names come from DOMAIN_GROUP_LABEL / DOMAIN_LABEL; what
   is new here is the two planes as groups, the page names the action ids
   carry in their middle token, and a name for every one of the 69 operations
   - permission-tree.test.ts fails on a missing one. */
export const PERMISSION_TREE_TEXT = {
  title: "权限策略",
  why: "按业务域、模块、页面、操作四级展开；每个操作需要的权限，以及持有它的角色。权限为系统预置，授权在角色管理里改。",
  count: (actions: number, roles: number) => `${actions} 个操作 · ${roles} 个角色`,
  colPoint: "名称",
  colLevel: "类型",
  // 层级 / 子级 (owner, 2026-09-11): 两个Ln、x子项堆积在名称列后面太乱，
  // 拉出来各自独立成列。
  colTier: "层级",
  colChildren: "子级",
  colOps: "操作",
  // 来源一列（owner 2026-09-10：参考平台治理平面的三列布局）：目录整个是
  // 代码里的 authz/actions.ts，没有一条是从这个页面新建出来的，所以每一行
  // 都如实标"系统预置" - 不做假的"新增权限"入口。
  colSource: "来源",
  source: "系统预置",
  // 工具行的搜索与筛选（owner 2026-09-10：参考平台治理平面的搜索/筛选布局）。
  searchLabel: "搜索权限",
  searchHint: "搜索名称、权限码",
  domainFilterLabel: "业务域",
  filterAllDomains: "全部业务域",
  resetFilters: "重置筛选",
  toolbarCount: (n: number) => `共 ${n} 项操作`,
  toolbarFilteredCount: (shown: number, total: number) => `筛选出 ${shown} / ${total} 项操作`,
  filterEmpty: "没有匹配的权限点，换个关键词、层级或业务域再试",
  levelFilterLabel: "层级",
  filterAllLevels: "全部层级",
  // 复制权限码（owner 2026-09-10：操作列加一个只读能做的动作）。
  copyCode: "复制权限码",
  codeCopied: (code: string) => `已复制：${code}`,
  copyFailed: "复制失败，换成手动选中",
  // 顶部总览卡（owner 2026-09-10：参考平台治理平面的统计区，换成我们真有的数）。
  overviewTotal: "总操作数",
  overviewRoles: "角色数",
  overviewUnheld: "未持有角色",
  // 授权角色一列（owner, 2026-09-10: 撤掉角色横铺，前三名 + 数量，悬停看全部）。
  colHolders: "授权角色",
  // 授权角色列只放数量（owner 2026-09-10：只留数字，tags 模式，悬浮看名单）。
  holdersNone: "无角色持有",
  holdersTitle: (op: string, n: number) => `${op} · ${n} 个角色可执行`,
  // 分支行（业务域/模块/页面）的悬浮标题：角色汇聚——能做到它子树里任意一件事
  // 的角色（owner 2026-09-10：权限应该有继承关系，角色应该是汇聚关系）。
  holdersTitleBranch: (name: string, n: number) => `${name} · ${n} 个角色能做到子级里的至少一件事`,
  levelLabel: {
    // 业务 (owner, 2026-09-11: 四层的名称...= 业务) - not 业务域, which stays
    // the fuller form the filter labels/headers use (domainFilterLabel 等).
    domain: "业务",
    module: "模块",
    page: "页面",
    action: "操作",
  } as Record<string, string>,
  // 占位模块 - 还没有自己的权限点 (owner, 2026-09-11: 先建占位，应该有自己的
  // 权限点 / 先加一个空占位模块，后续补表): 见 PLACEHOLDER_MODULES。
  modulePending: "待补充权限点",
  expandTo: "展开到",
  collapseAll: "全部收起",
  granted: "持有",
  notGranted: "不持有",
  // The two planes, plus the two crosscutting modules (owner, 2026-09-11:
  // 缺少今日裁决和销售大屏) as 业务 of their own - 今日判断 / 销售大屏 own no
  // object either, same reason 智能副驾 doesn't sit inside a business group.
  groupLabel: {
    copilot: "智能副驾",
    admin: "配置管理",
    home: "今日判断",
    national: "销售大屏",
    enablement: "赋能分析",
  } as Record<string, string>,
  moduleLabel: {
    admin: "成员与权限",
  } as Record<string, string>,
  pageLabel: {
    "strategy.plan": "战略方案",
    "strategy.segment": "细分市场",
    "planning.territory": "销售区域",
    "planning.target": "销售目标",
    "planning.attainment": "承诺达成",
    // 合成占位页面，复用模块名 (owner, 2026-09-11) - 一个模块的模块级操作
    // (campaign.view/signal.view/account.view/pipeline.view/copilot.ask 等)
    // 原来直接挂在模块下，现在每个模块下至少有一个页面节点，与 DOMAIN_LABEL
    // 里对应模块的名字相同。
    "campaign.base": "营销活动",
    "campaign.execution": "活动执行",
    "account.base": "客户管理",
    "account.contact": "联系人",
    "account.interaction": "互动记录",
    "account.commitment": "客户承诺",
    "account.graph": "客户关系图",
    "account.collaborator": "协作人",
    "signal.base": "商机智探",
    "signal.feed": "信号源",
    "signal.lead": "线索",
    "pipeline.base": "商机管理",
    "pipeline.opportunity": "商机",
    "pipeline.discount": "折扣审批",
    "pipeline.forecast": "销售预测",
    "pipeline.winloss": "赢丢复盘",
    "pipeline.stage": "阶段配置",
    "pipeline.contracttype": "签约类型",
    "pipeline.businessform": "业务形态",
    "pipeline.opportunityconfig": "业务配置",
    "delivery.project": "交付项目",
    "delivery.milestone": "里程碑",
    "delivery.revenue": "回款",
    "delivery.contract": "合同",
    "copilot.session": "会话",
    "copilot.base": "销售助手",
    "copilot.action": "副驾建议",
    "copilot.playbook": "剧本",
    "copilot.autopilot": "自动执行",
    "catalog.product": "产品",
    "catalog.solution": "解决方案",
    "catalog.pricebook": "价目",
    "admin.member": "成员",
    "admin.audit": "安全审计",
    "admin.diagnostics": "系统验证",
    "admin.role": "角色",
    "admin.org": "组织架构",
    "admin.reminderthreshold": "提醒阈值",
  } as Record<string, string>,
  actionLabel: {
    "strategy.plan.view": "查看战略方案",
    "strategy.plan.create": "新建战略方案",
    "strategy.plan.update": "修改战略方案",
    "strategy.plan.approve": "审批战略方案",
    "strategy.segment.view": "查看细分市场",
    "strategy.segment.upsert": "维护细分市场",
    "planning.territory.view": "查看销售区域",
    "planning.territory.upsert": "维护销售区域",
    "planning.target.view": "查看销售目标",
    "planning.target.create": "设定销售目标",
    "planning.target.update": "调整销售目标",
    "planning.attainment.view": "查看承诺达成",
    "campaign.view": "查看营销活动",
    "campaign.upsert": "维护营销活动",
    "campaign.execution.view": "查看活动执行",
    "campaign.execution.upsert": "记录活动执行",
    "account.view": "查看客户",
    "account.upsert": "维护客户",
    "account.contact.upsert": "维护联系人",
    "account.interaction.record": "记录互动",
    "account.commitment.upsert": "维护客户承诺",
    "account.commitment.settle": "结清客户承诺",
    "account.graph.view": "查看客户关系图",
    "account.graph.link": "建立客户关联",
    "account.collaborator.manage": "管理协作人",
    "signal.view": "查看信号",
    "signal.triage": "处理信号",
    "signal.rescore": "重新评分",
    "signal.feed.configure": "配置信号源",
    "signal.feed.ingest": "接入信号",
    "signal.lead.view": "查看线索",
    "signal.lead.upsert": "维护线索",
    "signal.lead.convert": "转化线索",
    "pipeline.view": "查看商机",
    "pipeline.opportunity.create": "新建商机",
    "pipeline.opportunity.update": "修改商机",
    "pipeline.discount.approve": "审批折扣",
    "pipeline.opportunity.advance": "推进商机阶段",
    "pipeline.opportunity.abandon": "放弃商机",
    "pipeline.claims.view": "查看声明变更与推迟",
    "pipeline.evidence.record": "记录购买证据",
    "pipeline.exitcheck.view": "查看阶段退出核验",
    "pipeline.opportunity.importance": "设定商机重要度",
    "pipeline.forecast.view": "查看销售预测",
    "pipeline.forecast.snapshot": "提交预测快照",
    "pipeline.forecast.categorize": "归类预测",
    "pipeline.winloss.view": "查看赢丢复盘",
    "pipeline.winloss.record": "记录赢丢复盘",
    "pipeline.stage.view": "查看阶段配置",
    "pipeline.contracttype.view": "查看签约类型",
    "pipeline.businessform.view": "查看业务形态",
    "pipeline.opportunityconfig.view": "查看业务配置",
    "pipeline.opportunityconfig.manage": "维护业务配置",
    "delivery.project.view": "查看交付项目",
    "delivery.contract.view": "查看合同",
    "delivery.contract.upsert": "录入与编辑合同",
    "delivery.contract.renew": "续约与记录续约结果",
    "delivery.project.upsert": "维护交付项目",
    "delivery.milestone.upsert": "维护里程碑",
    "delivery.revenue.view": "查看回款",
    "delivery.revenue.upsert": "记录回款",
    "copilot.session.open": "打开副驾会话",
    "copilot.ask": "向副驾提问",
    "copilot.suggest": "获取副驾建议",
    "copilot.action.decide": "裁决副驾建议",
    "copilot.action.decide_batch": "批量裁决副驾建议",
    "copilot.autopilot.enable": "启用自动执行",
    "copilot.playbook.view": "查看剧本",
    "copilot.action.view": "查看副驾建议",
    "copilot.playbook.upsert": "维护剧本",
    "catalog.product.view": "查看产品",
    "catalog.product.upsert": "维护产品",
    "catalog.solution.view": "查看解决方案",
    "catalog.solution.upsert": "维护解决方案",
    "catalog.pricebook.view": "查看价目",
    "catalog.pricebook.upsert": "维护价目",
    "admin.member.view": "查看成员",
    "admin.audit.view": "查看安全审计",
    "admin.diagnostics.view": "查看系统验证",
    "admin.diagnostics.probe": "运行平台探测",
    "admin.reminderthreshold.view": "查看提醒阈值",
    "admin.reminderthreshold.manage": "设置提醒阈值",
    "admin.member.role.assign": "分配角色",
    "admin.member.role.revoke": "撤销角色",
    "admin.member.deactivate": "停用成员",
    "admin.member.reactivate": "恢复成员",
    "admin.member.scope": "设置数据范围",
    "admin.role.upsert": "新建或配置角色",
    "admin.role.remove": "删除角色",
    "admin.org.upsert": "新建或配置单位",
    "admin.org.remove": "删除单位",
  } as Record<string, string>,
  /* 简写 for the nine role columns (owner: 角色太多，可以简写); the full name
     is the header's tooltip. */
  roleShort: {
    sales_leader: "负责人",
    marketing_manager: "市场",
    sales_rep: "销售",
    presales: "售前",
    delivery_manager: "交付",
    sales_ops: "运营",
    viewer: "只读",
    sales_manager: "经理",
    regional_director: "总监",
    // 0047 - the fifteen new rungs and functions.
    executive: "高管",
    finance: "财务",
    workspace_admin: "管理员",
    senior_sales_manager: "高销经",
    regional_general_manager: "区总",
    channel_manager: "渠道",
    senior_channel_manager: "高渠道",
    senior_delivery_manager: "高交付",
    senior_presales: "高售前",
    marketing_specialist: "市专",
    sales_ops_specialist: "运专",
    key_account_manager: "大客户",
    sdr: "商开",
    deal_desk: "商务",
    customer_success: "客成",
    // 0049 - the heads of the lines and the sales ladder re-cut.
    sales_director: "销总",
    branch_general_manager: "分总",
    channel_head: "渠负",
    delivery_head: "交负",
    presales_head: "售前负",
    marketing_head: "市负",
    ops_head: "运负",
  } as Record<string, string>,
} as const;

// A rule sweep's proposal rationale, rebuilt from its payload for the reader
// (proposal-rationale.ts). The stored English sentence is the audit record.
export const RATIONALE_TEXT = {
  upsell: (product: string, owners: number, peers: number) =>
    `尚未使用${product}。同行业有在约合同的 ${peers} 家客户里，${owners} 家在用。`,
  chase: (direction: "they_owe" | "we_owe", statement: string, due: string, days: number) =>
    `${direction === "they_owe" ? "对方答应" : "我方答应"}：${statement}。${due} 到期，已过 ${days} 天，没有任何记录关闭它。`,
};

// 外部动态 (YC-021 L1 工商舆情异动) - the customer page's matched signals.
export const SIGNAL_PANEL_TEXT = {
  title: "外部动态",
  summary: (n: number, newestDaysAgo: number) =>
    `${n} 条外部动态 · 最新一条${newestDaysAgo === 0 ? "今天" : `${newestDaysAgo} 天前`}`,
  when: (days: number) => (days === 0 ? "今天" : `${days} 天前`),
  source: (source: string) => `来源：${source}`,
  sourceLabel: {
    web: "网页",
    news: "新闻",
    campaign: "营销活动",
    crm: "CRM",
    partner: "合作伙伴",
    manual: "手工录入",
    arda: "Arda",
    cohort: "相似客户",
  } as Record<string, string>,
  openSource: "来源原文",
  handleInInbox: "去商机智探处理",
  viewAll: (n: number) => `在商机智探查看全部 ${n} 条`,
  // The header button names where it goes (owner, 2026-09-24: 按钮名称改为商机智探).
  inboxButton: "商机智探",
};

// 风险分型 (YC-021 L5, owner 2026-09-24): five types, what each rests on, who to go to.
export const RISK_TEXT = {
  title: "风险分型",
  type: { relationship: "关系", advance: "推进", delivery: "交付", collections: "回款", renewal: "续约" },
  level: { risk: "有风险", watch: "关注", clear: "正常", unknown: "未知" } as Record<RiskLevel, string>,
  role: { account_owner: "客户负责人", deal_owner: "商机负责人", project_manager: "项目经理" },
  noFinding: (level: RiskLevel): string => (level === "unknown" ? "数据读取不到，不下结论" : "没有发现问题"),
  finding: (f: Exclude<RiskFinding, { code: "renewal" }>): string => {
    switch (f.code) {
      case "buyer_unreachable":
        return `「${f.deal}」决策人不可达`;
      case "no_buyer":
        return `「${f.deal}」没有经济决策人`;
      case "roles_missing":
        return `「${f.deal}」缺 ${f.count} 个角色`;
      case "blockers":
        return `「${f.deal}」有 ${f.count} 个阻碍者`;
      case "single_thread":
        return `只和${f.who}一个人有来往`;
      case "deal_stalled":
        return `「${f.deal}」停了 ${f.days} 天`;
      case "project_red":
        return `「${f.project}」红灯`;
      case "project_amber":
        return `「${f.project}」黄灯`;
      case "milestones_overdue":
        return `「${f.project}」${f.count} 个里程碑逾期`;
      case "revenue_overdue":
        return `「${f.project}」${f.count} 笔回款逾期`;
      case "contract_risk":
        return `合同 ${f.contractNo} 续约风险${f.level === "high" ? "高" : "中"}`;
    }
  },
  separator: "；",
  whoUnassigned: "未指定",
  who: (role: string, name: string | null): string => (name ? `找 ${name}（${role}）` : `找${role}（未指定）`),
  // 每条的开头标签: 谁在说话 (owner, 2026-09-24)。
  source: { rule: "规则判断", model: "智能分析", manual: "人工填报" } as Record<FindingSource, string>,
  sourceHint: {
    rule: "按固定规则从记录算出来的，可以自己复核",
    model: "模型从原文看出来的，只能核对它引用的原文",
    manual: "团队成员自己填写的判断",
  } as Record<FindingSource, string>,
  today: (lanes: string): string => `今天要处理：${lanes}`,
  lanesJoin: "、",
  showEvidence: "展开触发条件和证据",
};

// ICP 拟合度 (YC-021 L1, owner 2026-09-24) - against the workspace's own target segments.
// 钱包份额 (YC-021 L4, owner 2026-09-24) - 业务规则 §9.6: 按商机算, 客户项目总投入
// 由销售在商机上填 (人工填报); 单位卡和存量收入卡只做加总, 已承接与在谈分开说。
export const WALLET_TEXT = {
  // 商机占比 (owner 2026-09-25: 钱包份额 不适合商机场景 - 商机比重 / 商机占比)
  title: "商机占比",
  hint: "我方承接额 ÷ 客户在这个项目上的总投入；总投入由销售在商机上填写",
  fieldLabel: "客户项目总投入",
  fieldHint: (currency: string) => `客户在这个项目上一共投入多少（${currency}），人工填报，用于算商机占比；清空即未填`,
  committed: (n: number) => `已承接（${n} 个项目）`,
  quoted: (n: number) => `在谈（${n} 个项目）`,
  ratio: (pct: string, ours: string, budget: string) => `${pct} · ${ours} / ${budget}`,
  coverage: (withBudget: number, eligible: number) => `${eligible} 个在谈或已赢的商机中 ${withBudget} 个填了客户项目总投入`,
  noneFilled: "商机上还没有填客户项目总投入，算不出占比",
  exceeds: "我方金额超过了客户总投入，总投入可能填低了",
  basis: { committed: "承接占比", quoted: "报价占比" },
  dealNoBudget: "未填总投入",
  dealNotOurs: "未赢下，不计",
  dealUnpriced: "无金额",
  ours: (v: string) => `我方 ${v}`,
  budget: (v: string) => `客户总投入 ${v}`,
  by: (name: string, date: string) => `${name} 填于 ${date}`,
  dealDetail: (basis: string, ours: string, budget: string) => `${basis}：我方 ${ours} / 客户总投入 ${budget}`,
  orgValue: (pct: string) => `已承接 ${pct}`,
  orgNone: "未填",
};

export const ICP_TEXT = {
  // ICP = 理想客户画像: 工作区在「目标细分市场」里设的行业 / 规模 / 区域条件;
  // 拟合度 = 这家客户命中了最匹配的那个细分市场的几项条件 (0-3)。
  label: "ICP 拟合",
  fitValue: (fit: number, segment: string) => `${fit}/3 · ${segment}`,
  noSegmentShort: "未设目标市场",
  dimensionRow: (d: string) => `· ${d}`,
  summary: (fit: number, segment: string) => `ICP 拟合 ${fit}/3 · 目标市场「${segment}」`,
  noSegment: "工作区还没有设了条件的目标细分市场，无从计算 ICP 拟合度",
  dimension: { industry: "行业", size: "规模", region: "区域" } as Record<IcpDimension, string>,
  feature: (status: IcpFeatureStatus, value: string | null, targets: readonly string[]): string =>
    status === "open"
      ? "不限，任何值都符合"
      : status === "missing_value"
        ? `未填写（目标：${targets.join("、")}）`
        : status === "hit"
          ? `${value} ✓ 在目标内（${targets.join("、")}）`
          : `${value} ✗ 不在目标内（${targets.join("、")}）`,
};

/** 商机详情页 (deal batch 2, 2026-09-25): 栏1 档案 / 栏2 六板块, the same
 *  build as the customer page (owner: 这两个是同一级别的). */
export const DEAL_PAGE_TEXT = {
  // 栏1 · 交易档案
  factCustomer: "客户",
  factOwner: "负责人",
  factContractType: "签约类型",
  factBusinessForm: "业务形态",
  factSource: "来源",
  sourceCampaign: (name: string) => `战役 · ${name}`,
  sourceDirect: "直接录入",
  factTerritory: "区域",
  factCreated: "创建",
  factBudget: "客户项目总投入",
  factTeam: "售前 / 交付",
  notSet: "未设置",
  amountLabel: "金额",
  amountNone: "未定价",
  editTerms: "编辑交易档案",
  // 栏1 · 产品方案 (YC-069 §04b): 组合 + 定制, no prices.
  solutionTitle: "产品方案",
  solutionFrom: (name: string) => `来自方案「${name}」`,
  solutionCustom: "自定义组合",
  solutionScenario: (s: string) => `适用：${s}`,
  solutionStandard: "标准",
  solutionOptional: "选配",
  solutionCustomisations: "定制",
  customOn: (product: string) => `挂在「${product}」`,
  solutionItems: (n: number) => `${n} 项`,
  solutionOptionalCount: (n: number) => `${n} 项选配`,
  solutionCustomCount: (n: number) => `${n} 项定制`,
  solutionNone: "还没有产品明细",
  solutionPriceElsewhere: "价格与审批在「报价与审批」",
  // 栏1 · 决策流程
  decisionTitle: "决策流程",
  decisionEmpty: "本单还没有写明任何人的角色",
  decisionNone: "本单决策链还没有人",
  decisionReachable: (n: number) => `${n} 人 · 经济决策人可触达`,
  decisionUnreachable: (n: number) => `${n} 人 · 经济决策人未触达`,
  decisionNoEconomic: (n: number) => `${n} 人 · 没有经济决策人`,
  decisionBlockers: (n: number) => `${n} 位反对`,
  decisionRole: (title: string | null, role: string) => (title ? `${title} · ${role}` : role),
  roleUnset: "角色未设",
  editRoles: "编辑决策角色",
  // 栏1 · 客户引用
  customerTitle: (name: string) => `客户 · ${name}`,
  customerTier: "客户级别",
  customerHealth: "客户健康",
  customerOpenDeals: "本客户其他在办",
  dealsCount: (n: number) => `${n} 单`,
  customerProjects: "交付项目",
  customerReadOnly: "只读。客户的事在客户全景图上改。",
  customerOpen: "客户全景图",
  // 栏3 · 本单参谋 (YC-069): the deck's section that follows the page.
  advisorTitle: "本单参谋",
  advisorEmpty: "本单暂无待裁提案",
  advisorTrail: (group: string, confidence: number | null) =>
    confidence === null ? group : `${group} · 置信 ${confidence}`,
  // 推进进程 · 变更史 (声明变更日志 incr/0084 + 阶段日志)
  claimField: {
    amount: "金额",
    currency: "币种",
    expected_close_at: "预计成交日",
    forecast_category: "预测类别",
    probability: "赢率",
  } as Record<string, string>,
  claimSource: {
    manual: "人工",
    stage_machine: "阶段机",
    proposal: "采纳提案",
    lines: "明细重算",
  } as Record<string, string>,
  claimNone: "空",
  claimChange: (field: string, from: string, to: string) => `${field} ${from} → ${to}`,
  stageChange: (from: string | null, to: string) => (from ? `${from} → ${to}` : `创建于 ${to}`),
  historyReason: (r: string) => `理由：「${r}」`,
  historyBy: (who: string, source: string) => `${who} · ${source}`,
  historySystem: "系统",
  historyEmpty: "还没有变更",
  historyExit: (met: number, total: number) => (total === 0 ? "离开时未设条件" : `离开时 ${met}/${total}`),
  historyExitUnmet: (names: readonly string[]) => `未满足：${names.join("、")}`,
  historySince: "声明变更（金额、成交日、类别、赢率）自本功能上线起记录，之前的变化不补录",
  slipped: (n: number, days: number) => `推迟 ${n} 次 · 累计 ${days} 天`,
  slippedQuarter: "推出本季",
  // 购买证据槽 (incr/0085)
  evidenceSlot: {
    pain: "痛点",
    metrics: "量化价值",
    status_quo: "不作为",
    decision_process: "决策流程",
    paper_process: "签约流程",
  } as Record<string, string>,
  evidenceEmpty: "未写明",
  evidenceGrounded: "有据",
  evidenceSaid: "口述",
  evidenceAccepted: "智能分析 · 已确认",
  evidenceFill: "填写",
  evidenceEdit: "修改",
  evidenceHistory: (n: number) => `历史 ${n} 版`,
  evidenceCleared: "（已清空）",
  evidenceDialog: (slot: string) => `写明${slot}`,
  evidenceDialogWhy: "每次保存都是新的一版，旧版留在历史里。清空内容再保存 = 清空这一项。",
  evidenceStatement: "内容",
  evidenceCite: "依据哪条跟进（可选）",
  evidenceCiteNone: "不引用（口述）",
  evidenceSave: "保存这一版",
  // 本阶段退出条件 (incr/0087)
  exitTitle: (met: number, total: number) => `本阶段退出条件 ${met}/${total}`,
  exitShort: (met: number, total: number) => `退出 ${met}/${total}`,
  exitNone: "本阶段未设退出条件",
  exitMet: "满足",
  exitUnmet: "未满足",
  exitUnknown: "无法判断",
  exitAnyone: "任何联系人",
  exitHolders: (n: number) => `${n} 人`,
  exitNoRole: (roles: string) => `本单还没有${roles}`,
  exitNeverReached: (roles: string) => `${roles}还没出现在本单跟进里`,
  exitReached: (d: number) => `${d} 天前触达`,
  exitReachedLate: (d: number, limit: number) => `${d} 天前，超过 ${limit} 天`,
  exitWritten: "已写明",
  exitGoTo: (panel: string) => `未写明 ↗ ${panel}`,
  exitNoLines: "还没有明细 ↗ 报价与审批",
  exitPendingLines: (n: number) => `${n} 行待批 ↗ 报价与审批`,
  exitPriced: (n: number) => `${n} 行已定价`,
  exitOverdue: (n: number) => `对方 ${n} 件逾期 · 见推进计划`,
  exitNoOverdue: "无逾期",
  exitNoDate: "没有预计成交日",
  exitDaysLeft: (n: number) => `还剩 ${n} 天`,
  exitDatePassed: (n: number) => `已过 ${n} 天`,
  exitUnreadable: "读不到依据",
  // 发现行 (deal batch 4b)
  findingSource: "智能分析",
  findingAccept: "采纳",
  findingIgnore: "忽略",
  findingRole: (name: string, role: string, stance: string | null) =>
    stance ? `${name}：本单角色 ${role} · 立场 ${stance}` : `${name}：本单角色 ${role}`,
  findingCommitment: (direction: string, due: string, statement: string) => `${direction} · ${due} 前：${statement}`,
  // 重要度与优先级 (deal batch 6, incr/0090)
  importanceLabel: "重要度",
  importanceEdit: "设定重要度",
  importanceDescription: "这个商机对我们有多重要。和客户级别交叉得出优先级，只影响列表的先后，不改任何规则。",
  importanceConfirm: "确定",
  importanceSaved: "重要度已更新",
  importancePriority: (p: number | null) => (p === null ? "未定级" : `优先级 P${p}`),
  importanceSetBy: (who: string, at: string) => `${who} 于 ${at} 设定`,
  importanceDefault: "默认档位，还没有人设定",
  importanceCross: (tier: string, level: string) => `客户 ${tier} × 商机 ${level}`,
  // 推进计划生成 (deal batch 5c)
  planGenerate: "生成计划草案",
  planGenerating: "生成中…",
  planDone: (n: number) => (n > 0 ? `起草了 ${n} 步，在推进计划下逐条采纳` : "这次没有起草出可用的步骤"),
  planCached: (n: number) => `条件与承诺没有变化，沿用今天的草案（${n} 步）`,
  findingPlanStep: (direction: string, due: string, statement: string, criterion: string) =>
    `${direction} · ${due} 前：${statement} · 对应「${criterion}」`,
  findingQuote: (source: string | null, quote: string) => `${source ? `${source}：` : ""}「${quote}」`,
  processTitle: "怎么决策、怎么签",
  reasonsFilled: (n: number, total: number) => `${n}/${total} 项已写明`,
  processUnwritten: "流程未写明",
  statusQuoSignal: "有不作为信号",
  // 栏2
  todo: "待动手的事",
  judgements: "判断",
  proposals: "参谋提案",
  progressTitle: "推进进程",
  progressSummary: (stage: string, days: number | null) =>
    days === null ? stage : `${stage} · 停 ${days} 天`,
  probability: (n: number) => `赢率 ${n}%`,
  closeOn: (d: string) => `成交日 ${d}`,
  plan: "推进计划",
  history: "变更史",
  historyFold: (n: number) => `变更史 · 声明与阶段 ${n} 条`,
  trackCurrent: (met: number, total: number) => `当前 ${met}/${total}`,
  trackHere: "当前",
  trackWithReason: "有理由",
  trackUnrecorded: "未记录",
  planEmpty: "还没有承诺",
  exitTitlePlain: "本阶段退出条件",
  reasonsTitle: "购买理由",
  requirement: "需求",
  requirementNone: "还没有写明需求",
  competitionTitle: "竞争态势",
  competitionMentions: (n: number) => `跟进里 ${n} 处提到对手`,
  quoteTitle: "报价与审批",
  quoteSummary: (lines: number, pending: number) =>
    pending > 0 ? `${lines} 行明细 · ${pending} 行待批` : `${lines} 行明细`,
  quoteNone: "还没有明细",
  commsTitle: "沟通记录",
  commsSummary: (days: number, recent: number) => `最近 ${days} 天前 · 近 30 天 ${recent} 次`,
  commsNone: "还没有沟通记录",
  reviewSummaryOwed: (outcome: string) => `${outcome} · 复盘未写`,
  reviewSummaryDone: (outcome: string) => `${outcome} · 已复盘`,
} as const;

/** 购买证据槽的写入回执 (incr/0085)。 */
export const EVIDENCE_ERROR: Record<string, string> = {
  ...GATE_ERROR,
  not_found: "商机不存在，或不属于当前工作区",
  evidence_slot_unknown: "没有这一项证据",
  evidence_too_long: "内容最多 2000 字",
  evidence_citation_foreign: "只能引用这一单自己的跟进",
};

/** 阶段退出条件配置 (incr/0087, YC-065 R1)。 */
export const EXIT_CONFIG_TEXT = {
  title: "阶段退出条件",
  why: "每个阶段该拿到的东西：由系统按已有记录判定，不是勾选框。作战页按当前阶段逐条核验；推进时不硬拦。",
  count: (n: number) => `${n} 条`,
  add: "添加条件",
  edit: "编辑",
  remove: "删除",
  addTitle: "添加退出条件",
  editTitle: "编辑退出条件",
  save: "保存",
  kindLabel: "判定方式",
  kindLocked: "判定方式不能改——要换判定方式，删掉这条再加一条，过往核验的含义才不会被悄悄换掉。",
  kind: {
    role_present: "本单有指定角色",
    role_reached: "指定角色近期触达",
    slot_filled: "证据已写明",
    lines_priced: "明细已定价",
    their_commitments_clear: "对方承诺无逾期",
    close_date_valid: "成交日未过",
  } as Record<string, string>,
  rolesLabel: "角色",
  rolesAnyone: "一个都不选 = 本单至少有一位联系人",
  daysLabel: "多少天内",
  slotLabel: "哪一项证据",
  nameLabel: "作战页显示的那句话",
  nameHint: "例如「经济决策人 30 天内触达」",
  describeRolePresent: (who: string) => `本单有${who}`,
  describeRoleReached: (who: string, days: number) => `${who} ${days} 天内触达`,
  describeSlot: (slot: string) => `${slot}已写明`,
  removeTitle: "{verb}退出条件「{target}」？",
  removeConsequence: "作战页不再核验这一条；已经写进阶段日志的过往核验不受影响。",
} as const;

/** 阶段退出条件的写入回执 (incr/0087)。 */
export const EXIT_CRITERION_ERROR: Record<string, string> = {
  ...GATE_ERROR,
  not_found: "找不到这条条件，可能刚被删掉，刷新后重试",
  name_required: "要写一句作战页上显示的话",
  name_too_long: "最多 255 个字",
  criterion_kind_unknown: "没有这种判定方式",
  criterion_param_invalid: "参数不对：角色至少选一个（触达类），天数 1-365，证据项从列表里选",
  criterion_kind_locked: "判定方式不能改，删掉这条再加一条",
  criterion_on_terminal: "已关闭的阶段没有退出条件",
  unknown_stage: "这个阶段不在本工作区的阶段目录里",
};

/** 生成计划草案的失败回执 (deal batch 5c)。 */
export const PLAN_DRAFT_ERROR: Record<string, string> = {
  ...GATE_ERROR,
  not_found: "商机不存在，或不属于当前工作区",
  no_active_tenant: "当前工作区没有接入平台租户，暂时不能调用模型",
  tenant_required: "当前工作区没有接入平台租户，暂时不能调用模型",
  advisor_not_admitted: "平台暂未放行本工作区的参谋调用，这次没有起草",
  plan_no_goals: "本阶段的退出条件都满足了，下一阶段也没有设条件——没有要推进的目标",
  plan_deal_closed: "商机已关闭，不再起草推进计划",
  empty_question: "起草请求为空",
  quota_exceeded: "本工作区的参谋调用额度已用完",
  turn_failed: "这次起草没完成（模型暂不可用），稍后再试",
  unknown: "这次起草没完成，稍后再试",
};

/** 设定重要度的失败回执 (incr/0090)。 */
export const IMPORTANCE_ERROR: Record<string, string> = {
  ...GATE_ERROR,
  not_found: "商机不存在，或不属于当前工作区",
  importance_level_unknown: "这个档位不在本工作区的重要度里，刷新后重选",
  unknown: "没有保存成功，稍后再试",
};


/** 商机评估分 (incr/0091) - the admin section and the dossier coin. */
export const DEAL_SCORE_TEXT = {
  title: "商机评估分",
  why: "交易档案上的 0-100 分：七个因子各自 0-100，按这里的权重加权平均。本阶段没设退出条件时，该因子不计，权重按比例分给其余因子。",
  sum: (n: number) => `权重合计 ${n}/100`,
  weightsLabel: "因子权重",
  weightsHint: "七个权重合计必须是 100。某项设为 0 即不参与评分。",
  factor: {
    exit: "退出条件",
    chain: "决策链",
    stage: "推进节奏",
    recency: "互动新鲜度",
    commitment: "承诺履约",
    forecast: "预测一致",
    price: "价格纪律",
  } as Record<string, string>,
  factorHow: {
    exit: "本阶段满足数 ÷ 总数",
    chain: "稳 100 · 关注 · 风险 0",
    stage: "稳 100 · 关注 · 风险 0",
    recency: "按最近一次跟进的天数",
    commitment: "稳 100 · 关注 · 风险 0",
    forecast: "稳 100 · 关注 · 风险 0",
    price: "稳 100 · 关注 · 风险 0",
  } as Record<string, string>,
  watchLabel: "「关注」得分",
  watchHint: "态势判决为「关注」时该因子得几分（稳 100、风险 0）",
  recentLabel: "新鲜天数",
  recentHint: "最近一次跟进在这么多天内，互动新鲜度 100",
  quietLabel: "沉寂天数",
  quietHint: "超过这么多天没跟进为 0，两者之间线性递减",
  save: "保存",
  reset: "恢复默认",
  formula: "评估分 = Σ(权重 × 因子分) ÷ Σ权重",
  saved: "评估分权重已保存",
  // 交易档案的评估分币
  coinLabel: "商机评估分",
  band: { good: "良好", warn: "关注", bad: "风险" } as Record<string, string>,
  concern: (factor: string, value: number) => `主要失分：${factor}（${value} 分）`,
  noConcern: "各因子均满分",
  howTo: "权重在 管理 · 商机配置",
};

/** 商机评估分权重的写入回执 (incr/0091)。 */
export const DEAL_SCORE_ERROR: Record<string, string> = {
  ...GATE_ERROR,
  weight_out_of_range: "每项权重在 0 到 100 之间",
  weights_not_100: "七个权重合计必须正好是 100",
  watch_out_of_range: "「关注」得分在 1 到 99 之间",
  recent_out_of_range: "新鲜天数在 1 到 365 之间",
  quiet_not_after_recent: "沉寂天数要大于新鲜天数，且不超过 365",
  unknown: "没有保存成功，稍后再试",
};
