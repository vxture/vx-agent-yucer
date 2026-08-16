// D6 pipeline persistence port.
//
// Two rules shape this interface, and both are structural rather than advisory:
//
//   1. EVERY method takes workspaceId explicitly. workspace_id is the
//      authoritative isolation key and is never inferred from a session, a
//      default, or "the last one we saw". Making it the first parameter of every
//      call means a query that forgot it does not compile.
//
//   2. A stage change is ONE method, not two. planStageChange() returns the
//      column patch and the journal event together precisely because writing one
//      without the other is the bug the journal exists to prevent; if the port
//      exposed `updateOpportunity` and `appendStageEvent` separately, the first
//      caller in a hurry would use only the first.

import type { Money } from "../shared/money";
import type { ForecastCategory, ScopeType, SnapshotRow } from "./lib/forecast";
import { DEFAULT_PROBABILITY } from "./lib/stage";
import type { OpportunityStatus, Stage, StageChangePlan } from "./lib/stage";

export interface OpportunityRecord {
  id: string;
  workspaceId: string;
  opportunityNo: string;
  name: string;
  accountId: string;
  accountName?: string;
  planId: string | null;
  campaignId: string | null;
  territoryId: string | null;
  ownerSub: string | null;
  stage: Stage;
  forecastCategory: ForecastCategory;
  amount: Money | null;
  probability: number | null;
  expectedCloseAt: Date | null;
  closedAt: Date | null;
  status: OpportunityStatus;
  currency: string;
}

export const WIN_LOSS_REASONS = ["price", "fit", "timing", "competitor", "no_decision", "other"] as const;
export type WinLossReason = (typeof WIN_LOSS_REASONS)[number];

/**
 * The learning loop. One review per opportunity (unique on opportunity_id), so
 * re-closing a deal updates the existing review rather than adding a second.
 */
export interface WinLossReviewRecord {
  id: string;
  opportunityId: string;
  outcome: "won" | "lost";
  primaryReason: WinLossReason | null;
  competitor: string | null;
  lessons: string | null;
  reviewerSub: string | null;
  reviewedAt: Date;
}

export interface NewWinLossReview {
  outcome: "won" | "lost";
  primaryReason: WinLossReason | null;
  competitor?: string | null;
  lessons?: string | null;
  reviewerSub: string;
}

export interface StageEventRecord {
  id: string;
  opportunityId: string;
  fromStage: Stage | null;
  toStage: Stage;
  reason: string | null;
  actorSub: string | null;
  occurredAt: Date;
}

export interface OpportunityFilter {
  stage?: Stage;
  ownerSub?: string;
  territoryId?: string;
  /** Terminal opportunities are excluded unless this is true. */
  includeClosed?: boolean;
  limit?: number;
}

/**
 * A new opportunity. The attribution keys are supplied HERE and never again -
 * they have no UPDATE grant, and the whole traceability claim rests on them
 * being written once from computed facts rather than typed in later.
 */
export interface NewOpportunity {
  name: string;
  accountId: string;
  campaignId: string | null;
  planId: string | null;
  territoryId: string | null;
  ownerSub: string | null;
  amount: Money | null;
  currency: string;
  expectedCloseAt: Date | null;
}

export interface PipelineStore {
  listOpportunities(workspaceId: string, filter?: OpportunityFilter): Promise<OpportunityRecord[]>;
  /** Creates in `qualify` with the stage default probability. A deal cannot be
   * born mid-funnel: the stage machine is what moves it, and every move is
   * journalled. */
  createOpportunity(workspaceId: string, input: NewOpportunity): Promise<OpportunityRecord>;
  getOpportunity(workspaceId: string, id: string): Promise<OpportunityRecord | null>;

  /**
   * Apply a planned stage change: the whitelisted column patch AND the journal
   * event, atomically. Returns false when the opportunity does not exist in this
   * workspace - which is also what a cross-workspace id looks like from here.
   */
  applyStageChange(workspaceId: string, opportunityId: string, plan: StageChangePlan): Promise<boolean>;

  listStageEvents(workspaceId: string, opportunityId: string): Promise<StageEventRecord[]>;

  /** Append-only. Re-forecasting writes a new row and never edits one. */
  appendForecastSnapshot(workspaceId: string, row: SnapshotRow): Promise<void>;

  listForecastSnapshots(
    workspaceId: string,
    query: { period: string; scopeType?: ScopeType },
  ): Promise<SnapshotRow[]>;

  getWinLossReview(workspaceId: string, opportunityId: string): Promise<WinLossReviewRecord | null>;
  /** Upsert on opportunity_id. A re-closed deal revises its review; it does not
   * accumulate several, and the unique index would reject one anyway. */
  saveWinLossReview(
    workspaceId: string,
    opportunityId: string,
    review: NewWinLossReview,
  ): Promise<WinLossReviewRecord>;
  /** Closed deals with no review yet - the outstanding learning debt. A rule
   * that says "must" without a way to see what is outstanding is unenforceable. */
  listUnreviewedClosed(workspaceId: string, limit?: number): Promise<OpportunityRecord[]>;
}

/** In-memory implementation for the offline path and for tests. */
export class InMemoryPipelineStore implements PipelineStore {
  private opportunities = new Map<string, OpportunityRecord>();
  private events: StageEventRecord[] = [];
  private snapshots: Array<SnapshotRow & { workspaceId: string }> = [];
  private reviews = new Map<string, WinLossReviewRecord & { workspaceId: string }>();
  private seq = 0;

  seed(records: OpportunityRecord[]): void {
    for (const r of records) this.opportunities.set(r.id, { ...r });
  }

  async createOpportunity(workspaceId: string, input: NewOpportunity): Promise<OpportunityRecord> {
    this.seq += 1;
    const record: OpportunityRecord = {
      id: `opp_${this.seq}`,
      workspaceId,
      opportunityNo: `OPP-${String(this.seq).padStart(5, "0")}`,
      name: input.name,
      accountId: input.accountId,
      planId: input.planId,
      campaignId: input.campaignId,
      territoryId: input.territoryId,
      ownerSub: input.ownerSub,
      stage: "qualify",
      forecastCategory: "pipeline",
      amount: input.amount,
      probability: DEFAULT_PROBABILITY.qualify,
      expectedCloseAt: input.expectedCloseAt,
      closedAt: null,
      status: "open",
      currency: input.currency,
    };
    this.opportunities.set(record.id, record);
    return record;
  }

  async listOpportunities(
    workspaceId: string,
    filter: OpportunityFilter = {},
  ): Promise<OpportunityRecord[]> {
    let rows = [...this.opportunities.values()].filter((o) => o.workspaceId === workspaceId);
    if (!filter.includeClosed) rows = rows.filter((o) => o.status === "open");
    if (filter.stage) rows = rows.filter((o) => o.stage === filter.stage);
    if (filter.ownerSub) rows = rows.filter((o) => o.ownerSub === filter.ownerSub);
    if (filter.territoryId) rows = rows.filter((o) => o.territoryId === filter.territoryId);
    return filter.limit ? rows.slice(0, filter.limit) : rows;
  }

  async getOpportunity(workspaceId: string, id: string): Promise<OpportunityRecord | null> {
    const row = this.opportunities.get(id);
    // The workspace check is not a formality: without it, an id guessed or
    // leaked from another workspace would read straight through.
    return row && row.workspaceId === workspaceId ? { ...row } : null;
  }

  async applyStageChange(
    workspaceId: string,
    opportunityId: string,
    plan: StageChangePlan,
  ): Promise<boolean> {
    const row = this.opportunities.get(opportunityId);
    if (!row || row.workspaceId !== workspaceId) return false;

    row.stage = plan.patch.stage;
    row.status = plan.patch.status;
    row.closedAt = plan.patch.closedAt;
    if (plan.patch.probability !== undefined) row.probability = plan.patch.probability;

    this.seq += 1;
    this.events.push({ id: `evt_${this.seq}`, opportunityId, ...plan.event });
    return true;
  }

  async listStageEvents(workspaceId: string, opportunityId: string): Promise<StageEventRecord[]> {
    const row = this.opportunities.get(opportunityId);
    if (!row || row.workspaceId !== workspaceId) return [];
    return this.events
      .filter((e) => e.opportunityId === opportunityId)
      .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  }

  async appendForecastSnapshot(workspaceId: string, row: SnapshotRow): Promise<void> {
    this.snapshots.push({ ...row, workspaceId });
  }

  async getWinLossReview(
    workspaceId: string,
    opportunityId: string,
  ): Promise<WinLossReviewRecord | null> {
    const r = this.reviews.get(opportunityId);
    return r && r.workspaceId === workspaceId ? { ...r } : null;
  }

  async saveWinLossReview(
    workspaceId: string,
    opportunityId: string,
    review: NewWinLossReview,
  ): Promise<WinLossReviewRecord> {
    const existing = this.reviews.get(opportunityId);
    const record: WinLossReviewRecord & { workspaceId: string } = {
      id: existing?.id ?? `wlr_${++this.seq}`,
      workspaceId,
      opportunityId,
      outcome: review.outcome,
      primaryReason: review.primaryReason,
      competitor: review.competitor ?? null,
      lessons: review.lessons ?? null,
      reviewerSub: review.reviewerSub,
      reviewedAt: new Date(),
    };
    this.reviews.set(opportunityId, record);
    return record;
  }

  async listUnreviewedClosed(workspaceId: string, limit = 50): Promise<OpportunityRecord[]> {
    return [...this.opportunities.values()]
      .filter(
        (o) =>
          o.workspaceId === workspaceId &&
          (o.status === "won" || o.status === "lost") &&
          !this.reviews.has(o.id),
      )
      .sort((a, b) => (b.closedAt?.getTime() ?? 0) - (a.closedAt?.getTime() ?? 0))
      .slice(0, limit);
  }

  async listForecastSnapshots(
    workspaceId: string,
    query: { period: string; scopeType?: ScopeType },
  ): Promise<SnapshotRow[]> {
    return this.snapshots
      .filter(
        (s) =>
          s.workspaceId === workspaceId &&
          s.period === query.period &&
          (!query.scopeType || s.scopeType === query.scopeType),
      )
      .sort((a, b) => a.snapshotAt.getTime() - b.snapshotAt.getTime());
  }
}
