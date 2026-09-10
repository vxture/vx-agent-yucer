import { getPrismaClient } from "../../lib/db";
import { assertWritable } from "../shared/column-locks";
import { DEFAULT_ORG_KINDS, type OrgTemplate, type OrgUnitDraft } from "./lib/org";
import { DEFAULT_CURRENCY, money } from "../shared/money";
import type { TerritoryDraft } from "./lib/territory";
import { currencyOf, targetValue, type PublishedTotals, type SalesTarget, type TargetMetric, type TargetScope, type TargetStatus, type TargetValue } from "./lib/target";
import type { OrgKindRecord, OrgUnitRecord, PlanningStore, TargetFilter, TargetRecord, TerritoryRecord } from "./store";

// Prisma-backed PlanningStore over yucer_gtm.
//
// The scope tuple never appears in an update. createTarget writes it once;
// updateTarget's data object is built field by field from a patch type that has
// no scope fields at all, so there is no path by which a commitment silently
// moves between people or periods.
//
// closedAmountFor reads D6's forecast snapshots. D2 sets targets, D6 computes
// achievement, and neither writes the other's data - so attainment reads the
// snapshot rather than recomputing a closed amount that already has an owner.

const TARGET_TABLE = "yucer_gtm.sales_target";
const TERRITORY_TABLE = "yucer_gtm.territory";
const ORG_KIND_TABLE = "yucer_gtm.org_unit_kind";
const ORG_UNIT_TABLE = "yucer_gtm.org_unit";
const ORG_MEMBER_TABLE = "yucer_gtm.org_unit_member";

type KindRow = { id: string; workspaceId: string; kindCode: string; name: string; sortOrder: number };
type UnitRow = { id: string; workspaceId: string; unitCode: string; name: string; kindId: string; parentId: string | null; leaderSub: string | null; sortOrder: number };
const toKind = (r: KindRow): OrgKindRecord => ({ id: r.id, workspaceId: r.workspaceId, kindCode: r.kindCode, name: r.name, sortOrder: r.sortOrder });
const toUnit = (r: UnitRow): OrgUnitRecord => ({
  id: r.id, workspaceId: r.workspaceId, unitCode: r.unitCode, name: r.name, kindId: r.kindId,
  parentId: r.parentId, leaderSub: r.leaderSub, sortOrder: r.sortOrder,
});
/** The 0051 whitelist, checked before every UPDATE the org verbs make. */
function locked(table: string, patch: Record<string, unknown>): void {
  const guard = assertWritable(table, patch);
  if (!guard.ok) throw new Error(`refusing to write a locked column: ${guard.violations.map((v) => v.message).join("; ")}`);
}

export class PrismaPlanningStore implements PlanningStore {
  /* --- 组织结构 (incr/0051) ------------------------------------------------ */

  async listOrgKinds(workspaceId: string): Promise<OrgKindRecord[]> {
    const p = await getPrismaClient();
    const rows = await p.orgUnitKind.findMany({ where: { workspaceId }, orderBy: [{ sortOrder: "asc" }, { kindCode: "asc" }] });
    return (rows as KindRow[]).map(toKind);
  }

  async upsertOrgKind(workspaceId: string, input: { kindCode: string; name: string }): Promise<OrgKindRecord> {
    const p = await getPrismaClient();
    const update = { name: input.name, updatedAt: new Date() };
    locked(ORG_KIND_TABLE, update);
    const tail = await p.orgUnitKind.aggregate({ where: { workspaceId }, _max: { sortOrder: true } });
    const row = await p.orgUnitKind.upsert({
      where: { workspaceId_kindCode: { workspaceId, kindCode: input.kindCode } },
      update,
      create: { workspaceId, kindCode: input.kindCode, name: input.name, sortOrder: (tail._max?.sortOrder ?? 0) + 1 },
    });
    return toKind(row as KindRow);
  }

  async setOrgKindOrder(workspaceId: string, orders: readonly { id: string; sortOrder: number }[]): Promise<void> {
    const p = await getPrismaClient();
    for (const o of orders) {
      const data = { sortOrder: o.sortOrder, updatedAt: new Date() };
      locked(ORG_KIND_TABLE, data);
      await p.orgUnitKind.updateMany({ where: { workspaceId, id: o.id }, data });
    }
  }

  async removeOrgKind(workspaceId: string, kindId: string): Promise<boolean> {
    const p = await getPrismaClient();
    // org_unit.kind_id RESTRICTs; the service refuses before this is reached.
    const { count } = await p.orgUnitKind.deleteMany({ where: { workspaceId, id: kindId } });
    return count > 0;
  }

  async countUnitsOfKind(workspaceId: string, kindId: string): Promise<number> {
    const p = await getPrismaClient();
    return p.orgUnit.count({ where: { workspaceId, kindId } });
  }

  async listOrgUnits(workspaceId: string): Promise<OrgUnitRecord[]> {
    const p = await getPrismaClient();
    const rows = (await p.orgUnit.findMany({ where: { workspaceId }, orderBy: [{ sortOrder: "asc" }, { unitCode: "asc" }] })) as UnitRow[];
    // Tree order, as the memory store gives it: parents first, siblings by order.
    const out: OrgUnitRecord[] = [];
    const walk = (parentId: string | null) => {
      for (const r of rows.filter((x) => x.parentId === parentId)) {
        out.push(toUnit(r));
        walk(r.id);
      }
    };
    walk(null);
    return out;
  }

  async upsertOrgUnit(workspaceId: string, input: OrgUnitDraft & { sortOrder?: number }): Promise<OrgUnitRecord> {
    const p = await getPrismaClient();
    const update = {
      name: input.name,
      kindId: input.kindId,
      parentId: input.parentId,
      leaderSub: input.leaderSub,
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      updatedAt: new Date(),
    };
    locked(ORG_UNIT_TABLE, update);
    let sortOrder = input.sortOrder;
    if (sortOrder === undefined) {
      const tail = await p.orgUnit.aggregate({ where: { workspaceId, parentId: input.parentId }, _max: { sortOrder: true } });
      sortOrder = (tail._max?.sortOrder ?? 0) + 1;
    }
    const row = await p.orgUnit.upsert({
      where: { workspaceId_unitCode: { workspaceId, unitCode: input.unitCode } },
      update,
      create: {
        workspaceId, unitCode: input.unitCode, name: input.name, kindId: input.kindId,
        parentId: input.parentId, leaderSub: input.leaderSub, sortOrder,
      },
    });
    return toUnit(row as UnitRow);
  }

  async setOrgUnitOrder(workspaceId: string, orders: readonly { id: string; sortOrder: number }[]): Promise<void> {
    const p = await getPrismaClient();
    for (const o of orders) {
      const data = { sortOrder: o.sortOrder, updatedAt: new Date() };
      locked(ORG_UNIT_TABLE, data);
      await p.orgUnit.updateMany({ where: { workspaceId, id: o.id }, data });
    }
  }

  async removeOrgUnit(workspaceId: string, unitId: string): Promise<boolean> {
    const p = await getPrismaClient();
    // Children RESTRICT underneath (the service refuses first); memberships
    // CASCADE with the unit.
    const { count } = await p.orgUnit.deleteMany({ where: { workspaceId, id: unitId } });
    return count > 0;
  }

  async listOrgMembers(workspaceId: string): Promise<Map<string, string[]>> {
    const p = await getPrismaClient();
    // Tree order for the unit list, so a person's units read the way the
    // tree draws them - the same order the memory adapter gives.
    const [rows, units] = await Promise.all([
      p.orgUnitMember.findMany({ where: { workspaceId } }) as Promise<Array<{ sub: string; unitId: string }>>,
      this.listOrgUnits(workspaceId),
    ]);
    const order = new Map(units.map((u, i) => [u.id, i]));
    const out = new Map<string, string[]>();
    for (const r of rows) (out.get(r.sub) ?? out.set(r.sub, []).get(r.sub)!).push(r.unitId);
    for (const list of out.values()) list.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
    return out;
  }

  async setMemberUnits(workspaceId: string, sub: string, unitIds: readonly string[]): Promise<void> {
    const p = await getPrismaClient();
    // A PAIR TABLE (incr/0053): the set is reconciled by delete and insert,
    // never by an UPDATE - there is no grant for one. Pairs that stay are
    // left alone, so updated_at still says when each placement was made.
    const want = new Set(unitIds);
    const have = (await p.orgUnitMember.findMany({ where: { workspaceId, sub } })) as Array<{ unitId: string }>;
    const gone = have.filter((r) => !want.has(r.unitId)).map((r) => r.unitId);
    const fresh = [...want].filter((id) => !have.some((r) => r.unitId === id));
    if (gone.length > 0) await p.orgUnitMember.deleteMany({ where: { workspaceId, sub, unitId: { in: gone } } });
    if (fresh.length > 0) await p.orgUnitMember.createMany({ data: fresh.map((unitId) => ({ workspaceId, sub, unitId })) });
  }

  async listOrgTemplates(): Promise<OrgTemplate[]> {
    const p = await getPrismaClient();
    const [templates, units] = await Promise.all([
      p.orgTemplate.findMany({ orderBy: { sortOrder: "asc" } }) as Promise<Array<{ id: string; templateKey: string; name: string; description: string; isDefault: boolean }>>,
      p.orgTemplateUnit.findMany({ orderBy: { sortOrder: "asc" } }) as Promise<Array<{ id: string; templateId: string; unitCode: string; parentId: string | null; kindCode: string; name: string }>>,
    ]);
    const codeById = new Map(units.map((u) => [u.id, u.unitCode]));
    return templates.map((t) => ({
      key: t.templateKey,
      name: t.name,
      description: t.description,
      isDefault: t.isDefault,
      units: units
        .filter((u) => u.templateId === t.id)
        .map((u) => ({ code: u.unitCode, parent: u.parentId ? (codeById.get(u.parentId) ?? null) : null, kind: u.kindCode, name: u.name })),
    }));
  }

  async seedOrgDefaults(workspaceId: string): Promise<boolean> {
    const p = await getPrismaClient();
    if ((await p.orgUnitKind.count({ where: { workspaceId } })) > 0) return false;
    await p.orgUnitKind.createMany({
      data: DEFAULT_ORG_KINDS.map((k, i) => ({ workspaceId, kindCode: k.code, name: k.name, sortOrder: i + 1 })),
      skipDuplicates: true,
    });
    if ((await p.orgUnit.count({ where: { workspaceId } })) === 0) {
      const templates = await this.listOrgTemplates();
      const t = templates.find((x) => x.isDefault) ?? templates[0];
      if (t) await this.applyOrgTemplate(workspaceId, t);
    }
    return true;
  }

  /** Copy a template in, in tree order; the service's reset uses it too. */
  async applyOrgTemplate(workspaceId: string, template: OrgTemplate): Promise<void> {
    const kinds = new Map((await this.listOrgKinds(workspaceId)).map((k) => [k.kindCode, k.id]));
    const ids = new Map<string, string>();
    for (const [i, u] of template.units.entries()) {
      const kindId = kinds.get(u.kind);
      if (!kindId) throw new Error(`template kind ${u.kind} is not a kind of this workspace`);
      const row = await this.upsertOrgUnit(workspaceId, {
        unitCode: u.code, name: u.name, kindId, parentId: u.parent ? (ids.get(u.parent) ?? null) : null, leaderSub: null, sortOrder: i + 1,
      });
      ids.set(u.code, row.id);
    }
  }

  async listTargets(workspaceId: string, filter: TargetFilter = {}): Promise<TargetRecord[]> {
    const p = await getPrismaClient();
    const rows = await p.salesTarget.findMany({
      where: {
        workspaceId,
        ...(filter.period ? { period: filter.period } : {}),
        ...(filter.ownerSub ? { ownerSub: filter.ownerSub } : {}),
        ...(filter.territoryId ? { territoryId: filter.territoryId } : {}),
        ...(filter.status ? { status: filter.status } : {}),
      },
      orderBy: [{ period: "desc" }, { scopeType: "asc" }],
    });
    return rows.map((r: Record<string, unknown>) => toTarget(r));
  }

  async getTarget(workspaceId: string, id: string): Promise<TargetRecord | null> {
    const p = await getPrismaClient();
    const row = await p.salesTarget.findFirst({ where: { id, workspaceId } });
    return row ? toTarget(row as Record<string, unknown>) : null;
  }

  async upsertTerritory(workspaceId: string, input: TerritoryDraft): Promise<TerritoryRecord> {
    const p = await getPrismaClient();
    // `regions` is NOT written since 0052: the names are derived from the
    // division links below, and a stored copy would be a second truth.
    const update = {
      name: input.name,
      parentId: input.parentId,
      ownerSub: input.ownerSub,
      status: input.status,
      updatedAt: new Date(),
    };
    // The update half only - the create half writes the anchor once, which is
    // exactly what the column lock permits and what assertWritable checks.
    const guard = assertWritable(TERRITORY_TABLE, update);
    if (!guard.ok) {
      throw new Error(
        `refusing to write a locked territory column: ${guard.violations.map((v) => v.message).join("; ")}`,
      );
    }
    const row = await p.territory.upsert({
      where: { workspaceId_territoryCode: { workspaceId, territoryCode: input.territoryCode } },
      update,
      create: { workspaceId, territoryCode: input.territoryCode, ...update },
    });
    const territoryId = String(row.id);
    // THE TWO LINKS, REPLACED WHOLESALE (0052): a pair has no third column to
    // change, so a change is a delete and an insert - the member_territory
    // shape. An unknown id is refused by the foreign key.
    await p.territoryDivision.deleteMany({ where: { workspaceId, territoryId } });
    if ((input.divisionIds ?? []).length > 0) {
      await p.territoryDivision.createMany({
        data: (input.divisionIds ?? []).map((divisionId) => ({ workspaceId, territoryId, divisionId })),
        skipDuplicates: true,
      });
    }
    await p.territoryUnit.deleteMany({ where: { workspaceId, territoryId } });
    if ((input.unitIds ?? []).length > 0) {
      await p.territoryUnit.createMany({
        data: (input.unitIds ?? []).map((unitId) => ({ workspaceId, territoryId, unitId })),
        skipDuplicates: true,
      });
    }
    const fresh = await p.territory.findUniqueOrThrow({ where: { id: territoryId }, include: TERRITORY_LINKS });
    return toTerritory(fresh as Record<string, unknown>);
  }

  async detachUnitFromTerritories(workspaceId: string, unitId: string): Promise<number> {
    const p = await getPrismaClient();
    const { count } = await p.territoryUnit.deleteMany({ where: { workspaceId, unitId } });
    return count;
  }

  async createTarget(workspaceId: string, target: SalesTarget): Promise<TargetRecord> {
    const p = await getPrismaClient();
    const row = await p.salesTarget.create({
      data: {
        workspaceId,
        planId: target.planId,
        period: target.period,
        scopeType: target.scopeType,
        territoryId: target.territoryId,
        ownerSub: target.ownerSub,
        metric: target.metric,
        targetAmount: target.targetValue.amount,
        // NULL for a count metric - incr/0013's CHECK enforces the pairing, and
        // currencyOf is the single place that decides it.
        currency: currencyOf(target.targetValue),
        status: target.status,
      },
    });
    return toTarget(row as Record<string, unknown>);
  }

  async updateTarget(
    workspaceId: string,
    id: string,
    patch: { targetValue?: TargetValue; status?: TargetStatus; planId?: string | null },
  ): Promise<boolean> {
    const p = await getPrismaClient();
    const data: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.status !== undefined) data.status = patch.status;
    if (patch.planId !== undefined) data.planId = patch.planId;
    if (patch.targetValue !== undefined) {
      data.targetAmount = patch.targetValue.amount;
      data.currency = currencyOf(patch.targetValue);
    }

    const guard = assertWritable(TARGET_TABLE, data);
    if (!guard.ok) {
      throw new Error(
        `refusing to write the target scope tuple: ${guard.violations.map((v) => v.message).join("; ")}`,
      );
    }

    const res = await p.salesTarget.updateMany({ where: { id, workspaceId }, data });
    return res.count > 0;
  }

  async listTerritories(
    workspaceId: string,
    opts: { includeRetired?: boolean } = {},
  ): Promise<TerritoryRecord[]> {
    const p = await getPrismaClient();
    const rows = await p.territory.findMany({
      // Active only by DEFAULT, and explicit about it. This adapter filtered on
      // status while the in-memory one did not, so the two answered the same
      // question differently: every test saw retired rows and production never
      // did. The default is the one the scope selector needs - you should not
      // be able to set a target on a region that has been wound down - and the
      // management panel asks for the rest by name.
      where: { workspaceId, ...(opts.includeRetired ? {} : { status: "active" }) },
      orderBy: { territoryCode: "asc" },
      include: TERRITORY_LINKS,
    });
    return rows.map((r: Record<string, unknown>) => toTerritory(r));
  }

  async publishedTotalsFor(workspaceId: string, scope: TargetScope): Promise<PublishedTotals | null> {
    const p = await getPrismaClient();
    // The LATEST snapshot for the scope. Snapshots are append-only and a period
    // accumulates many; attainment is measured against the most recent one, and
    // the older ones are what forecast accuracy is computed from.
    const row = await p.forecastSnapshot.findFirst({
      where: {
        workspaceId,
        period: scope.period,
        scopeType: scope.scopeType,
        territoryId: scope.territoryId,
        ownerSub: scope.ownerSub,
      },
      orderBy: { snapshotAt: "desc" },
    });
    if (!row) return null;
    return {
      closedAmount: money(Number(String(row.closedAmount)), String(row.currency)),
      pipelineAmount: money(Number(String(row.pipelineAmount)), String(row.currency)),
      newLogoCount: row.newLogoCount ?? null,
    };
  }
}

/* THE JOINTS, read with the row (0052): the unit ids, and the 大区 ids WITH
   THEIR CURRENT NAMES - a read-only reference into yucer_core, which is what
   "other domains reference it read-only" permits and the foreign key
   already states. */
const TERRITORY_LINKS = {
  units: { select: { unitId: true } },
  divisions: { select: { divisionId: true, division: { select: { name: true } } } },
} as const;

function toTerritory(r: Record<string, unknown>): TerritoryRecord {
  const units = (r.units as Array<{ unitId: string }> | undefined) ?? [];
  const divisions = (r.divisions as Array<{ divisionId: string; division: { name: string } }> | undefined) ?? [];
  return {
    id: String(r.id),
    workspaceId: String(r.workspaceId),
    territoryCode: String(r.territoryCode),
    name: String(r.name),
    parentId: (r.parentId as string | null) ?? null,
    // DERIVED from the links, never from the column: since 0052 the names
    // follow the 大区's current row, and the column is the pre-0052 remainder.
    regions: divisions.map((d) => d.division.name),
    divisionIds: divisions.map((d) => d.divisionId),
    unitIds: units.map((u) => u.unitId),
    ownerSub: (r.ownerSub as string | null) ?? null,
    status: String(r.status),
  };
}

function toTarget(r: Record<string, unknown>): TargetRecord {
  return {
    id: String(r.id),
    workspaceId: String(r.workspaceId),
    period: String(r.period),
    scopeType: r.scopeType as TargetScope["scopeType"],
    territoryId: (r.territoryId as string | null) ?? null,
    ownerSub: (r.ownerSub as string | null) ?? null,
    metric: r.metric as TargetMetric,
    // The unit is derived from the metric, never read back from the row: a row
    // whose currency disagreed with its metric would otherwise reintroduce the
    // exact ambiguity incr/0013 removed.
    targetValue: targetValue(
      r.metric as TargetMetric,
      Number(String(r.targetAmount)),
      r.currency == null ? DEFAULT_CURRENCY : String(r.currency),
    ),
    status: r.status as TargetStatus,
    planId: (r.planId as string | null) ?? null,
  };
}
