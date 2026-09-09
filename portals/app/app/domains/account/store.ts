// D4 account persistence port.
//
// One thing here differs from the pipeline port and is worth stating: the
// relationship graph is APPEND-ONLY. yucer_core.account_relation has no UPDATE
// grant at all, so the port offers addRelation and removeRelation and no way to
// edit one. A relationship that changed is a new edge, and the old edge is
// deleted or left standing - it is never rewritten in place, because "who
// reported to whom last quarter" is a fact the decision-chain analysis reads.

import {
  DEFAULT_MARKET_SCOPE,
  MARKET_DIVISIONS,
  MARKET_DIVISION_PROVINCES,
  DIVISION_TEMPLATES,
  frameMembers,
  scopePrefix,
  templatesFor,
  type DivisionTemplate,
  type MarketMember,
  type MarketScope,
} from "../shared/market-division";
import type { AccountStatus, ContactNode, DecisionRole, ProjectHealth, RelationEdge } from "./lib/health";
import { asc, by, desc } from "../shared/order";
import type { ContactDraft } from "./lib/contact";
import type { IndustryDraft } from "./lib/industry-vocab";

export interface AccountRecord {
  id: string;
  workspaceId: string;
  accountNo: string;
  name: string;
  /**
   * incr/0040. The join into this workspace's own industry vocabulary.
   *
   * This is the column; `industry` below is what it reads as. Null is the
   * ordinary state of a fresh prospect - unlike product.unit_id, which a
   * quotable product cannot be without.
   */
  industryId: string | null;
  /**
   * The industry's display name, RESOLVED ON READ from `industryId`.
   *
   * Derived, never written: the patch takes `industryId`. It is carried on the
   * record rather than joined by each screen because the completeness rule
   * compares it to `market_segment.criteria.industries`, which are names - a
   * per-screen lookup would put that join in five places and leave the rule
   * with nothing to compare.
   */
  industry: string | null;
  region: string | null;
  /**
   * incr/0035. The provincial-level division - one granularity below `region`.
   *
   * Both are stored rather than one derived from the other: `region` is a 大区
   * and is what TERRITORY ROUTING matches on, so writing a province into it
   * would place the account on ground no territory covers and quietly make it
   * unassignable. CHECK-constrained in the database to the 34 divisions.
   */
  province: string | null;
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

/** One 大区, as this workspace has it (incr/0036, members by frame since 0045). */
export interface MarketDivisionRecord {
  id: string;
  code: string;
  name: string;
  /** The frame it was carved in (incr/0043). Its code carries the prefix. */
  scope: MarketScope["kind"];
  sortOrder: number;
  /** What it holds - provinces under 中国市场, cities under 省级市场 - in no
   *  particular order. `key` is the stored identity, `label` the printed one. */
  members: MarketMember[];
}

/**
 * 行业 - one entry in this workspace's own industry vocabulary (incr/0040).
 *
 * `industryCode` is the anchor and never changes; `name` is what people read
 * and may be corrected at any time. Same shape as the catalogue's three
 * vocabularies, and the same reason for it.
 */
export interface IndustryRecord {
  id: string;
  workspaceId: string;
  industryCode: string;
  name: string;
  sortOrder: number;
}

export interface AccountStore {
  listAccounts(workspaceId: string, filter?: AccountFilter): Promise<AccountRecord[]>;
  /**
   * How this workspace divides its market.
   *
   * PRESET, THEN THEIRS. incr/0036 seeds five divisions and places all 34
   * provinces; the tenant may rename, re-order and move provinces afterwards.
   * Read rather than derived, because a 大区 is a sales structure and not a
   * fact of geography - deriving it in code would make the division a property
   * of the build and the same for every tenant.
   */
  /**
   * The divisions of the workspace's CURRENT frame.
   *
   * A workspace that switches frame does not lose the carve it made in the
   * old one - those rows stay, with their own scope - it stops seeing them.
   * Listing is by frame so a china carve and a global one never mix in one
   * roster or one roll-up.
   */
  listMarketDivisions(workspaceId: string): Promise<MarketDivisionRecord[]>;
  /* --- 市场范围 (incr/0043) --------------------------------------------------
     One row per workspace: `get` answers china where no row exists yet, and
     `set` writes it either way. */
  getMarketScope(workspaceId: string): Promise<MarketScope>;
  setMarketScope(workspaceId: string, scope: MarketScope): Promise<void>;
  /**
   * The ground the current frame is carved from: the 34 provinces under
   * 中国市场, the province's cities under 省级市场. What the picker offers and
   * what the coverage line counts against.
   */
  listFrameMembers(workspaceId: string): Promise<MarketMember[]>;
  /**
   * 预置方案 - the shipped carves that cut the current frame (incr/0047),
   * read from yucer_ref.market_carve. The service adopts one by copying its
   * rows; it never holds a carve of its own.
   */
  listCarves(workspaceId: string): Promise<DivisionTemplate[]>;
  /**
   * Place one member (a province, or a city) in one 大区, or in none when
   * code is null.
   *
   * A member belongs to AT MOST ONE division - both member tables' primary
   * keys say so - therefore this replaces rather than adds. Returns false when
   * the division code is not one this workspace has.
   */
  placeMember(
    workspaceId: string,
    memberKey: string,
    divisionCode: string | null,
  ): Promise<boolean>;
  /**
   * Create a 大区, or rename/re-order one that exists.
   *
   * THE TENANT OWNS THE LIST, not just the membership. Five are preset, and a
   * workspace that sells differently is expected to change them - a 新疆基地
   * holding one province is as legitimate a division as 西部 holding ten. The
   * code is the anchor and is never rewritten: upserting an existing code
   * renames it, a new code creates one.
   */
  upsertMarketDivision(
    workspaceId: string,
    input: { code: string; name: string; sortOrder?: number },
  ): Promise<MarketDivisionRecord>;
  /** Remove a 大区. Refuses while it still holds provinces - see the service. */
  removeMarketDivision(workspaceId: string, code: string): Promise<boolean>;
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
        | "name" | "industryId" | "region" | "province" | "segmentCode" | "ownerSub" | "healthScore"
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

  /* --- 行业 (incr/0040) -----------------------------------------------------
     The same five the catalogue vocabularies have. `countAccountsByIndustry`
     is what makes the delete refusal predictable: fk_account_industry RESTRICTs
     underneath, and a control whose refusal is known in advance should say so
     before it is clicked. */
  listIndustries(workspaceId: string): Promise<IndustryRecord[]>;
  upsertIndustry(workspaceId: string, input: IndustryDraft): Promise<IndustryRecord>;
  setIndustryOrder(
    workspaceId: string,
    orders: readonly { id: string; sortOrder: number }[],
  ): Promise<void>;
  removeIndustry(workspaceId: string, industryId: string): Promise<boolean>;
  countAccountsByIndustry(workspaceId: string, industryId: string): Promise<number>;
}

export class InMemoryAccountStore implements AccountStore {
  private plans = new Map<string, AccountPlanRecord>();
  private seq = 0;

  /* The demo has no database, so it carries the same preset incr/0036 seeds.
     market-division.test.ts parses that SQL and fails if the two ever
     disagree - the SQL is the authority, this is a copy for a store that has
     nothing to read. A tenant's edits live in the database; there are none
     here to make. */
  /* The tenant's own edits, over the preset. A workspace that has moved
     nothing has an empty map and reads the preset exactly; the demo has no
     database, so this is where its edits live for the life of the process. */
  private divisionMoves = new Map<string, Map<string, string | null>>();
  /* incr/0043. The frame, per workspace; absent reads as china. */
  private scopes = new Map<string, MarketScope>();

  async getMarketScope(workspaceId: string): Promise<MarketScope> {
    return this.scopes.get(workspaceId) ?? DEFAULT_MARKET_SCOPE;
  }

  async setMarketScope(workspaceId: string, scope: MarketScope): Promise<void> {
    this.scopes.set(workspaceId, { ...scope });
  }

  /* The tenant's own divisions, over the preset. Same shape as divisionMoves:
     an empty map means "the preset, unchanged". */
  private divisionEdits = new Map<string, Map<string, { name: string; sortOrder: number } | null>>();

  private divisionsFor(workspaceId: string): { code: string; name: string; sortOrder: number }[] {
    const edits = this.divisionEdits.get(workspaceId) ?? new Map();
    const out = new Map<string, { code: string; name: string; sortOrder: number }>();
    for (const d of MARKET_DIVISIONS) {
      out.set(d.code, { code: d.code, name: d.name, sortOrder: d.sortOrder });
    }
    for (const [code, edit] of edits) {
      if (edit === null) out.delete(code);
      else out.set(code, { code, name: edit.name, sortOrder: edit.sortOrder });
    }
    return [...out.values()].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  }

  async upsertMarketDivision(
    workspaceId: string,
    input: { code: string; name: string; sortOrder?: number },
  ): Promise<MarketDivisionRecord> {
    let ws = this.divisionEdits.get(workspaceId);
    if (!ws) { ws = new Map(); this.divisionEdits.set(workspaceId, ws); }
    const existing = this.divisionsFor(workspaceId).find((d) => d.code === input.code);
    ws.set(input.code, {
      name: input.name,
      sortOrder: input.sortOrder ?? existing?.sortOrder ?? this.divisionsFor(workspaceId).length + 1,
    });
    const rows = await this.listMarketDivisions(workspaceId);
    return rows.find((d) => d.code === input.code)!;
  }

  async removeMarketDivision(workspaceId: string, code: string): Promise<boolean> {
    if (!this.divisionsFor(workspaceId).some((d) => d.code === code)) return false;
    let ws = this.divisionEdits.get(workspaceId);
    if (!ws) { ws = new Map(); this.divisionEdits.set(workspaceId, ws); }
    ws.set(code, null);
    return true;
  }

  async listFrameMembers(workspaceId: string): Promise<MarketMember[]> {
    return [...frameMembers(await this.getMarketScope(workspaceId))];
  }

  async listCarves(workspaceId: string): Promise<DivisionTemplate[]> {
    // The mirror of incr/0047, proved against the table by market-carve.db.test.ts.
    return [...templatesFor(DIVISION_TEMPLATES, await this.getMarketScope(workspaceId))];
  }

  async placeMember(
    workspaceId: string,
    memberKey: string,
    divisionCode: string | null,
  ): Promise<boolean> {
    if (divisionCode !== null && !this.divisionsFor(workspaceId).some((d) => d.code === divisionCode)) {
      return false;
    }
    let ws = this.divisionMoves.get(workspaceId);
    if (!ws) { ws = new Map(); this.divisionMoves.set(workspaceId, ws); }
    ws.set(memberKey, divisionCode);
    return true;
  }

  async listMarketDivisions(workspaceId: string): Promise<MarketDivisionRecord[]> {
    const moved = this.divisionMoves.get(workspaceId) ?? new Map<string, string | null>();
    const placement = new Map<string, string>();
    for (const [province, code] of Object.entries(MARKET_DIVISION_PROVINCES)) {
      placement.set(province, code);
    }
    for (const [member, code] of moved) {
      if (code === null) placement.delete(member);
      else placement.set(member, code);
    }
    /* BY FRAME: the preset is a china carve, and so is anything a tenant adds
       through the form, since the form composes the code from the frame's
       prefix. A row whose prefix is not this frame's belongs to a carve made
       under another frame and stays out of this list - and so do its members,
       since a member follows its division. Labels come from the frame's own
       ground; a key it does not know (a province placed while the frame was
       china, read back under 陕西) is not a member here. */
    const scope = await this.getMarketScope(workspaceId);
    const prefix = scopePrefix(scope);
    const label = new Map(frameMembers(scope).map((m) => [m.key, m.label]));
    return this.divisionsFor(workspaceId).filter((d) => d.code.startsWith(prefix)).map((d) => ({
      id: `div_${d.code}`,
      code: d.code,
      name: d.name,
      scope: scope.kind,
      sortOrder: d.sortOrder,
      members: [...placement.entries()]
        .filter(([key, code]) => code === d.code && label.has(key))
        .map(([key]) => ({ key, label: label.get(key)! })),
    }));
  }

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
  /* incr/0040. The workspace's industry vocabulary, which the database holds
     in yucer_core.industry. */
  private industries: IndustryRecord[] = [];
  private contacts: ContactRecord[] = [];
  private relations: Array<RelationEdge & { workspaceId: string; accountId: string }> = [];
  private inputs = new Map<string, HealthInputs>();

  seed(input: {
    accounts?: AccountRecord[];
    industries?: IndustryRecord[];
    plans?: AccountPlanRecord[];
    contacts?: ContactRecord[];
    relations?: Array<RelationEdge & { workspaceId: string; accountId: string }>;
    healthInputs?: Record<string, HealthInputs>;
    opportunityContacts?: OpportunityContactRecord[];
  }): void {
    for (const pl of input.plans ?? []) this.plans.set(`${pl.workspaceId}|${pl.accountId}`, pl);
    this.industries.push(...(input.industries ?? []));
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

  /**
   * `industry` as the vocabulary currently spells it.
   *
   * ONLY WHERE THE ROW CARRIES A JOIN. A fixture that seeds a bare industry
   * name and never touches the vocabulary is describing an account as it reads
   * back, and this store is where fixtures live; the join itself is a property
   * of Postgres and is proved there, by the db tests, against the real FK.
   */
  private hydrate(a: AccountRecord): AccountRecord {
    if (!a.industryId) return { ...a };
    const row = this.industries.find(
      (i) => i.workspaceId === a.workspaceId && i.id === a.industryId,
    );
    return { ...a, industry: row?.name ?? null };
  }

  async listAccounts(workspaceId: string, filter: AccountFilter = {}): Promise<AccountRecord[]> {
    let rows = [...this.accounts.values()]
      .filter((a) => a.workspaceId === workspaceId)
      .map((a) => this.hydrate(a));
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
    return a && a.workspaceId === workspaceId ? this.hydrate(a) : null;
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

  async listIndustries(workspaceId: string): Promise<IndustryRecord[]> {
    return this.industries
      .filter((i) => i.workspaceId === workspaceId)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.industryCode.localeCompare(b.industryCode));
  }

  async upsertIndustry(workspaceId: string, input: IndustryDraft): Promise<IndustryRecord> {
    const at = this.industries.findIndex(
      (i) => i.workspaceId === workspaceId && i.industryCode === input.industryCode,
    );
    if (at >= 0) {
      // The code is the anchor: an upsert on it renames, never re-keys.
      const next = { ...this.industries[at]!, name: input.name };
      this.industries[at] = next;
      return next;
    }
    const tail = Math.max(
      0,
      ...this.industries.filter((i) => i.workspaceId === workspaceId).map((i) => i.sortOrder),
    );
    const row: IndustryRecord = {
      id: `ind_${++this.seq}`,
      workspaceId,
      sortOrder: tail + 1,
      ...input,
    };
    this.industries.push(row);
    return row;
  }

  async setIndustryOrder(
    workspaceId: string,
    orders: readonly { id: string; sortOrder: number }[],
  ): Promise<void> {
    const want = new Map(orders.map((o) => [o.id, o.sortOrder]));
    this.industries = this.industries.map((i) =>
      i.workspaceId === workspaceId && want.has(i.id) ? { ...i, sortOrder: want.get(i.id)! } : i,
    );
  }

  async removeIndustry(workspaceId: string, industryId: string): Promise<boolean> {
    const before = this.industries.length;
    this.industries = this.industries.filter(
      (i) => !(i.workspaceId === workspaceId && i.id === industryId),
    );
    return this.industries.length < before;
  }

  async countAccountsByIndustry(workspaceId: string, industryId: string): Promise<number> {
    return [...this.accounts.values()].filter(
      (a) => a.workspaceId === workspaceId && a.industryId === industryId,
    ).length;
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
