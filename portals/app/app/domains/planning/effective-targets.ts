import { createHash } from "node:crypto";
import { demand, planVersions, type SalesPlan } from "./plan-model";
import { targetValue, type TargetScope } from "./lib/target";
import type { PlanningStore, TargetFilter, TargetRecord } from "./store";
import type { SalesPlanStore } from "./plan-store";
import type { TargetBasis } from "./plan-service";
import { activeReleases } from "./plan-state";
// The registry caches the proxy across server entry points and dev reloads.
// A module-local WeakMap can lose its association while that proxy is live,
// causing an already projected target to be mistaken for an unadopted legacy row.
const rawTargetStoreKey = Symbol.for("yucer.planning.raw-target-store");
function rawTargetStore(store: PlanningStore): PlanningStore {
  return (Reflect.get(store, rawTargetStoreKey) as PlanningStore | undefined) ?? store;
}
const normalize = (p: string) =>
  /^Y?\d{4}$/.test(p) ? `Y${p.replace(/^Y/, "")}` : p;
const matches = (a: TargetScope, b: TargetScope) =>
  normalize(a.period) === normalize(b.period) &&
  a.scopeType === b.scopeType &&
  a.territoryId === b.territoryId &&
  a.ownerSub === b.ownerSub &&
  a.metric === b.metric;
// Projected lines have no sales_target row, but consumers persist references
// to them. A namespaced SHA-256 UUIDv8 gives each workspace/plan/line a stable UUID,
// independent of its value or release version. Adopted database IDs stay intact.
function projectedTargetId(plan: SalesPlan, lineKey: string): string {
  const bytes = createHash("sha256")
    .update(`urn:yucer:sales-plan-target:1:${JSON.stringify([plan.workspaceId, plan.id, lineKey])}`)
    .digest();
  bytes[6] = (bytes[6]! & 0x0f) | 0x80;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export function effectiveTargets(
  legacy: TargetRecord[],
  plans: SalesPlan[],
  at: string,
): TargetRecord[] {
  const out = legacy.filter(
    (t) =>
      !plans.some((p) => {
        const current = planVersions(p, at).current;
        return (
          current &&
          (p.legacy.some((l) => l.targetId === t.id) ||
            (t.status === "closed" &&
              current.content.targets.some(
                (x) =>
                  normalize(t.period) === x.period &&
                  t.metric === x.metric &&
                  x.scope ===
                    (t.scopeType === "workspace"
                      ? "workspace"
                      : t.scopeType === "territory"
                        ? `territory:${t.territoryId}`
                        : "owner"),
              )))
        );
      }),
  );
  for (const plan of plans) {
    const current = planVersions(plan, at).current;
    if (!current) continue;
    for (const t of current.content.targets.filter((t) => t.target !== null)) {
      const scope: TargetScope = {
        period: t.period,
        metric: t.metric,
        scopeType: t.scope === "workspace" ? "workspace" : "territory",
        territoryId: t.scope === "workspace" ? null : t.scope.slice(10),
        ownerSub: null,
      };
      const adopted = legacy.find(
        (x) =>
          matches(x, scope) && plan.legacy.some((l) => l.targetId === x.id),
      );
      demand(
        !out.some(
          (x) =>
            matches(x, scope) &&
            (x.targetValue.unit === "count"
              ? t.currency === null
              : x.targetValue.currency === t.currency),
        ),
        "unadopted_target_conflict",
      );
      out.push({
        ...scope,
        id: adopted?.id ?? projectedTargetId(plan, t.key),
        ...(adopted ? {} : { legacyProjectionId: `plan_${t.key}` }),
        workspaceId: plan.workspaceId,
        managedBySalesPlan: true,
        status: "committed",
        planId: adopted?.planId ?? null,
        targetValue: targetValue(
          t.metric,
          Number(t.target),
          t.currency ?? "CNY",
        ),
      });
    }
  }
  return out;
}
export function withSalesPlanTargets(
  raw: PlanningStore,
  versions: SalesPlanStore,
): PlanningStore {
  const managed = async (ws: string, scope: TargetScope) =>
    (await versions.list(ws)).some((plan) => {
      const state = planVersions(plan, new Date().toISOString());
      const current =
        state.current ??
        state.scheduled ??
        plan.revisions.find((r) => r.state === "sealed");
      return (
        current &&
        current.content.periods.some(
          (p) => p.key === normalize(scope.period),
        ) &&
        (scope.scopeType === "workspace" ||
          (scope.scopeType === "territory" &&
            current.content.regions.some((r) => r.id === scope.territoryId)))
      );
    });
  const all = async (ws: string) =>
    effectiveTargets(
      await raw.listTargets(ws),
      await versions.list(ws),
      new Date().toISOString(),
    );
  const wrapped = new Proxy(raw, {
    get(target, prop) {
      if (prop === rawTargetStoreKey) return target;
      if (prop === "isManagedScope") return managed;
      if (prop === "listTargets")
        return async (ws: string, filter: TargetFilter = {}) =>
          (await all(ws)).filter(
            (t) =>
              (!filter.period ||
                normalize(t.period) === normalize(filter.period)) &&
              (!filter.status || t.status === filter.status) &&
              (!filter.territoryId || t.territoryId === filter.territoryId) &&
              (!filter.ownerSub || t.ownerSub === filter.ownerSub),
          );
      if (prop === "getTarget")
        return async (ws: string, id: string) =>
          (await all(ws)).find((t) => t.id === id) ?? null;
      if (prop === "updateTarget" || prop === "removeTarget")
        return async (ws: string, id: string, ...args: unknown[]) => {
          demand(
            !id.startsWith("plan_") &&
              !(await all(ws)).some((t) => t.id === id && t.managedBySalesPlan) &&
              !(await versions.adopted(ws, id)),
            "managed_by_sales_plan",
          );
          return (
            Reflect.get(target, prop) as (...a: unknown[]) => unknown
          ).call(target, ws, id, ...args);
        };
      if (prop === "createTarget")
        return async (ws: string, row: TargetRecord) => {
          demand(!(await managed(ws, row)), "managed_by_sales_plan");
          demand(
            !(await all(ws)).some(
              (t) =>
                matches(t, row) &&
                (t.managedBySalesPlan || t.status === "committed"),
            ),
            "target_exists",
          );
          return target.createTarget(ws, row);
        };
      if (prop === "constructor") return target.constructor;
      const value = Reflect.get(target, prop);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return wrapped;
}
export async function resolveForecastTargetBasis(
  store: PlanningStore,
  versions: SalesPlanStore,
  workspaceId: string,
  scope: Omit<TargetScope, "metric">,
  currency?: string,
): Promise<TargetBasis[]> {
  const at = new Date().toISOString();
  const plans = await versions.list(workspaceId);
  // Derive targets from this exact immutable timeline snapshot. Re-entering
  // the wrapper here could observe a concurrent release and mix two baselines.
  const rows = effectiveTargets(
    (await rawTargetStore(store).listTargets(workspaceId)).filter((t) => normalize(t.period) === normalize(scope.period)),
    plans,
    at,
  );
  return ["revenue", "pipeline", "new_logo", "margin"].map((metric) => {
    const t = rows.find(
      (t) =>
        matches(t, { ...scope, metric: metric as TargetScope["metric"] }) &&
        t.status === "committed" &&
        (!currency ||
          t.targetValue.unit === "count" ||
          t.targetValue.currency === currency),
    );
    for (const plan of plans) {
      const revision = planVersions(plan, at).current;
      const line = revision?.content.targets.find(
        (l) =>
          l.period === normalize(scope.period) &&
          l.metric === metric &&
          (!currency || l.currency === null || l.currency === currency) &&
          l.scope ===
            (scope.scopeType === "workspace"
              ? "workspace"
              : `territory:${scope.territoryId}`),
      );
      if (line && scope.scopeType !== "owner")
        return {
          metric,
          sourceKind: "sales_plan" as const,
          revisionId: revision!.id,
          lineKey: line.key,
          legacyTargetId: null,
          version: revision!.version,
          target: line.target,
          currency: line.currency,
          resolvedAt: at,
          planId: plan.id,
        };
    }
    return {
      metric,
      sourceKind: t ? ("legacy" as const) : ("none" as const),
      revisionId: null,
      lineKey: null,
      legacyTargetId: t?.id ?? null,
      version: null,
      target: t ? String(t.targetValue.amount) : null,
      currency: t?.targetValue.unit === "money" ? t.targetValue.currency : null,
      resolvedAt: at,
    };
  });
}

export async function readEffectiveTargetSnapshot(
  store: PlanningStore,
  versions: SalesPlanStore,
  workspaceId: string,
  at: string,
  selection?: { year: number; revisionId: string },
) {
  const plans = await versions.list(workspaceId);
  const legacy = await rawTargetStore(store).listTargets(workspaceId);
  let targetPlans = plans;
  if (selection) {
    const plan = plans.find(p => p.year === selection.year);
    const selected = plan?.revisions.find(r => r.id === selection.revisionId && r.state === "sealed");
    const releases = plan ? activeReleases(plan, at).filter(e => e.effectiveAt <= at) : [];
    demand(selected && releases.some(e => e.revisionId === selected.id), "attainment_revision_unavailable");
    const baseline = planVersions(plan!, at).baseline;
    // Preserve the immutable first release and chosen release. Later releases
    // must not replace the explicitly selected comparison denominator.
    targetPlans = plans.map(p => p !== plan ? p : { ...p, events: p.events.filter(e =>
      e.kind !== "release" || e.revisionId === selected!.id || e.revisionId === baseline?.id,
    ) });
  }
  return { targets: effectiveTargets(legacy, targetPlans, at), plans };
}
