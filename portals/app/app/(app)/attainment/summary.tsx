import { BusinessSummary, type BusinessSummaryItem } from "../components/business-summary";
import { getMessages } from "../lib/i18n/server";
import { resolveLocale } from "../lib/i18n/locale";
import { formatMoney } from "../lib/view-model";
import { revenuePool, type resolveAttainmentQuery } from "../lib/attainment-workspace";
import { snapshotKey } from "../lib/attainment-progress";
import type { AttainmentPlan } from "../../domains/planning/attainment-plan";
import { loadAttainmentBase, loadAttainmentPlan, loadAttainmentTeam, loadForecastWorkspace } from "./board";

type Selection = ReturnType<typeof resolveAttainmentQuery>;
type SummaryText = Awaited<ReturnType<typeof getMessages>>["DEPLOYMENT_SUMMARY_TEXT"];
type SummaryContext = { readonly selection: Selection; readonly text: SummaryText; readonly locale: string };

const summary = (items: readonly BusinessSummaryItem[]) => <BusinessSummary kind="attainment" items={items}/>;
const unknown = (text: SummaryText) => summary([{ label: text.sourceUnknown, hint: text.attainmentHint }]);

export async function AttainmentModuleSummary({ selection, allowForecast }: {
  readonly selection: Selection;
  readonly allowForecast: boolean;
}) {
  const { DEPLOYMENT_SUMMARY_TEXT: text } = await getMessages(), locale = await resolveLocale();
  const context = { selection, text, locale };
  if (selection.period === "all") return summary([{ label: text.choosePeriod, hint: text.attainmentHint }]);
  if (selection.view === "history") return allowForecast ? <HistoricalReportSummary {...context}/> : unknown(text);
  const data = await loadAttainmentBase();
  if (!data) return null;
  const year = Number(selection.period.replace(/^Y/, "").slice(0, 4));
  const plan = await loadAttainmentPlan(year, selection.planRevision);
  if (!plan?.ok) return unknown(text);
  if (selection.perspective === "team" && selection.view === "progress") {
    if (!data.policy.ok) return unknown(text);
    return <PersonalTargetSummary {...context} plan={plan.value} currency={data.policy.value.defaultCurrency}/>;
  }
  if (selection.selection === "team") return summary(regionalTargetItems(plan.value, context));
  if (!data.deals.ok || !data.policy.ok) return unknown(text);
  return summary(revenueItems(plan.value, data.deals.value, data.policy.value.defaultCurrency, context));
}

async function HistoricalReportSummary({ selection, text, locale }: SummaryContext) {
  const board = await loadForecastWorkspace(selection.period, selection.scopeKey);
  if (!board?.ok || !board.history.ok) return unknown(text);
  if (!board.points.length) return summary([{ label: text.noReports, hint: text.reportHint }]);
  const latest = board.points.reduce((a, b) => a.snapshotAt > b.snapshotAt ? a : b);
  const selected = selection.snapshot ? board.points.find(point => snapshotKey(point) === selection.snapshot) : latest;
  return summary([
    { label: text.historicalReports, value: board.points.length.toLocaleString(locale), suffix: text.reportUnit, hint: text.reportHint },
    { label: selection.snapshot ? text.selectedReport : text.latestReport, value: selected?.snapshotAt.toLocaleDateString(locale, { timeZone: "UTC" }) ?? text.sourceUnknown, hint: text.reportHint },
  ]);
}

async function PersonalTargetSummary({ selection, text, locale, plan, currency }: SummaryContext & {
  readonly plan: AttainmentPlan; readonly currency: string;
}) {
  const team = await loadAttainmentTeam();
  if (!team) return unknown(text);
  const members = new Set(team.members.map(member => member.sub));
  const known = new Set(plan.targets.filter(target => target.period === selection.period && target.currency === currency && target.scope.startsWith("owner:") && members.has(target.scope.slice(6))).map(target => target.scope));
  return summary([
    { label: text.teamMembers, value: members.size.toLocaleString(locale), suffix: text.memberUnit, hint: text.teamHint },
    { label: text.personalTargets, value: members.size ? `${known.size.toLocaleString(locale)}/${members.size.toLocaleString(locale)}` : text.targetMissing, hint: text.teamHint, attention: known.size < members.size },
  ]);
}

function regionalTargetItems(plan: AttainmentPlan, { selection, text, locale }: SummaryContext): BusinessSummaryItem[] {
  const regions = plan.regions.filter(region => region.included);
  const ids = new Set(regions.map(region => `territory:${region.id}`));
  const known = new Set(plan.targets.filter(target => target.period === selection.period && ids.has(target.scope)).map(target => target.scope));
  return [
    { label: text.visibleRegions, value: regions.length.toLocaleString(locale), suffix: text.regionUnit, hint: text.teamHint },
    { label: text.regionsWithTarget, value: regions.length ? `${known.size}/${regions.length}` : text.targetMissing, hint: text.attainmentHint },
  ];
}

function revenueItems(plan: AttainmentPlan, deals: Parameters<typeof revenuePool>[0], defaultCurrency: string, { selection, text, locale }: SummaryContext): BusinessSummaryItem[] {
  const target = plan.targets.find(target => target.period === selection.period && target.scope === selection.scopeKey && target.currency === defaultCurrency)
    ?? plan.targets.find(target => target.period === selection.period && target.scope === selection.scopeKey);
  const currency = target?.currency ?? defaultCurrency;
  const pool = revenuePool(deals, selection.period, selection.scope, currency);
  const totals = pool?.totals.ok ? pool.totals.value : null;
  const rate = target && target.target > 0 && totals ? `${text.completionRate} ${(totals.closedAmount.amount / target.target * 100).toLocaleString(locale, { maximumFractionDigits: 1 })}%` : "";
  const items: BusinessSummaryItem[] = [
    { label: text.formalTarget, value: target ? formatMoney(target.target, currency, locale) : text.targetMissing, hint: text.attainmentHint },
    { label: text.actualClosed, value: totals ? formatMoney(totals.closedAmount.amount, currency, locale) : text.sourceUnknown, hint: `${text.attainmentActualHint} ${rate}` },
  ];
  if (!target || !totals) return items;
  const gap = (Math.round(target.target * 100) - Math.round(totals.closedAmount.amount * 100)) / 100;
  items.push(gap > 0
    ? { label: text.remainingGap, value: formatMoney(gap, currency, locale), hint: text.attainmentHint, attention: true }
    : { label: text.reachedTarget, hint: text.attainmentHint });
  return items;
}
