import { BusinessSummary, type BusinessSummaryItem } from "../components/business-summary";
import { getMessages } from "../lib/i18n/server";
import { resolveLocale } from "../lib/i18n/locale";
import { formatMoney } from "../lib/view-model";
import { revenuePool, type resolveAttainmentQuery } from "../lib/attainment-workspace";
import { snapshotKey } from "../lib/attainment-progress";
import { loadAttainmentBase, loadAttainmentPlan, loadAttainmentTeam, loadForecastWorkspace } from "./board";

export async function AttainmentModuleSummary({ selection, allowForecast }: {
  readonly selection: ReturnType<typeof resolveAttainmentQuery>;
  readonly allowForecast: boolean;
}) {
  const { DEPLOYMENT_SUMMARY_TEXT: T } = await getMessages(), locale = await resolveLocale();
  const summary = (items: readonly BusinessSummaryItem[]) => <BusinessSummary kind="attainment" items={items}/>;
  const unknown = () => summary([{ label: T.sourceUnknown, hint: T.attainmentHint }]);
  if (selection.period === "all") return summary([{ label: T.choosePeriod, hint: T.attainmentHint }]);
  if (selection.view === "history") {
    if (!allowForecast) return unknown();
    const board = await loadForecastWorkspace(selection.period, selection.scopeKey);
    if (!board?.ok || !board.history.ok) return unknown();
    if (!board.points.length) return summary([{ label: T.noReports, hint: T.reportHint }]);
    const latest = board.points.reduce((a, b) => a.snapshotAt > b.snapshotAt ? a : b);
    const selected = selection.snapshot ? board.points.find(point => snapshotKey(point) === selection.snapshot) : latest;
    return summary([
      { label: T.historicalReports, value: board.points.length.toLocaleString(locale), suffix: T.reportUnit, hint: T.reportHint },
      { label: selection.snapshot ? T.selectedReport : T.latestReport, value: selected?.snapshotAt.toLocaleDateString(locale, { timeZone: "UTC" }) ?? T.sourceUnknown, hint: T.reportHint },
    ]);
  }
  const data = await loadAttainmentBase();
  if (!data) return null;
  const year = Number(selection.period.replace(/^Y/, "").slice(0, 4));
  const plan = await loadAttainmentPlan(year, selection.planRevision);
  if (!plan?.ok) return unknown();
  if (selection.perspective === "team" && selection.view === "progress") {
    const team = await loadAttainmentTeam();
    if (!team || !data.policy.ok) return unknown();
    const currency = data.policy.value.defaultCurrency;
    const members = new Set(team.members.map(member => member.sub));
    const known = new Set(plan.value.targets.filter(target => target.period === selection.period && target.currency === currency && target.scope.startsWith("owner:") && members.has(target.scope.slice(6))).map(target => target.scope));
    return summary([
      { label: T.teamMembers, value: members.size.toLocaleString(locale), suffix: T.memberUnit, hint: T.teamHint },
      { label: T.personalTargets, value: members.size ? `${known.size.toLocaleString(locale)}/${members.size.toLocaleString(locale)}` : T.targetMissing, hint: T.teamHint, attention: known.size < members.size },
    ]);
  }
  if (selection.selection === "team") {
    const regions = plan.value.regions.filter(region => region.included);
    const ids = new Set(regions.map(region => `territory:${region.id}`));
    const known = new Set(plan.value.targets.filter(target => target.period === selection.period && ids.has(target.scope)).map(target => target.scope));
    return summary([
      { label: T.visibleRegions, value: regions.length.toLocaleString(locale), suffix: T.regionUnit, hint: T.teamHint },
      { label: T.regionsWithTarget, value: regions.length ? `${known.size}/${regions.length}` : T.targetMissing, hint: T.attainmentHint },
    ]);
  }
  if (!data.deals.ok || !data.policy.ok) return unknown();
  const defaultCurrency = data.policy.value.defaultCurrency;
  const target = plan.value.targets.find(target => target.period === selection.period && target.scope === selection.scopeKey && target.currency === defaultCurrency)
    ?? plan.value.targets.find(target => target.period === selection.period && target.scope === selection.scopeKey);
  const currency = target?.currency ?? defaultCurrency;
  const pool = revenuePool(data.deals.value, selection.period, selection.scope, currency);
  const totals = pool?.totals.ok ? pool.totals.value : null;
  const gap = target && totals ? (Math.round(target.target * 100) - Math.round(totals.closedAmount.amount * 100)) / 100 : null;
  const rate = target && target.target > 0 && totals ? `${T.completionRate} ${(totals.closedAmount.amount / target.target * 100).toLocaleString(locale, { maximumFractionDigits: 1 })}%` : "";
  const items: BusinessSummaryItem[] = [
    { label: T.formalTarget, value: target ? formatMoney(target.target, currency, locale) : T.targetMissing, hint: T.attainmentHint },
    { label: T.actualClosed, value: totals ? formatMoney(totals.closedAmount.amount, currency, locale) : T.sourceUnknown, hint: `${T.attainmentActualHint} ${rate}` },
  ];
  if (gap !== null) items.push(gap > 0
    ? { label: T.remainingGap, value: formatMoney(gap, currency, locale), hint: T.attainmentHint, attention: true }
    : { label: T.reachedTarget, hint: T.attainmentHint });
  return summary(items);
}
