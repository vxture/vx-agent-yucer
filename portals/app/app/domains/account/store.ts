// D4 account persistence port.
//
// One thing here differs from the pipeline port and is worth stating: the
// relationship graph is APPEND-ONLY. yucer_core.account_relation has no UPDATE
// grant at all, so the port offers addRelation and removeRelation and no way to
// edit one. A relationship that changed is a new edge, and the old edge is
// deleted or left standing - it is never rewritten in place, because "who
// reported to whom last quarter" is a fact the decision-chain analysis reads.

import type { AccountStatus, ContactNode, ProjectHealth, RelationEdge } from "./lib/health";
import { asc, by, desc } from "../shared/order";

export interface AccountRecord {
  id: string;
  workspaceId: string;
  accountNo: string;
  name: string;
  industry: string | null;
  region: string | null;
  segmentCode: string | null;
  ownerSub: string | null;
  healthScore: number | null;
  status: AccountStatus;
  /** strategic | key | standard - set by D1, not by the owner. See ADR-013. */
  tier: AccountTier;
}

export const ACCOUNT_TIERS = ["strategic", "key", "standard"] as const;
export type AccountTier = (typeof ACCOUNT_TIERS)[number];

/**
 * How we intend to work one strategic customer - see ADR-013.
 *
 * The cadence fields are why this exists: they let a judgement fire on an
 * ABSENCE, which every event-triggered rule is structurally unable to do.
 */
export interface AccountPlanRecord {
  id: string;
  workspaceId: string;
  accountId: string;
  period: string;
  targetAmount: number | null;
  contactCadenceDays: number;
  execCadenceDays: number;
  ownerSub: string | null;
  presalesSub: string | null;
  deliverySub: string | null;
  status: "active" | "closed";
}

export interface ContactRecord extends ContactNode {
  workspaceId: string;
  accountId: string;
  name: string;
  title: string | null;
  department: string | null;
}

export interface AccountFilter {
  /** Restrict to one tier - the cadence scan asks only for strategic ones. */
  tier?: AccountTier;
  status?: AccountStatus;
  ownerSub?: string;
  segmentCode?: string;
  limit?: number;
}

/** The source data a health recompute reads. Assembled by the service. */
export interface HealthInputs {
  openOpportunities: Array<{ stage: string; amount?: number | null }>;
  lastInteractionAt: Date | null;
  projectHealth: ProjectHealth[];
  overdueRevenueCount: number;
}

export interface AccountStore {
  listAccounts(workspaceId: string, filter?: AccountFilter): Promise<AccountRecord[]>;
  /** The live plan for one account, or null when it has none. */
  getAccountPlan(workspaceId: string, accountId: string): Promise<AccountPlanRecord | null>;
  getAccount(workspaceId: string, id: string): Promise<AccountRecord | null>;
  /** Whitelisted columns only; the adapter checks against the column-lock mirror. */
  updateAccount(
    workspaceId: string,
    id: string,
    // `tier` joined the patch on 2026-08-26 (batch 6c). The column lock has
    // allowed it since incr/0006 and this type did not, so nothing could
    // designate a strategic account - the tier existed, the cadence rule read
    // it, and no path could set it.
    patch: Partial<Pick<AccountRecord, "name" | "industry" | "region" | "segmentCode" | "ownerSub" | "healthScore" | "status" | "tier">>,
  ): Promise<boolean>;

  /**
   * Create or replace an account's plan for a period.
   *
   * `(account, period)` IS the plan's identity - re-planning the same period
   * edits that row, a different period is a new row. The port takes the whole
   * plan rather than a patch for the same reason `replaceLines` does: a plan is
   * a statement about a period, and merging half of one into the last one
   * produces a plan nobody wrote.
   */
  upsertAccountPlan(
    workspaceId: string,
    plan: Omit<AccountPlanRecord, "id" | "workspaceId">,
  ): Promise<AccountPlanRecord>;

  listContacts(workspaceId: string, accountId: string): Promise<ContactRecord[]>;
  /** Append-only edge. There is deliberately no updateRelation. */
  addRelation(workspaceId: string, edge: RelationEdge): Promise<void>;
  removeRelation(workspaceId: string, edge: RelationEdge): Promise<void>;
  listRelations(workspaceId: string, accountId: string): Promise<RelationEdge[]>;

  /** The inputs a health recompute needs, gathered across domains. */
  healthInputs(workspaceId: string, accountId: string): Promise<HealthInputs>;
}

export class InMemoryAccountStore implements AccountStore {
  private plans = new Map<string, AccountPlanRecord>();

  async getAccountPlan(workspaceId: string, accountId: string): Promise<AccountPlanRecord | null> {
    const p = this.plans.get(`${workspaceId}|${accountId}`);
    return p && p.status === "active" ? p : null;
  }

  /** Demo/seed entry point; the real write path is the planning service. */
  async upsertAccountPlan(
    workspaceId: string,
    plan: Omit<AccountPlanRecord, "id" | "workspaceId">,
  ): Promise<AccountPlanRecord> {
    const key = `${workspaceId}:${plan.accountId}`;
    const existing = this.plans.get(key);
    const row: AccountPlanRecord = {
      id: existing?.id ?? `apl_${this.plans.size + 1}`,
      workspaceId,
      ...plan,
    };
    this.plans.set(key, row);
    return row;
  }

  setAccountPlan(plan: AccountPlanRecord): void {
    this.plans.set(`${plan.workspaceId}|${plan.accountId}`, plan);
  }

  private accounts = new Map<string, AccountRecord>();
  private contacts: ContactRecord[] = [];
  private relations: Array<RelationEdge & { workspaceId: string; accountId: string }> = [];
  private inputs = new Map<string, HealthInputs>();

  seed(input: {
    accounts?: AccountRecord[];
    plans?: AccountPlanRecord[];
    contacts?: ContactRecord[];
    relations?: Array<RelationEdge & { workspaceId: string; accountId: string }>;
    healthInputs?: Record<string, HealthInputs>;
  }): void {
    for (const pl of input.plans ?? []) this.plans.set(`${pl.workspaceId}|${pl.accountId}`, pl);
    for (const a of input.accounts ?? []) this.accounts.set(a.id, { ...a });
    this.contacts.push(...(input.contacts ?? []));
    this.relations.push(...(input.relations ?? []));
    for (const [k, v] of Object.entries(input.healthInputs ?? {})) this.inputs.set(k, v);
  }

  async listAccounts(workspaceId: string, filter: AccountFilter = {}): Promise<AccountRecord[]> {
    let rows = [...this.accounts.values()].filter((a) => a.workspaceId === workspaceId);
    if (filter.status) rows = rows.filter((a) => a.status === filter.status);
    if (filter.ownerSub) rows = rows.filter((a) => a.ownerSub === filter.ownerSub);
    if (filter.segmentCode) rows = rows.filter((a) => a.segmentCode === filter.segmentCode);
    // Sickest first: the list exists to surface the accounts needing attention.
    // Unscored sorts last, which is Postgres ASC NULLS LAST - "never assessed"
    // is not "in trouble". Name breaks the tie so `limit` is deterministic.
    rows.sort(by(asc((a: AccountRecord) => a.healthScore), asc((a: AccountRecord) => a.name)));
    return filter.limit ? rows.slice(0, filter.limit) : rows;
    // tier filter applied by callers that ask for it
  }

  async getAccount(workspaceId: string, id: string): Promise<AccountRecord | null> {
    const a = this.accounts.get(id);
    return a && a.workspaceId === workspaceId ? { ...a } : null;
  }

  async updateAccount(
    workspaceId: string,
    id: string,
    patch: Partial<AccountRecord>,
  ): Promise<boolean> {
    const a = this.accounts.get(id);
    if (!a || a.workspaceId !== workspaceId) return false;
    Object.assign(a, patch);
    return true;
  }

  async listContacts(workspaceId: string, accountId: string): Promise<ContactRecord[]> {
    return this.contacts
      .filter((c) => c.workspaceId === workspaceId && c.accountId === accountId)
      .sort(by(desc((c: ContactRecord) => c.influence, { nulls: "last" })));
  }

  async addRelation(workspaceId: string, edge: RelationEdge): Promise<void> {
    const exists = this.relations.some(
      (r) =>
        r.workspaceId === workspaceId &&
        r.fromContactId === edge.fromContactId &&
        r.toContactId === edge.toContactId &&
        r.relationType === edge.relationType,
    );
    // uidx_account_relation_edge: the same edge twice is one edge.
    if (!exists) this.relations.push({ ...edge, workspaceId, accountId: "" });
  }

  async removeRelation(workspaceId: string, edge: RelationEdge): Promise<void> {
    this.relations = this.relations.filter(
      (r) =>
        !(
          r.workspaceId === workspaceId &&
          r.fromContactId === edge.fromContactId &&
          r.toContactId === edge.toContactId &&
          r.relationType === edge.relationType
        ),
    );
  }

  async listRelations(workspaceId: string, accountId: string): Promise<RelationEdge[]> {
    const ids = new Set(
      this.contacts.filter((c) => c.workspaceId === workspaceId && c.accountId === accountId).map((c) => c.id),
    );
    return this.relations
      .filter((r) => r.workspaceId === workspaceId && (ids.has(r.fromContactId) || ids.has(r.toContactId)))
      .map((r) => ({ fromContactId: r.fromContactId, toContactId: r.toContactId, relationType: r.relationType }));
  }

  async healthInputs(workspaceId: string, accountId: string): Promise<HealthInputs> {
    return (
      this.inputs.get(`${workspaceId}|${accountId}`) ?? {
        openOpportunities: [],
        lastInteractionAt: null,
        projectHealth: [],
        overdueRevenueCount: 0,
      }
    );
  }
}
