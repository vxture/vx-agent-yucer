// D4 account persistence port.
//
// One thing here differs from the pipeline port and is worth stating: the
// relationship graph is APPEND-ONLY. yucer_core.account_relation has no UPDATE
// grant at all, so the port offers addRelation and removeRelation and no way to
// edit one. A relationship that changed is a new edge, and the old edge is
// deleted or left standing - it is never rewritten in place, because "who
// reported to whom last quarter" is a fact the decision-chain analysis reads.

import type { AccountStatus, ContactNode, DecisionRole, ProjectHealth, RelationEdge } from "./lib/health";
import { asc, by, desc } from "../shared/order";
import type { ContactDraft } from "./lib/contact";

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
  /**
   * What identifies the legal entity, which `name` does not - incr/0024.
   *
   * A partial unique index enforces one row per (workspace, credit_code), so
   * this is the column that makes a duplicate customer master record refusable
   * rather than merely regrettable. NULL is always allowed and never collides:
   * not knowing the code yet is the normal state of a new prospect.
   */
  creditCode: string | null;
  website: string | null;
  /** A headcount. The bands are the owner's vocabulary - see incr/0024. */
  employeeCount: number | null;
  /** The parent company, or null for a customer that is nobody's subsidiary. */
  parentId: string | null;
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

/**
 * A person at a customer: who they are, what they do there, how to reach them.
 *
 * NO BUYING ROLE, since incr/0028. It used to extend ContactNode and so carried
 * decisionRole and influence, which made every reader able to ask a person what
 * they are on a deal - a question a person cannot answer. Roles come from
 * yucer_pipeline.opportunity_contact and reach the rule layer only through
 * chainForOpportunity().
 */
export interface ContactRecord {
  id: string;
  status: string;
  workspaceId: string;
  accountId: string;
  name: string;
  title: string | null;
  department: string | null;
  /** incr/0024 - how to actually reach this person. */
  email: string | null;
  mobile: string | null;
  wechat: string | null;
}

/**
 * One person's stated role on one deal - incr/0027.
 *
 * THE PORT LIVES IN D4 rather than D6 even though the table is in
 * yucer_pipeline, because the only reader is the decision chain and that is
 * D4's question. The table's OWNER is still D6 (ADR-001, one object one
 * partition); owning an object and being the one who asks about it are
 * different things, and the alternative - D4 importing a D6 port to answer a
 * D4 question - is the cross-domain coupling the partition rule exists to
 * prevent.
 */
export interface OpportunityContactRecord {
  id: string;
  workspaceId: string;
  opportunityId: string;
  personId: string;
  buyingRole: DecisionRole;
  influence: number | null;
  isPrimary: boolean;
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
  /**
   * The stated buying roles for one deal - incr/0027.
   *
   * An EMPTY result is the ordinary case and means something: this deal has not
   * distinguished itself from the customer-level default. It is not an error
   * and not an empty chain.
   */
  listOpportunityContacts(workspaceId: string, opportunityId: string): Promise<OpportunityContactRecord[]>;
  /** Every stated role across several deals, for a batch pass. */
  listOpportunityContactsFor(
    workspaceId: string,
    opportunityIds: readonly string[],
  ): Promise<OpportunityContactRecord[]>;
  setOpportunityContact(
    workspaceId: string,
    opportunityId: string,
    personId: string,
    patch: { buyingRole: DecisionRole; influence: number | null; isPrimary?: boolean },
  ): Promise<OpportunityContactRecord | null>;
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
    // creditCode/website/employeeCount joined with incr/0024 and parentId with
    // incr/0025. The column lock allows all four; a patch type that did not
    // would repeat the tier defect noted above, where the column existed, the
    // grant existed, and no path could set it.
    patch: Partial<
      Pick<
        AccountRecord,
        | "name" | "industry" | "region" | "segmentCode" | "ownerSub" | "healthScore"
        | "status" | "tier" | "creditCode" | "website" | "employeeCount" | "parentId"
      >
    >,
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
  /**
   * Create a contact, or edit one by id.
   *
   * BY ID, not by a business key. A territory has a code and a product has a
   * code; a person has a name, and two people at one customer can share one.
   * So `id` absent means create and `id` present means edit that row -
   * anything else would silently merge two colleagues.
   */
  upsertContact(
    workspaceId: string,
    accountId: string,
    input: ContactDraft,
  ): Promise<ContactRecord | null>;
  /** Append-only edge. There is deliberately no updateRelation. */
  addRelation(workspaceId: string, edge: RelationEdge): Promise<void>;
  removeRelation(workspaceId: string, edge: RelationEdge): Promise<void>;
  listRelations(workspaceId: string, accountId: string): Promise<RelationEdge[]>;

  /** The inputs a health recompute needs, gathered across domains. */
  healthInputs(workspaceId: string, accountId: string): Promise<HealthInputs>;
}

export class InMemoryAccountStore implements AccountStore {
  private plans = new Map<string, AccountPlanRecord>();
  private seq = 0;

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
    opportunityContacts?: OpportunityContactRecord[];
  }): void {
    for (const pl of input.plans ?? []) this.plans.set(`${pl.workspaceId}|${pl.accountId}`, pl);
    for (const a of input.accounts ?? []) this.accounts.set(a.id, { ...a });
    this.contacts.push(...(input.contacts ?? []));
    this.relations.push(...(input.relations ?? []));
    for (const [k, v] of Object.entries(input.healthInputs ?? {})) this.inputs.set(k, v);
    this.oppContacts.push(...(input.opportunityContacts ?? []));
  }

  private oppContacts: OpportunityContactRecord[] = [];

  async listOpportunityContacts(
    workspaceId: string,
    opportunityId: string,
  ): Promise<OpportunityContactRecord[]> {
    return this.oppContacts.filter(
      (r) => r.workspaceId === workspaceId && r.opportunityId === opportunityId,
    );
  }

  async listOpportunityContactsFor(
    workspaceId: string,
    opportunityIds: readonly string[],
  ): Promise<OpportunityContactRecord[]> {
    const wanted = new Set(opportunityIds);
    return this.oppContacts.filter((r) => r.workspaceId === workspaceId && wanted.has(r.opportunityId));
  }

  async setOpportunityContact(
    workspaceId: string,
    opportunityId: string,
    personId: string,
    patch: { buyingRole: DecisionRole; influence: number | null; isPrimary?: boolean },
  ): Promise<OpportunityContactRecord | null> {
    // The pair is the identity - uidx_opportunity_contact_pair says so - so a
    // second statement about the same person on the same deal REPLACES the
    // first rather than adding a second answer.
    const held = this.oppContacts.find(
      (r) => r.workspaceId === workspaceId && r.opportunityId === opportunityId && r.personId === personId,
    );
    if (held) {
      held.buyingRole = patch.buyingRole;
      held.influence = patch.influence;
      if (patch.isPrimary !== undefined) held.isPrimary = patch.isPrimary;
      return held;
    }
    const made: OpportunityContactRecord = {
      id: `oc_${++this.seq}`,
      workspaceId,
      opportunityId,
      personId,
      buyingRole: patch.buyingRole,
      influence: patch.influence,
      isPrimary: patch.isPrimary ?? false,
    };
    this.oppContacts.push(made);
    return made;
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
    // BY NAME since incr/0027. Sorting a customer's roster by influence was
    // ranking people by a per-deal number stored on the person; the roster is
    // not a ranking, and the number no longer exists here.
    return this.contacts
      .filter((c) => c.workspaceId === workspaceId && c.accountId === accountId)
      .sort(by(asc((c: ContactRecord) => c.name)));
  }

  async upsertContact(
    workspaceId: string,
    accountId: string,
    input: ContactDraft,
  ): Promise<ContactRecord | null> {
    if (input.id) {
      const held = this.contacts.find(
        (c) => c.id === input.id && c.workspaceId === workspaceId && c.accountId === accountId,
      );
      // Null, not a throw and not a silent create: an id that belongs to
      // another workspace or another account is a caller error the service
      // turns into "not found", and creating a row instead would move a person
      // between customers.
      if (!held) return null;
      held.name = input.name;
      held.title = input.title;
      held.department = input.department;
      held.email = input.email;
      held.mobile = input.mobile;
      held.wechat = input.wechat;
      held.status = input.status;
      return held;
    }
    const created: ContactRecord = {
      id: `con_${++this.seq}`,
      workspaceId,
      accountId,
      name: input.name,
      title: input.title,
      department: input.department,
      email: input.email,
      mobile: input.mobile,
      wechat: input.wechat,
      status: input.status,
    };
    this.contacts.push(created);
    return created;
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
