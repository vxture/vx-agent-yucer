import { randomUUID } from "node:crypto";
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
  templatesFor,
  type DivisionTemplate,
  type MarketMember,
  type MarketScope,
} from "../shared/market-division";
import type { AccountStatus, ContactNode, DecisionRole, ProjectHealth, RelationEdge, RenewalHealthInput, Stance } from "./lib/health";
import { asc, by, desc } from "../shared/order";
import type { ContactDraft } from "./lib/contact";
import type { IndustryDraft } from "./lib/industry-vocab";
import type { CustomerTypeDraft } from "./lib/customer-type";
import type { CustomerSizeDraft } from "./lib/customer-size";
import type { CustomerNatureDraft } from "./lib/customer-nature";

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
  /**
   * incr/0071. The other two joins of 客户分类, same resolved-on-read shape
   * as `industry`/`industryId` above: the id is the column, the name is
   * derived, and the patch takes the id.
   */
  customerTypeId: string | null;
  customerType: string | null;
  customerSizeId: string | null;
  customerSize: string | null;
  /** incr/0072. The fourth join - what kind of organisation this is. */
  customerNatureId: string | null;
  customerNature: string | null;
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
  /** incr/0073 - this account's manual roster order, dense-renumbered by
   *  planMove. A fact about the employment edge, not the person. */
  sortOrder: number;
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
  /** incr/0075 - see health.ts's own note. Null = nobody has stated it. */
  stance: Stance | null;
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
  /** L4 batch three. Read from D6 and D7, never written from here. */
  renewal: RenewalHealthInput;
}

/** One 大区, as this workspace has it (incr/0036, members by frame since 0045). */
export interface MarketDivisionRecord {
  id: string;
  code: string;
  name: string;
  /** The frame it was carved in (incr/0043), and for a province frame which
   *  province (0045) - the letters that used to prefix the code. */
  scope: MarketScope["kind"];
  scopeProvince: string | null;
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

/** 客户类型 - incr/0071, same shape as IndustryRecord. */
export interface CustomerTypeRecord {
  id: string;
  workspaceId: string;
  customerTypeCode: string;
  name: string;
  sortOrder: number;
}

/** 客户规模 - incr/0071, same shape again. */
export interface CustomerSizeRecord {
  id: string;
  workspaceId: string;
  customerSizeCode: string;
  name: string;
  sortOrder: number;
}

/** 客户性质 - incr/0072, same shape again. */
export interface CustomerNatureRecord {
  id: string;
  workspaceId: string;
  customerNatureCode: string;
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
   * 预置方案 - the shipped carves that cut the current frame (incr/0045),
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
    patch: { buyingRole: DecisionRole; influence: number | null; isPrimary?: boolean; stance?: Stance | null },
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
    // customerTypeId/customerSizeId joined with incr/0071, customerNatureId
    // with incr/0072, the same way tier joined in batch 6c - the column lock
    // allows all three; a patch type that did not would leave nothing able
    // to set them.
    patch: Partial<
      Pick<
        AccountRecord,
        | "name" | "industryId" | "customerTypeId" | "customerSizeId" | "customerNatureId" | "region" | "province"
        | "segmentCode" | "ownerSub" | "healthScore"
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
  /** Reorder one account's roster - incr/0073. Scoped to `accountId`, unlike
   *  `setIndustryOrder`: a person's place in this list is per-account. */
  setContactOrder(
    workspaceId: string,
    accountId: string,
    orders: readonly { id: string; sortOrder: number }[],
  ): Promise<void>;
  /**
   * People already in this workspace, not yet affiliated with `excludeAccountId`
   * - 关联联系人 (owner, 2026-09-20: mockup - "把系统里已有的人接到这个客户名下，
   * 不会新建一条联系人记录"). Matches on name/mobile/email, case-insensitive
   * substring. `affiliations` states every account this person is CURRENTLY
   * (endedAt null) linked to, for context in the picker - the same person can
   * legitimately work more than one account (incr/0073's own note on
   * person_affiliation), so this is a real fact, not a guessed "the" employer.
   */
  searchPersons(
    workspaceId: string,
    query: string,
    excludeAccountId: string,
  ): Promise<
    Array<{
      id: string;
      name: string;
      mobile: string | null;
      email: string | null;
      affiliations: Array<{ accountId: string; accountName: string; title: string | null }>;
    }>
  >;
  /**
   * Affiliate an EXISTING person (from searchPersons) with this account - a
   * new person_affiliation row, no new person row. Null when the person is
   * unknown or already affiliated here (uidx_person_affiliation_current would
   * otherwise refuse the insert).
   */
  linkExistingPerson(
    workspaceId: string,
    accountId: string,
    personId: string,
  ): Promise<ContactRecord | null>;
  /**
   * 取消关联 - end this person's CURRENT affiliation with this account (sets
   * ended_at), never a delete. The person and their evidence (interactions,
   * relations, buying roles) survive; they simply stop being a contact HERE.
   * False when there was no current affiliation to end.
   */
  endContactAffiliation(
    workspaceId: string,
    accountId: string,
    personId: string,
  ): Promise<boolean>;

  /** 关联协作人 (incr/0074) - who else works this account, alongside its one
   *  owner. A plain roster: add, remove, list; no update. */
  listCollaborators(
    workspaceId: string,
    accountId: string,
  ): Promise<Array<{ memberSub: string; addedAt: Date }>>;
  addCollaborator(workspaceId: string, accountId: string, memberSub: string): Promise<void>;
  /** 删除空壳客户: deleted_at, never a row DELETE - the credit-code index
   *  ignores deleted rows (incr/0024), so the company can be created again. */
  softDeleteAccount(workspaceId: string, id: string): Promise<boolean>;
  /** The other direction: every account this member collaborates on. Read by
   *  the data-scope resolver - a collaborator sees the account (YC-021 L1). */
  listCollaboratedAccountIds(workspaceId: string, memberSub: string): Promise<string[]>;
  removeCollaborator(workspaceId: string, accountId: string, memberSub: string): Promise<void>;

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

  /* --- 客户类型 / 客户规模 (incr/0071) ---------------------------------------
     客户分类's other two vocabularies, same five verbs each, same reasoning
     as 行业 above - independent of it and of each other. */
  listCustomerTypes(workspaceId: string): Promise<CustomerTypeRecord[]>;
  upsertCustomerType(workspaceId: string, input: CustomerTypeDraft): Promise<CustomerTypeRecord>;
  setCustomerTypeOrder(
    workspaceId: string,
    orders: readonly { id: string; sortOrder: number }[],
  ): Promise<void>;
  removeCustomerType(workspaceId: string, customerTypeId: string): Promise<boolean>;
  countAccountsByCustomerType(workspaceId: string, customerTypeId: string): Promise<number>;

  listCustomerSizes(workspaceId: string): Promise<CustomerSizeRecord[]>;
  upsertCustomerSize(workspaceId: string, input: CustomerSizeDraft): Promise<CustomerSizeRecord>;
  setCustomerSizeOrder(
    workspaceId: string,
    orders: readonly { id: string; sortOrder: number }[],
  ): Promise<void>;
  removeCustomerSize(workspaceId: string, customerSizeId: string): Promise<boolean>;
  countAccountsByCustomerSize(workspaceId: string, customerSizeId: string): Promise<number>;

  /* --- 客户性质 (incr/0072) --------------------------------------------------
     The fourth of 客户分类's vocabularies, same five verbs again. */
  listCustomerNatures(workspaceId: string): Promise<CustomerNatureRecord[]>;
  upsertCustomerNature(workspaceId: string, input: CustomerNatureDraft): Promise<CustomerNatureRecord>;
  setCustomerNatureOrder(
    workspaceId: string,
    orders: readonly { id: string; sortOrder: number }[],
  ): Promise<void>;
  removeCustomerNature(workspaceId: string, customerNatureId: string): Promise<boolean>;
  countAccountsByCustomerNature(workspaceId: string, customerNatureId: string): Promise<number>;
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
  /* KEYED BY FRAME AND CODE (0045): a province code carries no prefix, so
     GUANZHONG under 陕西 and a GUANZHONG a tenant typed under 中国市场 are two
     rows, the way (workspace_id, scope, scope_province, division_code) is
     the database's key. */
  private divisionEdits = new Map<string, Map<string, { name: string; sortOrder: number } | null>>();

  private static frameKey(scope: MarketScope): string {
    return `${scope.kind}:${scope.code ?? ""}`;
  }

  /* A STABLE, OPAQUE ID PER ROW, the shape the database gives one: the edit
     route carries it (owner: 名册连接改 id), so it must not be the code in
     disguise and must survive a rename - minted once per frame + code. */
  private divisionIds = new Map<string, string>();

  private idFor(workspaceId: string, scope: MarketScope, code: string): string {
    const key = `${workspaceId}|${InMemoryAccountStore.frameKey(scope)}|${code}`;
    let id = this.divisionIds.get(key);
    if (!id) {
      id = randomUUID();
      this.divisionIds.set(key, id);
    }
    return id;
  }

  private divisionsFor(workspaceId: string, scope: MarketScope): { code: string; name: string; sortOrder: number }[] {
    const frame = InMemoryAccountStore.frameKey(scope);
    const edits = this.divisionEdits.get(workspaceId) ?? new Map();
    const out = new Map<string, { code: string; name: string; sortOrder: number }>();
    if (scope.kind === "china") {
      for (const d of MARKET_DIVISIONS) {
        out.set(d.code, { code: d.code, name: d.name, sortOrder: d.sortOrder });
      }
    }
    for (const [key, edit] of edits) {
      if (!key.startsWith(`${frame}|`)) continue;
      const code = key.slice(frame.length + 1);
      if (edit === null) out.delete(code);
      else out.set(code, { code, name: edit.name, sortOrder: edit.sortOrder });
    }
    return [...out.values()].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  }

  async upsertMarketDivision(
    workspaceId: string,
    input: { code: string; name: string; sortOrder?: number },
  ): Promise<MarketDivisionRecord> {
    const scope = await this.getMarketScope(workspaceId);
    let ws = this.divisionEdits.get(workspaceId);
    if (!ws) { ws = new Map(); this.divisionEdits.set(workspaceId, ws); }
    const mine = this.divisionsFor(workspaceId, scope);
    const existing = mine.find((d) => d.code === input.code);
    ws.set(`${InMemoryAccountStore.frameKey(scope)}|${input.code}`, {
      name: input.name,
      sortOrder: input.sortOrder ?? existing?.sortOrder ?? mine.length + 1,
    });
    const rows = await this.listMarketDivisions(workspaceId);
    return rows.find((d) => d.code === input.code)!;
  }

  async removeMarketDivision(workspaceId: string, code: string): Promise<boolean> {
    const scope = await this.getMarketScope(workspaceId);
    if (!this.divisionsFor(workspaceId, scope).some((d) => d.code === code)) return false;
    let ws = this.divisionEdits.get(workspaceId);
    if (!ws) { ws = new Map(); this.divisionEdits.set(workspaceId, ws); }
    ws.set(`${InMemoryAccountStore.frameKey(scope)}|${code}`, null);
    return true;
  }

  async listFrameMembers(workspaceId: string): Promise<MarketMember[]> {
    return [...frameMembers(await this.getMarketScope(workspaceId))];
  }

  async listCarves(workspaceId: string): Promise<DivisionTemplate[]> {
    // The mirror of incr/0045, proved against the table by market-carve.db.test.ts.
    return [...templatesFor(DIVISION_TEMPLATES, await this.getMarketScope(workspaceId))];
  }

  async placeMember(
    workspaceId: string,
    memberKey: string,
    divisionCode: string | null,
  ): Promise<boolean> {
    const scope = await this.getMarketScope(workspaceId);
    if (divisionCode !== null && !this.divisionsFor(workspaceId, scope).some((d) => d.code === divisionCode)) {
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
    /* BY FRAME: the preset is a china carve, and a tenant's own rows are
       keyed by the frame they were carved in. A carve made under another
       frame stays out of this list - and so do its members, since a member
       follows its division. Labels come from the frame's own ground; a key
       it does not know (a province placed while the frame was china, read
       back under 陕西) is not a member here. */
    const scope = await this.getMarketScope(workspaceId);
    const known = new Map(frameMembers(scope).map((m) => [m.key, m]));
    return this.divisionsFor(workspaceId, scope).map((d) => ({
      id: this.idFor(workspaceId, scope, d.code),
      code: d.code,
      name: d.name,
      scope: scope.kind,
      scopeProvince: scope.kind === "province" ? scope.code : null,
      sortOrder: d.sortOrder,
      members: [...placement.entries()]
        .filter(([key, code]) => code === d.code && known.has(key))
        .map(([key]) => known.get(key)!),
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
  /* incr/0071. 客户分类's other two vocabularies. */
  private customerTypes: CustomerTypeRecord[] = [];
  private customerSizes: CustomerSizeRecord[] = [];
  private customerNatures: CustomerNatureRecord[] = [];
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
    patch: { buyingRole: DecisionRole; influence: number | null; isPrimary?: boolean; stance?: Stance | null },
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
      if (patch.stance !== undefined) held.stance = patch.stance;
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
      stance: patch.stance ?? null,
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
    // ONLY WHERE THE ROW CARRIES A JOIN, for each of the three independently -
    // a fixture that seeds a bare name (industry/customerType/customerSize)
    // and never touches the corresponding vocabulary is describing an account
    // as it reads back, same as the industry comment above always meant; the
    // real join is proved against Postgres by the db tests, not reproduced
    // here as a second source of truth.
    const industry = a.industryId
      ? (this.industries.find((i) => i.workspaceId === a.workspaceId && i.id === a.industryId)?.name ?? null)
      : a.industry;
    const customerType = a.customerTypeId
      ? (this.customerTypes.find((t) => t.workspaceId === a.workspaceId && t.id === a.customerTypeId)?.name ?? null)
      : a.customerType;
    const customerSize = a.customerSizeId
      ? (this.customerSizes.find((s) => s.workspaceId === a.workspaceId && s.id === a.customerSizeId)?.name ?? null)
      : a.customerSize;
    const customerNature = a.customerNatureId
      ? (this.customerNatures.find((n) => n.workspaceId === a.workspaceId && n.id === a.customerNatureId)?.name ?? null)
      : a.customerNature;
    return { ...a, industry, customerType, customerSize, customerNature };
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

  async softDeleteAccount(workspaceId: string, id: string): Promise<boolean> {
    const a = this.accounts.get(id);
    if (!a || a.workspaceId !== workspaceId) return false;
    // Reads filter deleted rows out; in memory that is the same as not being there.
    return this.accounts.delete(id);
  }

  async getAccount(workspaceId: string, id: string): Promise<AccountRecord | null> {
    const a = this.accounts.get(id);
    return a?.workspaceId === workspaceId ? this.hydrate(a) : null;
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

  async listCustomerTypes(workspaceId: string): Promise<CustomerTypeRecord[]> {
    return this.customerTypes
      .filter((t) => t.workspaceId === workspaceId)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.customerTypeCode.localeCompare(b.customerTypeCode));
  }

  async upsertCustomerType(workspaceId: string, input: CustomerTypeDraft): Promise<CustomerTypeRecord> {
    const at = this.customerTypes.findIndex(
      (t) => t.workspaceId === workspaceId && t.customerTypeCode === input.customerTypeCode,
    );
    if (at >= 0) {
      const next = { ...this.customerTypes[at]!, name: input.name };
      this.customerTypes[at] = next;
      return next;
    }
    const tail = Math.max(
      0,
      ...this.customerTypes.filter((t) => t.workspaceId === workspaceId).map((t) => t.sortOrder),
    );
    const row: CustomerTypeRecord = { id: `cty_${++this.seq}`, workspaceId, sortOrder: tail + 1, ...input };
    this.customerTypes.push(row);
    return row;
  }

  async setCustomerTypeOrder(
    workspaceId: string,
    orders: readonly { id: string; sortOrder: number }[],
  ): Promise<void> {
    const want = new Map(orders.map((o) => [o.id, o.sortOrder]));
    this.customerTypes = this.customerTypes.map((t) =>
      t.workspaceId === workspaceId && want.has(t.id) ? { ...t, sortOrder: want.get(t.id)! } : t,
    );
  }

  async removeCustomerType(workspaceId: string, customerTypeId: string): Promise<boolean> {
    const before = this.customerTypes.length;
    this.customerTypes = this.customerTypes.filter(
      (t) => !(t.workspaceId === workspaceId && t.id === customerTypeId),
    );
    return this.customerTypes.length < before;
  }

  async countAccountsByCustomerType(workspaceId: string, customerTypeId: string): Promise<number> {
    return [...this.accounts.values()].filter(
      (a) => a.workspaceId === workspaceId && a.customerTypeId === customerTypeId,
    ).length;
  }

  async listCustomerSizes(workspaceId: string): Promise<CustomerSizeRecord[]> {
    return this.customerSizes
      .filter((s) => s.workspaceId === workspaceId)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.customerSizeCode.localeCompare(b.customerSizeCode));
  }

  async upsertCustomerSize(workspaceId: string, input: CustomerSizeDraft): Promise<CustomerSizeRecord> {
    const at = this.customerSizes.findIndex(
      (s) => s.workspaceId === workspaceId && s.customerSizeCode === input.customerSizeCode,
    );
    if (at >= 0) {
      const next = { ...this.customerSizes[at]!, name: input.name };
      this.customerSizes[at] = next;
      return next;
    }
    const tail = Math.max(
      0,
      ...this.customerSizes.filter((s) => s.workspaceId === workspaceId).map((s) => s.sortOrder),
    );
    const row: CustomerSizeRecord = { id: `csz_${++this.seq}`, workspaceId, sortOrder: tail + 1, ...input };
    this.customerSizes.push(row);
    return row;
  }

  async setCustomerSizeOrder(
    workspaceId: string,
    orders: readonly { id: string; sortOrder: number }[],
  ): Promise<void> {
    const want = new Map(orders.map((o) => [o.id, o.sortOrder]));
    this.customerSizes = this.customerSizes.map((s) =>
      s.workspaceId === workspaceId && want.has(s.id) ? { ...s, sortOrder: want.get(s.id)! } : s,
    );
  }

  async removeCustomerSize(workspaceId: string, customerSizeId: string): Promise<boolean> {
    const before = this.customerSizes.length;
    this.customerSizes = this.customerSizes.filter(
      (s) => !(s.workspaceId === workspaceId && s.id === customerSizeId),
    );
    return this.customerSizes.length < before;
  }

  async countAccountsByCustomerSize(workspaceId: string, customerSizeId: string): Promise<number> {
    return [...this.accounts.values()].filter(
      (a) => a.workspaceId === workspaceId && a.customerSizeId === customerSizeId,
    ).length;
  }

  async listCustomerNatures(workspaceId: string): Promise<CustomerNatureRecord[]> {
    return this.customerNatures
      .filter((n) => n.workspaceId === workspaceId)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.customerNatureCode.localeCompare(b.customerNatureCode));
  }

  async upsertCustomerNature(workspaceId: string, input: CustomerNatureDraft): Promise<CustomerNatureRecord> {
    const at = this.customerNatures.findIndex(
      (n) => n.workspaceId === workspaceId && n.customerNatureCode === input.customerNatureCode,
    );
    if (at >= 0) {
      const next = { ...this.customerNatures[at]!, name: input.name };
      this.customerNatures[at] = next;
      return next;
    }
    const tail = Math.max(
      0,
      ...this.customerNatures.filter((n) => n.workspaceId === workspaceId).map((n) => n.sortOrder),
    );
    const row: CustomerNatureRecord = { id: `cnt_${++this.seq}`, workspaceId, sortOrder: tail + 1, ...input };
    this.customerNatures.push(row);
    return row;
  }

  async setCustomerNatureOrder(
    workspaceId: string,
    orders: readonly { id: string; sortOrder: number }[],
  ): Promise<void> {
    const want = new Map(orders.map((o) => [o.id, o.sortOrder]));
    this.customerNatures = this.customerNatures.map((n) =>
      n.workspaceId === workspaceId && want.has(n.id) ? { ...n, sortOrder: want.get(n.id)! } : n,
    );
  }

  async removeCustomerNature(workspaceId: string, customerNatureId: string): Promise<boolean> {
    const before = this.customerNatures.length;
    this.customerNatures = this.customerNatures.filter(
      (n) => !(n.workspaceId === workspaceId && n.id === customerNatureId),
    );
    return this.customerNatures.length < before;
  }

  async countAccountsByCustomerNature(workspaceId: string, customerNatureId: string): Promise<number> {
    return [...this.accounts.values()].filter(
      (a) => a.workspaceId === workspaceId && a.customerNatureId === customerNatureId,
    ).length;
  }

  async listContacts(workspaceId: string, accountId: string): Promise<ContactRecord[]> {
    // BY sortOrder since incr/0073 - a manual roster order, not the influence
    // ranking incr/0027 already retired. The "按姓名" the table also offers
    // is a click-to-sort on the rendered rows, not a second server order.
    return this.contacts
      .filter((c) => c.workspaceId === workspaceId && c.accountId === accountId)
      .sort(by(asc((c: ContactRecord) => c.sortOrder)));
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
    const tail = Math.max(
      0,
      ...this.contacts
        .filter((c) => c.workspaceId === workspaceId && c.accountId === accountId)
        .map((c) => c.sortOrder),
    );
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
      sortOrder: tail + 1,
    };
    this.contacts.push(created);
    return created;
  }

  async setContactOrder(
    workspaceId: string,
    accountId: string,
    orders: readonly { id: string; sortOrder: number }[],
  ): Promise<void> {
    const want = new Map(orders.map((o) => [o.id, o.sortOrder]));
    this.contacts = this.contacts.map((c) =>
      c.workspaceId === workspaceId && c.accountId === accountId && want.has(c.id)
        ? { ...c, sortOrder: want.get(c.id)! }
        : c,
    );
  }

  // 关联联系人 (owner, 2026-09-20). THE IN-MEMORY MODEL HAS NO SEPARATE PERSON
  // ENTITY - `contacts` is one flat row per (person, account), the shape this
  // double has always used. Faking a cross-account "same person" identity on
  // top of that would invent a concept this store never modeled; instead a
  // link here is what it observably is - a NEW roster row that copies the
  // found row's reachable-person facts (name/mobile/email/wechat), never its
  // title/department/status, which are the NEW employment's own facts, not
  // carried over from wherever the person was found. `affiliations` is
  // therefore always empty in-memory (there is no second row to report) -
  // the Prisma store is where this fact is real, off the actual
  // person_affiliation table.
  async searchPersons(
    workspaceId: string,
    query: string,
    excludeAccountId: string,
  ): Promise<
    Array<{
      id: string;
      name: string;
      mobile: string | null;
      email: string | null;
      affiliations: Array<{ accountId: string; accountName: string; title: string | null }>;
    }>
  > {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return this.contacts
      .filter(
        (c) =>
          c.workspaceId === workspaceId &&
          c.accountId !== excludeAccountId &&
          (c.name.toLowerCase().includes(q) ||
            (c.mobile ?? "").includes(q) ||
            (c.email ?? "").toLowerCase().includes(q)),
      )
      .slice(0, 20)
      .map((c) => ({
        id: c.id,
        name: c.name,
        mobile: c.mobile,
        email: c.email,
        affiliations: [],
      }));
  }

  async linkExistingPerson(
    workspaceId: string,
    accountId: string,
    personId: string,
  ): Promise<ContactRecord | null> {
    const found = this.contacts.find((c) => c.id === personId && c.workspaceId === workspaceId);
    if (!found) return null;
    // A real duplicate needs at least one shared, non-null identifier -
    // two contacts with mobile=null AND email=null are not thereby "the same
    // person" (most of this seed's contacts have neither), so a null/null
    // pair is never treated as a match. The Prisma store does not have this
    // problem at all: it checks the real person_affiliation row directly.
    const already = this.contacts.some(
      (c) =>
        c.workspaceId === workspaceId &&
        c.accountId === accountId &&
        ((found.mobile != null && c.mobile === found.mobile) ||
          (found.email != null && c.email === found.email)),
    );
    if (already) return null;
    const tail = Math.max(
      0,
      ...this.contacts
        .filter((c) => c.workspaceId === workspaceId && c.accountId === accountId)
        .map((c) => c.sortOrder),
    );
    const created: ContactRecord = {
      id: `con_${++this.seq}`,
      workspaceId,
      accountId,
      name: found.name,
      title: null,
      department: null,
      email: found.email,
      mobile: found.mobile,
      wechat: found.wechat,
      status: "active",
      sortOrder: tail + 1,
    };
    this.contacts.push(created);
    return created;
  }

  async endContactAffiliation(
    workspaceId: string,
    accountId: string,
    personId: string,
  ): Promise<boolean> {
    const before = this.contacts.length;
    this.contacts = this.contacts.filter(
      (c) => !(c.id === personId && c.workspaceId === workspaceId && c.accountId === accountId),
    );
    return this.contacts.length < before;
  }

  private collaborators: Array<{ workspaceId: string; accountId: string; memberSub: string; addedAt: Date }> = [];

  async listCollaborators(
    workspaceId: string,
    accountId: string,
  ): Promise<Array<{ memberSub: string; addedAt: Date }>> {
    return this.collaborators
      .filter((c) => c.workspaceId === workspaceId && c.accountId === accountId)
      .map((c) => ({ memberSub: c.memberSub, addedAt: c.addedAt }));
  }

  async listCollaboratedAccountIds(workspaceId: string, memberSub: string): Promise<string[]> {
    return this.collaborators
      .filter((c) => c.workspaceId === workspaceId && c.memberSub === memberSub)
      .map((c) => c.accountId);
  }

  async addCollaborator(workspaceId: string, accountId: string, memberSub: string): Promise<void> {
    const exists = this.collaborators.some(
      (c) => c.workspaceId === workspaceId && c.accountId === accountId && c.memberSub === memberSub,
    );
    if (!exists) this.collaborators.push({ workspaceId, accountId, memberSub, addedAt: new Date() });
  }

  async removeCollaborator(workspaceId: string, accountId: string, memberSub: string): Promise<void> {
    this.collaborators = this.collaborators.filter(
      (c) => !(c.workspaceId === workspaceId && c.accountId === accountId && c.memberSub === memberSub),
    );
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
        renewal: { windowDays: 90, hasOpenRenewalDeal: false, contracts: [], events: [] },
      }
    );
  }
}
