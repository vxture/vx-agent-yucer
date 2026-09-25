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
import { diffClaims, type ClaimContext, type ClaimEventRecord, type ClaimState } from "./lib/claims";
import type { EvidenceVersion } from "./lib/evidence";
import type { ExitCriterion } from "./lib/exit-criteria";

/** A deal's claimed values, as the claim log compares them (incr/0084). */
export function claimStateOf(o: OpportunityRecord): ClaimState {
  return {
    amount: o.amount?.amount ?? null,
    currency: o.amount?.currency ?? o.currency,
    expectedCloseAt: o.expectedCloseAt,
    forecastCategory: o.forecastCategory,
    probability: o.probability,
  };
}

/** The stage machine moving win rate or category: the system, not a person (YC-067 §02). */
export function stageMachineClaim(occurredAt: Date): ClaimContext {
  return { source: "stage_machine", actorSub: null, occurredAt };
}
import {
  DEFAULT_FORECAST_THRESHOLDS,
  type ForecastThresholds,
} from "./lib/forecast-rule";
import {
  DEFAULT_STAGE_DEFINITIONS,
  type OpportunityStatus,
  type Stage,
  type AbandonPlan,
  type DealExit,
  type StageChangePlan,
  type StageDefinition,
} from "./lib/stage";
import { asc, by, desc } from "../shared/order";

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
  /** incr/0034 - NOT NULL in the database. Every deal has an owner. */
  ownerSub: string;
  /** incr/0034 - what the customer wants. */
  requirement: string;
  stage: Stage;
  forecastCategory: ForecastCategory;
  amount: Money | null;
  probability: number | null;
  expectedCloseAt: Date | null;
  closedAt: Date | null;
  status: OpportunityStatus;
  currency: string;
  /**
   * The delivered project this deal renews, or null.
   *
   * Frozen after creation - 0019 adds the column and deliberately grants no
   * UPDATE on it, the same treatment campaignId gets.
   */
  sourceProjectId: string | null;
  /** Anchor column, immutable. Exposed because the capture metric's denominator
   * has to know when a deal STARTED being a deal - "opportunities open right
   * now" as a historical denominator would let last month's coverage improve on
   * its own every time something closed. */
  createdAt: Date;
  /** incr/0067 - 签约类型 / 业务形态. Both nullable: a deal may know one axis
   *  and not the other, which is what the old single column could not say. */
  contractTypeId: string | null;
  businessFormId: string | null;
  /** incr/0080 - 客户在这个项目上的总投入 (人工填报), in `currency`; the
   *  denominator of 钱包份额 (§9.6). Optional on the record so fixtures that
   *  predate it read as "not entered", which is what absent means. */
  customerBudget?: number | null;
  /** Who entered it and when - stamped by the service, never by the caller. */
  customerBudgetBySub?: string | null;
  customerBudgetAt?: Date | null;
}

/** One row of the 赢丢原因 vocabulary - incr/0039, per workspace. */
export interface WinLossReasonRecord {
  id: string;
  workspaceId: string;
  reasonCode: string;
  name: string;
  /** Which outcome it explains. A reason may serve one or both. */
  forWon: boolean;
  forLost: boolean;
  sortOrder: number;
}

/** One row of the 商机阶段 vocabulary - incr/0057, per workspace. */
export interface StageDefinitionRecord {
  id: string;
  workspaceId: string;
  stageCode: string;
  name: string;
  sortOrder: number;
  defaultProbability: number;
  isWon: boolean;
  isTerminal: boolean;
}

/** One row of the 签约类型 vocabulary - incr/0067, per workspace. */
export interface ContractTypeRecord {
  id: string;
  workspaceId: string;
  contractTypeCode: string;
  name: string;
  sortOrder: number;
}

/** One row of the 业务形态 vocabulary - incr/0067, per workspace. */
export interface BusinessFormRecord {
  id: string;
  workspaceId: string;
  businessFormCode: string;
  name: string;
  sortOrder: number;
  /**
   * This form's own stall-days threshold, null when it has none and defers to
   * the workspace's forecast_threshold.stall_days. It moved here from
   * deal_type with incr/0067's split, and is written only through
   * setBusinessFormStallOverride - upsertBusinessForm's own input deliberately
   * excludes it so the rename/reorder path cannot touch it.
   */
  stallDaysOverride: number | null;
}

/**
 * A workspace's rows, shaped for stage.ts's own rule functions - the store
 * returns the persistence shape (`id`/`workspaceId`/`stageCode`), the rule
 * layer takes `StageDefinition` (`code`, no storage identity). Every UI page
 * that reads `listStageDefinitions(ctx)` and threads the result into
 * `stage-control.tsx`/`deal-terms.tsx`/`pipeline-board.tsx`/etc. needs this
 * exact reshaping, so it lives once here rather than once per page.
 */
export function toStageCatalog(rows: readonly StageDefinitionRecord[]): readonly StageDefinition[] {
  return [...rows]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((r) => ({
      code: r.stageCode,
      name: r.name,
      sortOrder: r.sortOrder,
      defaultProbability: r.defaultProbability,
      isWon: r.isWon,
      isTerminal: r.isTerminal,
    }));
}

/**
 * The learning loop. One review per opportunity (unique on opportunity_id), so
 * re-closing a deal updates the existing review rather than adding a second.
 */
export interface WinLossReviewRecord {
  id: string;
  opportunityId: string;
  /** abandoned since YC-065 R6: giving a deal up is reviewed like a loss. */
  outcome: "won" | "lost" | "abandoned";
  /** The vocabulary row's uuid (incr/0039). Null = closed, reason not yet
   *  given, which is the state the review roster exists to surface. */
  primaryReasonId: string | null;
  competitor: string | null;
  lessons: string | null;
  reviewerSub: string | null;
  reviewedAt: Date;
}

export interface NewWinLossReview {
  /** abandoned since YC-065 R6: giving a deal up is reviewed like a loss. */
  outcome: "won" | "lost" | "abandoned";
  /** The vocabulary row's uuid (incr/0039). Null = closed, reason not yet
   *  given, which is the state the review roster exists to surface. */
  primaryReasonId: string | null;
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
  /**
   * Whose deals. Added so an account can list its own positions.
   *
   * The delivery store has always filtered projects by accountId; this one
   * did not, which meant the account page could not say which pursuits were
   * running on it - the one thing a page about an account most owes its
   * reader. That asymmetry was the gap, not the absence of a feature.
   */
  accountId?: string;
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
  /** incr/0034 - NOT NULL in the database. Every deal has an owner. */
  ownerSub: string;
  /** incr/0034 - what the customer wants, non-blank. */
  requirement: string;
  amount: Money | null;
  currency: string;
  expectedCloseAt: Date | null;
  /** Set once, at creation, for a deal derived from a delivered project. */
  sourceProjectId?: string | null;
  /** Tests and fixtures only. Real creation lets the database stamp it. */
  createdAt?: Date;
  /** incr/0067 - 签约类型 / 业务形态. Optional: the service fills the first in
   *  from suggestContractType when the caller names none. */
  contractTypeId?: string | null;
  businessFormId?: string | null;
}

/**
 * What may be repriced. Every field here carries an UPDATE grant in
 * 98_column_locks.sql; the stage triple deliberately does not appear.
 */
export interface CommercialTermsPatch {
  amount?: Money | null;
  probability?: number;
  expectedCloseAt?: Date | null;
  forecastCategory?: ForecastCategory;
  ownerSub?: string | null;
  /** incr/0067 - 签约类型 / 业务形态. Classifications a deal may acquire or
   *  change after creation, unlike the stage triple this patch excludes. */
  contractTypeId?: string | null;
  businessFormId?: string | null;
  /** incr/0080 - the three travel together: the service stamps who and when
   *  on every write of the amount (null clears all three). */
  customerBudget?: { amount: number | null; bySub: string | null; at: Date | null };
}

export interface PipelineStore {
  listOpportunities(workspaceId: string, filter?: OpportunityFilter): Promise<OpportunityRecord[]>;
  /** Creates in `qualify` with the stage default probability. A deal cannot be
   * born mid-funnel: the stage machine is what moves it, and every move is
   * journalled. */
  createOpportunity(workspaceId: string, input: NewOpportunity): Promise<OpportunityRecord>;
  getOpportunity(workspaceId: string, id: string): Promise<OpportunityRecord | null>;

  /**
   * Which projects already have a deal open off them.
   *
   * A SET OF IDS, not a list of opportunities, because that is the entire
   * question the renewal derivation asks and returning the rows would invite a
   * caller in D7 to read D6's deals for other purposes. It is also why this is
   * a dedicated method rather than a filter on listOpportunities: the answer
   * is needed for every project at once, so a per-project filter would be one
   * query per row.
   *
   * CLOSED DEALS COUNT. A renewal that was opened and then lost is still a
   * renewal somebody ran; re-proposing it the day it is marked lost would put
   * the product in the position of arguing with the rep who just lost it.
   */
  listRenewalSourceProjectIds(workspaceId: string): Promise<Set<string>>;

  /**
   * Apply a planned stage change: the whitelisted column patch AND the journal
   * event, atomically. Returns false when the opportunity does not exist in this
   * workspace - which is also what a cross-workspace id looks like from here.
   */
  applyStageChange(workspaceId: string, opportunityId: string, plan: StageChangePlan): Promise<boolean>;

  /**
   * Give a deal up (YC-065 R6): the status/closed/category patch AND its
   * funnel_exit row, atomically - a deal abandoned without its reason is the
   * gap this exists to close. Only an OPEN deal moves; returns false otherwise
   * (or when the id is not in this workspace).
   */
  abandonOpportunity(
    workspaceId: string,
    opportunityId: string,
    plan: AbandonPlan & { decidedBySub: string },
  ): Promise<boolean>;

  /** The latest exit recorded for a deal (lost or abandoned), or null. */
  latestDealExit(workspaceId: string, opportunityId: string): Promise<DealExitRecord | null>;

  /**
   * The COMMERCIAL terms only: what the deal is worth, when it lands, how likely
   * it is, and which forecast bucket it sits in.
   *
   * Deliberately NOT a general updateOpportunity. `stage`, `status` and
   * `closedAt` are absent from the patch type and cannot be reached from here -
   * if they could, this method would be the shortcut past applyStageChange that
   * rule 2 above exists to prevent, and the first caller in a hurry would take
   * it. Moving a deal journals; pricing it does not, because a price has no
   * from/to and the column history is not what any report reads.
   */
  updateCommercialTerms(
    workspaceId: string,
    opportunityId: string,
    patch: CommercialTermsPatch,
    /** Who and why - the claim log rows are written in the same unit (incr/0084). */
    claim: ClaimContext,
  ): Promise<boolean>;

  /** 声明变更日志 for one deal, oldest first (incr/0084). */
  listClaimEvents(workspaceId: string, opportunityId: string): Promise<ClaimEventRecord[]>;

  /** 阶段退出条件 (incr/0087): every criterion of the workspace, any order. */
  listExitCriteria(workspaceId: string): Promise<ExitCriterion[]>;
  createExitCriterion(workspaceId: string, row: Omit<ExitCriterion, "id">): Promise<ExitCriterion>;
  /** kind is locked - only name / param / sort order change. False when absent. */
  updateExitCriterion(
    workspaceId: string,
    id: string,
    patch: { name?: string; param?: Record<string, unknown>; sortOrder?: number },
  ): Promise<boolean>;
  removeExitCriterion(workspaceId: string, id: string): Promise<boolean>;

  /** 购买证据槽 (incr/0085): every version of a deal's evidence, any order. */
  listEvidence(workspaceId: string, opportunityId: string): Promise<EvidenceVersion[]>;
  /** Append one version. Never an update - the history is the point. */
  appendEvidence(
    workspaceId: string,
    opportunityId: string,
    row: Omit<EvidenceVersion, "id" | "recordedAt">,
  ): Promise<EvidenceVersion>;

  listStageEvents(workspaceId: string, opportunityId: string): Promise<StageEventRecord[]>;

  /**
   * When each opportunity last moved stage, for the whole workspace.
   *
   * ONE QUERY, NOT ONE PER DEAL, and that is why this is its own method rather
   * than a loop over listStageEvents. The forecast rule needs the dwell time of
   * every open deal at once; asking the journal per deal is the N+1 the renewal
   * derivation avoided by taking its cross-domain fact as a set. A deal absent
   * from the map has no journal rows - which reads as "unknown", never as "a
   * long time", or every deal older than the journal would be downgraded.
   */
  latestStageChangeAt(workspaceId: string): Promise<Map<string, Date>>;

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

  /* 赢丢原因 (incr/0039) - the same five the catalogue vocabularies have,
     because it is the same kind of thing: a per-workspace list with an anchor
     code, a manual order, and a count of what points at a row before it goes. */
  listWinLossReasons(workspaceId: string): Promise<WinLossReasonRecord[]>;
  upsertWinLossReason(
    workspaceId: string,
    input: Omit<WinLossReasonRecord, "id" | "workspaceId" | "sortOrder">,
  ): Promise<WinLossReasonRecord>;
  setWinLossReasonOrder(
    workspaceId: string,
    orders: readonly { id: string; sortOrder: number }[],
  ): Promise<void>;
  removeWinLossReason(workspaceId: string, reasonId: string): Promise<boolean>;
  countReviewsByReason(workspaceId: string, reasonId: string): Promise<number>;

  /* 商机阶段 (incr/0057) - the same shape again, plus the two flags that make
     a code "won"/terminal and the count a removal must check before the FK
     (0058) would refuse it anyway. */
  listStageDefinitions(workspaceId: string): Promise<StageDefinitionRecord[]>;
  upsertStageDefinition(
    workspaceId: string,
    input: Omit<StageDefinitionRecord, "id" | "workspaceId" | "sortOrder">,
  ): Promise<StageDefinitionRecord>;
  setStageDefinitionOrder(
    workspaceId: string,
    orders: readonly { id: string; sortOrder: number }[],
  ): Promise<void>;
  removeStageDefinition(workspaceId: string, stageId: string): Promise<boolean>;
  countOpportunitiesByStage(workspaceId: string, stageCode: string): Promise<number>;

  /* 签约类型 (incr/0067) - the same five-verb shape as 赢丢原因/行业分类:
     an anchor code, a manual order, and a count of what points at a row
     before it goes. */
  listContractTypes(workspaceId: string): Promise<ContractTypeRecord[]>;
  upsertContractType(
    workspaceId: string,
    input: Omit<ContractTypeRecord, "id" | "workspaceId" | "sortOrder">,
  ): Promise<ContractTypeRecord>;
  setContractTypeOrder(
    workspaceId: string,
    orders: readonly { id: string; sortOrder: number }[],
  ): Promise<void>;
  removeContractType(workspaceId: string, contractTypeId: string): Promise<boolean>;
  countOpportunitiesByContractType(workspaceId: string, contractTypeId: string): Promise<number>;

  /* 业务形态 (incr/0067) - the same shape again, plus the stall override that
     moved onto this axis with the split. */
  listBusinessForms(workspaceId: string): Promise<BusinessFormRecord[]>;
  upsertBusinessForm(
    workspaceId: string,
    input: Omit<BusinessFormRecord, "id" | "workspaceId" | "sortOrder" | "stallDaysOverride">,
  ): Promise<BusinessFormRecord>;
  setBusinessFormOrder(
    workspaceId: string,
    orders: readonly { id: string; sortOrder: number }[],
  ): Promise<void>;
  removeBusinessForm(workspaceId: string, businessFormId: string): Promise<boolean>;
  countOpportunitiesByBusinessForm(workspaceId: string, businessFormId: string): Promise<number>;
  /** 停滞天数覆盖 - null clears it back to the workspace default. Null return
   *  means no such row in this workspace. */
  setBusinessFormStallOverride(
    workspaceId: string,
    businessFormId: string,
    stallDaysOverride: number | null,
  ): Promise<BusinessFormRecord | null>;

  /**
   * How many deals this account has already won - incr/0067.
   *
   * A COUNT, not a list: the only question asked of it is "is this a customer
   * we have sold to before", which is what decides whether a new deal defaults
   * to 新签 or 增购 (suggestContractType). Returning the rows would invite a
   * caller to answer other questions from a query shaped for this one.
   */
  countWonOpportunitiesForAccount(workspaceId: string, accountId: string): Promise<number>;

  /* --- 预测阈值 (incr/0041) --------------------------------------------------
     One row per workspace, so there is no list verb and no delete: `get`
     answers with the shipped numbers where no row exists yet, and `set` writes
     the row whether or not it was there. */
  getForecastThresholds(workspaceId: string): Promise<ForecastThresholds>;
  setForecastThresholds(workspaceId: string, input: ForecastThresholds): Promise<void>;
}

/** In-memory implementation for the offline path and for tests. */
/** A deal's exit as funnel_exit records it (stage = opportunity). */
export interface DealExitRecord extends DealExit {
  decidedBySub: string;
  decidedAt: Date;
}

export class InMemoryPipelineStore implements PipelineStore {
  private opportunities = new Map<string, OpportunityRecord>();
  private events: StageEventRecord[] = [];
  private exits: (DealExitRecord & { workspaceId: string; opportunityId: string })[] = [];
  private claims: (ClaimEventRecord & { workspaceId: string })[] = [];
  private evidence: (EvidenceVersion & { workspaceId: string; opportunityId: string })[] = [];
  private criteria: (ExitCriterion & { workspaceId: string })[] = [];

  async listExitCriteria(workspaceId: string): Promise<ExitCriterion[]> {
    return this.criteria.filter((c) => c.workspaceId === workspaceId).map(({ workspaceId: _w, ...c }) => ({ ...c }));
  }

  async createExitCriterion(workspaceId: string, row: Omit<ExitCriterion, "id">): Promise<ExitCriterion> {
    // The FK: a criterion belongs to a stage the workspace's catalog has.
    if (!this.stageDefinitions.some((d) => d.workspaceId === workspaceId && d.stageCode === row.stageCode)) {
      throw new Error(`fk_exit_criterion_stage: no stage ${row.stageCode}`);
    }
    this.seq += 1;
    const made = { ...row, id: `exc_${this.seq}` };
    this.criteria.push({ ...made, workspaceId });
    return made;
  }

  async updateExitCriterion(
    workspaceId: string,
    id: string,
    patch: { name?: string; param?: Record<string, unknown>; sortOrder?: number },
  ): Promise<boolean> {
    const c = this.criteria.find((x) => x.workspaceId === workspaceId && x.id === id);
    if (!c) return false;
    Object.assign(c, {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.param !== undefined ? { param: patch.param } : {}),
      ...(patch.sortOrder !== undefined ? { sortOrder: patch.sortOrder } : {}),
    });
    return true;
  }

  async removeExitCriterion(workspaceId: string, id: string): Promise<boolean> {
    const before = this.criteria.length;
    this.criteria = this.criteria.filter((x) => !(x.workspaceId === workspaceId && x.id === id));
    return this.criteria.length < before;
  }

  async listEvidence(workspaceId: string, opportunityId: string): Promise<EvidenceVersion[]> {
    return this.evidence
      .filter((e) => e.workspaceId === workspaceId && e.opportunityId === opportunityId)
      .map(({ workspaceId: _w, opportunityId: _o, ...e }) => e);
  }

  async appendEvidence(
    workspaceId: string,
    opportunityId: string,
    row: Omit<EvidenceVersion, "id" | "recordedAt">,
  ): Promise<EvidenceVersion> {
    this.seq += 1;
    // Strictly increasing, so two saves in one millisecond still order.
    const last = this.evidence.at(-1)?.recordedAt.getTime() ?? 0;
    const saved = { ...row, id: `evd_${this.seq}`, recordedAt: new Date(Math.max(Date.now(), last + 1)) };
    this.evidence.push({ ...saved, workspaceId, opportunityId });
    return saved;
  }

  /** Append the rows for what changed between two states - the store's half of incr/0084. */
  private logClaims(workspaceId: string, opportunityId: string, before: ClaimState, after: ClaimState, ctx: ClaimContext): void {
    for (const e of diffClaims(before, after, ctx)) {
      this.seq += 1;
      this.claims.push({ ...e, id: `clm_${this.seq}`, workspaceId, opportunityId });
    }
  }

  async listClaimEvents(workspaceId: string, opportunityId: string): Promise<ClaimEventRecord[]> {
    return this.claims
      .filter((c) => c.workspaceId === workspaceId && c.opportunityId === opportunityId)
      .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())
      .map(({ workspaceId: _ws, ...c }) => c);
  }
  private snapshots: Array<SnapshotRow & { workspaceId: string }> = [];
  private reviews = new Map<string, WinLossReviewRecord & { workspaceId: string }>();
  private reasons: WinLossReasonRecord[] = [];
  private stageDefinitions: StageDefinitionRecord[] = [];
  private contractTypes: ContractTypeRecord[] = [];
  private businessForms: BusinessFormRecord[] = [];
  private seq = 0;

  /**
   * The journal and the reviews are seedable too, and deliberately so: a closed
   * deal with no stage history and no review is not a smaller version of a real
   * one, it is a different thing. `listUnreviewedClosed` is what the pipeline
   * page renders as outstanding learning debt, and with nothing seeded EVERY
   * closed deal appears in it - which shows the list but hides the rule, since
   * a review that was actually done must be seen to leave it.
   */
  seed(
    records: OpportunityRecord[],
    extra: {
      events?: StageEventRecord[];
      reviews?: Array<WinLossReviewRecord & { workspaceId: string }>;
      reasons?: WinLossReasonRecord[];
      stageDefinitions?: StageDefinitionRecord[];
      contractTypes?: ContractTypeRecord[];
      businessForms?: BusinessFormRecord[];
      /** A forecast series. Append-only in the DDL; seeded as a series here so
       *  the trajectory the immutability exists for is actually visible. */
      snapshots?: Array<SnapshotRow & { workspaceId: string }>;
    } = {},
  ): void {
    for (const r of records) this.opportunities.set(r.id, { ...r });
    this.events.push(...(extra.events ?? []));
    for (const r of extra.reviews ?? []) this.reviews.set(r.opportunityId, { ...r });
    if (extra.reasons) this.reasons = [...extra.reasons];
    if (extra.stageDefinitions) this.stageDefinitions = [...extra.stageDefinitions];
    if (extra.contractTypes) this.contractTypes = [...extra.contractTypes];
    if (extra.businessForms) this.businessForms = [...extra.businessForms];
    this.snapshots.push(...(extra.snapshots ?? []));
  }

  async createOpportunity(workspaceId: string, input: NewOpportunity): Promise<OpportunityRecord> {
    this.seq += 1;
    const entry = this.entryStage(workspaceId);
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
      requirement: input.requirement,
      stage: entry.stageCode,
      forecastCategory: "pipeline",
      amount: input.amount,
      probability: entry.defaultProbability,
      expectedCloseAt: input.expectedCloseAt,
      closedAt: null,
      status: "open",
      currency: input.currency,
      sourceProjectId: input.sourceProjectId ?? null,
      createdAt: input.createdAt ?? new Date(),
      contractTypeId: input.contractTypeId ?? null,
      businessFormId: input.businessFormId ?? null,
    };
    this.opportunities.set(record.id, record);
    return record;
  }

  /**
   * Where a new deal lands: the workspace's own lowest-sort-order OPEN stage
   * (incr/0057), falling back to the shipped "qualify" when the workspace has
   * never had its stage catalog seeded yet - the bootstrap case for a
   * genuinely brand-new workspace's very first opportunity, before anything
   * has called listStageDefinitions (whose own first-contact seeding is what
   * normally fills this in) to seed it.
   */
  private entryStage(workspaceId: string): { stageCode: string; defaultProbability: number } {
    const rows = this.stageDefinitions
      .filter((s) => s.workspaceId === workspaceId && !s.isTerminal)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    if (rows.length > 0) return { stageCode: rows[0]!.stageCode, defaultProbability: rows[0]!.defaultProbability };
    const fallback = DEFAULT_STAGE_DEFINITIONS[0]!;
    return { stageCode: fallback.code, defaultProbability: fallback.defaultProbability };
  }

  async listRenewalSourceProjectIds(workspaceId: string): Promise<Set<string>> {
    const ids = new Set<string>();
    for (const o of this.opportunities.values()) {
      if (o.workspaceId === workspaceId && o.sourceProjectId) ids.add(o.sourceProjectId);
    }
    return ids;
  }

  async listOpportunities(
    workspaceId: string,
    filter: OpportunityFilter = {},
  ): Promise<OpportunityRecord[]> {
    let rows = [...this.opportunities.values()].filter((o) => o.workspaceId === workspaceId);
    if (!filter.includeClosed) rows = rows.filter((o) => o.status === "open");
    if (filter.accountId)
      rows = rows.filter((o) => o.accountId === filter.accountId);
    if (filter.stage) rows = rows.filter((o) => o.stage === filter.stage);
    if (filter.ownerSub) rows = rows.filter((o) => o.ownerSub === filter.ownerSub);
    if (filter.territoryId) rows = rows.filter((o) => o.territoryId === filter.territoryId);
    // Matches the adapter's ORDER BY. Without it `limit` took an arbitrary
    // slice here and the earliest-closing deals in production.
    rows.sort(by(asc((o: OpportunityRecord) => o.expectedCloseAt)));
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
    const before = claimStateOf(row);

    row.stage = plan.patch.stage;
    row.status = plan.patch.status;
    row.closedAt = plan.patch.closedAt;
    if (plan.patch.probability !== undefined) row.probability = plan.patch.probability;
    if (plan.patch.forecastCategory !== undefined) row.forecastCategory = plan.patch.forecastCategory;

    this.seq += 1;
    this.events.push({ id: `evt_${this.seq}`, opportunityId, ...plan.event });
    this.logClaims(workspaceId, opportunityId, before, claimStateOf(row), stageMachineClaim(plan.event.occurredAt));
    if (plan.exit) {
      this.exits.push({
        workspaceId,
        opportunityId,
        ...plan.exit,
        decidedBySub: plan.event.actorSub ?? "system",
        decidedAt: plan.event.occurredAt,
      });
    }
    return true;
  }

  async abandonOpportunity(
    workspaceId: string,
    opportunityId: string,
    plan: AbandonPlan & { decidedBySub: string },
  ): Promise<boolean> {
    const row = this.opportunities.get(opportunityId);
    if (!row || row.workspaceId !== workspaceId || row.status !== "open") return false;
    const before = claimStateOf(row);
    row.status = plan.patch.status;
    row.closedAt = plan.patch.closedAt;
    row.forecastCategory = plan.patch.forecastCategory;
    this.logClaims(workspaceId, opportunityId, before, claimStateOf(row), stageMachineClaim(plan.patch.closedAt));
    this.exits.push({ workspaceId, opportunityId, ...plan.exit, decidedBySub: plan.decidedBySub, decidedAt: plan.patch.closedAt });
    return true;
  }

  async latestDealExit(workspaceId: string, opportunityId: string): Promise<DealExitRecord | null> {
    const mine = this.exits
      .filter((e) => e.workspaceId === workspaceId && e.opportunityId === opportunityId)
      .sort((a, b) => b.decidedAt.getTime() - a.decidedAt.getTime());
    const e = mine[0];
    return e ? { outcome: e.outcome, reasonCode: e.reasonCode, note: e.note, decidedBySub: e.decidedBySub, decidedAt: e.decidedAt } : null;
  }

  async updateCommercialTerms(
    workspaceId: string,
    opportunityId: string,
    patch: CommercialTermsPatch,
    claim: ClaimContext,
  ): Promise<boolean> {
    const row = this.opportunities.get(opportunityId);
    if (!row || row.workspaceId !== workspaceId) return false;
    const before = claimStateOf(row);

    // Field by field against `undefined`, not a spread: `amount: null` and
    // `expectedCloseAt: null` are meaningful values ("unpriced", "no date"), and
    // a spread of the whole patch would let an absent key overwrite a present
    // one with undefined.
    if (patch.amount !== undefined) row.amount = patch.amount;
    if (patch.probability !== undefined) row.probability = patch.probability;
    if (patch.expectedCloseAt !== undefined) row.expectedCloseAt = patch.expectedCloseAt;
    if (patch.forecastCategory !== undefined) row.forecastCategory = patch.forecastCategory;
    // NOT NULL since incr/0034 - reassigning to nobody is not a move this
    // product offers, and the patch type still allows null for callers that
    // predate it. Ignored rather than written, which is what the column
    // enforces anyway.
    if (patch.ownerSub) row.ownerSub = patch.ownerSub;
    if (patch.contractTypeId !== undefined) row.contractTypeId = patch.contractTypeId;
    if (patch.businessFormId !== undefined) row.businessFormId = patch.businessFormId;
    if (patch.customerBudget !== undefined) {
      row.customerBudget = patch.customerBudget.amount;
      row.customerBudgetBySub = patch.customerBudget.bySub;
      row.customerBudgetAt = patch.customerBudget.at;
    }
    this.logClaims(workspaceId, opportunityId, before, claimStateOf(row), claim);
    return true;
  }

  async latestStageChangeAt(workspaceId: string): Promise<Map<string, Date>> {
    const out = new Map<string, Date>();
    for (const e of this.events) {
      // Scoped through the opportunity, the way listStageEvents does it: the
      // journal rows carry no workspace of their own here, and inventing one
      // on the in-memory side would let the two adapters disagree about what
      // tenant isolation means.
      const owner = this.opportunities.get(e.opportunityId);
      if (!owner || owner.workspaceId !== workspaceId) continue;
      const held = out.get(e.opportunityId);
      if (!held || e.occurredAt.getTime() > held.getTime()) {
        out.set(e.opportunityId, e.occurredAt);
      }
    }
    return out;
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

  async listWinLossReasons(workspaceId: string): Promise<WinLossReasonRecord[]> {
    return this.reasons
      .filter((r) => r.workspaceId === workspaceId)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.reasonCode.localeCompare(b.reasonCode));
  }

  async upsertWinLossReason(
    workspaceId: string,
    input: Omit<WinLossReasonRecord, "id" | "workspaceId" | "sortOrder">,
  ): Promise<WinLossReasonRecord> {
    const at = this.reasons.findIndex(
      (r) => r.workspaceId === workspaceId && r.reasonCode === input.reasonCode,
    );
    if (at >= 0) {
      const next = { ...this.reasons[at]!, ...input, reasonCode: this.reasons[at]!.reasonCode };
      this.reasons[at] = next;
      return next;
    }
    const tail = Math.max(
      0,
      ...this.reasons.filter((r) => r.workspaceId === workspaceId).map((r) => r.sortOrder),
    );
    const row: WinLossReasonRecord = {
      id: `wlx_${++this.seq}`, workspaceId, sortOrder: tail + 1, ...input,
    };
    this.reasons.push(row);
    return row;
  }

  async setWinLossReasonOrder(
    workspaceId: string,
    orders: readonly { id: string; sortOrder: number }[],
  ): Promise<void> {
    const want = new Map(orders.map((o) => [o.id, o.sortOrder]));
    this.reasons = this.reasons.map((r) =>
      r.workspaceId === workspaceId && want.has(r.id) ? { ...r, sortOrder: want.get(r.id)! } : r,
    );
  }

  async removeWinLossReason(workspaceId: string, reasonId: string): Promise<boolean> {
    const before = this.reasons.length;
    this.reasons = this.reasons.filter(
      (r) => !(r.workspaceId === workspaceId && r.id === reasonId),
    );
    return this.reasons.length < before;
  }

  async countReviewsByReason(workspaceId: string, reasonId: string): Promise<number> {
    return [...this.reviews.values()].filter(
      (r) => r.workspaceId === workspaceId && r.primaryReasonId === reasonId,
    ).length;
  }

  async listStageDefinitions(workspaceId: string): Promise<StageDefinitionRecord[]> {
    return this.stageDefinitions
      .filter((s) => s.workspaceId === workspaceId)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.stageCode.localeCompare(b.stageCode));
  }

  async upsertStageDefinition(
    workspaceId: string,
    input: Omit<StageDefinitionRecord, "id" | "workspaceId" | "sortOrder">,
  ): Promise<StageDefinitionRecord> {
    const at = this.stageDefinitions.findIndex(
      (s) => s.workspaceId === workspaceId && s.stageCode === input.stageCode,
    );
    if (at >= 0) {
      const next = { ...this.stageDefinitions[at]!, ...input, stageCode: this.stageDefinitions[at]!.stageCode };
      this.stageDefinitions[at] = next;
      return next;
    }
    const tail = Math.max(
      0,
      ...this.stageDefinitions.filter((s) => s.workspaceId === workspaceId).map((s) => s.sortOrder),
    );
    const row: StageDefinitionRecord = {
      id: `stg_${++this.seq}`, workspaceId, sortOrder: tail + 1, ...input,
    };
    this.stageDefinitions.push(row);
    return row;
  }

  async setStageDefinitionOrder(
    workspaceId: string,
    orders: readonly { id: string; sortOrder: number }[],
  ): Promise<void> {
    const want = new Map(orders.map((o) => [o.id, o.sortOrder]));
    this.stageDefinitions = this.stageDefinitions.map((s) =>
      s.workspaceId === workspaceId && want.has(s.id) ? { ...s, sortOrder: want.get(s.id)! } : s,
    );
  }

  async removeStageDefinition(workspaceId: string, stageId: string): Promise<boolean> {
    const before = this.stageDefinitions.length;
    this.stageDefinitions = this.stageDefinitions.filter(
      (s) => !(s.workspaceId === workspaceId && s.id === stageId),
    );
    return this.stageDefinitions.length < before;
  }

  async countOpportunitiesByStage(workspaceId: string, stageCode: string): Promise<number> {
    return [...this.opportunities.values()].filter(
      (o) => o.workspaceId === workspaceId && o.stage === stageCode,
    ).length;
  }

  async listContractTypes(workspaceId: string): Promise<ContractTypeRecord[]> {
    return this.contractTypes
      .filter((c) => c.workspaceId === workspaceId)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.contractTypeCode.localeCompare(b.contractTypeCode));
  }

  async upsertContractType(
    workspaceId: string,
    input: Omit<ContractTypeRecord, "id" | "workspaceId" | "sortOrder">,
  ): Promise<ContractTypeRecord> {
    const at = this.contractTypes.findIndex(
      (c) => c.workspaceId === workspaceId && c.contractTypeCode === input.contractTypeCode,
    );
    if (at >= 0) {
      const next = {
        ...this.contractTypes[at]!,
        ...input,
        contractTypeCode: this.contractTypes[at]!.contractTypeCode,
      };
      this.contractTypes[at] = next;
      return next;
    }
    const tail = Math.max(
      0,
      ...this.contractTypes.filter((c) => c.workspaceId === workspaceId).map((c) => c.sortOrder),
    );
    const row: ContractTypeRecord = {
      id: `ctp_${++this.seq}`, workspaceId, sortOrder: tail + 1, ...input,
    };
    this.contractTypes.push(row);
    return row;
  }

  async setContractTypeOrder(
    workspaceId: string,
    orders: readonly { id: string; sortOrder: number }[],
  ): Promise<void> {
    const want = new Map(orders.map((o) => [o.id, o.sortOrder]));
    this.contractTypes = this.contractTypes.map((c) =>
      c.workspaceId === workspaceId && want.has(c.id) ? { ...c, sortOrder: want.get(c.id)! } : c,
    );
  }

  async removeContractType(workspaceId: string, contractTypeId: string): Promise<boolean> {
    const before = this.contractTypes.length;
    this.contractTypes = this.contractTypes.filter(
      (c) => !(c.workspaceId === workspaceId && c.id === contractTypeId),
    );
    return this.contractTypes.length < before;
  }

  async countOpportunitiesByContractType(workspaceId: string, contractTypeId: string): Promise<number> {
    return [...this.opportunities.values()].filter(
      (o) => o.workspaceId === workspaceId && o.contractTypeId === contractTypeId,
    ).length;
  }

  async listBusinessForms(workspaceId: string): Promise<BusinessFormRecord[]> {
    return this.businessForms
      .filter((b) => b.workspaceId === workspaceId)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.businessFormCode.localeCompare(b.businessFormCode));
  }

  async upsertBusinessForm(
    workspaceId: string,
    input: Omit<BusinessFormRecord, "id" | "workspaceId" | "sortOrder" | "stallDaysOverride">,
  ): Promise<BusinessFormRecord> {
    const at = this.businessForms.findIndex(
      (b) => b.workspaceId === workspaceId && b.businessFormCode === input.businessFormCode,
    );
    if (at >= 0) {
      const next = {
        ...this.businessForms[at]!,
        ...input,
        businessFormCode: this.businessForms[at]!.businessFormCode,
      };
      this.businessForms[at] = next;
      return next;
    }
    const tail = Math.max(
      0,
      ...this.businessForms.filter((b) => b.workspaceId === workspaceId).map((b) => b.sortOrder),
    );
    const row: BusinessFormRecord = {
      id: `bfm_${++this.seq}`, workspaceId, sortOrder: tail + 1, stallDaysOverride: null, ...input,
    };
    this.businessForms.push(row);
    return row;
  }

  async setBusinessFormStallOverride(
    workspaceId: string,
    businessFormId: string,
    stallDaysOverride: number | null,
  ): Promise<BusinessFormRecord | null> {
    const at = this.businessForms.findIndex(
      (b) => b.workspaceId === workspaceId && b.id === businessFormId,
    );
    if (at < 0) return null;
    const next = { ...this.businessForms[at]!, stallDaysOverride };
    this.businessForms[at] = next;
    return next;
  }

  async setBusinessFormOrder(
    workspaceId: string,
    orders: readonly { id: string; sortOrder: number }[],
  ): Promise<void> {
    const want = new Map(orders.map((o) => [o.id, o.sortOrder]));
    this.businessForms = this.businessForms.map((b) =>
      b.workspaceId === workspaceId && want.has(b.id) ? { ...b, sortOrder: want.get(b.id)! } : b,
    );
  }

  async removeBusinessForm(workspaceId: string, businessFormId: string): Promise<boolean> {
    const before = this.businessForms.length;
    this.businessForms = this.businessForms.filter(
      (b) => !(b.workspaceId === workspaceId && b.id === businessFormId),
    );
    return this.businessForms.length < before;
  }

  async countOpportunitiesByBusinessForm(workspaceId: string, businessFormId: string): Promise<number> {
    return [...this.opportunities.values()].filter(
      (o) => o.workspaceId === workspaceId && o.businessFormId === businessFormId,
    ).length;
  }

  async countWonOpportunitiesForAccount(workspaceId: string, accountId: string): Promise<number> {
    return [...this.opportunities.values()].filter(
      (o) => o.workspaceId === workspaceId && o.accountId === accountId && o.status === "won",
    ).length;
  }

  private thresholds = new Map<string, ForecastThresholds>();

  async getForecastThresholds(workspaceId: string): Promise<ForecastThresholds> {
    return this.thresholds.get(workspaceId) ?? DEFAULT_FORECAST_THRESHOLDS;
  }

  async setForecastThresholds(workspaceId: string, input: ForecastThresholds): Promise<void> {
    this.thresholds.set(workspaceId, { ...input });
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
      primaryReasonId: review.primaryReasonId,
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
          (o.status === "won" || o.status === "lost" || o.status === "abandoned") &&
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
