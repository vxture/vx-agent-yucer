import { getPrismaClient } from "../../lib/db";
import { assertWritable } from "../shared/column-locks";
import { money, type Money } from "../shared/money";
import type { CampaignStatus, ExecutionStatus, NewPlanDraft, PlanStatus } from "./lib/lifecycle";
import type {
  CampaignRecord,
  ExecutionRecord,
  PlanRecord,
  StrategyStore,
} from "./store";

// Prisma-backed StrategyStore over yucer_gtm (D1 plans, D3 campaigns).
//
// There is no delete on either table, matching the port. Every downstream
// reference into these rows is ON DELETE SET NULL, and removing an upstream
// anchor would strip the lineage off records that are accomplished fact - the
// lifecycle is a status change, always.
//
// attributedOpportunities() is the one cross-schema read, and it is the query
// the product's whole thesis rests on: it answers "what did this campaign
// actually produce" by reading opportunity.campaign_id, which was captured at
// conversion and frozen. It is a join because the attribution is data, not
// because anyone tallied it.

const PLAN_TABLE = "yucer_gtm.strategy_plan";
const CAMPAIGN_TABLE = "yucer_gtm.campaign";

export class PrismaStrategyStore implements StrategyStore {
  async listPlans(
    workspaceId: string,
    filter: { period?: string; status?: PlanStatus } = {},
  ): Promise<PlanRecord[]> {
    const p = await getPrismaClient();
    const rows = await p.strategyPlan.findMany({
      where: {
        workspaceId,
        ...(filter.period ? { period: filter.period } : {}),
        ...(filter.status ? { status: filter.status } : {}),
      },
      orderBy: [{ period: "desc" }, { createdAt: "desc" }],
    });
    return rows.map((r: Record<string, unknown>) => toPlan(r));
  }

  async createPlan(workspaceId: string, input: NewPlanDraft): Promise<PlanRecord | null> {
    const p = await getPrismaClient();
    // findFirst before create rather than catching the unique violation: the
    // service turns null into "that number is taken", and a caught error would
    // have to guess WHICH constraint fired to say the same thing.
    const taken = await p.strategyPlan.findFirst({
      where: { workspaceId, planNo: input.planNo },
      select: { id: true },
    });
    if (taken) return null;

    const row = await p.strategyPlan.create({
      data: {
        workspaceId,
        planNo: input.planNo,
        name: input.name,
        period: input.period,
        objective: input.objective,
        ownerSub: input.ownerSub,
        // Not from the caller. A plan starts as a draft and every move after
        // that belongs to the transition verb, which is what stamps approved_at.
        status: "draft",
      },
    });
    return toPlan(row as Record<string, unknown>);
  }

  async getPlan(workspaceId: string, id: string): Promise<PlanRecord | null> {
    const p = await getPrismaClient();
    const row = await p.strategyPlan.findFirst({ where: { id, workspaceId } });
    return row ? toPlan(row as Record<string, unknown>) : null;
  }

  async updatePlan(
    workspaceId: string,
    id: string,
    patch: { status?: PlanStatus; approvedAt?: Date | null; name?: string; objective?: string | null },
  ): Promise<boolean> {
    const p = await getPrismaClient();
    const data: Record<string, unknown> = { ...patch, updatedAt: new Date() };

    const guard = assertWritable(PLAN_TABLE, data);
    if (!guard.ok) {
      throw new Error(
        `refusing to write locked columns: ${guard.violations.map((v) => v.message).join("; ")}`,
      );
    }

    const res = await p.strategyPlan.updateMany({ where: { id, workspaceId }, data });
    return res.count > 0;
  }

  async listCampaigns(
    workspaceId: string,
    filter: { planId?: string; status?: CampaignStatus } = {},
  ): Promise<CampaignRecord[]> {
    const p = await getPrismaClient();
    const rows = await p.campaign.findMany({
      where: {
        workspaceId,
        ...(filter.planId ? { planId: filter.planId } : {}),
        ...(filter.status ? { status: filter.status } : {}),
      },
      orderBy: [{ startsAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    });
    return rows.map((r: Record<string, unknown>) => toCampaign(r));
  }

  async getCampaign(workspaceId: string, id: string): Promise<CampaignRecord | null> {
    const p = await getPrismaClient();
    const row = await p.campaign.findFirst({ where: { id, workspaceId } });
    return row ? toCampaign(row as Record<string, unknown>) : null;
  }

  async updateCampaign(
    workspaceId: string,
    id: string,
    patch: { status?: CampaignStatus; name?: string; startsAt?: Date | null; endsAt?: Date | null },
  ): Promise<boolean> {
    const p = await getPrismaClient();
    const data: Record<string, unknown> = { ...patch, updatedAt: new Date() };

    const guard = assertWritable(CAMPAIGN_TABLE, data);
    if (!guard.ok) {
      throw new Error(
        `refusing to write locked columns: ${guard.violations.map((v) => v.message).join("; ")}`,
      );
    }

    const res = await p.campaign.updateMany({ where: { id, workspaceId }, data });
    return res.count > 0;
  }

  async listExecutions(workspaceId: string, campaignId: string): Promise<ExecutionRecord[]> {
    const p = await getPrismaClient();
    const rows = await p.campaignExecution.findMany({
      where: { workspaceId, campaignId },
      orderBy: { dueAt: "asc" },
    });
    return rows.map((r: Record<string, unknown>) => ({
      id: String(r.id),
      campaignId: String(r.campaignId),
      title: String(r.title),
      actionType: String(r.actionType),
      assigneeSub: (r.assigneeSub as string | null) ?? null,
      dueAt: (r.dueAt as Date | null) ?? null,
      status: r.status as ExecutionStatus,
    }));
  }

  async attributedOpportunities(
    workspaceId: string,
    campaignId: string,
  ): Promise<Array<{ id: string; amount: Money | null; status: string }>> {
    const p = await getPrismaClient();
    // Read-only across the domain boundary: D3 owns the campaign, D6 owns the
    // opportunity. Soft-deleted rows are excluded - a deleted deal did not
    // happen, and counting it would inflate a campaign's return.
    const rows = await p.opportunity.findMany({
      where: { workspaceId, campaignId, deletedAt: null },
      select: { id: true, amount: true, currency: true, status: true },
    });
    return rows.map((r: { id: string; amount: unknown; currency: string; status: string }) => ({
      id: r.id,
      amount: r.amount == null ? null : money(Number(String(r.amount)), r.currency),
      status: r.status,
    }));
  }
}

function toPlan(r: Record<string, unknown>): PlanRecord {
  return {
    id: String(r.id),
    workspaceId: String(r.workspaceId),
    planNo: String(r.planNo),
    name: String(r.name),
    period: String(r.period),
    objective: (r.objective as string | null) ?? null,
    ownerSub: (r.ownerSub as string | null) ?? null,
    status: r.status as PlanStatus,
    approvedAt: (r.approvedAt as Date | null) ?? null,
  };
}

function toCampaign(r: Record<string, unknown>): CampaignRecord {
  const currency = String(r.currency);
  return {
    id: String(r.id),
    workspaceId: String(r.workspaceId),
    campaignNo: String(r.campaignNo),
    name: String(r.name),
    planId: (r.planId as string | null) ?? null,
    segmentId: (r.segmentId as string | null) ?? null,
    channel: (r.channel as string | null) ?? null,
    budgetAmount: r.budgetAmount == null ? null : money(Number(String(r.budgetAmount)), currency),
    ownerSub: (r.ownerSub as string | null) ?? null,
    startsAt: (r.startsAt as Date | null) ?? null,
    endsAt: (r.endsAt as Date | null) ?? null,
    status: r.status as CampaignStatus,
    currency,
  };
}
