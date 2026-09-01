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
  segment: "细分市场",
  solution: "解决方案",
  pricebook: "价格本",
  territory: "销售区域",
  namedAccount: "重点客户",
  quote: "报价管理",
  routing: "线索分派",
  renewal: "合同续约",
  forecastRule: "预测口径",
  attainment: "承诺达成",
  winLossReview: "赢丢复盘",
  collection: "回款计划",
  planning: "销售规划",
  campaign: "市场执行",
  account: "客户管理",
  signal: "商机侦探",
  pipeline: "商机管理",
  delivery: "项目落地",
  copilot: "销售助手",
  catalog: "产品目录",
  home: "今日判断",
  queue: "待我裁决",
  admin: "成员与角色",
  adoption: "使用情况",
};

/**
 * The five functional domains - see functional-domains.ts for why these five
 * and why they speak in this register.
 */
export const DOMAIN_GROUP_LABEL: Record<string, string> = {
  armory: "战略武备域",
  deployment: "兵力部署域",
  recon: "火力侦察域",
  position: "阵地经营域",
  settlement: "战果结算域",
};

/**
 * One line under each domain name, phrased as the QUESTION it answers rather
 * than a summary of its contents. The contents are already listed underneath;
 * a second list of them in prose would be the same information twice, and it
 * is not what a reader hovering over a new word needs.
 */
/** 域首页：跨模块事实的名字。每一条都是两个模块页各持一半、谁都说不全的那件事。 */
export const NAMED_ACCOUNT_TEXT = {
  none: "还没有重点客户",
  noneWhy:
    "在客户详情页把一家标为战略或重点，它就会出现在这里。分级要在能看到证据的地方做——健康度、决策链、在办商机都在那一页上。",
} as const;

export const ROUTING_TEXT = {
  title: "线索分派",
  why:
    "先按区域，再按负载（owner 裁定 2026-08-30）。区域决定谁有资格接，负载决定这几个人里该谁接——顺序反过来，闲着的人会拿到他从没打过的地盘。",
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
} as const;

export const RENEWAL_TEXT = {
  title: "合同续约",
  why:
    "订阅制项目到期前 90 天出现在这里（owner 裁定 2026-08-30：从项目派生，且只为订阅类）。一次性交付不在此列——它交付完就结束了，替它造一个续约义务是客户从没承诺过的事。",
  none: "没有临近到期的订阅项目",
  noneWhy: "一次性项目不产生续约；订阅项目要到期限前 90 天才出现在这里。",
  colProject: "项目",
  colEnds: "到期",
  colAmount: "上期金额",
  colVerdict: "结论",
  colOpen: "动作",
  open: "开商机",
  opened: "已创建",
  denied: "你没有创建商机的权限。",
  // 已过期的排在最前，说法也不一样：那不是「还有 -12 天」。
  lapsed: (days: number) => `已过期 ${days} 天`,
  dueIn: (days: number) => `还有 ${days} 天`,
  noEndDate: "未填到期日",
  risk: {
    low: "交付正常",
    // 用的是事实推出来的健康度，不是交付团队自己报的那个。
    watch: "交付有风险，谨慎接触",
  } as Record<string, string>,
  notDue: {
    not_subscription: "一次性项目，交付即结束",
    no_end_date: "订阅项目缺到期日——续约会悄悄漏掉",
    too_far_out: "还没进入 90 天窗口",
    not_delivering: "尚未开始或已终止，没有可续的期限",
    already_renewed: "已有续约商机在跑",
  } as Record<string, string>,
} as const;


export const FORECAST_RULE_TEXT = {
  title: "预测口径",
  why:
    "规则会把每笔生意归到哪一档，摆在人归的那一档旁边（owner 裁定 2026-08-31：只建议，逐单应用）。分歧本身就是预测评审要谈的东西——以前它只能靠一单一单翻看板才看得见。",
  none: "没有开放中的生意",
  noneWhy: "已成交与已判负的生意，档位由阶段定死，不是判断，也就没有第二种意见。",
  colDeal: "生意",
  colFiled: "人归的",
  colSuggested: "规则归的",
  colBasis: "依据",
  colStage: "停留",
  colApply: "应用",
  agrees: "一致",
  apply: "改成这档",
  applied: "已改",
  denied: "你可以看见分歧，但没有调整预测档位的权限——这是产品有意的分工：生意归你，预测承诺不归你。",
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
} as const;


export const ATTAINMENT_TEXT = {
  title: "承诺达成",
  why:
    "本期承诺了多少、已经落了多少、后面还有多少接得住——三件事放在一起才是一句话。它们此前分散在导航板上，各自是一张不属于任何模块的卡。",
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
  why:
    "这个助手在没有问你之前，可以做到哪一步。改的是「哪些决定还要一条条过你的手」，不是「它能不能提议」——它始终只提议，采纳才动数据（ADR-003）。",
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
    ask_always: "每一条都等你裁决。没有设置过的工作区就是这一档——没设置不等于已授权。",
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
  denied: "你没有调整助手授权的权限——裁决一条提案，和决定提案不再需要裁决，是两件事。",
} as const;


export const QUOTE_TEXT = {
  title: "报价",
  why:
    "每笔商机当前报出去的是什么。行项、底价和签字本来就都在，只是从没有一处把它们放在一起——「我们给这家报过什么价」以前只能一单一单翻。",
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
  factsDeniedWhy: "这里的每一项都走各自模块页同一道门；一项也没通过，所以什么都不显示。",
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
 * Labels for modules that have no page yet. Modules that DO have a page take
 * their label from DOMAIN_LABEL via the nav entry, so a built module never
 * appears in both tables.
 */
export const PLANNED_MODULE_LABEL: Record<string, string> = {
  segment: "细分市场",
  catalog: "产品目录",
  solution: "解决方案",
  pricebook: "价目折扣",
  territory: "销售区域",
  namedAccount: "战略客户",
  routing: "线索分配",
  quote: "报价管理",
  winLossReview: "赢丢复盘",
  collection: "回款计划",
};

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
export const TIER_LABEL: Record<string, string> = {
  free: "FREE",
  starter: "STARTER",
  pro: "PRO",
  business: "BUSINESS",
  enterprise: "ENTERPRISE",
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
} as const;

export const CATALOG_TEXT = {
  title: "产品目录",
  description:
    "目录是被所有域引用的维度：商机、合同、交付、信号匹配都读它，而它谁都不写。",
  lead: (n: number) => `${n} 个在售产品`,
  leadWhy: "不知道自己卖什么，就没法卖任何东西——所以目录不按档位售卖，全档可读。",

  products: "产品",
  productsWhy: "单品或服务。单位不是装饰：每条行项都是数量乘单价，没有单位的「10 × 1000」是十个坐席、十天还是十个站点，那是三笔不同的生意。",
  colCode: "编码",
  colName: "名称",
  colCategory: "类别",
  colUnit: "单位",
  colStatus: "状态",
  statusActive: "在售",
  statusRetired: "已下架",
  noCategory: "未分类",
  addProduct: "新增/更新产品",
  saveProduct: "保存产品",
  productSaved: "已保存",
  codeHint: "按编码更新：同一个编码再保存一次是修改，不是新增一条",

  solutions: "解决方案",
  solutionsWhy: "组合模板。行项从不引用它做计算（ADR-014 §4）——模板是起点，不是权威。",
  solutionItems: (n: number) => `${n} 个产品`,
  noSolutions: "还没有解决方案",
  emptyBundle: "一个不装产品的方案只是个名字",

  pricebook: "价目与底价",
  pricebookWhy:
    "底价是这张表存在的理由：低于它的报价需要签字。价格只追加不改写——被取代的那一行解释了今天这个数字是怎么来的。",
  colList: "标价",
  colFloor: "底价",
  colCurrency: "币种",
  colEffective: "生效时间",
  noPrices: "还没有价目",
  setPrice: "记一次价格",
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

export const ACCOUNT_ERROR: Record<string, string> = {
  ...GATE_ERROR,
  plan_required: "战略客户必须配计划——节奏规则读的是它，没有计划这次定级什么都不改变",
  period_required: "计划必须写明周期",
  cadence_positive: "零天的节奏不是节奏",
  unknown_tier: "未知的客户分级",
  not_found: "客户不存在，或不属于当前工作区",
};

/**
 * 信号与线索的行操作。
 *
 * `signal-queue` 与 `lead-list` 此前对失败**毫无反应**——`.then` 只处理成功分支，
 * 用户点了「转商机」失败，界面一动不动。比裸码更糟的一类（TD-010 巡检发现）。
 */
export const RENEWAL_ERROR: Record<string, string> = {
  ...GATE_ERROR,
  renewal_not_due: "这个项目现在不该续约——页面可能已经过时，刷新后再看",
  name_required: "商机需要名称",
  account_required: "商机必须挂在客户下",
  amount_negative: "金额不能为负",
  not_found: "项目不存在，或不属于当前工作区",
};

export const FORECAST_RULE_ERROR: Record<string, string> = {
  ...GATE_ERROR,
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
};

/** 参谋提案的裁决。`proposal-queue` 此前对失败毫无反应。 */
export const PROPOSAL_ERROR: Record<string, string> = {
  ...GATE_ERROR,
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
};

/** 复盘记录。`pending-reviews` 此前把裸 code 当句子显示。 */
export const REVIEW_ERROR: Record<string, string> = {
  ...GATE_ERROR,
  not_found: "商机不存在，或不属于当前工作区",
  not_closed: "只有已关闭的商机才能复盘——过程未定，结论还不存在",
};

export const CATALOG_ERROR: Record<string, string> = {
  ...GATE_ERROR,
  code_required: "需要填写编码",
  name_required: "需要填写名称",
  unit_required: "需要填写单位——没有单位的数量说不出卖的是什么",
  items_required: "一个不装产品的方案只是个名字",
  quantity_positive: "数量必须大于零",
  duplicate_product: "同一个产品出现了两次，请合并成一行",
  product_required: "需要选择产品",
  currency_required: "需要币种",
  amount_negative: "价格不能为负",
  floor_above_list: "底价高于标价会让每一笔都需要签字，等于没有底价",
};

export const ROLE_LABEL: Record<string, string> = {
  sales_leader: "销售负责人",
  marketing_manager: "市场经理",
  sales_rep: "销售代表",
  presales: "售前顾问",
  delivery_manager: "交付经理",
  sales_ops: "销售运营",
  viewer: "只读成员",
  // 0021 的两级（owner 2026-09-01 裁定）。
  //
  // 「总经理」没有单独的角色码——`sales_leader` 已经持有它会持有的一切
  // （admin.manage / copilot.autopilot / strategy.approve）。两个码一套权限，
  // 是一份假装自己做了区分的目录。要org 头衔上屏，那是改这里的标签，不是加角色。
  sales_manager: "销售经理",
  regional_director: "大区总监",
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
  handoverPartial: (skipped: number) => `其中 ${skipped} 条未能转交，规则拒绝了它们。`,
  // 数据范围（incr/0022，owner 2026-09-01 裁定）。决定权在主管理员，不在角色。
  columnScope: "可见范围",
  scopeTerritory: "选择销售区域",
  scopeLabels: {
    workspace: "全工作区",
    territory: "本区域",
    own: "仅本人",
  } as Record<string, string>,
} as const;

export const MEMBER_ERROR: Record<string, string> = {
  ...GATE_ERROR,
  last_admin: "这是工作区最后一位管理员；移除后将无人能再分配角色",
  unknown_role: "角色不在目录中",
  sub_required: "请选择成员",
  not_found: "该成员不属于当前工作区",
  permission_denied: "你没有管理成员角色的权限",
  no_data_access: "当前工作区无权访问",

  // 转交带来的拒绝理由。域规则会逐条拒，这些句子是它们在成员页上的读法——
  // 而不是把裸 code 丢给读的人（TD-010）。
  same_owner: "转出和转入是同一个人",
  owner_required: "转交需要指定一个接收人",
  recipient_not_a_member: "接收人不是这个工作区的成员",
  recipient_inactive: "接收人自己也已停用——转过去只会让这些工作对第二个人也不可见",
  lead_converted: "这条线索已经转成商机，商机上已经有负责人了",
  empty_patch: "没有需要改动的内容",
  amount_negative: "金额不能小于零",
  probability_range: "赢率是 0 到 100 之间的整数",
  terminal_probability_fixed: "已关闭的商机不再调整赢率",
  terminal_requires_closed: "赢单/丢单必须同时落下结案时间",
  closed_requires_terminal_stage: "预测归入「已结案」必须配已关闭的阶段",
  unknown_forecast_category: "这条商机的预测分类不在目录中",
};

// 客户信息补齐（2026-09-01 owner 提出）。分两组，因为它们的代价不同：
// 数据已经知道的（免费、确定、一键），和只有模型能答的（一次 turn，走提案队列）。
export const COMPLETENESS_ERROR: Record<string, string> = {
  ...GATE_ERROR,
  not_found: "这条客户记录不存在，或不属于当前工作区",
  field_not_fillable: "这个字段不在助手可填写的范围内",
  value_required: "填写需要一个值——空白不是填写",
};

export const COMPLETENESS_TEXT = {
  title: "这份客户资料还缺什么",
  description:
    "缺的信息分两种：本工作区的数据已经能推出来的，和需要问助手的。推出来的会写明依据——一次说不出来路的填写，等于机器替你在客户档案上签字。",
  fill: "填入",
  fields: {
    region: "所在区域",
    industry: "行业",
    segmentCode: "细分市场",
    ownerSub: "负责人",
  } as Record<string, string>,
  askable: (fields: string) =>
    `${fields} 数据里推不出来——这类是关于这家公司本身的事实，交给助手去查，它会作为提案进入待裁决队列，采纳后才写入。`,
  /** 字段名的连接符。标点也是文案，中英文不同，所以不留在组件里（TD-002）。 */
  joinFields: (fields: readonly string[]) => fields.join("、"),
  structural: {
    regionUnplaced:
      "这个区域没有被任何销售区域覆盖（未分区）。资料本身是填好的，但因为没人认领这块地，这家客户对所有区域成员都可见——修的是区域划分，不是这条记录。",
  } as Record<string, string>,
} as const;

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
  campaign: "市场执行",
  catalog: "产品目录",
  pipelineArchive: "商机管理",
  deals: "商机",
  catalogProducts: "产品",
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
  // Per-module figures for the navigation cards. Each is the number that gives
  // a reason to open that module, not a row count for its own sake - "3 待分派"
  // is why you click 线索分派; "12 条线索" is trivia.
  segments: "细分",
  solutions: "方案",
  pricedProducts: "已定价",
  namedAccounts: "重点",
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
  // The two flank toggles. Named for what the flank IS, not for the direction it
  // moves: "收起左栏" tells you the geometry, "收起战况板" tells you what you
  // stop being able to see, and only the second is a reason to keep it open.
  boardOpen: "展开战况板",
  boardClose: "收起战况板",
  agentDock: "智能助手",
  agentDockWithCount: (n: number) => `智能助手，${n} 件待你裁决`,
  countOverflow: "99+",

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

  // --- product lines (batch 6b-3, ADR-014 section 2) ------------------------
  linesTitle: "产品行项",
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
} as const;

export const TERRITORY_ERROR: Record<string, string> = {
  ...GATE_ERROR,
  code_required: "区域代码不能为空",
  name_required: "区域名称不能为空",
  unknown_status: "未知的区域状态",
  parent_not_found: "上级区域不存在",
  parent_cycle: "区域不能直接或间接地成为自己的上级",
  // 可达是 2026-08-31 才成立的：校验器一直存在，但写路径从没调用过它。
  region_too_long: "区域名最多 64 个字符——超过这个长度的多半是粘错了列",
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
  ...GATE_ERROR,
  stage_unchanged: "已经在这个阶段了，不会记录空变更",
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
  columnIndustry: "行业",
  columnSegment: "细分市场",
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
  // The way back. A detail page reached from a list owes the reader the list -
  // it is the most common next action, and with the board gone the shell no
  // longer offers it.
  // The theatre command post. This page is not a record card - it is where a
  // multi-year relationship is commanded from, and its two new blocks are the
  // two things it could not previously say: what is being fought here, and
  // what to do next.
  roster: "阵地清单",
  rosterWhy: "这个客户身上正在打的仗。战区不知道自己有几个阵地，是荒谬的。",
  rosterDeals: "在办商机",
  rosterProjects: "交付项目",
  rosterNoDeals: "没有在办商机",
  rosterNoProjects: "没有交付项目",
  rosterOpenDeal: "打开阵地",
  rosterOpenProjects: "去项目落地",
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
  backToList: "客户管理",
  openAccount: "打开客户",
  recompute: "重算健康度",
  recomputeHint: "按当前源数据重新计算，结果立即写回",
  recomputeDenied: "没有重算健康度的权限",
  recomputedTitle: "健康度已重算",
  recomputedOn: (name: string, score: number | null) =>
    score === null ? `${name}:数据不足，仍为未评估` : `${name}:${score} 分`,
  recomputeFailed: "重算失败",

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
  contactStatus: "状态",
  contactStatusLabel: { active: "在职", left: "已离职", invalid: "信息作废" } as Record<string, string>,
  contactEditing: "编辑谁",
  contactNew: "新建联系人",
  contactSave: "保存联系人",
  contactSaved: "已保存",
  contactsDenied: "你没有维护联系人的权限",
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
  collections: "回款计划",
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
  milestoneAffectsHealth:
    "序号在一个项目内唯一且不可改，它就是这个节点的身份——同一序号再存一次是修改那一条。一个「已错过」的里程碑会推翻上面表里项目经理上报的绿色。",
  moveDenied: "你没有修改回款的权限",
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
  territoryTitle: "销售区域",
  territoryWhy:
    "谁扛哪一片市场。区域是目标的作用域之一——没有区域，就设不了区域目标。区域代码是身份：输入已有的代码是编辑那一条，输入新的是新建。",
  territoryNone: "还没有销售区域",
  territoryNoneWhy: "先建一个区域，才能给它设目标、把商机归到它名下。",
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
    no_cost_data: "毛利需要成本，而成本目前还没有进入模型。这不是本期没达成，也不是这个指标算不了——补上成本它就能算",
    not_counted: "这条快照没有新客计数——它早于该字段，或者它的周期标签无法解析成日期",
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
  closeWhy: "关闭后冻结。它记录的是一个已结束周期上承诺过什么，改它等于把没达成的季度改成达成",
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
  segmentsTitle: "细分市场",
  segmentsWhy:
    "把要打的市场切成有名字的块，按优先级排。客户身上的细分代码指向这里，战役也可以瞄准其中一块——在此之前这些指向都是悬空的。",
  segmentsNone: "还没有细分市场",
  segmentsNoneWhy:
    "客户档案里已经在用细分代码了，但它们还没有对应的定义。在下面建一个，代码对上就能连起来。",
  segmentsDenied: "你没有编辑细分市场的权限。",
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

export const CONTACT_ERROR: Record<string, string> = {
  ...GATE_ERROR,
  name_required: "联系人需要一个姓名",
  unknown_decision_role: "未知的决策角色",
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
  not_found: "计划不存在",
};

export const PLAN_ERROR: Record<string, string> = {
  ...GATE_ERROR,
  plan_no_required: "计划需要一个编号",
  name_required: "计划需要一个名称",
  period_required: "计划需要一个周期",
  plan_no_taken: "这个编号已经被占用了",
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
  completion_needs_done: "实际完成时间只属于已完成的里程碑——错过的那个并没有发生",
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

  // --- designating a strategic account (batch 6c) ---------------------------
  designate: "定级",
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
