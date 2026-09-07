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
  /** Share of delivery projects reported healthy, 0-1, or null when there are none. */
  readonly healthRate: number | null;
  /** Won value over decided value - null when nothing has been decided here. */
  readonly winRate: number | null;
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
  inDelivery: number; healthy: number; delivered: number;
}

const blank = (): Cell => ({
  accounts: 0, openDeals: 0, pipelineValue: 0,
  wonDeals: 0, contractValue: 0, lostValue: 0,
  inDelivery: 0, healthy: 0, delivered: 0,
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
    if (!settled.has(p.status)) cell.inDelivery += money(p.contractAmount);
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
    // NULL, NOT ZERO, when nothing has been delivered here. Zero would read
    // as "everything is unhealthy" on a province where nothing is running -
    // the same distinction the delivery page keeps between an unforecast
    // quarter and a failed one.
    healthRate: c.delivered === 0 ? null : c.healthy / c.delivered,
    // Likewise: a province where nothing has closed has no win rate, and
    // printing 0% would rank it below a province that genuinely loses.
    winRate: decided === 0 ? null : c.contractValue / decided,
  };
}

export function rollUpByProvince(
  accounts: readonly AccountRecord[],
  deals: readonly DealLike[],
  projects: readonly ProjectLike[],
): NationalRollup {
  const provinceOf = new Map<string, string | null>();
  for (const a of accounts) provinceOf.set(a.id, a.province);

  // EVERY province starts present, including the empty ones. A province missing
  // from the map is a hole, and a hole reads as "no business here" rather than
  // "nothing has been recorded here".
  const acc = new Map<string, Cell>();
  for (const p of ALL_PROVINCES) acc.set(p, blank());

  const unplaced = foldAccounts(accounts, acc);
  foldDeals(deals, provinceOf, acc);
  foldProjects(projects, provinceOf, acc);

  const provinces = ALL_PROVINCES.map((p) => readingOf(p, acc.get(p)!));

  const byRegion = new Map<Region, ProvinceRollup[]>();
  for (const p of provinces) {
    const list = byRegion.get(p.region) ?? [];
    list.push(p);
    byRegion.set(p.region, list);
  }

  return { provinces, byRegion, unplacedAccounts: unplaced };
}

/** Sum a set of provinces into one reading - used for 大区 and 全国 scope. */
export function totalOf(rows: readonly ProvinceRollup[]) {
  const t = rows.reduce(
    (s, r) => ({
      accounts: s.accounts + r.accounts,
      openDeals: s.openDeals + r.openDeals,
      pipelineValue: s.pipelineValue + r.pipelineValue,
      wonDeals: s.wonDeals + r.wonDeals,
      contractValue: s.contractValue + r.contractValue,
      inDelivery: s.inDelivery + r.inDelivery,
    }),
    { accounts: 0, openDeals: 0, pipelineValue: 0, wonDeals: 0, contractValue: 0, inDelivery: 0 },
  );
  // Averaged over the provinces that HAVE a reading, never over all of them:
  // dividing by 34 would drag the national health rate toward zero in
  // proportion to how many provinces are quiet, which is not what it means.
  const withHealth = rows.filter((r) => r.healthRate !== null);
  const withWin = rows.filter((r) => r.winRate !== null);
  return {
    ...t,
    healthRate: withHealth.length
      ? withHealth.reduce((s, r) => s + r.healthRate!, 0) / withHealth.length
      : null,
    winRate: withWin.length
      ? withWin.reduce((s, r) => s + r.winRate!, 0) / withWin.length
      : null,
  };
}
