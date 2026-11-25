import { readFocusContacts } from "./focus-contacts";
import { readFocusCoverage } from "./focus-coverage";
import type { PipelineContext } from "../pipeline/service";
import { can } from "../../authz/decide";
import type { DataScope } from "../../authz/scope";
import { listAccounts, type AccountContext } from "../account/service";
import { amount, demand, minor } from "./plan-values";
import { planVersions } from "./plan-state";
import { regionalPlanningRevision } from "./plan-workflow";
import type { SalesPlanContext } from "./plan-service";
import type { PlanContent, PlanRevision, PlanRegion } from "./plan-model";
import type { FocusRow, FocusWorkspace } from "./focus-model";

export type FocusContext = SalesPlanContext & { accounts: AccountContext["store"]; pipeline?: PipelineContext["store"]; members?: () => Promise<{ sub: string; name: string }[]> };
export type FocusQuery = { year: number; revisionId?: string; regionId?: string; period?: string };
function regionAllowed(scope: DataScope, region: PlanRegion) {
  return scope.kind !== "territory" && scope.kind !== "unit" || scope.territoryIds.includes(region.id);
}
function rowAllowed(scope: DataScope, account: { ownerSub: string | null }, content: PlanContent, id: string) {
  if (scope.kind === "own") return account.ownerSub === scope.sub || content.actions.some(a => a.accountId === id && a.ownerSub === scope.sub);
  if (scope.kind === "unit") return content.actions.some(a => a.accountId === id && !!a.ownerSub && scope.memberSubs.includes(a.ownerSub)) || scope.memberSubs.includes(account.ownerSub ?? "") || scope.accountIds.includes(id);
  return true;
}
function projectRow(content: PlanContent, account: FocusRow, period: string, regionIds: ReadonlySet<string>): FocusRow {
  const contributions = content.contributions.flatMap(c => {
    if (!regionIds.has(c.regionId)) return [];
    const budget = content.budgets.find(b => b.key === c.budgetKey && b.accountId === account.id && b.period === period);
    const target = content.targets.find(t => t.key === c.targetKey);
    return budget && target ? [{ ...c, budget, target: { key: target.key, period: target.period, metric: target.metric, currency: target.currency } }] : [];
  });
  const range = content.periods.find(p => p.key === period)!;
  const actions = content.actions.filter(a => a.accountId === account.id && regionIds.has(a.regionId) && range.start <= a.due && a.due < range.end);
  const regions = content.regions.filter(r => regionIds.has(r.id) && (contributions.some(c => c.regionId === r.id) || actions.some(a => a.regionId === r.id))).map(({ id, name, ownerSub }) => ({ id, name, ownerSub }));
  const sums = new Map<string, bigint>();
  for (const c of contributions.filter(c => c.budget.metric === "revenue" && c.budget.currency)) sums.set(c.budget.currency!, (sums.get(c.budget.currency!) ?? 0n) + minor(c.amount));
  return { ...account, contributions, actions, regions, revenue: [...sums].map(([currency, value]) => ({ currency, amount: amount(value) })) };
}
function visibleRows(ctx: FocusContext, content: PlanContent, candidates: FocusWorkspace["candidates"], period: string, ids: ReadonlySet<string>, canTeam: boolean, regionId?: string) {
  return candidates.flatMap(a => {
    if (!rowAllowed(ctx.scope, a, content, a.id)) return [];
    const ownSub = ctx.scope.kind === "own" ? ctx.scope.sub : null;
    const accountRegions = ownSub ? new Set(content.actions.filter(action => action.accountId === a.id && action.ownerSub === ownSub && ids.has(action.regionId)).map(action => action.regionId)) : ids;
    const row = projectRow(content, { id: a.id, name: a.name, accountNo: a.accountNo, tier: a.tier, ownerSub: a.ownerSub, contributions: [], actions: [], unallocated: [], revenue: [], regions: [], coverage: { state: "unavailable" }, contacts: { state: "unavailable" } }, period, accountRegions);
    if (ownSub) row.actions = row.actions.filter(action => action.ownerSub === ownSub);
    if (ctx.scope.kind !== "workspace") row.contributions = row.contributions.map(c => ({ ...c, budget: { ...c.budget, amount: null, note: "", sourcePlanId: null, sourceReadAt: "" } }));
    if (ctx.scope.kind !== "workspace") row.actions = row.actions.map(a => ({ ...a, evidenceRefs: [] }));
    if (!canTeam) {
      row.ownerSub = row.ownerSub === ctx.sub ? ctx.sub : null;
      row.actions = row.actions.map(action => ({ ...action, ownerSub: action.ownerSub === ctx.sub ? ctx.sub : null }));
      row.regions = row.regions.map(region => ({ ...region, ownerSub: region.ownerSub === ctx.sub ? ctx.sub : null }));
    }
    // Budgets without an allocation are visible only to workspace maintainers.
    if (ctx.scope.kind === "workspace" && !regionId) row.unallocated = content.budgets.filter(b => b.accountId === a.id && b.period === period && !content.contributions.some(c => c.budgetKey === b.key));
    return row.contributions.length || row.actions.length || row.unallocated.length ? [row] : [];
  });
}
/** Scope and source gates apply before returning a customer-only projection. */
export async function readFocusWorkspace(ctx: FocusContext, query: FocusQuery, options: { includeContactDetails?: boolean } = {}): Promise<FocusWorkspace> {
  demand(can(ctx.holder, ctx.entitlement, "planning.target.view", "data").allowed && can(ctx.holder, ctx.entitlement, "account.view", "data").allowed, "plan_denied");
  demand(Number.isInteger(query.year) && query.year >= 2000 && query.year <= 2200, "invalid_period");
  const at = (ctx.now?.() ?? new Date()).toISOString();
  const [plan, accounts] = await Promise.all([ctx.store.read(ctx.workspaceId, query.year), listAccounts({ workspaceId: ctx.workspaceId, sub: ctx.sub, holder: ctx.holder, entitlement: ctx.entitlement, store: ctx.accounts })]);
  demand(accounts.ok, "plan_source_permission");
  const state = plan && planVersions(plan, at);
  const writer = ctx.scope.kind === "workspace" && can(ctx.holder, ctx.entitlement, "planning.target.update", "data").allowed;
  const selected = query.revisionId ? plan?.revisions.find(r => r.id === query.revisionId && (r.state === "sealed" || (r.state === "draft" && writer))) : state?.current;
  demand(!query.revisionId || selected, "version_not_found");
  const period = query.period ?? `Y${query.year}`;
  const canTeam = can(ctx.holder, ctx.entitlement, "admin.member.view", "data").allowed;
  const members = canTeam && ctx.scope.kind === "workspace" ? await ctx.members?.() ?? [] : [];
  const empty: FocusWorkspace = { year: query.year, period, regionId: query.regionId ?? null, revision: null, versions: [], draftId: writer ? state?.draft?.id ?? null : null, companyDraft: writer && state?.draft?.content.releaseScope === "company", eventNo: writer ? state?.eventNo ?? 0 : 0, editToken: null, closed: state?.closed ?? false, canEdit: false, canTeam, regions: [], periods: [], candidates: [], members, currentSub: ctx.sub, rows: [] };
  if (!selected || !plan) return empty;
  const content = selected.content;
  demand(content.periods.some(p => p.key === period), "invalid_period");
  const regions = content.regions.filter(r => r.included && regionAllowed(ctx.scope, r));
  demand(!query.regionId || regions.some(r => r.id === query.regionId), "region_unknown");
  const ids = new Set(regions.filter(r => !query.regionId || r.id === query.regionId).map(r => r.id));
  const candidates = accounts.value.filter(a => rowAllowed(ctx.scope, a, content, a.id)).map(a => ({ id: a.id, name: a.name, accountNo: a.accountNo, tier: a.tier, ownerSub: a.ownerSub }));
  const rows = visibleRows(ctx, content, candidates, period, ids, canTeam, query.regionId);
  if (options.includeContactDetails !== false) {
    const contactCache = await readFocusContacts(ctx, rows);
    await readFocusCoverage(ctx, rows, contactCache);
  }
  const visibleRegions = ctx.scope.kind === "own" ? regions.filter(r => rows.some(row => row.regions.some(region => region.id === r.id))) : regions;
  return { ...empty, rows, candidates: writer ? candidates : [], regions: visibleRegions.map(({ id, name }) => ({ id, name })), periods: content.periods.map(({ key, start, end }) => ({ key, start, end })),
    revision: revisionLabel(plan, selected, state?.current?.id),
    versions: plan.revisions.filter(r => r.state === "sealed" || (writer && r.state === "draft")).map(r => ({ id: r.id, version: r.version, draft: r.state === "draft" })),
    editToken: selected.state === "draft" && writer ? selected.editToken : null,
    canEdit: editableSelection(ctx, selected, state, writer, canTeam),
  };
}

export async function readFocusDetail(ctx: FocusContext, query: FocusQuery & { accountId: string }) {
  const workspace = await readFocusWorkspace(ctx, query);
  const row = workspace.rows.find(r => r.id === query.accountId);
  demand(row, "account_unknown");
  const plan = await ctx.store.read(ctx.workspaceId, query.year);
  const revision = plan?.revisions.find(r => r.id === workspace.revision?.id);
  demand(revision && (workspace.editToken === null || revision.editToken === workspace.editToken), "draft_conflict");
  const allocations = workspace.canTeam && ctx.scope.kind !== "own" ? revision?.content.team.filter(t => row.regions.some(r => r.id === t.regionId)) ?? [] : [];
  return { workspace, row, regionTeams: row.regions.map(region => ({ regionId: region.id, regionName: region.name, allocations: allocations.filter(a => a.regionId === region.id) })) };
}
function revisionLabel(plan: import("./plan-model").SalesPlan, selected: PlanRevision, currentId?: string) {
  return { id: selected.id, version: selected.version, draft: selected.state === "draft", current: selected.id === currentId, regionalVersion: regionalPlanningRevision(plan, selected)?.version ?? null };
}

function editableSelection(ctx: FocusContext, selected: PlanRevision, state: ReturnType<typeof planVersions> | null, writer: boolean, canTeam: boolean) {
  if (!writer || !canTeam || state?.closed) return false;
  if (selected.content.strategyAcceptances?.length && !can(ctx.holder, ctx.entitlement, "strategy.plan.view", "data").allowed) return false;
  if (state?.draft && state.draft.id !== selected.id) return false;
  if (selected.state !== "draft") return selected.id === state?.current?.id;
  return selected.content.releaseScope === "regions" && selected.baseId === (state?.current?.id ?? null);
}
