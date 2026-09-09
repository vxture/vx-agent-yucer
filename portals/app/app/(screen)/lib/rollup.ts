import type { AccountRecord } from "../../domains/account/store";
import { ALL_PROVINCES } from "../../domains/shared/provinces";
import { within, type Period } from "./period";

// 全国态势的口径 - the screen's roll-up, as a pure function.
//
// SEPARATED FROM THE PAGE ON PURPOSE. Everything the screen claims is arithmetic
// over three lists, and arithmetic is the half worth testing: a page component
// can only be checked by rendering it, and rendering says nothing about whether
// 合同额 equals the sum of the won deals under it. The page fetches; this file
// decides what the numbers mean.
//
// THE STAGES MUST ADD UP. Every figure below is derived from the SAME rows one
// stage earlier, never computed independently - 合同额 is the won subset of the
// deals counted in 商机数, 在交付 is the subset of those contracts with a live
// project, 回款 is a share of contract value. A screen whose stages are each
// plausible but do not reconcile teaches people to distrust all of it, which is
// worse than showing nothing.
//
// AN ACCOUNT WITH NO PROVINCE IS COUNTED NATIONALLY AND MAPPED NOWHERE. It is a
// real state - most prospects are a name somebody typed - and dropping those
// rows would make the national total disagree with the sum of the provinces
// without saying why. `unplaced` carries the count so the screen can say it.

export interface DealLike {
  readonly id: string;
  readonly accountId: string;
  readonly status: string;
  readonly amount: { readonly amount: number } | null;
  /** 加权预测 is the sum of amount x probability - a real column, not a guess. */
  readonly probability: number | null;
  /** Which of the four stages 商机储备 charts. */
  readonly stage: string;
  readonly closedAt: Date | null;
  /** Where an open deal sits in time, since it has not closed. */
  readonly expectedCloseAt: Date | null;
}

export interface ProjectLike {
  readonly id: string;
  readonly accountId: string;
  /** The deal that created it - a project's only commercial date. */
  readonly opportunityId: string | null;
  readonly status: string;
  readonly health: string;
  readonly contractAmount: { readonly amount: number } | null;
}

export interface LeadLike {
  readonly id: string;
  readonly accountId: string | null;
  readonly status: string;
  readonly ownerSub: string | null;
  readonly createdAt: Date;
}

export interface ProposalLike {
  readonly id: string;
  readonly status: string;
  readonly subjectType: string;
  readonly subjectId: string;
  readonly createdAt: Date;
}

export interface InstalmentLike {
  readonly id: string;
  readonly projectId: string;
  readonly status: string;
  readonly plannedAmount: number;
  readonly actualAmount: number | null;
  readonly dueAt: Date | null;
  readonly settledAt: Date | null;
}

export interface MilestoneLike {
  readonly id: string;
  readonly projectId: string;
  readonly status: string;
  readonly dueAt: Date | null;
  readonly completedAt: Date | null;
}

/** The lists the six panels are folded from. */
export interface RollupExtra {
  readonly leads?: readonly LeadLike[];
  readonly proposals?: readonly ProposalLike[];
  readonly instalments?: readonly InstalmentLike[];
  readonly milestones?: readonly MilestoneLike[];
  /** 统计周期. Every dated row outside it is dropped before anything is summed. */
  readonly period?: Period;
  /** province -> 大区 code, as this workspace divides its market (incr/0036). */
  readonly provinceDivision?: Readonly<Record<string, string>>;
  /** The clock, injected so the 30-day window is testable. */
  readonly now?: Date;
}

/** One province's figures. Money is in the store's own minor unit (CNY yuan). */
export interface ProvinceRollup {
  readonly province: string;
  /**
   * The 大区 this province is in, by code.
   *
   * COMES FROM THE WORKSPACE, not from a constant: the division is a sales
   * structure the tenant owns (incr/0036), so a province's 大区 is whatever
   * that workspace says it is. Empty string when the workspace has not placed
   * it - which is a real state on a tenant that has edited its own divisions.
   */
  readonly division: string;
  readonly accounts: number;
  /** Open deals - the pipeline still being worked. */
  readonly openDeals: number;
  readonly pipelineValue: number;
  /** Won deals and their value: 签约合同. */
  readonly wonDeals: number;
  readonly contractValue: number;
  /** Contract value carried by projects that have not finished: 在交付. */
  readonly inDelivery: number;
  /** Projects here, and the subset still being worked: 在建项目. */
  readonly projects: number;
  readonly projectsLive: number;
  /** Share of delivery projects reported healthy, 0-1, or null when there are none. */
  readonly healthRate: number | null;
  /** Value of the deals lost here - the other half of the win rate's denominator. */
  readonly lostValue: number;
  /** Won value over decided value - null when nothing has been decided here. */
  readonly winRate: number | null;

  /* 01 线索供给. A lead with no account is attributed nowhere - the same rule
     the accounts follow, and the common case, since a lead becomes an account
     by being converted. */
  readonly leads: number;
  /** 本期新增 - arrived in the current 期, which is a week. */
  readonly leadsNew: number;
  readonly leadsUnclaimed: number;
  readonly leadsConverted: number;
  /** 转商机率: converted over all leads here - null when there are none. */
  readonly leadConversion: number | null;
  /** 近 12 期新增线索, oldest first. Element-wise summable across a scope. */
  readonly leadSeries: readonly number[];

  /* 02 商机储备 */
  /** 加权预测: sum of open amount x probability. */
  readonly weighted: number;
  /** Open pipeline value by stage, in the design's four-stage order. */
  readonly stageMix: readonly number[];

  /* 03 签约合同 - 近 12 期签约额, oldest first. */
  readonly signSeries: readonly number[];

  /* AI 智能副驾, attributed through the proposal's subject to an account. */
  readonly proposals30: number;
  readonly accepted30: number;
  /** 提案采纳率: accepted over PROPOSED in the window, per the design. */
  readonly adoption: number | null;
  /** Still awaiting a human: a stock, not a flow. */
  readonly pending: number;
  /** 延期 - pending past the decision TTL, the queue's late half. */
  readonly pendingLate: number;
  /** 影响金额: value of the deals an accepted proposal touched. */
  readonly influenced: number;
  /** 采纳率 · 近 30 天, oldest first: accepted and proposed per day. */
  readonly adoptionSeries: readonly { readonly acc: number; readonly prop: number }[];

  /* 04 交付履约 */
  /** 里程碑准点: gates completed on or before their date, over those completed. */
  readonly onTime: number | null;
  readonly milestonesDone: number;
  readonly milestonesOnTime: number;
  /** The donut: projects reported 健康 / 有隐忧 / 高风险. */
  readonly healthMix: readonly number[];

  /* 回款兑现. Settled counts what ARRIVED; everything live counts what was
     promised. A written-off instalment is in neither - the decision is taken. */
  readonly collected: number;
  readonly receivable: number;
  readonly overdue: number;
  /** 近 7 期回款率, oldest first: what arrived and what fell due. */
  readonly cashSeries: readonly { readonly got: number; readonly due: number }[];
}

export interface NationalRollup {
  readonly provinces: readonly ProvinceRollup[];
  /** Provinces grouped by 大区 code, in the workspace's own division order. */
  readonly byDivision: ReadonlyMap<string, readonly ProvinceRollup[]>;
  /** Accounts with no province on file: counted nationally, drawn nowhere. */
  readonly unplacedAccounts: number;
}

const money = (m: { amount: number } | null | undefined) => m?.amount ?? 0;

/** One province's running totals while the three lists are folded in. */
/** The design's four stages, and the deal stages that fall in each. */
export const STAGE_KEYS = ["discover", "qualify", "validate", "negotiate"] as const;
/** The design's three health bands, in donut order. */
export const HEALTH_KEYS = ["green", "amber", "red"] as const;
/** 期 is a WEEK: 12 of them is a quarter, which is the intake the panel charts. */
export const PERIOD_MS = 7 * 24 * 60 * 60 * 1000;
export const PERIODS = 12;
/** 采纳率 is charted daily over the same 30 days the cells count. */
export const TREND_DAYS = 30;
export const CASH_PERIODS = 7;
/** Past this a pending proposal is 延期 - the same TTL the sweep uses. */
const PROPOSAL_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface Cell {
  accounts: number; openDeals: number; pipelineValue: number;
  wonDeals: number; contractValue: number; lostValue: number;
  inDelivery: number; healthy: number; delivered: number; live: number;
  leads: number; leadsNew: number; leadsUnclaimed: number; leadsConverted: number;
  proposals30: number; accepted30: number; pending: number; pendingLate: number;
  influenced: number;
  collected: number; receivable: number; overdue: number;
  weighted: number;
  milestonesDone: number; milestonesOnTime: number;
  leadSeries: number[]; signSeries: number[];
  stageMix: number[]; healthMix: number[];
  adoptionSeries: { acc: number; prop: number }[];
  cashSeries: { got: number; due: number }[];
}

const zeros = (n: number) => Array.from({ length: n }, () => 0);

const blank = (): Cell => ({
  accounts: 0, openDeals: 0, pipelineValue: 0,
  wonDeals: 0, contractValue: 0, lostValue: 0,
  inDelivery: 0, healthy: 0, delivered: 0, live: 0,
  leads: 0, leadsNew: 0, leadsUnclaimed: 0, leadsConverted: 0,
  proposals30: 0, accepted30: 0, pending: 0, pendingLate: 0, influenced: 0,
  collected: 0, receivable: 0, overdue: 0,
  weighted: 0, milestonesDone: 0, milestonesOnTime: 0,
  leadSeries: zeros(PERIODS), signSeries: zeros(PERIODS),
  stageMix: zeros(STAGE_KEYS.length), healthMix: zeros(HEALTH_KEYS.length),
  adoptionSeries: Array.from({ length: TREND_DAYS }, () => ({ acc: 0, prop: 0 })),
  cashSeries: Array.from({ length: CASH_PERIODS }, () => ({ got: 0, due: 0 })),
});

/**
 * Which bucket a date falls in, counting back from `now`.
 *
 * Returns -1 for anything outside the window, and the caller drops it. Bucket
 * `n-1` is the CURRENT period, so every series reads oldest-first left to
 * right, which is the direction the charts are drawn.
 */
function bucketOf(at: Date | null, now: Date, span: number, count: number): number {
  if (!at) return -1;
  const back = Math.floor((now.getTime() - at.getTime()) / span);
  if (back < 0 || back >= count) return -1;
  return count - 1 - back;
}

/**
 * Fold the accounts in, and report how many landed nowhere.
 *
 * Two different things count as unplaced and both are honest: an account with
 * no province on file, and an account carrying a province the vocabulary does
 * not know. The second is a data fault - the database's CHECK should have
 * refused it - and the rule is that a fault is neither silently dropped nor
 * silently turned into a 35th province.
 */
function foldAccounts(accounts: readonly AccountRecord[], acc: Map<string, Cell>): number {
  let unplaced = 0;
  for (const a of accounts) {
    const cell = a.province ? acc.get(a.province) : undefined;
    if (!cell) { unplaced += 1; continue; }
    cell.accounts += 1;
  }
  return unplaced;
}

/** Fold the deals in: won is the contract, lost is only a denominator. */
function foldDeals(
  deals: readonly DealLike[],
  provinceOf: ReadonlyMap<string, string | null>,
  acc: Map<string, Cell>,
  now: Date,
): void {
  for (const d of deals) {
    const province = provinceOf.get(d.accountId);
    const cell = province ? acc.get(province) : undefined;
    if (!cell) continue;
    const value = money(d.amount);
    if (d.status === "won") {
      cell.wonDeals += 1;
      cell.contractValue += value;
      // 近 12 期签约额 - charted from when the deal actually closed.
      const b = bucketOf(d.closedAt, now, PERIOD_MS, PERIODS);
      if (b >= 0) cell.signSeries[b]! += value;
    } else if (d.status === "lost") {
      cell.lostValue += value;
    } else {
      cell.openDeals += 1;
      cell.pipelineValue += value;
      // 加权预测 - the column exists; no deal here is assigned a probability
      // it was not given.
      cell.weighted += value * ((d.probability ?? 0) / 100);
      const si = STAGE_KEYS.indexOf(d.stage as (typeof STAGE_KEYS)[number]);
      if (si >= 0) cell.stageMix[si]! += value;
    }
  }
}

/** Fold the projects in. 在交付 is the contract value still being worked. */
function foldProjects(
  projects: readonly ProjectLike[],
  provinceOf: ReadonlyMap<string, string | null>,
  acc: Map<string, Cell>,
): void {
  const settled = new Set(["delivered", "closed", "cancelled"]);
  for (const p of projects) {
    const province = provinceOf.get(p.accountId);
    const cell = province ? acc.get(province) : undefined;
    if (!cell) continue;
    cell.delivered += 1;
    if (p.health === "green") cell.healthy += 1;
    const hi = HEALTH_KEYS.indexOf(p.health as (typeof HEALTH_KEYS)[number]);
    if (hi >= 0) cell.healthMix[hi]! += 1;
    // A finished or cancelled project does not count: that money has been
    // delivered, it is not in flight.
    if (!settled.has(p.status)) {
      cell.live += 1;
      cell.inDelivery += money(p.contractAmount);
    }
  }
}

/** Fold the leads in: 线索供给. */
function foldLeads(
  leads: readonly LeadLike[],
  provinceOf: ReadonlyMap<string, string | null>,
  acc: Map<string, Cell>,
  now: Date,
): void {
  for (const l of leads) {
    const province = l.accountId ? provinceOf.get(l.accountId) : null;
    const cell = province ? acc.get(province) : undefined;
    if (!cell) continue;
    cell.leads += 1;
    // 本期新增 is WHEN IT ARRIVED, not what state it is in. Reading it off
    // status === "new" counted a lead that has sat untouched for a year as
    // this period's intake, which is the opposite of what the cell asks.
    if (now.getTime() - l.createdAt.getTime() < PERIOD_MS) cell.leadsNew += 1;
    if (!l.ownerSub) cell.leadsUnclaimed += 1;
    if (l.status === "converted") cell.leadsConverted += 1;
    const b = bucketOf(l.createdAt, now, PERIOD_MS, PERIODS);
    if (b >= 0) cell.leadSeries[b]! += 1;
  }
}

/**
 * Fold the copilot's proposals in: 智能副驾.
 *
 * THE WINDOW APPLIES TO THE FLOW AND NOT TO THE QUEUE. 提案 and 采纳 are things
 * that HAPPENED, so they are counted over 30 days; 待裁决 is what is sitting
 * there NOW, so it is counted over everything. Deriving the queue from the
 * window is the defect that made the backlog grow when the window widened.
 */
function foldProposals(
  proposals: readonly ProposalLike[],
  accountOfSubject: ReadonlyMap<string, string>,
  valueOfSubject: ReadonlyMap<string, number>,
  provinceOf: ReadonlyMap<string, string | null>,
  acc: Map<string, Cell>,
  now: Date,
): void {
  const since = now.getTime() - TREND_DAYS * 24 * 60 * 60 * 1000;
  for (const a of proposals) {
    const key = `${a.subjectType}:${a.subjectId}`;
    const accountId = accountOfSubject.get(key);
    const province = accountId ? provinceOf.get(accountId) : null;
    const cell = province ? acc.get(province) : undefined;
    if (!cell) continue;

    if (a.status === "proposed") {
      cell.pending += 1;
      // 延期: past the same TTL the expiry sweep uses. The two halves add up
      // to the queue, which is what makes the "+n" on screen honest.
      if (now.getTime() - a.createdAt.getTime() >= PROPOSAL_TTL_MS) cell.pendingLate += 1;
    }
    const accepted = a.status === "accepted" || a.status === "executed";
    // 影响金额 is the value of what an accepted proposal TOUCHED, counted
    // whenever it was accepted - a deal the copilot moved last month is still
    // a deal it moved.
    if (accepted) cell.influenced += valueOfSubject.get(key) ?? 0;

    if (a.createdAt.getTime() < since) continue;
    cell.proposals30 += 1;
    if (accepted) cell.accepted30 += 1;
    const d = bucketOf(a.createdAt, now, 24 * 60 * 60 * 1000, TREND_DAYS);
    if (d >= 0) {
      cell.adoptionSeries[d]!.prop += 1;
      if (accepted) cell.adoptionSeries[d]!.acc += 1;
    }
  }
}

/** Fold the instalments in: 回款兑现. */
function foldInstalments(
  instalments: readonly InstalmentLike[],
  provinceOfProject: ReadonlyMap<string, string | null>,
  acc: Map<string, Cell>,
  now: Date,
): void {
  for (const i of instalments) {
    const province = provinceOfProject.get(i.projectId);
    const cell = province ? acc.get(province) : undefined;
    if (!cell) continue;
    if (i.status === "written_off") continue;

    /* 近 7 期回款率 is what ARRIVED over what FELL DUE in the same period, so
       both halves are bucketed by their own date: money is credited to the
       period it landed in, and demanded of the period it was owed in. */
    const dueB = bucketOf(i.dueAt, now, PERIOD_MS, CASH_PERIODS);
    if (dueB >= 0) cell.cashSeries[dueB]!.due += i.plannedAmount;
    if (i.status === "settled") {
      const gotB = bucketOf(i.settledAt, now, PERIOD_MS, CASH_PERIODS);
      if (gotB >= 0) cell.cashSeries[gotB]!.got += i.actualAmount ?? i.plannedAmount;
    }
    if (i.status === "settled") {
      // What ARRIVED, not what was promised: short payment is normal here and
      // summing the plan would report money nobody received.
      cell.collected += i.actualAmount ?? i.plannedAmount;
      continue;
    }
    cell.receivable += i.plannedAmount;
    if (i.status === "overdue") cell.overdue += i.plannedAmount;
  }
}

/** Fold the gates in: 里程碑准点. */
function foldMilestones(
  milestones: readonly MilestoneLike[],
  provinceOfProject: ReadonlyMap<string, string | null>,
  acc: Map<string, Cell>,
): void {
  for (const m of milestones) {
    const province = provinceOfProject.get(m.projectId);
    const cell = province ? acc.get(province) : undefined;
    if (!cell) continue;
    // MEASURED OVER WHAT HAS FINISHED. A gate still open is not late yet, and
    // counting it as a miss would report a slipping project the day it starts.
    if (!m.completedAt || !m.dueAt) continue;
    cell.milestonesDone += 1;
    if (m.completedAt.getTime() <= m.dueAt.getTime()) cell.milestonesOnTime += 1;
  }
}

/** Close one province's cell into the reading the screen renders. */
function readingOf(
  province: string,
  c: Cell,
  divisionOf: Readonly<Record<string, string>>,
): ProvinceRollup {
  const decided = c.contractValue + c.lostValue;
  return {
    province,
    division: divisionOf[province] ?? "",
    accounts: c.accounts,
    openDeals: c.openDeals,
    pipelineValue: c.pipelineValue,
    wonDeals: c.wonDeals,
    contractValue: c.contractValue,
    inDelivery: c.inDelivery,
    projects: c.delivered,
    projectsLive: c.live,
    // NULL, NOT ZERO, when nothing has been delivered here. Zero would read
    // as "everything is unhealthy" on a province where nothing is running -
    // the same distinction the delivery page keeps between an unforecast
    // quarter and a failed one.
    healthRate: c.delivered === 0 ? null : c.healthy / c.delivered,
    // Likewise: a province where nothing has closed has no win rate, and
    // printing 0% would rank it below a province that genuinely loses.
    lostValue: c.lostValue,
    winRate: decided === 0 ? null : c.contractValue / decided,

    leads: c.leads,
    leadsNew: c.leadsNew,
    leadsUnclaimed: c.leadsUnclaimed,
    leadsConverted: c.leadsConverted,
    leadConversion: c.leads === 0 ? null : c.leadsConverted / c.leads,
    leadSeries: c.leadSeries,

    weighted: c.weighted,
    stageMix: c.stageMix,
    signSeries: c.signSeries,

    proposals30: c.proposals30,
    accepted30: c.accepted30,
    // Per the design, 采纳率 is accepted over PROPOSED - the figure the
    // sub-line spells out as "n / m 已采纳". Null, not zero, when nothing was
    // proposed: a scope the copilot never spoke about has no verdict on it.
    adoption: c.proposals30 === 0 ? null : c.accepted30 / c.proposals30,
    pending: c.pending,
    pendingLate: c.pendingLate,
    influenced: c.influenced,
    adoptionSeries: c.adoptionSeries,

    onTime: c.milestonesDone === 0 ? null : c.milestonesOnTime / c.milestonesDone,
    milestonesDone: c.milestonesDone,
    milestonesOnTime: c.milestonesOnTime,
    healthMix: c.healthMix,

    collected: c.collected,
    receivable: c.receivable,
    overdue: c.overdue,
    cashSeries: c.cashSeries,
  };
}

export function rollUpByProvince(
  accounts: readonly AccountRecord[],
  deals: readonly DealLike[],
  projects: readonly ProjectLike[],
  extra: RollupExtra = {},
): NationalRollup {
  const provinceOf = new Map<string, string | null>();
  for (const a of accounts) provinceOf.set(a.id, a.province);

  /* A proposal names its SUBJECT, not an account, so reaching a province means
     walking one hop: an opportunity or a project to the account behind it, a
     lead to the account it was matched to, an account to itself. A subject the
     screen cannot resolve is left off the map rather than guessed onto it. */
  const accountOfSubject = new Map<string, string>();
  for (const a of accounts) accountOfSubject.set(`account:${a.id}`, a.id);
  for (const d of deals) accountOfSubject.set(`opportunity:${d.id}`, d.accountId);
  for (const p of projects) accountOfSubject.set(`project:${p.id}`, p.accountId);
  for (const l of extra.leads ?? []) {
    if (l.accountId) accountOfSubject.set(`lead:${l.id}`, l.accountId);
  }

  /* What a proposal's subject is WORTH, for 影响金额. Only an opportunity and
     the project behind one carry money; an account or a lead is a subject the
     copilot can act on without any amount being on the table, and counting
     zero for those is the honest reading rather than an omission. */
  const valueOfSubject = new Map<string, number>();
  for (const d of deals) valueOfSubject.set(`opportunity:${d.id}`, money(d.amount));
  for (const p of projects) valueOfSubject.set(`project:${p.id}`, money(p.contractAmount));

  const provinceOfProject = new Map<string, string | null>();
  for (const p of projects) provinceOfProject.set(p.id, provinceOf.get(p.accountId) ?? null);

  // EVERY province starts present, including the empty ones. A province missing
  // from the map is a hole, and a hole reads as "no business here" rather than
  // "nothing has been recorded here".
  const acc = new Map<string, Cell>();
  for (const p of ALL_PROVINCES) acc.set(p, blank());

  const now = extra.now ?? new Date();
  const period = extra.period;

  /* THE PERIOD IS APPLIED ONCE, HERE, at the door. Filtering inside each fold
     would mean six places that each have to remember - and the one that forgot
     would produce a screen whose stages no longer add up, which is the failure
     this file exists to prevent.

     Each row is placed by its OWN event date. A deal belongs to the quarter it
     closed in, or the one it is expected to close in if it has not; an
     instalment to when it arrived, or when it fell due if it has not. */
  const keep = <T,>(rows: readonly T[], at: (r: T) => Date | null | undefined) =>
    period ? rows.filter((r) => within(at(r), period)) : rows;

  const closedOf = new Map<string, Date | null>();
  for (const d of deals) closedOf.set(d.id, d.closedAt ?? d.expectedCloseAt);

  const inDeals = keep(deals, (d) => d.closedAt ?? d.expectedCloseAt);
  // A project has no commercial date of its own, so it takes its deal's.
  const inProjects = keep(projects, (p) =>
    p.opportunityId ? closedOf.get(p.opportunityId) ?? null : null);
  const liveProjectIds = new Set(inProjects.map((p) => p.id));

  const unplaced = foldAccounts(accounts, acc);
  foldDeals(inDeals, provinceOf, acc, now);
  foldProjects(inProjects, provinceOf, acc);
  foldLeads(keep(extra.leads ?? [], (l) => l.createdAt), provinceOf, acc, now);
  foldProposals(
    keep(extra.proposals ?? [], (a) => a.createdAt),
    accountOfSubject, valueOfSubject, provinceOf, acc, now,
  );
  // A schedule belongs to the period its project does, and then to its own
  // date within it - otherwise a quarter shows money against work it excludes.
  foldInstalments(
    keep(extra.instalments ?? [], (i) => i.settledAt ?? i.dueAt)
      .filter((i) => !period || liveProjectIds.has(i.projectId)),
    provinceOfProject, acc, now,
  );
  foldMilestones(
    keep(extra.milestones ?? [], (m) => m.completedAt ?? m.dueAt)
      .filter((m) => !period || liveProjectIds.has(m.projectId)),
    provinceOfProject, acc,
  );

  const divisionOf = extra.provinceDivision ?? {};
  const provinces = ALL_PROVINCES.map((p) => readingOf(p, acc.get(p)!, divisionOf));

  const byDivision = new Map<string, ProvinceRollup[]>();
  for (const p of provinces) {
    if (!p.division) continue;   // unplaced by this workspace; national only
    const list = byDivision.get(p.division) ?? [];
    list.push(p);
    byDivision.set(p.division, list);
  }

  return { provinces, byDivision, unplacedAccounts: unplaced };
}

/**
 * Sum a set of provinces into one reading - used for 大区 and 全国 scope.
 *
 * SUMS ARE SUMMED, SERIES ADD ELEMENT-WISE, RATES ARE RE-DERIVED. Averaging
 * the provinces' own rates would weight 西藏 the same as 广东, so every rate
 * here is recomputed from the scope's own totals. Health is the exception with
 * no numerator to re-derive from, and it is averaged over the provinces that
 * HAVE a reading rather than over all 34 - dividing by 34 drags the figure
 * toward zero in proportion to how many provinces are quiet.
 */
export function totalOf(rows: readonly ProvinceRollup[]) {
  const addInto = (into: number[], from: readonly number[]) => {
    for (let i = 0; i < from.length; i++) into[i] = (into[i] ?? 0) + from[i]!;
    return into;
  };

  const t = {
    accounts: 0, openDeals: 0, pipelineValue: 0, wonDeals: 0, contractValue: 0,
    lostValue: 0, inDelivery: 0, projects: 0, projectsLive: 0,
    leads: 0, leadsNew: 0, leadsUnclaimed: 0, leadsConverted: 0,
    weighted: 0, proposals30: 0, accepted30: 0, pending: 0, pendingLate: 0,
    influenced: 0, milestonesDone: 0, milestonesOnTime: 0,
    collected: 0, receivable: 0, overdue: 0,
  };
  const leadSeries = zeros(PERIODS);
  const signSeries = zeros(PERIODS);
  const stageMix = zeros(STAGE_KEYS.length);
  const healthMix = zeros(HEALTH_KEYS.length);
  const adoptionSeries = Array.from({ length: TREND_DAYS }, () => ({ acc: 0, prop: 0 }));
  const cashSeries = Array.from({ length: CASH_PERIODS }, () => ({ got: 0, due: 0 }));

  for (const r of rows) {
    t.accounts += r.accounts;
    t.openDeals += r.openDeals;
    t.pipelineValue += r.pipelineValue;
    t.wonDeals += r.wonDeals;
    t.contractValue += r.contractValue;
    t.lostValue += r.lostValue;
    t.inDelivery += r.inDelivery;
    t.projects += r.projects;
    t.projectsLive += r.projectsLive;
    t.leads += r.leads;
    t.leadsNew += r.leadsNew;
    t.leadsUnclaimed += r.leadsUnclaimed;
    t.leadsConverted += r.leadsConverted;
    t.weighted += r.weighted;
    t.proposals30 += r.proposals30;
    t.accepted30 += r.accepted30;
    t.pending += r.pending;
    t.pendingLate += r.pendingLate;
    t.influenced += r.influenced;
    t.milestonesDone += r.milestonesDone;
    t.milestonesOnTime += r.milestonesOnTime;
    t.collected += r.collected;
    t.receivable += r.receivable;
    t.overdue += r.overdue;
    addInto(leadSeries, r.leadSeries);
    addInto(signSeries, r.signSeries);
    addInto(stageMix, r.stageMix);
    addInto(healthMix, r.healthMix);
    r.adoptionSeries.forEach((d, i) => {
      adoptionSeries[i]!.acc += d.acc;
      adoptionSeries[i]!.prop += d.prop;
    });
    r.cashSeries.forEach((d, i) => {
      cashSeries[i]!.got += d.got;
      cashSeries[i]!.due += d.due;
    });
  }

  const withHealth = rows.filter((r) => r.healthRate !== null);
  const decidedValue = t.contractValue + t.lostValue;

  return {
    ...t,
    leadSeries, signSeries, stageMix, healthMix, adoptionSeries, cashSeries,
    healthRate: withHealth.length
      ? withHealth.reduce((s, r) => s + r.healthRate!, 0) / withHealth.length
      : null,
    winRate: decidedValue === 0 ? null : t.contractValue / decidedValue,
    leadConversion: t.leads === 0 ? null : t.leadsConverted / t.leads,
    adoption: t.proposals30 === 0 ? null : t.accepted30 / t.proposals30,
    onTime: t.milestonesDone === 0 ? null : t.milestonesOnTime / t.milestonesDone,
  };
}
