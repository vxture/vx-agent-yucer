import { getPrismaClient } from "../../lib/db";
import { assertWritable } from "../shared/column-locks";
import { money, type Money } from "../shared/money";
import type { ForecastCategory, ScopeType, SnapshotRow } from "./lib/forecast";
import { DEFAULT_PROBABILITY } from "./lib/stage";
import type { OpportunityStatus, Stage, StageChangePlan } from "./lib/stage";
import type {
  NewOpportunity,
  OpportunityFilter,
  OpportunityRecord,
  PipelineStore,
  StageEventRecord,
} from "./store";

// Prisma-backed PipelineStore over yucer_pipeline.
//
// Every write runs assertWritable() against the column-lock mirror BEFORE it
// reaches the driver. The database would reject an illegal column anyway - that
// is the backstop - but it rejects with `permission denied for column ...` from
// inside the adapter, at runtime, on whichever code path happened to build the
// bad patch. Checking here turns that into a named violation at the call site.
//
// The check is not redundant with the rule functions either: those decide what
// SHOULD change, this decides what MAY be written. A bug that skips a rule
// function still hits this.

const OPPORTUNITY_TABLE = "yucer_pipeline.opportunity";

interface OpportunityRow {
  id: string;
  workspaceId: string;
  opportunityNo: string;
  name: string;
  accountId: string;
  planId: string | null;
  campaignId: string | null;
  territoryId: string | null;
  ownerSub: string | null;
  stage: string;
  forecastCategory: string;
  amount: { toString(): string } | null;
  currency: string;
  probability: number | null;
  expectedCloseAt: Date | null;
  closedAt: Date | null;
  status: string;
}

function toRecord(row: OpportunityRow): OpportunityRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    opportunityNo: row.opportunityNo,
    name: row.name,
    accountId: row.accountId,
    planId: row.planId,
    campaignId: row.campaignId,
    territoryId: row.territoryId,
    ownerSub: row.ownerSub,
    stage: row.stage as Stage,
    forecastCategory: row.forecastCategory as ForecastCategory,
    // NUMERIC arrives as a Decimal. Going through Number would silently lose
    // precision on large amounts, so it is parsed from its string form.
    amount: row.amount == null ? null : money(Number(row.amount.toString()), row.currency),
    currency: row.currency,
    probability: row.probability,
    expectedCloseAt: row.expectedCloseAt,
    closedAt: row.closedAt,
    status: row.status as OpportunityStatus,
  };
}

export class PrismaPipelineStore implements PipelineStore {
  async createOpportunity(workspaceId: string, input: NewOpportunity): Promise<OpportunityRecord> {
    const p = await getPrismaClient();
    // opportunity_no is a human-facing immutable business number, allocated
    // inside the transaction so two concurrent conversions cannot claim the
    // same one and collide on uidx_opportunity_ws_no.
    return p.$transaction(async (tx) => {
      const count = await tx.opportunity.count({ where: { workspaceId } });
      const row = await tx.opportunity.create({
        data: {
          workspaceId,
          opportunityNo: `OPP-${String(count + 1).padStart(5, "0")}`,
          name: input.name,
          // Written once, here. accountId and campaignId have no UPDATE grant.
          accountId: input.accountId,
          campaignId: input.campaignId,
          planId: input.planId,
          territoryId: input.territoryId,
          ownerSub: input.ownerSub,
          amount: input.amount?.amount ?? null,
          currency: input.currency,
          probability: DEFAULT_PROBABILITY.qualify,
          expectedCloseAt: input.expectedCloseAt,
          // stage and forecast_category default to qualify/pipeline in the DDL.
        },
      });
      return toRecord(row as OpportunityRow);
    });
  }

  async listOpportunities(
    workspaceId: string,
    filter: OpportunityFilter = {},
  ): Promise<OpportunityRecord[]> {
    const p = await getPrismaClient();
    const rows = await p.opportunity.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        ...(filter.includeClosed ? {} : { status: "open" }),
        ...(filter.stage ? { stage: filter.stage } : {}),
        ...(filter.ownerSub ? { ownerSub: filter.ownerSub } : {}),
        ...(filter.territoryId ? { territoryId: filter.territoryId } : {}),
      },
      orderBy: [{ expectedCloseAt: "asc" }, { createdAt: "desc" }],
      ...(filter.limit ? { take: filter.limit } : {}),
    });
    return rows.map((r: OpportunityRow) => toRecord(r));
  }

  async getOpportunity(workspaceId: string, id: string): Promise<OpportunityRecord | null> {
    const p = await getPrismaClient();
    // Scoped by workspace in the WHERE, not checked after the fetch: an id from
    // another workspace must not even be read.
    const row = await p.opportunity.findFirst({ where: { id, workspaceId, deletedAt: null } });
    return row ? toRecord(row as OpportunityRow) : null;
  }

  async applyStageChange(
    workspaceId: string,
    opportunityId: string,
    plan: StageChangePlan,
  ): Promise<boolean> {
    const p = await getPrismaClient();

    const patch: Record<string, unknown> = {
      stage: plan.patch.stage,
      status: plan.patch.status,
      closedAt: plan.patch.closedAt,
      updatedAt: new Date(),
    };
    if (plan.patch.probability !== undefined) patch.probability = plan.patch.probability;

    const guard = assertWritable(OPPORTUNITY_TABLE, patch);
    if (!guard.ok) {
      throw new Error(
        `refusing to write locked columns: ${guard.violations.map((v) => v.message).join("; ")}`,
      );
    }

    // One transaction. The column patch and the journal row are the same fact
    // recorded twice; a partial write leaves the analytics reading a stage
    // history that never happened, or a stage with no history at all.
    return p.$transaction(async (tx) => {
      const updated = await tx.opportunity.updateMany({
        where: { id: opportunityId, workspaceId },
        data: patch,
      });
      if (updated.count === 0) return false;

      await tx.opportunityStageEvent.create({
        data: {
          workspaceId,
          opportunityId,
          fromStage: plan.event.fromStage,
          toStage: plan.event.toStage,
          reason: plan.event.reason,
          actorSub: plan.event.actorSub,
          occurredAt: plan.event.occurredAt,
        },
      });
      return true;
    });
  }

  async listStageEvents(workspaceId: string, opportunityId: string): Promise<StageEventRecord[]> {
    const p = await getPrismaClient();
    const rows = await p.opportunityStageEvent.findMany({
      where: { workspaceId, opportunityId },
      orderBy: { occurredAt: "asc" },
    });
    return rows.map(
      (r: {
        id: string;
        opportunityId: string;
        fromStage: string | null;
        toStage: string;
        reason: string | null;
        actorSub: string | null;
        occurredAt: Date;
      }) => ({
        id: r.id,
        opportunityId: r.opportunityId,
        fromStage: r.fromStage as Stage | null,
        toStage: r.toStage as Stage,
        reason: r.reason,
        actorSub: r.actorSub,
        occurredAt: r.occurredAt,
      }),
    );
  }

  async appendForecastSnapshot(workspaceId: string, row: SnapshotRow): Promise<void> {
    const p = await getPrismaClient();
    // create, never upsert: forecast_snapshot has no UPDATE grant, and the whole
    // point is that history survives. A same-instant collision is the unique
    // index doing its job.
    await p.forecastSnapshot.create({
      data: {
        workspaceId,
        period: row.period,
        scopeType: row.scopeType,
        territoryId: row.territoryId,
        ownerSub: row.ownerSub,
        commitAmount: row.commitAmount.amount,
        bestCaseAmount: row.bestCaseAmount.amount,
        pipelineAmount: row.pipelineAmount.amount,
        closedAmount: row.closedAmount.amount,
        currency: row.currency,
        snapshotAt: row.snapshotAt,
      },
    });
  }

  async listForecastSnapshots(
    workspaceId: string,
    query: { period: string; scopeType?: ScopeType },
  ): Promise<SnapshotRow[]> {
    const p = await getPrismaClient();
    const rows = await p.forecastSnapshot.findMany({
      where: { workspaceId, period: query.period, ...(query.scopeType ? { scopeType: query.scopeType } : {}) },
      orderBy: { snapshotAt: "asc" },
    });
    return rows.map((r: Record<string, unknown>) => decimalSnapshot(r));
  }
}

function decimalSnapshot(r: Record<string, unknown>): SnapshotRow {
  const currency = String(r.currency);
  const num = (v: unknown): Money => money(Number(String(v)), currency);
  return {
    period: String(r.period),
    scopeType: r.scopeType as ScopeType,
    territoryId: (r.territoryId as string | null) ?? null,
    ownerSub: (r.ownerSub as string | null) ?? null,
    commitAmount: num(r.commitAmount),
    bestCaseAmount: num(r.bestCaseAmount),
    pipelineAmount: num(r.pipelineAmount),
    closedAmount: num(r.closedAmount),
    currency,
    snapshotAt: r.snapshotAt as Date,
  };
}
