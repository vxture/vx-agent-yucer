import type { AccountStatus } from "./health";

// 状态标签 - evaluated, never set (YC-021 L5; owner, 2026-09-23: 按事实四分，
// 读时推导). The stored `account.status` column was never written after
// creation, so every customer read as whatever it was born as, forever. The
// label is now DERIVED FROM FACTS EACH TIME IT IS READ - "派生不落表": a
// stored label needs a job to keep it true, and a row the job missed is a lie
// that reads like a fact.
//
//   prospect - never won a deal, never signed a contract, no project running
//   active   - a contract in force, an open deal, a project running, or a
//              deal won in the last 12 months
//   churned  - not active, and the latest renewal outcome recorded was 流失
//   dormant  - every other customer who has bought before
//
// Order matters: active is checked before churned, so a lost renewal on a
// customer with a new deal in play reads as active - they are still talking.
//
// The inputs are COUNTS AND DATES, not other domains' records: which contract
// is in force is delivery's rule (contractPhase), which deal is open is the
// pipeline's. The caller asks each owner and hands the answers here.

export interface AccountStatusFacts {
  /** Non-draft contracts ever signed. */
  signedContracts: number;
  /** Of those, in force today (contractPhase === "in_force"). */
  inForceContracts: number;
  openDeals: number;
  /** When each won deal closed; a won deal with no close date counts as won long ago. */
  wonDealsClosedAt: ReadonlyArray<Date | null>;
  /** Projects in planning, active or on hold. */
  runningProjects: number;
  /** The most recent renewal event on any of the account's contracts. */
  latestRenewalOutcome: "renewed" | "downgraded" | "lost" | null;
}

const RECENT_WIN_DAYS = 365;
const DAY_MS = 86_400_000;

export function deriveAccountStatus(f: AccountStatusFacts, now: Date): AccountStatus {
  // A running project counts too: delivery follows a sale even when the deal
  // or the contract behind it was never entered.
  const everBought = f.signedContracts > 0 || f.wonDealsClosedAt.length > 0 || f.runningProjects > 0;
  if (!everBought) return "prospect";

  const since = now.getTime() - RECENT_WIN_DAYS * DAY_MS;
  const recentWin = f.wonDealsClosedAt.some((d) => d !== null && d.getTime() >= since);
  if (f.inForceContracts > 0 || f.openDeals > 0 || f.runningProjects > 0 || recentWin) return "active";

  if (f.latestRenewalOutcome === "lost") return "churned";
  return "dormant";
}

export const RUNNING_PROJECT_STATUSES: ReadonlySet<string> = new Set(["planning", "active", "on_hold"]);
