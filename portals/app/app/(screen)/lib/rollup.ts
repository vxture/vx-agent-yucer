import type { AccountRecord } from "../../domains/account/store";
import { ALL_PROVINCES, regionOfProvince, type Region } from "../../domains/shared/provinces";

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
}

export interface ProjectLike {
  readonly id: string;
  readonly accountId: string;
  readonly status: string;
  readonly health: string;
  readonly contractAmount: { readonly amount: number } | null;
}

export interface LeadLike {
  readonly id: string;
  readonly accountId: string | null;
  readonly status: string;
  readonly ownerSub: string | null;
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
}

/** The lists the six panels are folded from. */
export interface RollupExtra {
  readonly leads?: readonly LeadLike[];
  readonly proposals?: readonly ProposalLike[];
  readonly instalments?: readonly InstalmentLike[];
  /** The clock, injected so the 30-day window is testable. */
  readonly now?: Date;
}

/** One province's figures. Money is in the store's own minor unit (CNY yuan). */
export interface ProvinceRollup {
  readonly province: string;
  readonly region: Region;
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

  /* 线索供给. A lead with no account is attributed nowhere - the same rule the
     accounts follow, and the common case, since a lead becomes an account by
     being converted. */
  readonly leads: number;
  readonly leadsNew: number;
  readonly leadsUnclaimed: number;
  readonly leadsConverted: number;
  /** Converted over all leads here - null when there are none. */
  readonly leadConversion: number | null;

  /* 智能副驾, attributed through the proposal's subject to an account. */
  readonly proposals30: number;
  readonly accepted30: number;
  /** Accepted over decided in the window - null when nothing was decided. */
  readonly adoption: number | null;
  /** Proposals decided in the window - the adoption rate's denominator. */
  readonly decided30: number;
  /** Still awaiting a human: a stock, not a flow. */
  readonly pending: number;

  /* 回款兑现. Settled counts what ARRIVED; everything live counts what was
     promised. A written-off instalment is in neither - the decision is taken. */
  readonly collected: number;
  readonly receivable: number;
  readonly overdue: number;
}

export interface NationalRollup {
  readonly provinces: readonly ProvinceRollup[];
  readonly byRegion: ReadonlyMap<Region, readonly ProvinceRollup[]>;
  /** Accounts with no province on file: counted nationally, drawn nowhere. */
  readonly unplacedAccounts: number;
}

const money = (m: { amount: number } | null | undefined) => m?.amount ?? 0;

/** One province's running totals while the three lists are folded in. */
interface Cell {
  accounts: number; openDeals: number; pipelineValue: number;
  wonDeals: number; contractValue: number; lostValue: number;
  inDelivery: number; healthy: number; delivered: number; live: number;
  leads: number; leadsNew: number; leadsUnclaimed: number; leadsConverted: number;
  proposals30: number; accepted30: number; decided30: number; pending: number;
  collected: number; receivable: number; overdue: number;
}

const blank = (): Cell => ({
  accounts: 0, openDeals: 0, pipelineValue: 0,
  wonDeals: 0, contractValue: 0, lostValue: 0,
  inDelivery: 0, healthy: 0, delivered: 0, live: 0,
  leads: 0, leadsNew: 0, leadsUnclaimed: 0, leadsConverted: 0,
  proposals30: 0, accepted30: 0, decided30: 0, pending: 0,
  collected: 0, receivable: 0, overdue: 0,
});

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
): void {
  for (const d of deals) {
    const province = provinceOf.get(d.accountId);
    const cell = province ? acc.get(province) : undefined;
    if (!cell) continue;
    const value = money(d.amount);
    if (d.status === "won") { cell.wonDeals += 1; cell.contractValue += value; }
    else if (d.status === "lost") { cell.lostValue += value; }
    else { cell.openDeals += 1; cell.pipelineValue += value; }
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
): void {
  for (const l of leads) {
    const province = l.accountId ? provinceOf.get(l.accountId) : null;
    const cell = province ? acc.get(province) : undefined;
    if (!cell) continue;
    cell.leads += 1;
    if (l.status === "new") cell.leadsNew += 1;
    if (!l.ownerSub) cell.leadsUnclaimed += 1;
    if (l.status === "converted") cell.leadsConverted += 1;
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
  provinceOf: ReadonlyMap<string, string | null>,
  acc: Map<string, Cell>,
  now: Date,
): void {
  const since = now.getTime() - 30 * 24 * 60 * 60 * 1000;
  for (const a of proposals) {
    const accountId = accountOfSubject.get(`${a.subjectType}:${a.subjectId}`);
    const province = accountId ? provinceOf.get(accountId) : null;
    const cell = province ? acc.get(province) : undefined;
    if (!cell) continue;
    if (a.status === "proposed") cell.pending += 1;
    if (a.createdAt.getTime() < since) continue;
    cell.proposals30 += 1;
    // Executed means accepted AND carried out; both are the human saying yes.
    if (a.status === "accepted" || a.status === "executed") {
      cell.accepted30 += 1;
      cell.decided30 += 1;
    } else if (a.status === "rejected") {
      cell.decided30 += 1;
    }
    // proposed / expired / failed are not a decision, and counting them as a
    // refusal would report an adoption rate nobody chose.
  }
}

/** Fold the instalments in: 回款兑现. */
function foldInstalments(
  instalments: readonly InstalmentLike[],
  provinceOfProject: ReadonlyMap<string, string | null>,
  acc: Map<string, Cell>,
): void {
  for (const i of instalments) {
    const province = provinceOfProject.get(i.projectId);
    const cell = province ? acc.get(province) : undefined;
    if (!cell) continue;
    if (i.status === "written_off") continue;
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

/** Close one province's cell into the reading the screen renders. */
function readingOf(province: string, c: Cell): ProvinceRollup {
  const decided = c.contractValue + c.lostValue;
  return {
    province,
    region: regionOfProvince(province)!,
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

    proposals30: c.proposals30,
    accepted30: c.accepted30,
    adoption: c.decided30 === 0 ? null : c.accepted30 / c.decided30,
    decided30: c.decided30,
    pending: c.pending,

    collected: c.collected,
    receivable: c.receivable,
    overdue: c.overdue,
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

  const provinceOfProject = new Map<string, string | null>();
  for (const p of projects) provinceOfProject.set(p.id, provinceOf.get(p.accountId) ?? null);

  // EVERY province starts present, including the empty ones. A province missing
  // from the map is a hole, and a hole reads as "no business here" rather than
  // "nothing has been recorded here".
  const acc = new Map<string, Cell>();
  for (const p of ALL_PROVINCES) acc.set(p, blank());

  const unplaced = foldAccounts(accounts, acc);
  foldDeals(deals, provinceOf, acc);
  foldProjects(projects, provinceOf, acc);
  foldLeads(extra.leads ?? [], provinceOf, acc);
  foldProposals(
    extra.proposals ?? [], accountOfSubject, provinceOf, acc, extra.now ?? new Date(),
  );
  foldInstalments(extra.instalments ?? [], provinceOfProject, acc);

  const provinces = ALL_PROVINCES.map((p) => readingOf(p, acc.get(p)!));

  const byRegion = new Map<Region, ProvinceRollup[]>();
  for (const p of provinces) {
    const list = byRegion.get(p.region) ?? [];
    list.push(p);
    byRegion.set(p.region, list);
  }

  return { provinces, byRegion, unplacedAccounts: unplaced };
}

/**
 * Sum a set of provinces into one reading - used for 大区 and 全国 scope.
 *
 * SUMS ARE SUMMED, RATES ARE RE-DERIVED. Averaging the provinces' own rates
 * would weight 西藏 the same as 广东; every rate here is recomputed from the
 * scope's totals so a big province counts for what it is. The exception is
 * healthRate, which has no numerator to re-derive from at this level - it is
 * averaged over the provinces that HAVE a reading, never over all 34, because
 * dividing by 34 drags the figure toward zero in proportion to how many
 * provinces are quiet, which is not what a health rate means.
 */
export function totalOf(rows: readonly ProvinceRollup[]) {
  const t = rows.reduce(
    (s, r) => ({
      accounts: s.accounts + r.accounts,
      openDeals: s.openDeals + r.openDeals,
      pipelineValue: s.pipelineValue + r.pipelineValue,
      wonDeals: s.wonDeals + r.wonDeals,
      contractValue: s.contractValue + r.contractValue,
      inDelivery: s.inDelivery + r.inDelivery,
      projects: s.projects + r.projects,
      projectsLive: s.projectsLive + r.projectsLive,
      leads: s.leads + r.leads,
      leadsNew: s.leadsNew + r.leadsNew,
      leadsUnclaimed: s.leadsUnclaimed + r.leadsUnclaimed,
      leadsConverted: s.leadsConverted + r.leadsConverted,
      lostValue: s.lostValue + r.lostValue,
      decided30: s.decided30 + r.decided30,
      proposals30: s.proposals30 + r.proposals30,
      accepted30: s.accepted30 + r.accepted30,
      pending: s.pending + r.pending,
      collected: s.collected + r.collected,
      receivable: s.receivable + r.receivable,
      overdue: s.overdue + r.overdue,
    }),
    {
      accounts: 0, openDeals: 0, pipelineValue: 0, wonDeals: 0, contractValue: 0,
      inDelivery: 0, projects: 0, projectsLive: 0, leads: 0, leadsNew: 0, leadsUnclaimed: 0, leadsConverted: 0,
      lostValue: 0, decided30: 0,
      proposals30: 0, accepted30: 0, pending: 0, collected: 0, receivable: 0, overdue: 0,
    },
  );

  const withHealth = rows.filter((r) => r.healthRate !== null);
  const decidedValue = t.contractValue + t.lostValue;

  return {
    ...t,
    healthRate: withHealth.length
      ? withHealth.reduce((s, r) => s + r.healthRate!, 0) / withHealth.length
      : null,
    winRate: decidedValue === 0 ? null : t.contractValue / decidedValue,
    leadConversion: t.leads === 0 ? null : t.leadsConverted / t.leads,
    adoption: t.decided30 === 0 ? null : t.accepted30 / t.decided30,
  };
}
