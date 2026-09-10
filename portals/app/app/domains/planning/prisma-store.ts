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

  async listOrgMembers(workspaceId: string): Promise<Map<string, string>> {
    const p = await getPrismaClient();
    const rows = (await p.orgUnitMember.findMany({ where: { workspaceId } })) as Array<{ sub: string; unitId: string }>;
    return new Map(rows.map((r) => [r.sub, r.unitId]));
  }

  async setMemberUnit(workspaceId: string, sub: string, unitId: string | null): Promise<void> {
    const p = await getPrismaClient();
    if (unitId === null) {
      await p.orgUnitMember.deleteMany({ where: { workspaceId, sub } });
      return;
    }
    const update = { unitId, updatedAt: new Date() };
    locked(ORG_MEMBER_TABLE, update);
    await p.orgUnitMember.upsert({ where: { workspaceId_sub: { workspaceId, sub } }, update, create: { workspaceId, sub, unitId } });
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
    const update = {
      name: input.name,
      parentId: input.parentId,
      ownerSub: input.ownerSub,
      status: input.status,
      regions: input.regions,
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
    return toTerritory(row as Record<string, unknown>);
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

function toTerritory(r: Record<string, unknown>): TerritoryRecord {
  return {
    id: String(r.id),
    workspaceId: String(r.workspaceId),
    territoryCode: String(r.territoryCode),
    name: String(r.name),
    parentId: (r.parentId as string | null) ?? null,
    // Tolerant of pre-0017 rows: absent reads as covering nothing, the same
    // answer an empty list gives and the safe one for a router.
    regions: Array.isArray(r.regions) ? (r.regions as unknown[]).map(String) : [],
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
