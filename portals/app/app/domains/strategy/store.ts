// D1 strategy and D3 campaign persistence port.
//
// These two share a port for the same reason they share a rules file: both own
// an upstream anchor that downstream records point back at, and both carry the
// rule that matters most here -
//
//   ARCHIVING AN UPSTREAM RECORD NEVER DESTROYS DOWNSTREAM ONES.
//
// Every downstream reference is ON DELETE SET NULL, never CASCADE. So this port
// has no deleteCampaign and no deletePlan: the lifecycle is a status change, and
// a record that stops being current keeps existing. Downstream data is
// accomplished fact and a tidy-up upstream must not erase it.

import { DEFAULT_STRATEGY_TYPES, type StrategyType } from "./lib/strategy-type";
import type { ProductReference, SolutionReference } from "../catalog/service";
import { money, type Money } from "../shared/money";
import type {
  CampaignStatus,
  ExecutionActionType,
  ExecutionDraft,
  ExecutionStatus,
  NewPlanDraft,
  PlanStatus,
  SegmentCriteria,
  SegmentDraft,
  SegmentStatus,
  TargetMarket,
} from "./lib/lifecycle";
import type { NewCampaignDraft } from "./lib/campaign";
import { asc, by, desc } from "../shared/order";

export interface PlanRecord {
  id: string;
  workspaceId: string;
  planNo: string;
  name: string;
  period: string;
  strategyTypeCode?: string | null;
  strategyType?: StrategyType | null;
  objective: string | null;
  ownerSub: string | null;
  readonly createdBySub?: string | null;
  readonly lineageId?: string;
  readonly basePlanId?: string | null;
  readonly versionNo?: number | null;
  readonly editToken?: number;
  readonly publishedBySub?: string | null;
  readonly publishedSnapshot?: StrategyPublication | null;
  readonly changeReason?: string;
  solutionIds: readonly string[];
  productIds?: readonly string[];
  targetMarkets?: readonly TargetMarket[];
  status: PlanStatus;
  approvedAt: Date | null;
}

export interface StrategyPublication {
  schemaVersion: 1;
  legacy: boolean;
  capturedAt: string;
  name: string;
  period: string;
  strategyTypeCode?: string | null;
  strategyType?: StrategyType | null;
  objective: string | null;
  ownerSub: string | null;
  ownerName: string | null;
  sharedSolutionIds: readonly string[];
  sharedProductIds?: readonly string[];
  targetMarkets: readonly TargetMarket[];
  solutions: readonly SolutionReference[];
  products?: readonly ProductReference[];
}

export class StrategyVersionError extends Error {
  constructor(readonly code: string) { super(code); }
}
export interface PlanWriteGuard { expectedEditToken?: number; expectedStatus?: PlanStatus }
export interface PublishPlanCommand {
  expectedEditToken: number;
  actorSub: string;
  at: Date;
  solutions: readonly SolutionReference[];
  products?: readonly ProductReference[];
  ownerName: string | null;
}
export function captureStrategyPublication(plan: PlanRecord, solutions: readonly SolutionReference[], at: Date, legacy = false, ownerName: string | null = null, products: readonly ProductReference[] = []): StrategyPublication {
  return structuredClone({schemaVersion:1,legacy,capturedAt:at.toISOString(),name:plan.name,period:plan.period,
    strategyTypeCode:plan.strategyTypeCode ?? null,strategyType:plan.strategyType ?? null,objective:plan.objective,ownerSub:plan.ownerSub,ownerName,sharedSolutionIds:plan.solutionIds,sharedProductIds:plan.productIds ?? [],products,
    targetMarkets:plan.targetMarkets ?? [],solutions});
}
/** One overview entry per lineage. A revision draft never displaces a publication. */
export function currentStrategyPlans<T extends Pick<PlanRecord,"id"|"lineageId"|"versionNo"|"status">>(plans: readonly T[]): T[] {
  const groups = new Map<string,T[]>();
  for (const p of plans) {const key=p.lineageId ?? p.id;groups.set(key,[...(groups.get(key) ?? []),p]);}
  return [...groups.values()].flatMap(rows=>{
    const published=rows.filter(p=>p.versionNo != null).sort((a,b)=>(b.versionNo ?? 0)-(a.versionNo ?? 0));
    return published[0] ? [published[0]] : [rows.find(p=>p.status==="draft") ?? rows[0]!];
  });
}

/** A selected catalog row disappeared between validation and the write. */
export class PlanSolutionUnavailableError extends Error {}
export class PlanProductUnavailableError extends Error {}
export class PlanMarketUnavailableError extends Error {}
export class SegmentReferencedError extends Error {}

export type PlanCreate = Omit<NewPlanDraft, "targetMarkets"> & { targetMarkets?: readonly TargetMarket[]; createdBySub?: string | null };

/** What updateCampaign may move - exactly the columns 98_column_locks grants. */
export interface CampaignPatch {
  status?: CampaignStatus;
  name?: string;
  planId?: string | null;
  segmentId?: string | null;
  channel?: string | null;
  budgetAmount?: number | null;
  currency?: string;
  ownerSub?: string | null;
  startsAt?: Date | null;
  endsAt?: Date | null;
}

export interface CampaignRecord {
  id: string;
  workspaceId: string;
  campaignNo: string;
  name: string;
  planId: string | null;
  segmentId: string | null;
  channel: string | null;
  budgetAmount: Money | null;
  ownerSub: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  status: CampaignStatus;
  currency: string;
}

export interface SegmentRecord {
  id: string;
  workspaceId: string;
  segmentCode: string;
  name: string;
  priority: number;
  status: SegmentStatus;
  criteria: SegmentCriteria;
  solutionIds?: readonly string[];
  productIds?: readonly string[];
}

export interface ExecutionRecord {
  id: string;
  campaignId: string;
  title: string;
  actionType: ExecutionActionType;
  assigneeSub: string | null;
  dueAt: Date | null;
  status: ExecutionStatus;
}

export interface SegmentCoverageSnapshotInput {
  segmentId: string;
  snapshotedAt: Date;
  matchedAccountCount: number;
  openPipelineAmount: number;
  wonAmount: number;
  currency: string;
}

export interface TerritoryAttainmentSnapshotInput {
  territoryId: string;
  period: string;
  snapshotedAt: Date;
  targetAmount: number;
  attainedAmount: number;
  currency: string;
}

export interface StrategyStore {
  listStrategyTypes(workspaceId: string): Promise<StrategyType[]>;
  saveStrategyType(workspaceId: string, input: StrategyType): Promise<void>;
  listPlans(workspaceId: string, filter?: { period?: string; status?: PlanStatus }): Promise<PlanRecord[]>;
  getPlan(workspaceId: string, id: string): Promise<PlanRecord | null>;
  /**
   * Create a plan.
   *
   * CREATE, not upsert. `plan_no` is workspace-unique and immutable, so it
   * could key an upsert - but a plan carries a LIFECYCLE (draft -> approved ->
   * active -> closed), and re-sending an existing number would silently rewrite
   * a plan that people have already been approved against. Territories and
   * products have no such state; plans do. A duplicate number is refused.
   */
  createPlan(workspaceId: string, input: PlanCreate): Promise<PlanRecord | null>;
  /**
   * Patch a plan.
   *
   * `plan_no` is absent on purpose and not by omission: it is the anchor every
   * downstream reader quotes, it has no UPDATE grant, and a write naming it
   * would be refused by the column locks anyway. The other four are the ones
   * the DDL actually grants - see 98_column_locks.sql.
   */
  updatePlan(
    workspaceId: string,
    id: string,
    patch: {
      status?: PlanStatus;
      approvedAt?: Date | null;
      name?: string;
      period?: string;
      strategyTypeCode?: string | null;
      objective?: string | null;
      ownerSub?: string | null;
      solutionIds?: readonly string[];
      productIds?: readonly string[];
      targetMarkets?: readonly TargetMarket[];
      changeReason?: string;
    },
    guard?: PlanWriteGuard,
  ): Promise<boolean>;
  createRevision(workspaceId: string, baseId: string, actorSub: string): Promise<PlanRecord>;
  publishPlan(workspaceId: string, id: string, command: PublishPlanCommand): Promise<PlanRecord>;
  discardDraft(workspaceId: string, id: string, expectedEditToken: number, actorSub: string): Promise<PlanRecord>;

  listCampaigns(
    workspaceId: string,
    filter?: { planId?: string; status?: CampaignStatus },
  ): Promise<CampaignRecord[]>;
  getCampaign(workspaceId: string, id: string): Promise<CampaignRecord | null>;
  /** Null when the number is taken - the service says so by name. */
  createCampaign(workspaceId: string, input: NewCampaignDraft): Promise<CampaignRecord | null>;
  updateCampaign(
    workspaceId: string,
    id: string,
    patch: CampaignPatch,
  ): Promise<boolean>;

  listExecutions(workspaceId: string, campaignId: string): Promise<ExecutionRecord[]>;
  /**
   * Create an execution, or edit one by id.
   *
   * BY ID: campaign_execution has no business key, and two outreach items on
   * one campaign can share a title. Null when the id belongs to another
   * workspace or another campaign - the service turns that into "not found"
   * rather than moving the item between campaigns.
   */
  /** Delete one execution of one campaign. False when it is not on that campaign. */
  removeExecution(workspaceId: string, campaignId: string, id: string): Promise<boolean>;
  upsertExecution(
    workspaceId: string,
    campaignId: string,
    input: ExecutionDraft,
  ): Promise<ExecutionRecord | null>;

  listSegments(workspaceId: string): Promise<SegmentRecord[]>;
  /**
   * Create a segment, or edit one BY ITS CODE.
   *
   * By code, not by id, because segment_code is the anchor: accounts carry it
   * as a plain string with no foreign key behind it. An edit therefore finds
   * the existing row by code and never changes that column, which is the only
   * thing standing between a rename and seven accounts silently ceasing to
   * resolve.
   */
  upsertSegment(workspaceId: string, input: SegmentDraft): Promise<SegmentRecord>;
  /** Apply a renumbering computed by planMove - priority IS the order. */
  setSegmentOrder(
    workspaceId: string,
    orders: readonly { id: string; sortOrder: number }[],
  ): Promise<void>;
  /** Delete a segment. The SERVICE refuses one anything still points at:
   * campaign.segment_id is SET NULL and account.segment_code is a plain
   * string, so a delete would un-aim campaigns and orphan codes in silence. */
  removeSegment(workspaceId: string, segmentId: string): Promise<boolean>;

  /** Opportunities attributed to a campaign. Read-only across the domain
   * boundary: D3 owns the campaign, D6 owns the opportunity. */
  attributedOpportunities(
    workspaceId: string,
    campaignId: string,
  ): Promise<Array<{ id: string; amount: Money | null; status: string }>>;

  /** Append a segment coverage snapshot row. Never updates an existing one. */
  appendSegmentCoverageSnapshot(
    workspaceId: string,
    row: SegmentCoverageSnapshotInput,
  ): Promise<void>;

  /** Append a territory attainment snapshot row. Never updates an existing one. */
  appendTerritoryAttainmentSnapshot(
    workspaceId: string,
    row: TerritoryAttainmentSnapshotInput,
  ): Promise<void>;

  /** The newest segment coverage snapshots, newest first, at most `limit`
   *  (the 战略诊断 screen's read - it used to query Prisma itself). */
  listSegmentCoverageSnapshots(workspaceId: string, limit: number): Promise<SegmentCoverageSnapshotInput[]>;

  /** The newest territory attainment snapshots, newest first, at most `limit`. */
  listTerritoryAttainmentSnapshots(workspaceId: string, limit: number): Promise<TerritoryAttainmentSnapshotInput[]>;
}

export class InMemoryStrategyStore implements StrategyStore {
  private plans = new Map<string, PlanRecord>();
  private seq = 0;
  private campaigns = new Map<string, CampaignRecord>();
  private segments = new Map<string, SegmentRecord>();
  private strategyTypes = new Map<string, StrategyType[]>();

  async listStrategyTypes(workspaceId: string): Promise<StrategyType[]> {
    if (!this.strategyTypes.has(workspaceId)) this.strategyTypes.set(workspaceId, structuredClone([...DEFAULT_STRATEGY_TYPES]));
    return structuredClone(this.strategyTypes.get(workspaceId)!).sort((a,b)=>a.sortOrder-b.sortOrder || a.code.localeCompare(b.code));
  }
  async saveStrategyType(workspaceId: string, input: StrategyType): Promise<void> {
    const rows = this.strategyTypes.get(workspaceId) ?? [...DEFAULT_STRATEGY_TYPES];
    this.strategyTypes.set(workspaceId, [...rows.filter(t=>t.code!==input.code), structuredClone(input)]);
  }

  private executions: Array<ExecutionRecord & { workspaceId: string }> = [];
  private attributed = new Map<string, Array<{ id: string; amount: Money | null; status: string }>>();

  seed(input: {
    plans?: PlanRecord[];
    campaigns?: CampaignRecord[];
    segments?: SegmentRecord[];
    executions?: Array<ExecutionRecord & { workspaceId: string }>;
    attributed?: Record<string, Array<{ id: string; amount: Money | null; status: string }>>;
  }): void {
    for (const p of input.plans ?? []) this.plans.set(p.id, structuredClone({ ...p,
      lineageId:p.lineageId ?? p.id,editToken:p.editToken ?? 1,
      versionNo:p.versionNo ?? (p.status === "draft" || (p.status === "archived" && !p.approvedAt) ? null : 1),
      basePlanId:p.basePlanId ?? null,
      publishedSnapshot:p.publishedSnapshot ?? null,
    }));
    for (const c of input.campaigns ?? []) this.campaigns.set(c.id, { ...c });
    for (const g of input.segments ?? []) this.segments.set(g.id, { ...g });
    this.executions.push(...(input.executions ?? []));
    for (const [k, v] of Object.entries(input.attributed ?? {})) this.attributed.set(k, v);
  }

  /** Offline legacy seed adoption mirrors 0110; never used by database stores. */
  adoptSeedPublications(workspaceId: string, solutions: readonly SolutionReference[], at: Date): void {
    for (const p of this.plans.values()) {
      if (p.workspaceId !== workspaceId || !p.versionNo || p.publishedSnapshot) continue;
      const ids = new Set([...p.solutionIds, ...(p.targetMarkets ?? []).flatMap(m => m.solutionIds)]);
      Object.assign(p, { publishedSnapshot: captureStrategyPublication({...p,strategyType:p.strategyTypeCode ? DEFAULT_STRATEGY_TYPES.find(t=>t.code===p.strategyTypeCode) ?? null : null}, solutions.filter(s => ids.has(s.id)), at, true) });
    }
  }

  async listPlans(
    workspaceId: string,
    filter: { period?: string; status?: PlanStatus } = {},
  ): Promise<PlanRecord[]> {
    let rows = [...this.plans.values()].filter((p) => p.workspaceId === workspaceId);
    if (filter.period) rows = rows.filter((p) => p.period === filter.period);
    if (filter.status) rows = rows.filter((p) => p.status === filter.status);
    rows.sort(by(desc((p: PlanRecord) => p.period)));
    return Promise.all(rows.map(p=>this.getPlan(workspaceId,p.id).then(p=>p!)));
  }

  private nextPlanId():string {let id:string;do{id=`plan_${++this.seq}`;}while(this.plans.has(id));return id;}

  async createPlan(workspaceId: string, input: PlanCreate): Promise<PlanRecord | null> {
    // Null, not a throw: the unique index would refuse it anyway, and the
    // service turns this into "that number is taken" rather than a constraint
    // name.
    const taken = [...this.plans.values()].some(
      (p) => p.workspaceId === workspaceId && p.planNo === input.planNo,
    );
    if (taken) return null;
    if (input.targetMarkets?.some(m => this.segments.get(m.segmentId)?.workspaceId !== workspaceId)) {
      throw new PlanMarketUnavailableError();
    }
    const created: PlanRecord = {
      ...input,
      createdBySub: input.createdBySub ?? null,
      solutionIds: [...(input.solutionIds ?? [])],
      productIds: [...(input.productIds ?? [])],
      targetMarkets: structuredClone(input.targetMarkets ?? []),
      id: this.nextPlanId(),
      workspaceId,
      status: "draft",
      approvedAt: null,
    };
    Object.assign(created,{lineageId:created.id,basePlanId:null,versionNo:null,editToken:1,changeReason:"",publishedSnapshot:null,publishedBySub:null});
    this.plans.set(created.id, created);
    return (await this.getPlan(workspaceId,created.id))!;
  }

  async getPlan(workspaceId: string, id: string): Promise<PlanRecord | null> {
    const p = this.plans.get(id);
    if (!p || p.workspaceId !== workspaceId) return null;
    return structuredClone({...p, strategyType: p.publishedSnapshot ? p.publishedSnapshot.strategyType ?? null : (await this.listStrategyTypes(workspaceId)).find(t=>t.code===p.strategyTypeCode) ?? null});
  }

  async updatePlan(workspaceId: string, id: string, patch: Partial<PlanRecord>, guard: PlanWriteGuard = {}): Promise<boolean> {
    const p = this.plans.get(id);
    if (!p || p.workspaceId !== workspaceId || (guard.expectedEditToken !== undefined && guard.expectedEditToken !== (p.editToken ?? 1)) || (guard.expectedStatus !== undefined && p.status !== guard.expectedStatus)) return false;
    if (["strategyTypeCode", "changeReason", "name", "period", "objective", "ownerSub", "solutionIds", "productIds", "targetMarkets"].some(key => key in patch) && p.status !== "draft") return false;
    if (patch.targetMarkets?.some(m => this.segments.get(m.segmentId)?.workspaceId !== workspaceId)) {
      throw new PlanMarketUnavailableError();
    }
    const { targetMarkets, ...fields } = patch;
    Object.assign(p, fields, fields.productIds === undefined ? {} : { productIds: [...fields.productIds] }, fields.solutionIds === undefined ? {} : { solutionIds: [...fields.solutionIds] });
    if (targetMarkets !== undefined) p.targetMarkets = structuredClone(targetMarkets);
    Object.assign(p,{editToken:(p.editToken ?? 1)+1});
    return true;
  }

  async createRevision(workspaceId: string, baseId: string, actorSub: string): Promise<PlanRecord> {
    const base=this.plans.get(baseId);
    if(!base || base.workspaceId!==workspaceId) throw new StrategyVersionError("strategy_not_found");
    const lineageId=base.lineageId ?? base.id;
    const family=[...this.plans.values()].filter(p=>p.workspaceId===workspaceId && (p.lineageId ?? p.id)===lineageId);
    const latest=currentStrategyPlans(family)[0];
    if(latest?.id!==base.id || !base.versionNo || !["approved","active"].includes(base.status)) throw new StrategyVersionError("strategy_not_revisable");
    const existing=family.find(p=>p.status==="draft");if(existing)return (await this.getPlan(workspaceId,existing.id))!;
    const draft={...structuredClone(base),id:this.nextPlanId(),lineageId,basePlanId:base.id,versionNo:null,editToken:1,
      status:"draft" as const,approvedAt:null,publishedBySub:null,publishedSnapshot:null,createdBySub:actorSub,changeReason:""};
    this.plans.set(draft.id,draft);return (await this.getPlan(workspaceId,draft.id))!;
  }

  async publishPlan(workspaceId: string, id: string, command: PublishPlanCommand): Promise<PlanRecord> {
    const draft=this.plans.get(id);
    if(!draft || draft.workspaceId!==workspaceId)throw new StrategyVersionError("strategy_not_found");
    if(draft.versionNo)return (await this.getPlan(workspaceId,draft.id))!;
    if(draft.status!=="draft")throw new StrategyVersionError("draft_required");
    if((draft.editToken ?? 1)!==command.expectedEditToken)throw new StrategyVersionError("strategy_draft_conflict");
    if(draft.basePlanId && !draft.changeReason?.trim())throw new StrategyVersionError("strategy_reason_required");
    const family=[...this.plans.values()].filter(p=>p.workspaceId===workspaceId && (p.lineageId ?? p.id)===(draft.lineageId ?? draft.id));
    const latest=family.filter(p=>p.versionNo).sort((a,b)=>(b.versionNo ?? 0)-(a.versionNo ?? 0))[0];
    if((draft.basePlanId ?? null)!==(latest?.id ?? null) || (latest && !["approved","active"].includes(latest.status)))throw new StrategyVersionError("strategy_base_conflict");
    const status=latest?.status==="active"?"active":"approved";
    if(latest)Object.assign(latest,{status:"closed",editToken:(latest.editToken ?? 1)+1});
    Object.assign(draft,{status,versionNo:(latest?.versionNo ?? 0)+1,approvedAt:command.at,publishedBySub:command.actorSub,
      publishedSnapshot:captureStrategyPublication({...draft,strategyType:(this.strategyTypes.get(workspaceId) ?? DEFAULT_STRATEGY_TYPES).find(t=>t.code===draft.strategyTypeCode) ?? null},command.solutions,command.at,false,command.ownerName,command.products),editToken:(draft.editToken ?? 1)+1});
    return (await this.getPlan(workspaceId,draft.id))!;
  }

  async discardDraft(workspaceId: string, id: string, expectedEditToken: number, _actorSub: string): Promise<PlanRecord> {
    const draft=this.plans.get(id);
    if(!draft || draft.workspaceId!==workspaceId)throw new StrategyVersionError("strategy_not_found");
    if(draft.status==="archived" && !draft.versionNo)return structuredClone(draft);
    if(draft.status!=="draft")throw new StrategyVersionError("draft_required");
    if((draft.editToken ?? 1)!==expectedEditToken)throw new StrategyVersionError("strategy_draft_conflict");
    Object.assign(draft,{status:"archived",editToken:(draft.editToken ?? 1)+1});return structuredClone(draft);
  }

  async listCampaigns(
    workspaceId: string,
    filter: { planId?: string; status?: CampaignStatus } = {},
  ): Promise<CampaignRecord[]> {
    let rows = [...this.campaigns.values()].filter((c) => c.workspaceId === workspaceId);
    if (filter.planId) rows = rows.filter((c) => c.planId === filter.planId);
    if (filter.status) rows = rows.filter((c) => c.status === filter.status);
    rows.sort(by(desc((c: CampaignRecord) => c.startsAt, { nulls: "last" })));
    return rows;
  }

  async getCampaign(workspaceId: string, id: string): Promise<CampaignRecord | null> {
    const c = this.campaigns.get(id);
    return c && c.workspaceId === workspaceId ? { ...c } : null;
  }

  async createCampaign(workspaceId: string, input: NewCampaignDraft): Promise<CampaignRecord | null> {
    const taken = [...this.campaigns.values()].some(
      (c) => c.workspaceId === workspaceId && c.campaignNo === input.campaignNo,
    );
    if (taken) return null;
    const created: CampaignRecord = {
      id: `camp_${++this.seq}`,
      workspaceId,
      campaignNo: input.campaignNo,
      name: input.name,
      planId: input.planId,
      segmentId: input.segmentId,
      channel: input.channel,
      budgetAmount: input.budgetAmount === null ? null : money(input.budgetAmount, input.currency),
      ownerSub: input.ownerSub,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      // Not from the caller: every move after this belongs to the transition.
      status: "draft",
      currency: input.currency,
    };
    this.campaigns.set(created.id, created);
    return { ...created };
  }

  async updateCampaign(workspaceId: string, id: string, patch: CampaignPatch): Promise<boolean> {
    const c = this.campaigns.get(id);
    if (!c || c.workspaceId !== workspaceId) return false;
    const { budgetAmount, ...rest } = patch;
    Object.assign(c, rest);
    if (budgetAmount !== undefined) {
      c.budgetAmount = budgetAmount === null ? null : money(budgetAmount, patch.currency ?? c.currency);
    }
    return true;
  }

  async removeExecution(workspaceId: string, campaignId: string, id: string): Promise<boolean> {
    const at = this.executions.findIndex(
      (e) => e.id === id && e.workspaceId === workspaceId && e.campaignId === campaignId,
    );
    if (at < 0) return false;
    this.executions.splice(at, 1);
    return true;
  }

  async upsertExecution(
    workspaceId: string,
    campaignId: string,
    input: ExecutionDraft,
  ): Promise<ExecutionRecord | null> {
    if (input.id) {
      const held = this.executions.find(
        (e) => e.id === input.id && e.workspaceId === workspaceId && e.campaignId === campaignId,
      );
      // Null rather than a silent create: an id from another campaign would
      // otherwise move the item, and the campaign's completion rule counts what
      // is on IT.
      if (!held) return null;
      held.title = input.title;
      held.actionType = input.actionType;
      held.assigneeSub = input.assigneeSub;
      held.dueAt = input.dueAt;
      held.status = input.status;
      return held;
    }
    const row = { ...input, id: `exec_${++this.seq}`, campaignId, workspaceId };
    this.executions.push(row);
    return row;
  }

  async listSegments(workspaceId: string): Promise<SegmentRecord[]> {
    return [...this.segments.values()]
      .filter((g) => g.workspaceId === workspaceId)
      .sort(by(asc((g: SegmentRecord) => g.priority), asc((g: SegmentRecord) => g.segmentCode)));
  }

  async upsertSegment(workspaceId: string, input: SegmentDraft): Promise<SegmentRecord> {
    const held = [...this.segments.values()].find(
      (g) => g.workspaceId === workspaceId && g.segmentCode === input.segmentCode,
    );
    if (held) {
      // segmentCode is deliberately not assigned - it is how this row was found.
      held.name = input.name;
      held.priority = input.priority;
      held.status = input.status;
      held.criteria = input.criteria;
      if (input.solutionIds !== undefined) held.solutionIds = [...input.solutionIds];
      if (input.productIds !== undefined) held.productIds = [...input.productIds];
      return held;
    }
    const row: SegmentRecord = { ...input, id: `seg_${++this.seq}`, workspaceId };
    this.segments.set(row.id, row);
    return row;
  }

  async setSegmentOrder(
    workspaceId: string,
    orders: readonly { id: string; sortOrder: number }[],
  ): Promise<void> {
    const want = new Map(orders.map((o) => [o.id, o.sortOrder]));
    for (const [id, row] of this.segments) {
      if (row.workspaceId === workspaceId && want.has(id)) row.priority = want.get(id)!;
    }
  }

  async removeSegment(workspaceId: string, segmentId: string): Promise<boolean> {
    const row = this.segments.get(segmentId);
    if (!row || row.workspaceId !== workspaceId) return false;
    if ([...this.plans.values()].some(p => p.workspaceId === workspaceId && p.targetMarkets?.some(m => m.segmentId === segmentId))) {
      throw new SegmentReferencedError();
    }
    this.segments.delete(segmentId);
    return true;
  }

  async listExecutions(workspaceId: string, campaignId: string): Promise<ExecutionRecord[]> {
    return this.executions
      .filter((e) => e.workspaceId === workspaceId && e.campaignId === campaignId)
      .sort(by(asc((e: ExecutionRecord) => e.dueAt)));
  }

  async attributedOpportunities(
    workspaceId: string,
    campaignId: string,
  ): Promise<Array<{ id: string; amount: Money | null; status: string }>> {
    return this.attributed.get(`${workspaceId}|${campaignId}`) ?? [];
  }

  // KEPT, not dropped: the in-memory store used to discard these, so the
  // 战略诊断 screen had nothing to read without a database.
  private readonly segmentSnapshots: Array<SegmentCoverageSnapshotInput & { workspaceId: string }> = [];
  private readonly territorySnapshots: Array<TerritoryAttainmentSnapshotInput & { workspaceId: string }> = [];

  async appendSegmentCoverageSnapshot(
    workspaceId: string,
    row: SegmentCoverageSnapshotInput,
  ): Promise<void> {
    this.segmentSnapshots.push({ ...row, workspaceId });
  }

  async appendTerritoryAttainmentSnapshot(
    workspaceId: string,
    row: TerritoryAttainmentSnapshotInput,
  ): Promise<void> {
    this.territorySnapshots.push({ ...row, workspaceId });
  }

  async listSegmentCoverageSnapshots(workspaceId: string, limit: number): Promise<SegmentCoverageSnapshotInput[]> {
    return this.segmentSnapshots
      .filter((s) => s.workspaceId === workspaceId)
      .sort((a, b) => b.snapshotedAt.getTime() - a.snapshotedAt.getTime())
      .slice(0, limit)
      .map(({ workspaceId: _w, ...row }) => row);
  }

  async listTerritoryAttainmentSnapshots(workspaceId: string, limit: number): Promise<TerritoryAttainmentSnapshotInput[]> {
    return this.territorySnapshots
      .filter((s) => s.workspaceId === workspaceId)
      .sort((a, b) => b.snapshotedAt.getTime() - a.snapshotedAt.getTime())
      .slice(0, limit)
      .map(({ workspaceId: _w, ...row }) => row);
  }
}
