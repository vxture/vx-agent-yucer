import { can } from "../../authz/decide";
import { getAuthzStore } from "../../authz/store";
import {
  listMarketDivisions,
  listAccounts,
} from "../../domains/account/service";
import { listOrgUnits, listTerritories } from "../../domains/planning/service";
import {
  getCatalogStore,
  getPlanningStore,
  getSalesPlanStore,
} from "../../domains/shared/registry";
import { salesRegionTerritories } from "../lib/sales-regions";
import {
  demand,
  canonical,
  emptyContent,
  type PlanContent,
} from "../../domains/planning/plan-model";
import type { AppSession } from "../lib/session";
export type PlanSources = {
  regions: {
    id: string;
    divisionId: string;
    code: string;
    name: string;
    provinces: string[];
  }[];
  accounts: { id: string; name: string; tier: string }[];
  members: { sub: string; name: string }[];
  units: { id: string; name: string }[];
  currency: string;
  canCustomers: boolean;
  canTeam: boolean;
};
export function salesPlanContext(s: AppSession) {
  return {
    workspaceId: s.workspaceId,
    sub: s.user.sub,
    holder: s.authz,
    entitlement: s.entitlement,
    scope: s.scope,
    store: getSalesPlanStore(),
  };
}
export async function loadPlanSources(s: AppSession): Promise<PlanSources> {
  demand(s.scope.kind === "workspace", "plan_scope_required");
  const base = {
    workspaceId: s.workspaceId,
    sub: s.user.sub,
    holder: s.authz,
    entitlement: s.entitlement,
  };
  const canCustomers = can(
    s.authz,
    s.entitlement,
    "account.view",
    "data",
  ).allowed;
  const canTeam = can(
    s.authz,
    s.entitlement,
    "admin.member.view",
    "data",
  ).allowed;
  const [divisions, territories, accounts, members, units, policy] =
    await Promise.all([
      listMarketDivisions({ ...base, store: s.stores.account() }),
      listTerritories({ ...base, store: getPlanningStore() }),
      canCustomers
        ? listAccounts({ ...base, store: s.stores.account() })
        : null,
      canTeam ? getAuthzStore().listMembers(s.workspaceId) : [],
      canTeam ? listOrgUnits({ ...base, store: getPlanningStore() }) : null,
      getCatalogStore().getPricingPolicy(s.workspaceId),
    ]);
  demand(
    divisions.ok &&
      territories.ok &&
      (!accounts || accounts.ok) &&
      (!units || units.ok),
    "source_read_failed",
  );
  const ts = salesRegionTerritories(divisions.value, territories.value);
  return {
    regions: divisions.value.map((d) => {
      const t = ts.find((t) => t.divisionIds.includes(d.id));
      demand(t, "region_unknown");
      return {
        id: t.id,
        divisionId: d.id,
        code: d.code,
        name: d.name,
        provinces: d.members.map((m) => m.label),
      };
    }),
    accounts: accounts?.ok
      ? accounts.value.map((a) => ({ id: a.id, name: a.name, tier: a.tier }))
      : [],
    members: members
      .filter((m) => m.status === "active")
      .map((m) => ({ sub: m.sub, name: m.displayName ?? m.sub })),
    units: units?.ok
      ? units.value.map((u) => ({ id: u.id, name: u.name }))
      : [],
    currency: policy.defaultCurrency,
    canCustomers,
    canTeam,
  };
}
export function checkPlanRead(s: AppSession, content: PlanContent) {
  demand(
    !content.budgets.length ||
      can(s.authz, s.entitlement, "account.view", "data").allowed,
    "plan_source_permission",
  );
  demand(
    !(content.team.length || content.actions.length) ||
      can(s.authz, s.entitlement, "admin.member.view", "data").allowed,
    "plan_source_permission",
  );
}
export function freshPlan(year: number, sources: PlanSources) {
  return emptyContent(
    year,
    sources.regions.map((r) => ({
      ...r,
      included: true,
      reason: "",
      ownerSub: null,
    })),
    sources.currency,
  );
}
export async function verifyPlanSources(
  s: AppSession,
  content: PlanContent,
  sources: PlanSources,
  stampSources = false,
) {
  checkPlanRead(s, content);
  const before = await getSalesPlanStore().read(s.workspaceId, content.year);
  const oldRegions = before?.revisions.flatMap((r) => r.content.regions) ?? [];
  for (const r of content.regions) {
    demand(
      [...sources.regions, ...oldRegions].some(
        (x) =>
          x.id === r.id &&
          x.divisionId === r.divisionId &&
          x.code === r.code &&
          x.name === r.name &&
          JSON.stringify([...x.provinces].sort()) ===
            JSON.stringify([...r.provinces].sort()),
      ),
      "region_unknown",
    );
    demand(
      !r.ownerSub || sources.members.some((m) => m.sub === r.ownerSub),
      "member_unknown",
    );
  }
  for (const b of content.budgets) {
    const a = sources.accounts.find((a) => a.id === b.accountId);
    demand(a && a.name === b.name && a.tier === b.tier, "account_unknown");
    if (stampSources) {
      const unchanged = before?.revisions
        .flatMap((r) => r.content.budgets)
        .find(
          (old) =>
            canonical({ ...old, sourceReadAt: null }) ===
            canonical({ ...b, sourceReadAt: null }),
        );
      b.sourceReadAt = unchanged?.sourceReadAt ?? new Date().toISOString();
    }
    if (b.sourcePlanId) {
      const p = await s.stores
        .account()
        .getAccountPlan(s.workspaceId, b.accountId);
      demand(
        p &&
          p.id === b.sourcePlanId &&
          (p.period === b.period || `Y${p.period}` === b.period) &&
          p.status === "active" &&
          b.metric === "revenue" &&
          p.targetAmount !== null &&
          String(p.targetAmount) === String(Number(b.amount)),
        "budget_source_changed",
      );
    }
  }
  for (const x of content.team) {
    demand(
      !x.memberSub ||
        sources.members.some(
          (m) => m.sub === x.memberSub && m.name === x.memberName,
        ) ||
        before?.revisions.some((r) =>
          r.content.team.some(
            (o) => o.memberSub === x.memberSub && o.memberName === x.memberName,
          ),
        ),
      "member_unknown",
    );
    demand(
      !x.unitId ||
        sources.units.some((u) => u.id === x.unitId && u.name === x.unitName) ||
        before?.revisions.some((r) =>
          r.content.team.some(
            (o) => o.unitId === x.unitId && o.unitName === x.unitName,
          ),
        ),
      "unit_unknown",
    );
  }
  for (const a of content.actions) {
    demand(
      !a.ownerSub || sources.members.some((m) => m.sub === a.ownerSub),
      "member_unknown",
    );
    demand(
      !a.accountId || sources.accounts.some((x) => x.id === a.accountId),
      "account_unknown",
    );
  }
}
