// D2 planning persistence port.
//
// The scope tuple (period, scope_type, territory_id, owner_sub, metric) is a
// target's IDENTITY, not a set of attributes, and the port says so: createTarget
// takes the tuple, updateTarget does not accept it at any position. A different
// scope is a different target, and the old one is closed rather than edited -
// otherwise a commitment silently moves between people or periods while keeping
// its history.

import type { Money } from "../shared/money";
import type { PublishedTotals, SalesTarget, TargetScope, TargetStatus, TargetValue } from "./lib/target";
import type { TerritoryDraft } from "./lib/territory";
import { DEFAULT_ORG_KINDS, ORG_TEMPLATES, defaultOrgTemplate, type OrgTemplate, type OrgUnitDraft } from "./lib/org";

export interface TargetRecord extends SalesTarget {
  id: string;
  workspaceId: string;
}

export interface TerritoryRecord {
  id: string;
  workspaceId: string;
  territoryCode: string;
  name: string;
  parentId: string | null;
  ownerSub: string | null;
  /** The regions this territory covers - see 0017. Empty covers NOTHING. */
  regions: readonly string[];
  status: string;
}

export interface TargetFilter {
  period?: string;
  ownerSub?: string;
  territoryId?: string;
  status?: TargetStatus;
}

/** One row of the 单位类型 vocabulary (incr/0051). */
export interface OrgKindRecord {
  id: string;
  workspaceId: string;
  kindCode: string;
  name: string;
  sortOrder: number;
}

/** One unit of the organisation (incr/0051). */
export interface OrgUnitRecord {
  id: string;
  workspaceId: string;
  unitCode: string;
  name: string;
  kindId: string;
  parentId: string | null;
  leaderSub: string | null;
  sortOrder: number;
}

export interface PlanningStore {
  /* --- 组织结构 (incr/0051) --------------------------------------------------
     The unit tree, its kind vocabulary, who belongs where, and the shipped
     templates. Every write stays inside 0051's UPDATE whitelist: a code is
     never rewritten, a membership is replaced whole. */
  listOrgKinds(workspaceId: string): Promise<OrgKindRecord[]>;
  upsertOrgKind(workspaceId: string, input: { kindCode: string; name: string }): Promise<OrgKindRecord>;
  setOrgKindOrder(workspaceId: string, orders: readonly { id: string; sortOrder: number }[]): Promise<void>;
  removeOrgKind(workspaceId: string, kindId: string): Promise<boolean>;
  countUnitsOfKind(workspaceId: string, kindId: string): Promise<number>;
  /** In tree order: parents before children, siblings by sort_order. */
  listOrgUnits(workspaceId: string): Promise<OrgUnitRecord[]>;
  upsertOrgUnit(workspaceId: string, input: OrgUnitDraft & { sortOrder?: number }): Promise<OrgUnitRecord>;
  setOrgUnitOrder(workspaceId: string, orders: readonly { id: string; sortOrder: number }[]): Promise<void>;
  /** False when the id is not here. Throws while children stand under it. */
  removeOrgUnit(workspaceId: string, unitId: string): Promise<boolean>;
  /** sub -> unit id, for every placed member of the workspace. */
  listOrgMembers(workspaceId: string): Promise<Map<string, string>>;
  /** Place a member in a unit, or in none. Replaces. */
  setMemberUnit(workspaceId: string, sub: string, unitId: string | null): Promise<void>;
  /** The shipped templates - the table for Prisma, the mirror for memory. */
  listOrgTemplates(): Promise<OrgTemplate[]>;
  /**
   * FIRST CONTACT: a workspace with no kinds at all gets the kinds and the
   * default template together. A workspace that HAS kinds is one somebody
   * has touched, and its tree - even an empty one - is left alone; 重置预置
   * is the way back. Returns true when it seeded. */
  seedOrgDefaults(workspaceId: string): Promise<boolean>;
  /** Copy a template's units in, on top of whatever is there (upsert by code). */
  applyOrgTemplate(workspaceId: string, template: OrgTemplate): Promise<void>;

  listTargets(workspaceId: string, filter?: TargetFilter): Promise<TargetRecord[]>;
  getTarget(workspaceId: string, id: string): Promise<TargetRecord | null>;
  /** The scope tuple is supplied once, here, and never again. */
  createTarget(workspaceId: string, target: SalesTarget): Promise<TargetRecord>;
  /** Only the number, the state and the plan link move. */
  updateTarget(
    workspaceId: string,
    id: string,
    patch: { targetValue?: TargetValue; status?: TargetStatus; planId?: string | null },
  ): Promise<boolean>;

  /** Active territories, unless the caller asks for the retired ones too. */
  listTerritories(
    workspaceId: string,
    opts?: { includeRetired?: boolean },
  ): Promise<TerritoryRecord[]>;
  /**
   * UPSERT BY CODE, not by id. `territory_code` is the anchor the DDL marks
   * immutable and the column locks refuse UPDATE on, and it is what a person
   * types; ids are generated. Keying on it means importing the same regional
   * structure twice updates rather than duplicating - the way a territory list
   * actually arrives.
   */
  upsertTerritory(workspaceId: string, input: TerritoryDraft): Promise<TerritoryRecord>;
  /**
   * The published numbers for a scope and period, read from D6's snapshot.
   *
   * WAS `closedAmountFor`, returning one Money. That shape is what let `metric`
   * be ignored: with only a closed amount on offer, every metric was measured
   * against it. Returning the whole published set makes choosing the numerator
   * a decision the rule layer has to actually make - see `measure`.
   *
   * D2 sets targets and D6 computes achievement; neither writes the other's
   * data, and this port is the seam.
   */
  publishedTotalsFor(workspaceId: string, scope: TargetScope): Promise<PublishedTotals | null>;
}

export class InMemoryPlanningStore implements PlanningStore {
  private orgKinds: OrgKindRecord[] = [];
  private orgUnits: OrgUnitRecord[] = [];
  /** `${workspaceId}|${sub}` -> unit id */
  private orgMembers = new Map<string, string>();

  async listOrgKinds(workspaceId: string): Promise<OrgKindRecord[]> {
    return this.orgKinds
      .filter((k) => k.workspaceId === workspaceId)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.kindCode.localeCompare(b.kindCode))
      .map((k) => ({ ...k }));
  }

  async upsertOrgKind(workspaceId: string, input: { kindCode: string; name: string }): Promise<OrgKindRecord> {
    const at = this.orgKinds.findIndex((k) => k.workspaceId === workspaceId && k.kindCode === input.kindCode);
    if (at >= 0) {
      this.orgKinds[at] = { ...this.orgKinds[at]!, name: input.name };
      return { ...this.orgKinds[at]! };
    }
    const tail = Math.max(0, ...this.orgKinds.filter((k) => k.workspaceId === workspaceId).map((k) => k.sortOrder));
    const row: OrgKindRecord = { id: `kind_${++this.seq}`, workspaceId, kindCode: input.kindCode, name: input.name, sortOrder: tail + 1 };
    this.orgKinds.push(row);
    return { ...row };
  }

  async setOrgKindOrder(workspaceId: string, orders: readonly { id: string; sortOrder: number }[]): Promise<void> {
    const want = new Map(orders.map((o) => [o.id, o.sortOrder]));
    this.orgKinds = this.orgKinds.map((k) => (k.workspaceId === workspaceId && want.has(k.id) ? { ...k, sortOrder: want.get(k.id)! } : k));
  }

  async removeOrgKind(workspaceId: string, kindId: string): Promise<boolean> {
    if ((await this.countUnitsOfKind(workspaceId, kindId)) > 0) throw new Error(`kind ${kindId} still has units`);
    const before = this.orgKinds.length;
    this.orgKinds = this.orgKinds.filter((k) => !(k.workspaceId === workspaceId && k.id === kindId));
    return this.orgKinds.length < before;
  }

  async countUnitsOfKind(workspaceId: string, kindId: string): Promise<number> {
    return this.orgUnits.filter((u) => u.workspaceId === workspaceId && u.kindId === kindId).length;
  }

  async listOrgUnits(workspaceId: string): Promise<OrgUnitRecord[]> {
    const mine = this.orgUnits.filter((u) => u.workspaceId === workspaceId);
    const out: OrgUnitRecord[] = [];
    const walk = (parentId: string | null) => {
      for (const u of mine.filter((x) => x.parentId === parentId).sort((a, b) => a.sortOrder - b.sortOrder || a.unitCode.localeCompare(b.unitCode))) {
        out.push({ ...u });
        walk(u.id);
      }
    };
    walk(null);
    return out;
  }

  async upsertOrgUnit(workspaceId: string, input: OrgUnitDraft & { sortOrder?: number }): Promise<OrgUnitRecord> {
    if (!this.orgKinds.some((k) => k.workspaceId === workspaceId && k.id === input.kindId)) {
      throw new Error(`kind ${input.kindId} is not a kind of this workspace`);
    }
    const held = this.orgUnits.find((u) => u.workspaceId === workspaceId && u.unitCode === input.unitCode);
    if (held) {
      held.name = input.name; held.parentId = input.parentId; held.kindId = input.kindId; held.leaderSub = input.leaderSub;
      if (input.sortOrder !== undefined) held.sortOrder = input.sortOrder;
      return { ...held };
    }
    const siblings = this.orgUnits.filter((u) => u.workspaceId === workspaceId && u.parentId === input.parentId);
    const row: OrgUnitRecord = {
      id: `unit_${++this.seq}`, workspaceId, unitCode: input.unitCode, name: input.name, kindId: input.kindId,
      parentId: input.parentId, leaderSub: input.leaderSub,
      sortOrder: input.sortOrder ?? Math.max(0, ...siblings.map((u) => u.sortOrder)) + 1,
    };
    this.orgUnits.push(row);
    return { ...row };
  }

  async setOrgUnitOrder(workspaceId: string, orders: readonly { id: string; sortOrder: number }[]): Promise<void> {
    const want = new Map(orders.map((o) => [o.id, o.sortOrder]));
    for (const u of this.orgUnits) if (u.workspaceId === workspaceId && want.has(u.id)) u.sortOrder = want.get(u.id)!;
  }

  async removeOrgUnit(workspaceId: string, unitId: string): Promise<boolean> {
    const mine = this.orgUnits.filter((u) => u.workspaceId === workspaceId);
    if (!mine.some((u) => u.id === unitId)) return false;
    // The FK's rule (RESTRICT on the parent), kept so the adapters agree.
    if (mine.some((u) => u.parentId === unitId)) throw new Error(`unit ${unitId} still has children`);
    this.orgUnits = this.orgUnits.filter((u) => !(u.workspaceId === workspaceId && u.id === unitId));
    // Memberships go with the unit (CASCADE).
    for (const [k, v] of [...this.orgMembers]) if (k.startsWith(`${workspaceId}|`) && v === unitId) this.orgMembers.delete(k);
    return true;
  }

  async listOrgMembers(workspaceId: string): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    for (const [k, v] of this.orgMembers) if (k.startsWith(`${workspaceId}|`)) out.set(k.slice(workspaceId.length + 1), v);
    return out;
  }

  async setMemberUnit(workspaceId: string, sub: string, unitId: string | null): Promise<void> {
    if (unitId !== null && !this.orgUnits.some((u) => u.workspaceId === workspaceId && u.id === unitId)) {
      throw new Error(`unit ${unitId} is not a unit of this workspace`);
    }
    if (unitId === null) this.orgMembers.delete(`${workspaceId}|${sub}`);
    else this.orgMembers.set(`${workspaceId}|${sub}`, unitId);
  }

  async listOrgTemplates(): Promise<OrgTemplate[]> {
    return [...ORG_TEMPLATES];
  }

  async seedOrgDefaults(workspaceId: string): Promise<boolean> {
    if (this.orgKinds.some((k) => k.workspaceId === workspaceId)) return false;
    for (const k of DEFAULT_ORG_KINDS) await this.upsertOrgKind(workspaceId, { kindCode: k.code, name: k.name });
    if (!this.orgUnits.some((u) => u.workspaceId === workspaceId)) {
      await this.applyOrgTemplate(workspaceId, defaultOrgTemplate());
    }
    return true;
  }

  /** Copy a template in, in tree order, resolving parents and kinds by code.
   *  Shared by the seed and the service's reset. */
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

  private targets = new Map<string, TargetRecord>();
  private territories: TerritoryRecord[] = [];
  private published = new Map<string, PublishedTotals>();
  private seq = 0;

  seed(input: {
    targets?: TargetRecord[];
    territories?: TerritoryRecord[];
    published?: Record<string, PublishedTotals>;
  }): void {
    for (const t of input.targets ?? []) this.targets.set(t.id, { ...t });
    this.territories.push(...(input.territories ?? []));
    for (const [k, v] of Object.entries(input.published ?? {})) this.published.set(k, v);
  }

  async listTargets(workspaceId: string, filter: TargetFilter = {}): Promise<TargetRecord[]> {
    let rows = [...this.targets.values()].filter((t) => t.workspaceId === workspaceId);
    if (filter.period) rows = rows.filter((t) => t.period === filter.period);
    if (filter.ownerSub) rows = rows.filter((t) => t.ownerSub === filter.ownerSub);
    if (filter.territoryId) rows = rows.filter((t) => t.territoryId === filter.territoryId);
    if (filter.status) rows = rows.filter((t) => t.status === filter.status);
    return rows;
  }

  async getTarget(workspaceId: string, id: string): Promise<TargetRecord | null> {
    const t = this.targets.get(id);
    return t && t.workspaceId === workspaceId ? { ...t } : null;
  }

  async createTarget(workspaceId: string, target: SalesTarget): Promise<TargetRecord> {
    this.seq += 1;
    const record: TargetRecord = { ...target, id: `tgt_${this.seq}`, workspaceId };
    this.targets.set(record.id, record);
    return record;
  }

  async updateTarget(
    workspaceId: string,
    id: string,
    patch: { targetValue?: TargetValue; status?: TargetStatus; planId?: string | null },
  ): Promise<boolean> {
    const t = this.targets.get(id);
    if (!t || t.workspaceId !== workspaceId) return false;
    if (patch.targetValue !== undefined) t.targetValue = patch.targetValue;
    if (patch.status !== undefined) t.status = patch.status;
    if (patch.planId !== undefined) t.planId = patch.planId;
    return true;
  }

  async listTerritories(
    workspaceId: string,
    opts: { includeRetired?: boolean } = {},
  ): Promise<TerritoryRecord[]> {
    // The status filter matches the Prisma adapter. It did not, and that is a
    // whole class of defect on its own: every test saw retired rows because
    // this one returned them, and production never did because that one
    // filtered. Two adapters answering the same question differently is a
    // fixture that lies.
    return this.territories
      .filter((t) => t.workspaceId === workspaceId)
      .filter((t) => opts.includeRetired || t.status === "active")
      .sort((a, b) => a.territoryCode.localeCompare(b.territoryCode));
  }

  async upsertTerritory(workspaceId: string, input: TerritoryDraft): Promise<TerritoryRecord> {
    const held = this.territories.find(
      (t) => t.workspaceId === workspaceId && t.territoryCode === input.territoryCode,
    );
    if (held) {
      // The code is the identity and never moves; everything else may.
      held.name = input.name;
      held.parentId = input.parentId;
      held.ownerSub = input.ownerSub;
      held.regions = input.regions;
      held.status = input.status;
      return held;
    }
    const created: TerritoryRecord = { ...input, id: `terr_${++this.seq}`, workspaceId };
    this.territories.push(created);
    return created;
  }

  async publishedTotalsFor(workspaceId: string, scope: TargetScope): Promise<PublishedTotals | null> {
    return (
      this.published.get(
        [workspaceId, scope.period, scope.scopeType, scope.territoryId ?? "", scope.ownerSub ?? ""].join("|"),
      ) ?? null
    );
  }
}
