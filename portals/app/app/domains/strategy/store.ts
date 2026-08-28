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

import type { Money } from "../shared/money";
import type {
  CampaignStatus,
  ExecutionActionType,
  ExecutionDraft,
  ExecutionStatus,
  NewPlanDraft,
  PlanStatus,
} from "./lib/lifecycle";
import { asc, by, desc } from "../shared/order";

export interface PlanRecord {
  id: string;
  workspaceId: string;
  planNo: string;
  name: string;
  period: string;
  objective: string | null;
  ownerSub: string | null;
  status: PlanStatus;
  approvedAt: Date | null;
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

export interface ExecutionRecord {
  id: string;
  campaignId: string;
  title: string;
  actionType: ExecutionActionType;
  assigneeSub: string | null;
  dueAt: Date | null;
  status: ExecutionStatus;
}

export interface StrategyStore {
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
  createPlan(workspaceId: string, input: NewPlanDraft): Promise<PlanRecord | null>;
  updatePlan(
    workspaceId: string,
    id: string,
    patch: { status?: PlanStatus; approvedAt?: Date | null; name?: string; objective?: string | null },
  ): Promise<boolean>;

  listCampaigns(
    workspaceId: string,
    filter?: { planId?: string; status?: CampaignStatus },
  ): Promise<CampaignRecord[]>;
  getCampaign(workspaceId: string, id: string): Promise<CampaignRecord | null>;
  updateCampaign(
    workspaceId: string,
    id: string,
    patch: { status?: CampaignStatus; name?: string; startsAt?: Date | null; endsAt?: Date | null },
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
  upsertExecution(
    workspaceId: string,
    campaignId: string,
    input: ExecutionDraft,
  ): Promise<ExecutionRecord | null>;

  /** Opportunities attributed to a campaign. Read-only across the domain
   * boundary: D3 owns the campaign, D6 owns the opportunity. */
  attributedOpportunities(
    workspaceId: string,
    campaignId: string,
  ): Promise<Array<{ id: string; amount: Money | null; status: string }>>;
}

export class InMemoryStrategyStore implements StrategyStore {
  private plans = new Map<string, PlanRecord>();
  private seq = 0;
  private campaigns = new Map<string, CampaignRecord>();
  private executions: Array<ExecutionRecord & { workspaceId: string }> = [];
  private attributed = new Map<string, Array<{ id: string; amount: Money | null; status: string }>>();

  seed(input: {
    plans?: PlanRecord[];
    campaigns?: CampaignRecord[];
    executions?: Array<ExecutionRecord & { workspaceId: string }>;
    attributed?: Record<string, Array<{ id: string; amount: Money | null; status: string }>>;
  }): void {
    for (const p of input.plans ?? []) this.plans.set(p.id, { ...p });
    for (const c of input.campaigns ?? []) this.campaigns.set(c.id, { ...c });
    this.executions.push(...(input.executions ?? []));
    for (const [k, v] of Object.entries(input.attributed ?? {})) this.attributed.set(k, v);
  }

  async listPlans(
    workspaceId: string,
    filter: { period?: string; status?: PlanStatus } = {},
  ): Promise<PlanRecord[]> {
    let rows = [...this.plans.values()].filter((p) => p.workspaceId === workspaceId);
    if (filter.period) rows = rows.filter((p) => p.period === filter.period);
    if (filter.status) rows = rows.filter((p) => p.status === filter.status);
    rows.sort(by(desc((p: PlanRecord) => p.period)));
    return rows;
  }

  async createPlan(workspaceId: string, input: NewPlanDraft): Promise<PlanRecord | null> {
    // Null, not a throw: the unique index would refuse it anyway, and the
    // service turns this into "that number is taken" rather than a constraint
    // name.
    const taken = [...this.plans.values()].some(
      (p) => p.workspaceId === workspaceId && p.planNo === input.planNo,
    );
    if (taken) return null;
    const created: PlanRecord = {
      ...input,
      id: `plan_${++this.seq}`,
      workspaceId,
      status: "draft",
      approvedAt: null,
    };
    this.plans.set(created.id, created);
    return created;
  }

  async getPlan(workspaceId: string, id: string): Promise<PlanRecord | null> {
    const p = this.plans.get(id);
    return p && p.workspaceId === workspaceId ? { ...p } : null;
  }

  async updatePlan(workspaceId: string, id: string, patch: Partial<PlanRecord>): Promise<boolean> {
    const p = this.plans.get(id);
    if (!p || p.workspaceId !== workspaceId) return false;
    Object.assign(p, patch);
    return true;
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

  async updateCampaign(
    workspaceId: string,
    id: string,
    patch: Partial<CampaignRecord>,
  ): Promise<boolean> {
    const c = this.campaigns.get(id);
    if (!c || c.workspaceId !== workspaceId) return false;
    Object.assign(c, patch);
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
}
