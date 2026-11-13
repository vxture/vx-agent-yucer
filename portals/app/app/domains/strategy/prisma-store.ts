import { getPrismaClient } from "../../lib/db";
import { assertWritable } from "../shared/column-locks";
import { money, type Money } from "../shared/money";
import type {
  CampaignStatus,
  ExecutionActionType,
  ExecutionDraft,
  ExecutionStatus,
  PlanStatus,
  SegmentDraft,
  SegmentCriteria,
  SegmentStatus,
  TargetMarket,
} from "./lib/lifecycle";
import type { NewCampaignDraft } from "./lib/campaign";
import {
  PlanMarketUnavailableError,
  PlanSolutionUnavailableError,
  SegmentReferencedError,
  type CampaignPatch,
  type CampaignRecord,
  type ExecutionRecord,
  type PlanRecord,
  type PlanCreate,
  type SegmentCoverageSnapshotInput,
  type StrategyStore,
  type SegmentRecord,
  type TerritoryAttainmentSnapshotInput,
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
const EXECUTION_TABLE = "yucer_gtm.campaign_execution";
const SEGMENT_TABLE = "yucer_gtm.market_segment";
const PLAN_SELECTION = {
  solutionLinks: { select: { solutionId: true } },
  targetMarkets: { include: { solutionLinks: { select: { solutionId: true } } } },
} as const;
type StrategyClient = Awaited<ReturnType<typeof getPrismaClient>>;
type StrategySelectionClient = Pick<StrategyClient, "strategyPlanMarket" | "strategyPlanMarketSolution">;

async function writeTargets(tx: StrategySelectionClient, scope: { workspaceId: string; planId: string }, targets: readonly TargetMarket[]) {
  await tx.strategyPlanMarket.deleteMany({ where: scope });
  if (!targets.length) return;
  try {
    await tx.strategyPlanMarket.createMany({ data: targets.map(({ solutionIds: _ids, criteria, ...target }) => ({
      ...scope, ...target, criteria: { ...criteria },
    })) });
  } catch (error) {
    if (foreignKeyFailure(error)) throw new PlanMarketUnavailableError("Target market disappeared", { cause: error });
    throw error;
  }
  const solutions = targets.flatMap(t => t.solutionIds.map(solutionId => ({ ...scope, segmentId: t.segmentId, solutionId })));
  if (solutions.length) await tx.strategyPlanMarketSolution.createMany({ data: solutions });
}

function foreignKeyFailure(error: unknown) {
  return error && typeof error === "object" && "code" in error && error.code === "P2003";
}

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
      include: PLAN_SELECTION,
    });
    return rows.map((r: Record<string, unknown>) => toPlan(r));
  }

  async createPlan(workspaceId: string, input: PlanCreate): Promise<PlanRecord | null> {
    const p = await getPrismaClient();
    // findFirst before create rather than catching the unique violation: the
    // service turns null into "that number is taken", and a caught error would
    // have to guess WHICH constraint fired to say the same thing.
    const taken = await p.strategyPlan.findFirst({
      where: { workspaceId, planNo: input.planNo },
      select: { id: true },
    });
    if (taken) return null;

    const row = await writePlanSolutions(() => p.$transaction(async (tx) => {
      const created = await tx.strategyPlan.create({
        data: {
          workspaceId,
          planNo: input.planNo,
          name: input.name,
          period: input.period,
          objective: input.objective,
          ownerSub: input.ownerSub,
          // Lifecycle transitions own all moves after creation.
          status: "draft",
        },
      });
      const solutionLinks = (input.solutionIds ?? []).map(solutionId => ({ workspaceId, planId: created.id, solutionId }));
      if (solutionLinks.length) await tx.strategyPlanSolution.createMany({ data: solutionLinks });
      const targets = input.targetMarkets ?? [];
      if (targets.length) await writeTargets(tx, { workspaceId, planId: created.id }, targets);
      return { ...created, solutionLinks, targetMarkets: targets.map(t => ({
        ...t, solutionLinks: t.solutionIds.map(solutionId => ({ solutionId })),
      })) };
    }));
    return toPlan(row);
  }

  async getPlan(workspaceId: string, id: string): Promise<PlanRecord | null> {
    const p = await getPrismaClient();
    const row = await p.strategyPlan.findFirst({
      where: { id, workspaceId },
      include: PLAN_SELECTION,
    });
    return row ? toPlan(row as Record<string, unknown>) : null;
  }

  async updatePlan(
    workspaceId: string,
    id: string,
    patch: {
      status?: PlanStatus;
      approvedAt?: Date | null;
      name?: string;
      period?: string;
      objective?: string | null;
      ownerSub?: string | null;
      solutionIds?: readonly string[];
      targetMarkets?: readonly TargetMarket[];
    },
  ): Promise<boolean> {
    const p = await getPrismaClient();
    const { solutionIds, targetMarkets, ...fields } = patch;
    const data = { ...fields, updatedAt: new Date() };

    const guard = assertWritable(PLAN_TABLE, data);
    if (!guard.ok) {
      throw new Error(
        `refusing to write locked columns: ${guard.violations.map((v) => v.message).join("; ")}`,
      );
    }

    const where = { id, workspaceId, ...(fields.name === undefined ? {} : { status: { notIn: ["closed", "archived"] } }) };
    if (solutionIds === undefined && targetMarkets === undefined) {
      return (await p.strategyPlan.updateMany({ where, data })).count > 0;
    }
    return writePlanSolutions(() => p.$transaction(async (tx) => {
      // The parent update takes the row lock before changing the selection.
      if (!(await tx.strategyPlan.updateMany({ where, data })).count) return false;
      const scope = { workspaceId, planId: id };
      if (solutionIds !== undefined) {
        await tx.strategyPlanSolution.deleteMany({ where: { ...scope, solutionId: { notIn: [...solutionIds] } } });
        if (solutionIds.length) {
          await tx.strategyPlanSolution.createMany({ data: solutionIds.map(solutionId => ({ ...scope, solutionId })), skipDuplicates: true });
        }
      }
      if (targetMarkets !== undefined) await writeTargets(tx, scope, targetMarkets);
      return true;
    }));
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

  async createCampaign(workspaceId: string, input: NewCampaignDraft): Promise<CampaignRecord | null> {
    const p = await getPrismaClient();
    // findFirst before create, as createPlan does: the service turns null into
    // "that number is taken" without guessing which constraint fired.
    const taken = await p.campaign.findFirst({ where: { workspaceId, campaignNo: input.campaignNo }, select: { id: true } });
    if (taken) return null;
    const row = await p.campaign.create({
      data: {
        workspaceId,
        campaignNo: input.campaignNo,
        name: input.name,
        planId: input.planId,
        segmentId: input.segmentId,
        channel: input.channel,
        budgetAmount: input.budgetAmount,
        currency: input.currency,
        ownerSub: input.ownerSub,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        // Not from the caller: a campaign starts as a draft.
        status: "draft",
      },
    });
    return toCampaign(row as Record<string, unknown>);
  }

  async updateCampaign(
    workspaceId: string,
    id: string,
    patch: CampaignPatch,
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

  async removeExecution(workspaceId: string, campaignId: string, id: string): Promise<boolean> {
    const p = await getPrismaClient();
    // The campaign is in the predicate, as in the update: an id from another
    // campaign must delete nothing.
    const res = await p.campaignExecution.deleteMany({ where: { id, workspaceId, campaignId } });
    return res.count > 0;
  }

  async upsertExecution(
    workspaceId: string,
    campaignId: string,
    input: ExecutionDraft,
  ): Promise<ExecutionRecord | null> {
    const p = await getPrismaClient();
    const writable = {
      title: input.title,
      actionType: input.actionType,
      assigneeSub: input.assigneeSub,
      dueAt: input.dueAt,
      status: input.status,
      updatedAt: new Date(),
    };
    const guard = assertWritable(EXECUTION_TABLE, writable);
    if (!guard.ok) {
      throw new Error(
        `refusing to write a locked execution column: ${guard.violations.map((v) => v.message).join("; ")}`,
      );
    }

    if (input.id) {
      // The campaign is in the predicate as well as the workspace: an id from
      // another campaign must update nothing rather than move the item, because
      // the completion rule counts what is on ITS campaign.
      const res = await p.campaignExecution.updateMany({
        where: { id: input.id, workspaceId, campaignId },
        data: writable,
      });
      if (res.count === 0) return null;
      const row = await p.campaignExecution.findFirst({ where: { id: input.id, workspaceId } });
      return row ? toExecution(row as Record<string, unknown>) : null;
    }

    const row = await p.campaignExecution.create({ data: { workspaceId, campaignId, ...writable } });
    return toExecution(row as Record<string, unknown>);
  }

  async listSegments(workspaceId: string): Promise<SegmentRecord[]> {
    const p = await getPrismaClient();
    const rows = await p.marketSegment.findMany({
      where: { workspaceId },
      orderBy: [{ priority: "asc" }, { segmentCode: "asc" }],
    });
    return rows.map((r) => toSegment(r as Record<string, unknown>));
  }

  async upsertSegment(workspaceId: string, input: SegmentDraft): Promise<SegmentRecord> {
    const p = await getPrismaClient();
    const writable = {
      name: input.name,
      priority: input.priority,
      status: input.status,
      // JSONB; the column locks grant UPDATE on criteria alongside the rest.
      criteria: input.criteria as unknown as Record<string, never>,
      updatedAt: new Date(),
    };
    // segmentCode is absent on purpose, and the column locks agree: the DDL
    // grants UPDATE on name/criteria/priority/status only. An edit that
    // tried to rename the anchor would be refused by the database.
    const guard = assertWritable(SEGMENT_TABLE, writable);
    if (!guard.ok) {
      throw new Error(
        `refusing to write a locked segment column: ${guard.violations.map((v) => v.message).join("; ")}`,
      );
    }

    // By the anchor, not by id: this is the one identity accounts carry.
    const row = await p.marketSegment.upsert({
      where: { workspaceId_segmentCode: { workspaceId, segmentCode: input.segmentCode } },
      update: writable,
      create: { workspaceId, segmentCode: input.segmentCode, ...writable },
    });
    return toSegment(row as Record<string, unknown>);
  }

  async setSegmentOrder(
    workspaceId: string,
    orders: readonly { id: string; sortOrder: number }[],
  ): Promise<void> {
    const p = await getPrismaClient();
    for (const o of orders) {
      const patch = { priority: o.sortOrder, updatedAt: new Date() };
      const guard = assertWritable(SEGMENT_TABLE, patch);
      if (!guard.ok) {
        throw new Error(
          `refusing to write a locked segment column: ${guard.violations.map((v) => v.message).join("; ")}`,
        );
      }
      await p.marketSegment.updateMany({ where: { workspaceId, id: o.id }, data: patch });
    }
  }

  async removeSegment(workspaceId: string, segmentId: string): Promise<boolean> {
    const p = await getPrismaClient();
    // fk_campaign_segment is ON DELETE SET NULL and account.segment_code is a
    // plain string - neither would stop this, which is exactly why the SERVICE
    // refuses a segment anything still points at.
    try {
      const { count } = await p.marketSegment.deleteMany({ where: { workspaceId, id: segmentId } });
      return count > 0;
    } catch (error) {
      if (foreignKeyFailure(error)) throw new SegmentReferencedError("Market in use", { cause: error });
      throw error;
    }
  }

  async listExecutions(workspaceId: string, campaignId: string): Promise<ExecutionRecord[]> {
    const p = await getPrismaClient();
    const rows = await p.campaignExecution.findMany({
      where: { workspaceId, campaignId },
      orderBy: { dueAt: "asc" },
    });
    return rows.map((r: Record<string, unknown>) => toExecution(r));
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

  async appendSegmentCoverageSnapshot(
    workspaceId: string,
    row: SegmentCoverageSnapshotInput,
  ): Promise<void> {
    const p = await getPrismaClient();
    await p.segmentCoverageSnapshot.create({
      data: {
        workspaceId,
        segmentId: row.segmentId,
        snapshotedAt: row.snapshotedAt,
        matchedAccountCount: row.matchedAccountCount,
        openPipelineAmount: row.openPipelineAmount,
        wonAmount: row.wonAmount,
        currency: row.currency,
      },
    });
  }

  async appendTerritoryAttainmentSnapshot(
    workspaceId: string,
    row: TerritoryAttainmentSnapshotInput,
  ): Promise<void> {
    const p = await getPrismaClient();
    await p.territoryAttainmentSnapshot.create({
      data: {
        workspaceId,
        territoryId: row.territoryId,
        period: row.period,
        snapshotedAt: row.snapshotedAt,
        targetAmount: row.targetAmount,
        attainedAmount: row.attainedAmount,
        currency: row.currency,
      },
    });
  }

  async listSegmentCoverageSnapshots(workspaceId: string, limit: number): Promise<SegmentCoverageSnapshotInput[]> {
    const p = await getPrismaClient();
    const rows = await p.segmentCoverageSnapshot.findMany({
      where: { workspaceId },
      orderBy: { snapshotedAt: "desc" },
      take: limit,
    });
    return rows.map((r) => ({
      segmentId: r.segmentId,
      snapshotedAt: r.snapshotedAt,
      matchedAccountCount: r.matchedAccountCount,
      openPipelineAmount: Number(r.openPipelineAmount),
      wonAmount: Number(r.wonAmount),
      currency: r.currency,
    }));
  }

  async listTerritoryAttainmentSnapshots(workspaceId: string, limit: number): Promise<TerritoryAttainmentSnapshotInput[]> {
    const p = await getPrismaClient();
    const rows = await p.territoryAttainmentSnapshot.findMany({
      where: { workspaceId },
      orderBy: { snapshotedAt: "desc" },
      take: limit,
    });
    return rows.map((r) => ({
      territoryId: r.territoryId,
      period: r.period,
      snapshotedAt: r.snapshotedAt,
      targetAmount: Number(r.targetAmount),
      attainedAmount: Number(r.attainedAmount),
      currency: r.currency,
    }));
  }
}

async function writePlanSolutions<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (error) {
    if (foreignKeyFailure(error)) {
      throw new PlanSolutionUnavailableError("Selected solution is no longer available", { cause: error });
    }
    throw error;
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
    solutionIds: (r.solutionLinks as { solutionId: string }[]).map(link => link.solutionId).sort(),
    targetMarkets: (r.targetMarkets as Array<{
      segmentId: string; marketName: string; intent: TargetMarket["intent"]; approach: string | null;
      criteria: unknown; solutionLinks: { solutionId: string }[];
    }>).map(t => ({
      segmentId: t.segmentId, marketName: t.marketName, intent: t.intent, approach: t.approach,
      criteria: readCriteria(t.criteria), solutionIds: t.solutionLinks.map(s => s.solutionId).sort(),
    })).sort((a, b) => a.marketName.localeCompare(b.marketName)),
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

function toSegment(r: Record<string, unknown>): SegmentRecord {
  return {
    id: String(r.id),
    workspaceId: String(r.workspaceId),
    segmentCode: String(r.segmentCode),
    name: String(r.name),
    priority: Number(r.priority ?? 0),
    status: r.status as SegmentStatus,
    criteria: readCriteria(r.criteria),
  };
}

function readCriteria(criteria: unknown): SegmentCriteria {
  const raw = (criteria ?? {}) as Partial<Record<keyof SegmentCriteria, unknown>>;
  return {
    industries: Array.isArray(raw.industries) ? raw.industries.map(String) : [],
    regions: Array.isArray(raw.regions) ? raw.regions.map(String) : [],
    sizes: Array.isArray(raw.sizes) ? raw.sizes.map(String) : [],
    ...Object.fromEntries((["customerNeed", "buyingScenario", "expectedOutcome", "entryBarrier"] as const)
      .map(key => [key, raw[key]]).filter(([, value]) => typeof value === "string")),
  };
}

function toExecution(r: Record<string, unknown>): ExecutionRecord {
  return {
    id: String(r.id),
    campaignId: String(r.campaignId),
    title: String(r.title),
    actionType: r.actionType as ExecutionActionType,
    assigneeSub: (r.assigneeSub as string | null) ?? null,
    dueAt: (r.dueAt as Date | null) ?? null,
    status: r.status as ExecutionStatus,
  };
}
