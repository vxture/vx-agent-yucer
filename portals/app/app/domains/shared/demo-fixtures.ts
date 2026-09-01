/* eslint-disable */
// Display text for the demo workspace.
//
// Kept beside messages.ts as the SECOND file permitted to hold non-ASCII, and
// for the same reason: this is demonstration copy in the product's market
// language, and escaping it would produce something nobody can review. It is
// separated from the seed logic so the logic itself stays ASCII and greppable.
//
// See TD-002. Both files go together when the standard is settled.

export const DEMO_ACCOUNTS = [
  { name: "华东零售集团", industry: "零售", region: "华东" },
  { name: "西南制造股份", industry: "制造", region: "西南" },
  { name: "北方通信", industry: "通信", region: "华北" },
  { name: "长江物流", industry: "物流", region: "华中" },
  { name: "华南连锁药房", industry: "零售", region: "华南" },
  // Added to exercise two rules the first five never reached. Without them the
  // "本周" tier was permanently 0 and two of the four judgement rules had no
  // demo case at all - a screen nobody could review is not a demo.
  { name: "西部能源装备", industry: "能源", region: "西北" },
  { name: "东海精密仪器", industry: "制造", region: "华东" },
] as const;

/** The unmatched lead's company - deliberately not one of DEMO_ACCOUNTS. */
export const DEMO_UNMATCHED_COMPANY = "生鲜连锁";

export const DEMO_CONTACTS = [
  { name: "王磊", title: "首席财务官", department: "财务" },
  { name: "陈昊", title: "信息技术总监", department: "信息技术" },
  { name: "刘敏", title: "运营经理", department: "运营" },
  { name: "赵强", title: "采购负责人", department: "采购" },
  { name: "孙悦", title: "供应链总监", department: "供应链" },
  { name: "周涛", title: "首席运营官", department: "管理层" },
] as const;

/** Which regions each demo territory covers - the join lead routing needs. */
export const DEMO_TERRITORY_REGIONS: Record<string, readonly string[]> = {
  EAST: ["华东", "华中"],
  NORTH: ["华北", "西北"],
  SOUTH: ["华南", "西南"],
};

export const DEMO_SEGMENTS = [
  {
    code: "ENTERPRISE",
    name: "大型企业",
    // Matches its members (西南制造/北方通信/东海精密) exactly.
    criteria: { industries: ["制造", "通信"], regions: [] },
  },
  {
    code: "MIDMARKET",
    name: "中型市场",
    // 零售 and 物流 cover three of its four members. 西部能源装备 carries the
    // code but matches no criterion - a deliberate seam: "assigned but not
    // matching" is a finding the surface should make visible, not a tidy row.
    criteria: { industries: ["零售", "物流"], regions: [] },
  },
] as const;

export const DEMO_PLANS = [
  { name: "2026 下半年 - 主攻中型零售", objective: "以门店 POS 替换方案拿下 12 家中型零售客户。" },
  { name: "2026 上半年 - 制造业滩头阵地", objective: null },
] as const;

export const DEMO_CAMPAIGNS = [
  "零售 POS 替换 - 外呼战役",
  "制造业线上研讨会系列",
  "华南区域巡展",
] as const;

export const DEMO_EXECUTIONS = [
  "一线城市外呼序列",
  "POS 迁移白皮书",
  "区域巡展",
  "研讨会第一期",
  "会后培育触达",
  "药房连锁定向邀约",
] as const;

export const DEMO_OPPORTUNITIES = [
  "全国门店数字化",
  "供应链协同平台一期",
  "客服智能化改造",
  "门店 POS 替换",
  "生产排程系统选型",
  "干线运输调度平台",
  "连锁药房库存中台",
  "智能仓储升级",
  "网点运营分析平台",
  "处方流转系统",
  "技改能效监测",
  "实验室数据对接",
  // Opened off prj_demo_6, so the renewal page has a project it must NOT
  // propose again.
  "调度平台续约",
  // Two deals that exist for the forecast rule's DOWNGRADES. Without them the
  // demo exercises the probability band and nothing else - the three caps are
  // unit-tested but the basis column that renders their reasons never runs
  // against real rows. Same gap `already_renewed` had before 0019.
  "冷链仓配平台",
  "会员中台改造",
  // Three deals WON INSIDE 2026Q2, so the demo has a settled quarter. Without
  // them the product's flagship number - forecast accuracy - had no surface it
  // could ever appear on: accuracy needs a period that is OVER, and every
  // closed deal in this fixture lands in the current one. See the Q2 block in
  // demo-seed.ts.
  "区域仓配一体化",
  "门店能耗管理",
  "客户服务中台",
] as const;

export const DEMO_PROJECTS = [
  "POS 上线 - 一期",
  "智能仓储实施",
  "处方流转交付",
  "运输调度试点",
  // Two subscriptions added for the renewal derivation. Five verdicts exist
  // and a demo that shows only "due" would let the other four ship untested
  // against real rows - `already_renewed` in particular, which is the one that
  // stops the product proposing the same approach to a customer twice.
  "门店运营订阅服务",
  "调度平台年度订阅",
] as const;

export const DEMO_MILESTONES = ["启动与调研", "试点门店上线", "全面推广", "验收"] as const;

export const DEMO_SIGNALS = [
  "华东零售集团正在评估 POS 替换方案",
  "生鲜连锁完成 C 轮融资",
  "北方通信招聘 20 名零售运营工程师",
  "合作伙伴推荐：长江物流",
  "华南连锁药房启动数字化招标",
  "西南制造股份更换 ERP 供应商",
  "长江物流公开招标运输调度系统",
  "某零售集团高管在行业会议提及库存痛点",
] as const;

export const DEMO_RATIONALES = [
  "验收报告已由技术决策人签字，且商务已索要正式报价单。",
  "该客户 48 天无互动，且有一笔逾期回款，健康度已降至 34。",
  "C 轮融资通常领先平台选型决策一到两个季度。",
  "本周同一客户有两次入站咨询。",
  "招标文件已发布，交付周期与我们的实施能力匹配。",
] as const;

export const DEMO_LESSONS = [
  "客户内部换了决策人，早期建立的共识没有传递下去。",
  "方案匹配度是主因，价格不是。",
] as const;

export const DEMO_PLAYBOOKS = [
  {
    code: "PB-QUALIFY",
    name: "商机合格判定",
    scope: "pipeline",
    content:
      "离开合格判定阶段之前，确认四件事：预算是否落实、决策权在谁手上、需求是否已被客户自己承认、时间窗口是否明确。四者缺一，阶段不要前进——把缺的那一项写进阶段事件的理由里。",
  },
  {
    code: "PB-CHAIN",
    name: "决策链推进",
    scope: "account",
    content:
      "先确认经济决策人是否可达，而不是是否存在。若只有内线而无路径，下一步是请内线引荐，不是继续发资料。遇到明确的阻碍者，绕行不如正面处理其顾虑。",
  },
  {
    code: "PB-SIGNAL",
    name: "信号处置",
    scope: "signal",
    content:
      "未匹配到已有客户的高分信号优先看——那是新客户机会。判重之前先确认来源引用是否真的相同，来源不同的同一事件不是重复。",
  },
  {
    code: "PB-GENERAL",
    name: "助手工作方式",
    scope: "copilot",
    content:
      "回答要落在数据上：引用具体的商机编号、金额、阶段和时间。数据不足时说明缺什么，不要估算。需要改动时提出建议动作，由人裁决。",
  },
] as const;

// --- The evidence plane (ADR-006) -------------------------------------------
//
// These notes are written the way a rep actually writes them: unpunctuated,
// mid-thought, sometimes contradicting an earlier one. That is the point. The
// capture form asks for a dump, so a demo full of tidy minutes would be selling
// a discipline the product deliberately does not require.
//
// Each note carries a fact a later stage will need to cite - a name, a date, an
// objection - so the timeline is a source rather than decoration.

export const DEMO_NOTES = {
  a1_kickoff:
    "见了王总和陈总监。预算这条线还是要 CFO 点头,王总说下周三之前给答复。陈总监对接口这块有顾虑,说去年上过一个系统,数据对不上,他被追责过。",
  a1_followup:
    "微信问了王总进展,回复说 CFO 出差,要往后拖。没给新日期。",
  a1_blocked:
    "刘敏私下说采购赵强倾向另一家,理由是价格。她建议我们别硬碰,先把陈总监的接口顾虑解决掉,他说话 CFO 会听。",
  a2_renewal:
    "季度复盘会,孙悦带了三个业务口的人。整体满意,提到仓储模块的报表跑得慢。答应我们两周内出优化方案。",
  a2_evidence:
    "按承诺把优化方案发过去了,孙悦确认收到,说下周内部过一轮。",
  a4_slip:
    "周总电话,语气不太好。上次答应给他的试点数据一直没给,他说再拖就先不谈了。",
  a5_intro:
    "行业会上碰到王磊,聊了二十分钟。他们今年重点是门店数字化,预算在总部。留了微信,说节后可以正式聊。",
} as const;

/** Notes for the two rule-coverage accounts. */
export const DEMO_QUIET_NOTES = {
  a6_demo:
    "给设备部做了一轮演示，现场反馈还行。他们说要等集团那边的技改预算批下来，没给具体时间。",
  a6_intro: "行业会上加的联系人，回来后通了一次电话，介绍了大致情况。",
  a7_kickoff:
    "见了采购和质量两条线。质量那边最关心的是校准数据能不能对接他们的 LIMS，让我们出个方案。",
  a7_followup: "电话确认了方案范围，他们说下周内部评审。",
} as const;

export const DEMO_COMMITMENT_TEXT = {
  a1_cfo: "CFO 给出预算是否批复的答复",
  a1_interface: "我方提供与既有系统的接口方案说明",
  a2_report: "我方两周内提交仓储报表优化方案",
  a4_pilot: "我方提供试点门店的运行数据",
  a5_meeting: "对方安排节后与总部信息化负责人正式会面",
  a1_procurement: "对方安排与采购负责人赵强的当面沟通",
  /** Ours, and only a few days late - the "本周" case for the we-owe rule. */
  a7_lims: "把 LIMS 对接方案发给质量部张工",
} as const;

export const DEMO_WAIVE_REASON = "对方组织调整,原对接人离任,该承诺不再适用";

/**
 * Recent deal-level follow-ups.
 *
 * These exist so the adoption instrument has something to measure. They are
 * spread across four open deals and six weeks, and one deal (acc_demo_1's)
 * stays dark the whole time while sitting in negotiate. That dark deal is the
 * point of the whole panel.
 *
 * The curve is NOT monotonically rising - an earlier version of this comment
 * said it was, and the seeded dates do not produce that. It rises overall and
 * dips, which is what partial adoption actually looks like. Do not "fix" the
 * data to match a tidier sentence; the sentence was the thing that was wrong.
 */
export const DEMO_DEAL_NOTES = {
  d2_a: "孙悦那边把报表优化排进了他们的迭代,让我们下周同步一次进度。",
  d2_b: "过了一轮技术方案,IT 提了两个集成上的问题,已经记下来带回去。",
  d2_c: "电话对了一下商务条款,分期方式他们内部还要走一轮。",
  d6_a: "周总带我们看了两家门店的实际流程,和方案里的假设有出入,要改。",
  d6_b: "把修改后的方案发过去了,周总说本周内给反馈。",
  d6_c: "微信催了一次方案反馈,说还在走内部会签。",
  d9_a: "价格谈到第三轮,对方采购坚持要再降,我们守住了服务范围。",
  d9_b: "对方法务开始看合同了,这是个好信号。",
  d9_c: "合同条款回来两条修改意见,都不涉及价格。",
  d7_a: "第一次正式拜访,主要是摸情况。对方今年确实有预算。",
  d7_b: "把行业案例发过去了,对方问了两个很具体的问题。",
} as const;

/**
 * The catalogue this demo company sells - see ADR-014.
 *
 * Five products across three lines, so whitespace analysis has something to be
 * about: an account that bought the platform but not the analytics module is a
 * different sales conversation from one that bought neither.
 */
export const DEMO_PRODUCTS = [
  { code: "PRD-CORE", name: "零售中台基础平台", category: "平台", unit: "套", list: 800_000, floor: 600_000 },
  { code: "PRD-ANALYTICS", name: "经营分析模块", category: "平台", unit: "套", list: 400_000, floor: 300_000 },
  { code: "PRD-WMS", name: "智能仓储调度", category: "供应链", unit: "套", list: 600_000, floor: 450_000 },
  { code: "PRD-INTEGRATION", name: "系统对接实施", category: "服务", unit: "人月", list: 60_000, floor: 45_000 },
  { code: "PRD-SUPPORT", name: "年度技术支持", category: "服务", unit: "年", list: 200_000, floor: 160_000 },
] as const;

export const DEMO_SOLUTIONS = [
  {
    code: "SOL-RETAIL",
    name: "零售数字化整体方案",
    summary: "基础平台 + 经营分析 + 实施与首年支持，面向连锁零售。",
    items: [
      { code: "PRD-CORE", qty: 1 },
      { code: "PRD-ANALYTICS", qty: 1 },
      { code: "PRD-INTEGRATION", qty: 6 },
      { code: "PRD-SUPPORT", qty: 1 },
    ],
  },
  {
    code: "SOL-SUPPLY",
    name: "供应链协同方案",
    summary: "仓储调度 + 对接实施，面向物流与制造。",
    items: [
      { code: "PRD-WMS", qty: 1 },
      { code: "PRD-INTEGRATION", qty: 4 },
    ],
  },
] as const;

/**
 * Tender and policy signals - see ADR-016.
 *
 * The third one is deliberately from a company NOT on the named list: a system
 * that only mined its own account list would systematically miss every new
 * logo, and new-logo signals are the reason the detective domain exists.
 */
export const DEMO_TENDER_SIGNALS = {
  strategic: "北方通信发布省级政企客户管理平台公开招标，预算 1200 万，投标截止 9 月 26 日",
  known: "华东零售集团门店数字化二期招标公示，含经营分析模块",
  newLogo: "西城市政数据集团发布数据中台采购公告，采购人此前无往来记录",
  policy: "省工信厅发文要求二级以上物流企业 2027 年前完成运输数据联网",
} as const;

/**
 * A longer follow-up history on the flagship account.
 *
 * The demo had three notes per account, which is enough to prove the timeline
 * renders and not enough to show what a real pursuit looks like: the swings,
 * the people who change their minds, the months where nothing happens. These
 * span five months on 华东零售集团 so the account page has a story rather than
 * a sample.
 */
export const DEMO_LONG_HISTORY = {
  d1: "第一次拜访。王总说集团今年要统一门店系统，但预算还没批，让我们先出个初步方案。",
  d2: "把初步方案发过去了。陈总监回了很细的问题，主要在数据迁移和历史订单的对账口径。",
  d3: "现场做了一轮演示。运营的人反馈不错，说比现在的系统快很多。陈总监全程没怎么说话。",
  d4: "陈总监私下讲了顾虑：去年上过一个系统，数据对不上，他被追责过。这次他要看到迁移的验证方案。",
  d5: "按他说的补了数据迁移验证方案，附了两个同行业案例。他说要拿去内部过一轮。",
  d6: "王总说预算批下来了，但要走集团采购流程，让我们准备正式报价。",
  d7: "报价发出。采购赵强要求再降 15%，理由是有其他家报得更低。",
  d8: "刘敏私下说赵强倾向另一家，理由是价格。她建议别硬碰，先把陈总监的接口顾虑解决掉，他说话 CFO 会听。",
  d9: "微信问王总进展，回复说 CFO 出差，要往后拖。没给新日期。",
} as const;
