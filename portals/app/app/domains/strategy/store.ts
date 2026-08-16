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
import type { CampaignStatus, ExecutionStatus, PlanStatus } from "./lib/lifecycle";

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
  actionType: string;
  assigneeSub: string | null;
  dueAt: Date | null;
  status: ExecutionStatus;
}

export interface StrategyStore {
  listPlans(workspaceId: string, filter?: { period?: string; status?: PlanStatus }): Promise<PlanRecord[]>;
  getPlan(workspaceId: string, id: string): Promise<PlanRecord | null>;
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

  /** Opportunities attributed to a campaign. Read-only across the domain
   * boundary: D3 owns the campaign, D6 owns the opportunity. */
  attributedOpportunities(
    workspaceId: string,
    campaignId: string,
  ): Promise<Array<{ id: string; amount: Money | null; status: string }>>;
}

export class InMemoryStrategyStore implements StrategyStore {
  private plans = new Map<string, PlanRecord>();
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
    return rows;
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

  async listExecutions(workspaceId: string, campaignId: string): Promise<ExecutionRecord[]> {
    return this.executions.filter((e) => e.workspaceId === workspaceId && e.campaignId === campaignId);
  }

  async attributedOpportunities(
    workspaceId: string,
    campaignId: string,
  ): Promise<Array<{ id: string; amount: Money | null; status: string }>> {
    return this.attributed.get(`${workspaceId}|${campaignId}`) ?? [];
  }
}
