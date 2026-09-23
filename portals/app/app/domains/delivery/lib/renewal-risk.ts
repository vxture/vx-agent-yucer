// 续约风险评分 (YC-021 L4, owner 2026-09-24: 规则分级 高/中/低).
//
// PER IN-FORCE CONTRACT, BEFORE IT IS DUE. The renewal factor in the health
// score answers "is a renewal hurting this customer right now" once, for the
// whole account, and only inside the window. This answers the earlier and
// narrower question - how likely is THIS contract to renew - for every active,
// not-yet-renewed contract, whether or not its window has opened, and every
// point it adds is a basis item a reader can open.
//
// Rules, not a model. Each signal carries a weight; the level is the sum:
//   notice deadline passed, no renewal deal open      3
//   inside the window, no renewal deal open           2
//   a red delivery project under this contract        2
//   an amber one                                      1
//   an overdue instalment under this contract         1
//   no recorded contact for more than 30 days         1
//   the contract it renewed was a downgrade           1
// high >= 3, medium 1-2, low 0. A contract whose sources could not be read is
// not scored here - the caller leaves it out rather than calling it low.

export const RENEWAL_QUIET_DAYS = 30;

export type RenewalRiskLevel = "high" | "medium" | "low";

export type RenewalRiskBasis =
  | { readonly code: "notice_passed"; readonly days: number }
  | { readonly code: "in_window"; readonly days: number }
  | { readonly code: "delivery_red"; readonly project: string }
  | { readonly code: "delivery_amber"; readonly project: string }
  | { readonly code: "revenue_overdue"; readonly count: number }
  | { readonly code: "quiet"; readonly days: number }
  | { readonly code: "prior_downgrade" }
  | { readonly code: "renewal_deal_open" };

export interface RenewalRiskInput {
  /** Days until the notice deadline (term_end minus notice_days); negative = passed. */
  readonly noticeInDays: number;
  readonly windowDays: number;
  /** An open deal sourced from one of this contract's projects (or, with no
   *  project link, from any of the account's). */
  readonly renewalDealOpen: boolean;
  /** Derived health of the projects under this contract. */
  readonly projects: readonly { readonly name: string; readonly health: string }[];
  readonly overdueInstalments: number;
  /** Days since the account's last recorded contact; null = never. */
  readonly quietDays: number | null;
  readonly priorDowngrade: boolean;
}

export interface RenewalRisk {
  readonly level: RenewalRiskLevel;
  readonly points: number;
  /** Every signal that counted, and - when one is open - the renewal deal that
   *  took the deadline signals off. In weight order. */
  readonly basis: readonly RenewalRiskBasis[];
}

export function renewalRisk(i: RenewalRiskInput): RenewalRisk {
  const hits: { basis: RenewalRiskBasis; points: number }[] = [];
  if (!i.renewalDealOpen && i.noticeInDays < 0) hits.push({ basis: { code: "notice_passed", days: -i.noticeInDays }, points: 3 });
  else if (!i.renewalDealOpen && i.noticeInDays <= i.windowDays) hits.push({ basis: { code: "in_window", days: i.noticeInDays }, points: 2 });
  const red = i.projects.find((p) => p.health === "red");
  const amber = i.projects.find((p) => p.health === "amber");
  if (red) hits.push({ basis: { code: "delivery_red", project: red.name }, points: 2 });
  else if (amber) hits.push({ basis: { code: "delivery_amber", project: amber.name }, points: 1 });
  if (i.overdueInstalments > 0) hits.push({ basis: { code: "revenue_overdue", count: i.overdueInstalments }, points: 1 });
  if (i.quietDays === null || i.quietDays > RENEWAL_QUIET_DAYS) hits.push({ basis: { code: "quiet", days: i.quietDays ?? -1 }, points: 1 });
  if (i.priorDowngrade) hits.push({ basis: { code: "prior_downgrade" }, points: 1 });
  hits.sort((a, b) => b.points - a.points);
  const points = hits.reduce((n, h) => n + h.points, 0);
  const basis = hits.map((h) => h.basis);
  // Said, not silent: a renewal deal already open is why the deadline does not count.
  if (i.renewalDealOpen && i.noticeInDays <= i.windowDays) basis.push({ code: "renewal_deal_open" });
  return { level: points >= 3 ? "high" : points >= 1 ? "medium" : "low", points, basis };
}
