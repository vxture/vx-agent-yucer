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
  status: string;
}

export interface TargetFilter {
  period?: string;
  ownerSub?: string;
  territoryId?: string;
  status?: TargetStatus;
}

export interface PlanningStore {
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
