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
] as const;

export const DEMO_PROJECTS = [
  "POS 上线 - 一期",
  "智能仓储实施",
  "处方流转交付",
  "运输调度试点",
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
