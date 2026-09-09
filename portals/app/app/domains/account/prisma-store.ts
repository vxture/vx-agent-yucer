import type { PrismaClient } from "@prisma/client";
import { getPrismaClient } from "../../lib/db";
import { assertWritable } from "../shared/column-locks";
import type { ContactDraft } from "./lib/contact";
import type { IndustryDraft } from "./lib/industry-vocab";
import { DEFAULT_MARKET_SCOPE, type MarketScope } from "../shared/market-division";
import type { AccountStatus, DecisionRole, ProjectHealth, RelationEdge, RelationType } from "./lib/health";
import type {
  AccountFilter,
  AccountPlanRecord,
  AccountRecord,
  AccountStore,
  AccountTier,
  MarketDivisionRecord,
  ContactRecord,
  HealthInputs,
  IndustryRecord,
  OpportunityContactRecord,
} from "./store";

// Prisma-backed AccountStore over yucer_core.
//
// healthInputs() is the one method that reaches across schemas: it reads open
// opportunities from yucer_pipeline and project health plus overdue instalments
// from yucer_delivery. That is deliberate and does not violate the ownership
// rule - D4 owns the account and only READS the other domains, which is exactly
// what "one object, one owning domain; everyone else references it read-only"
// permits. Writing any of those rows from here would be the violation.

const PLAN_TABLE = "yucer_core.account_plan";
const ACCOUNT_TABLE = "yucer_core.account";
// incr/0026. The table was RENAMED, not replaced - so the id space, the
// evidence foreign keys and every row are the ones that were always there.
const PERSON_TABLE = "yucer_core.person";
const AFFILIATION_TABLE = "yucer_core.person_affiliation";
const OPPORTUNITY_CONTACT_TABLE = "yucer_pipeline.opportunity_contact";
// incr/0040. 行业, the workspace's own vocabulary.
const INDUSTRY_TABLE = "yucer_core.industry";
// incr/0043. 市场范围, one row per workspace.
const MARKET_SCOPE_TABLE = "yucer_core.market_scope";

export class PrismaAccountStore implements AccountStore {
  /**
   * How this adapter reaches the database, injectable for tests.
   *
   * A CONSTRUCTOR PARAMETER, not a mutable global. The five Prisma adapters in
   * this repo have no tests at all - not unit, and not db either, since
   * adapters.db.test.ts drives raw `pg` rather than the stores - and the
   * coverage gate said so the first time it could (TD-015's own first catch was
   * the same shape). What lives here is real: the column-lock guard, the
   * workspace-AND-account predicate that stops an edit moving a person between
   * customers, and the null-versus-value mapping. All three are worth pinning,
   * and none of them needs a running Postgres to pin.
   *
   * Production constructs this with no argument and nothing changes.
   */
  constructor(private readonly client: () => Promise<PrismaClient> = getPrismaClient) {}

  async upsertMarketDivision(
    workspaceId: string,
    input: { code: string; name: string; sortOrder?: number },
  ): Promise<MarketDivisionRecord> {
    const p = await this.client();
    /* KEYED ON THE CODE, which is the anchor: upserting an existing code
       renames it, a new one creates a division. 98/incr-0036 deliberately do
       NOT grant UPDATE on division_code - a division whose code changed is a
       new division wearing an old one's history.
       A NEW ROW IS CARVED IN THE CURRENT FRAME (incr/0043); the database then
       CHECKs that the code carries that frame's prefix. */
    const scope = await this.getMarketScope(workspaceId);
    const row = await p.marketDivision.upsert({
      where: { workspaceId_divisionCode: { workspaceId, divisionCode: input.code } },
      create: {
        workspaceId, divisionCode: input.code, name: input.name, scope: scope.kind,
        sortOrder: input.sortOrder ?? 0,
      },
      update: {
        name: input.name,
        ...(input.sortOrder === undefined ? {} : { sortOrder: input.sortOrder }),
        updatedAt: new Date(),
      },
      include: { provinces: { select: { province: true } } },
    });
    return {
      id: row.id, code: row.divisionCode, name: row.name, sortOrder: row.sortOrder,
      scope: row.scope as MarketScope["kind"],
      provinces: row.provinces.map((x) => x.province),
    };
  }

  async removeMarketDivision(workspaceId: string, code: string): Promise<boolean> {
    const p = await this.client();
    /* The FK is ON DELETE RESTRICT, so a division still holding provinces
       cannot be removed - deleted here rather than letting Postgres raise,
       so the caller gets a countable answer instead of a constraint name. */
    const { count } = await p.marketDivision.deleteMany({
      where: { workspaceId, divisionCode: code, provinces: { none: {} } },
    });
    return count > 0;
  }

  async setProvinceDivision(
    workspaceId: string,
    province: string,
    divisionCode: string | null,
  ): Promise<boolean> {
    const p = await this.client();
    if (divisionCode === null) {
      // Out of every 大区. A DELETE, not a null division_id: the column is NOT
      // NULL, and "in no division" is the absence of a row rather than a row
      // pointing nowhere.
      await p.marketDivisionProvince.deleteMany({ where: { workspaceId, province } });
      return true;
    }
    const division = await p.marketDivision.findFirst({
      where: { workspaceId, divisionCode },
      select: { id: true },
    });
    if (!division) return false;
    /* UPSERT ON THE PRIMARY KEY, because a province belongs to at most one
       division and the table enforces that. An insert would collide; a plain
       update would silently do nothing for a province nobody had placed. */
    await p.marketDivisionProvince.upsert({
      where: { workspaceId_province: { workspaceId, province } },
      create: { workspaceId, province, divisionId: division.id },
      update: { divisionId: division.id, updatedAt: new Date() },
    });
    return true;
  }

  /* --- 市场范围 (incr/0043) --------------------------------------------------
     NO ROW READS AS CHINA: the increment seeds every workspace that carves,
     and one created afterwards has none until somebody changes the frame. */

  async getMarketScope(workspaceId: string): Promise<MarketScope> {
    const p = await this.client();
    const row = await p.marketScope.findUnique({ where: { workspaceId } });
    if (!row) return DEFAULT_MARKET_SCOPE;
    return { kind: row.scopeKind as MarketScope["kind"], code: row.scopeProvince ?? null };
  }

  async setMarketScope(workspaceId: string, scope: MarketScope): Promise<void> {
    const p = await this.client();
    const update = { scopeKind: scope.kind, scopeProvince: scope.code, updatedAt: new Date() };
    const guard = assertWritable(MARKET_SCOPE_TABLE, update);
    if (!guard.ok) {
      throw new Error(
        `refusing to write a locked market_scope column: ${guard.violations.map((v) => v.message).join("; ")}`,
      );
    }
    await p.marketScope.upsert({ where: { workspaceId }, update, create: { workspaceId, ...update } });
  }

  async listMarketDivisions(workspaceId: string): Promise<MarketDivisionRecord[]> {
    const p = await this.client();
    const scope = await this.getMarketScope(workspaceId);
    const rows = await p.marketDivision.findMany({
      // BY FRAME - a carve made under another frame stays out of this roster.
      where: { workspaceId, scope: scope.kind },
      // The workspace's OWN order, then name - a tenant that re-orders its
      // divisions expects the menu and the breadcrumb to follow.
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { provinces: { select: { province: true } } },
    });
    return rows.map((d) => ({
      id: d.id,
      code: d.divisionCode,
      name: d.name,
      scope: d.scope as MarketScope["kind"],
      sortOrder: d.sortOrder,
      provinces: d.provinces.map((x) => x.province),
    }));
  }

  async listAccounts(workspaceId: string, filter: AccountFilter = {}): Promise<AccountRecord[]> {
    const p = await this.client();
    const rows = await p.account.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.ownerSub ? { ownerSub: filter.ownerSub } : {}),
        ...(filter.segmentCode ? { segmentCode: filter.segmentCode } : {}),
      },
      // Sickest first. Postgres sorts NULLs last on ASC by default, which is
      // what we want: an unscored account is not the most urgent one.
      orderBy: [{ healthScore: "asc" }, { name: "asc" }],
      ...(filter.limit ? { take: filter.limit } : {}),
    });
    const names = await this.industryNames(workspaceId);
    return rows.map((r: Record<string, unknown>) => toAccount(r, names));
  }

  async getAccount(workspaceId: string, id: string): Promise<AccountRecord | null> {
    const p = await this.client();
    const row = await p.account.findFirst({ where: { id, workspaceId, deletedAt: null } });
    if (!row) return null;
    return toAccount(row as Record<string, unknown>, await this.industryNames(workspaceId));
  }

  /**
   * industry_id -> the name it reads as.
   *
   * A SECOND QUERY rather than a Prisma relation, because this schema declares
   * none: the mirror carries columns and indexes, and every join in this
   * adapter is written by hand. One extra read per account listing, over a
   * table with at most a few dozen rows in it.
   */
  private async industryNames(workspaceId: string): Promise<Map<string, string>> {
    const p = await this.client();
    const rows = await p.industry.findMany({ where: { workspaceId } });
    return new Map(rows.map((r: { id: string; name: string }) => [r.id, r.name]));
  }

  async updateAccount(
    workspaceId: string,
    id: string,
    patch: Partial<AccountRecord>,
  ): Promise<boolean> {
    const p = await this.client();
    const data: Record<string, unknown> = { ...patch, updatedAt: new Date() };

    const guard = assertWritable(ACCOUNT_TABLE, data);
    if (!guard.ok) {
      throw new Error(
        `refusing to write locked columns: ${guard.violations.map((v) => v.message).join("; ")}`,
      );
    }

    const res = await p.account.updateMany({ where: { id, workspaceId }, data });
    return res.count > 0;
  }

  /**
   * The people at one customer - a person JOINED to their employment there.
   *
   * THE READ MODEL DID NOT CHANGE, and that is deliberate. ContactRecord still
   * carries accountId, title and department, so the decision chain, the health
   * rules and every screen that reads them are untouched by batch C. What
   * changed is where those three come from: the affiliation row rather than the
   * person. Changing the storage and the read model in one batch would have
   * made every downstream failure ambiguous.
   *
   * CURRENT EMPLOYMENT ONLY (`endedAt: null`). Somebody who has left is not a
   * contact at this customer any more - they are history, which is exactly what
   * the old schema could not say. Their evidence rows still point at the same
   * person id, so the interactions they attended survive them leaving.
   */
  async listContacts(workspaceId: string, accountId: string): Promise<ContactRecord[]> {
    const p = await this.client();
    const links = await p.personAffiliation.findMany({
      where: { workspaceId, accountId, endedAt: null },
    });
    if (links.length === 0) return [];
    const people = await p.person.findMany({
      where: { workspaceId, id: { in: links.map((l: { personId: string }) => l.personId) }, deletedAt: null },
      // Ordered by NAME now. Sorting people by influence was sorting them by a
      // column that no longer exists - influence is per deal, and a customer's
      // roster is not a ranking.
      orderBy: { name: "asc" },
    });
    const byPerson = new Map(links.map((l: { personId: string }) => [l.personId, l]));
    return people.map((r: Record<string, unknown>) =>
      toContact(r, byPerson.get(String(r.id)) as Record<string, unknown> | undefined),
    );
  }

  async upsertContact(
    workspaceId: string,
    accountId: string,
    input: ContactDraft,
  ): Promise<ContactRecord | null> {
    const p = await this.client();
    // title and department are NOT here any more - they are the employment, not
    // the person, and the person table has no such columns to grant.
    const writable = {
      name: input.name,
      email: input.email,
      mobile: input.mobile,
      wechat: input.wechat,
      status: input.status,
      updatedAt: new Date(),
    };
    // TWO ROWS, TWO LOCK CHECKS. The draft spans a person and an employment
    // now, and the split is not cosmetic: title and department are writable on
    // the affiliation and do not exist on the person, so one combined check
    // against either table would pass columns the other refuses.
    const link = {
      title: input.title,
      department: input.department,
      updatedAt: new Date(),
    };
    for (const [table, patch] of [
      [PERSON_TABLE, writable],
      [AFFILIATION_TABLE, link],
    ] as const) {
      const guard = assertWritable(table, patch);
      if (!guard.ok) {
        throw new Error(
          `refusing to write a locked ${table} column: ${guard.violations.map((v) => v.message).join("; ")}`,
        );
      }
    }

    if (input.id) {
      // The workspace AND the account stay in the predicate, but the account
      // now lives on the affiliation - so an id from another tenant, or a
      // person who does not work at this customer, updates nothing rather than
      // editing somebody else's record. count === 0 is the service's not_found.
      const held = await p.personAffiliation.findFirst({
        where: { workspaceId, accountId, personId: input.id, endedAt: null },
      });
      if (!held) return null;
      const res = await p.person.updateMany({
        where: { id: input.id, workspaceId, deletedAt: null },
        data: writable,
      });
      if (res.count === 0) return null;
      await p.personAffiliation.updateMany({ where: { id: held.id }, data: link });
      const row = await p.person.findFirst({ where: { id: input.id, workspaceId } });
      return row ? toContact(row as Record<string, unknown>, { ...held, ...link }) : null;
    }

    const row = await p.person.create({ data: { workspaceId, ...writable } });
    const made = await p.personAffiliation.create({
      data: { workspaceId, personId: String(row.id), accountId, ...link },
    });
    return toContact(row as Record<string, unknown>, made as Record<string, unknown>);
  }

  async addRelation(workspaceId: string, edge: RelationEdge): Promise<void> {
    const p = await this.client();
    try {
      await p.accountRelation.create({
        data: {
          workspaceId,
          fromContactId: edge.fromContactId,
          toContactId: edge.toContactId,
          relationType: edge.relationType,
        },
      });
    } catch {
      // uidx_account_relation_edge - the same edge twice is one edge, and the
      // desired end state is already reached. There is no UPDATE grant on this
      // table, so there is nothing else that could be done here anyway.
    }
  }

  async removeRelation(workspaceId: string, edge: RelationEdge): Promise<void> {
    const p = await this.client();
    await p.accountRelation.deleteMany({
      where: {
        workspaceId,
        fromContactId: edge.fromContactId,
        toContactId: edge.toContactId,
        relationType: edge.relationType,
      },
    });
  }

  // --- incr/0027, the per-deal buying roles ---------------------------------

  async listOpportunityContacts(
    workspaceId: string,
    opportunityId: string,
  ): Promise<OpportunityContactRecord[]> {
    const p = await this.client();
    const rows = await p.opportunityContact.findMany({ where: { workspaceId, opportunityId } });
    return rows.map((r: Record<string, unknown>) => toOpportunityContact(r));
  }

  async listOpportunityContactsFor(
    workspaceId: string,
    opportunityIds: readonly string[],
  ): Promise<OpportunityContactRecord[]> {
    // The short-circuit is not an optimisation: `in: []` asks the database for
    // every row in the workspace and filters to none.
    if (opportunityIds.length === 0) return [];
    const p = await this.client();
    const rows = await p.opportunityContact.findMany({
      where: { workspaceId, opportunityId: { in: [...opportunityIds] } },
    });
    return rows.map((r: Record<string, unknown>) => toOpportunityContact(r));
  }

  async setOpportunityContact(
    workspaceId: string,
    opportunityId: string,
    personId: string,
    patch: { buyingRole: DecisionRole; influence: number | null; isPrimary?: boolean },
  ): Promise<OpportunityContactRecord | null> {
    const p = await this.client();
    const writable: Record<string, unknown> = {
      buyingRole: patch.buyingRole,
      influence: patch.influence,
      updatedAt: new Date(),
    };
    if (patch.isPrimary !== undefined) writable.isPrimary = patch.isPrimary;

    const guard = assertWritable(OPPORTUNITY_CONTACT_TABLE, writable);
    if (!guard.ok) {
      throw new Error(
        `refusing to write a locked column: ${guard.violations.map((v) => v.message).join("; ")}`,
      );
    }

    // The pair IS the identity (uidx_opportunity_contact_pair), so a second
    // statement about the same person on the same deal replaces the first.
    // upsert rather than update-then-create: the two-statement version races
    // itself under the unique index and fails on the second caller.
    const row = await p.opportunityContact.upsert({
      where: { opportunityId_personId: { opportunityId, personId } },
      update: writable,
      create: { workspaceId, opportunityId, personId, ...writable },
    });
    return toOpportunityContact(row as Record<string, unknown>);
  }

  async listRelations(workspaceId: string, accountId: string): Promise<RelationEdge[]> {
    const p = await this.client();
    // The edges are between PEOPLE, and which people belong to this customer is
    // now the affiliation's question rather than the person's. Not filtered on
    // endedAt: a relationship map that dropped everyone who left would silently
    // rewrite the chain that existed when those interactions happened, and
    // account_relation is evidence.
    const contacts = await p.personAffiliation.findMany({
      where: { workspaceId, accountId },
      select: { personId: true },
    });
    if (contacts.length === 0) return [];
    const ids = contacts.map((c: { personId: string }) => c.personId);

    // An edge belongs to this account if EITHER endpoint does. A relationship
    // that crosses accounts (a referral, a shared board member) is real and must
    // not be dropped just because one end sits elsewhere.
    const rows = await p.accountRelation.findMany({
      where: { workspaceId, OR: [{ fromContactId: { in: ids } }, { toContactId: { in: ids } }] },
    });
    return rows.map((r: Record<string, unknown>) => ({
      fromContactId: String(r.fromContactId),
      toContactId: String(r.toContactId),
      relationType: r.relationType as RelationType,
    }));
  }

  /* --- 行业 (incr/0040) -----------------------------------------------------
     The same five verbs the catalogue vocabularies have, and the same
     assertWritable guard on every write: `industry_code` is the anchor, so a
     patch that reached it would be refused by the grant at the database and is
     refused here first, where the message names the column. */

  async listIndustries(workspaceId: string): Promise<IndustryRecord[]> {
    const p = await this.client();
    const rows = await p.industry.findMany({
      where: { workspaceId },
      orderBy: [{ sortOrder: "asc" }, { industryCode: "asc" }],
    });
    return rows.map((r: IndustryRecord) => ({
      id: r.id,
      workspaceId: r.workspaceId,
      industryCode: r.industryCode,
      name: r.name,
      sortOrder: r.sortOrder,
    }));
  }

  async upsertIndustry(workspaceId: string, input: IndustryDraft): Promise<IndustryRecord> {
    const p = await this.client();
    const update = { name: input.name, updatedAt: new Date() };
    const guard = assertWritable(INDUSTRY_TABLE, update);
    if (!guard.ok) {
      throw new Error(
        `refusing to write a locked industry column: ${guard.violations.map((v) => v.message).join("; ")}`,
      );
    }
    const tail = await p.industry.aggregate({ where: { workspaceId }, _max: { sortOrder: true } });
    const row = await p.industry.upsert({
      where: { workspaceId_industryCode: { workspaceId, industryCode: input.industryCode } },
      update,
      create: {
        workspaceId,
        industryCode: input.industryCode,
        sortOrder: (tail._max?.sortOrder ?? 0) + 1,
        ...update,
      },
    });
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      industryCode: row.industryCode,
      name: row.name,
      sortOrder: row.sortOrder,
    };
  }

  async setIndustryOrder(
    workspaceId: string,
    orders: readonly { id: string; sortOrder: number }[],
  ): Promise<void> {
    const p = await this.client();
    for (const o of orders) {
      const patch = { sortOrder: o.sortOrder, updatedAt: new Date() };
      const guard = assertWritable(INDUSTRY_TABLE, patch);
      if (!guard.ok) {
        throw new Error(
          `refusing to write a locked industry column: ${guard.violations.map((v) => v.message).join("; ")}`,
        );
      }
      await p.industry.updateMany({ where: { workspaceId, id: o.id }, data: patch });
    }
  }

  async removeIndustry(workspaceId: string, industryId: string): Promise<boolean> {
    const p = await this.client();
    // The service refused an industry in use; fk_account_industry RESTRICTs
    // underneath as the last line.
    const { count } = await p.industry.deleteMany({ where: { workspaceId, id: industryId } });
    return count > 0;
  }

  async countAccountsByIndustry(workspaceId: string, industryId: string): Promise<number> {
    const p = await this.client();
    // Soft-deleted customers do not count: an industry nothing live carries is
    // one the workspace may retire.
    return p.account.count({ where: { workspaceId, industryId, deletedAt: null } });
  }

  async healthInputs(workspaceId: string, accountId: string): Promise<HealthInputs> {
    const p = await this.client();

    const [opportunities, projects] = await Promise.all([
      // Every opportunity, not only the open ones: the open set drives the
      // pipeline factor, while the full set is what the recency proxy reads.
      p.opportunity.findMany({
        where: { workspaceId, accountId, deletedAt: null },
        select: { id: true, stage: true, amount: true, status: true },
      }),
      p.project.findMany({
        where: { workspaceId, accountId, status: { in: ["planning", "active", "on_hold"] } },
        select: { id: true, health: true },
      }),
    ]);

    const projectIds = projects.map((x: { id: string }) => x.id);

    // "Last interaction" is now a REAL interaction (ADR-006, incr/0004).
    //
    // It used to be the most recent stage movement on the account's deals -
    // named honestly as an approximation, but an approximation that reported
    // three calls, two proposals and a site visit as NO CONTACT unless somebody
    // also dragged a card. The evidence plane exists so this can be the truth.
    //
    // Note this changes what the same constants MEASURE. Health scores move on
    // the deploy that lands this, and accounts that looked fresh because a card
    // moved will correctly go red. That is a correction, not a regression, and
    // ADR-006 records that it needs a release note rather than a silent ship.
    const lastContact = await p.interaction.findFirst({
      where: { workspaceId, accountId },
      orderBy: { occurredAt: "desc" },
      select: { occurredAt: true },
    });
    const overdueRevenueCount =
      projectIds.length === 0
        ? 0
        : await p.revenueSchedule.count({
            where: { workspaceId, projectId: { in: projectIds }, status: "overdue" },
          });

    return {
      openOpportunities: opportunities
        .filter((o: { status: string }) => o.status === "open")
        .map((o: { stage: string; amount: unknown }) => ({
          stage: o.stage,
          amount: o.amount == null ? null : Number(String(o.amount)),
        })),
      lastInteractionAt: (lastContact?.occurredAt as Date | undefined) ?? null,
      projectHealth: projects.map((x: { health: string }) => x.health as ProjectHealth),
      overdueRevenueCount,
    };
  }

  async getAccountPlan(workspaceId: string, accountId: string): Promise<AccountPlanRecord | null> {
    const p = await this.client();
    const r = (await p.accountPlan.findFirst({
      where: { workspaceId, accountId, status: "active" },
      orderBy: { period: "desc" },
    })) as Record<string, unknown> | null;
    if (!r) return null;
    return {
      id: String(r.id),
      workspaceId: String(r.workspaceId),
      accountId: String(r.accountId),
      period: String(r.period),
      targetAmount: r.targetAmount === null ? null : Number(r.targetAmount),
      contactCadenceDays: Number(r.contactCadenceDays),
      execCadenceDays: Number(r.execCadenceDays),
      ownerSub: (r.ownerSub as string | null) ?? null,
      presalesSub: (r.presalesSub as string | null) ?? null,
      deliverySub: (r.deliverySub as string | null) ?? null,
      status: r.status as "active" | "closed",
    };
  }

  async upsertAccountPlan(
    workspaceId: string,
    plan: Omit<AccountPlanRecord, "id" | "workspaceId">,
  ): Promise<AccountPlanRecord> {
    const p = await this.client();
    const data = {
      targetAmount: plan.targetAmount,
      contactCadenceDays: plan.contactCadenceDays,
      execCadenceDays: plan.execCadenceDays,
      ownerSub: plan.ownerSub,
      presalesSub: plan.presalesSub,
      deliverySub: plan.deliverySub,
      status: plan.status,
      updatedAt: new Date(),
    };
    // The update half only. account_id and period are the identity that was
    // matched on, so they are not among the columns a re-plan may move - which
    // is exactly what 98's whitelist says for this table.
    const guard = assertWritable(PLAN_TABLE, data);
    if (!guard.ok) {
      throw new Error(
        `refusing to write a locked account_plan column: ${guard.violations.map((v) => v.message).join("; ")}`,
      );
    }
    const row = (await p.accountPlan.upsert({
      where: {
        workspaceId_accountId_period: {
          workspaceId,
          accountId: plan.accountId,
          period: plan.period,
        },
      },
      update: data,
      create: { workspaceId, accountId: plan.accountId, period: plan.period, ...data },
    })) as Record<string, unknown>;
    return {
      id: String(row.id),
      workspaceId: String(row.workspaceId),
      accountId: String(row.accountId),
      period: String(row.period),
      targetAmount: row.targetAmount === null ? null : Number(row.targetAmount),
      contactCadenceDays: Number(row.contactCadenceDays),
      execCadenceDays: Number(row.execCadenceDays),
      ownerSub: (row.ownerSub as string | null) ?? null,
      presalesSub: (row.presalesSub as string | null) ?? null,
      deliverySub: (row.deliverySub as string | null) ?? null,
      status: row.status as "active" | "closed",
    };
  }
}

function toAccount(r: Record<string, unknown>, industryNames: Map<string, string>): AccountRecord {
  const industryId = (r.industryId as string | null) ?? null;
  return {
    id: String(r.id),
    workspaceId: String(r.workspaceId),
    accountNo: String(r.accountNo),
    name: String(r.name),
    industryId,
    industry: industryId ? industryNames.get(industryId) ?? null : null,
    region: (r.region as string | null) ?? null,
    province: (r.province as string | null) ?? null,
    segmentCode: (r.segmentCode as string | null) ?? null,
    ownerSub: (r.ownerSub as string | null) ?? null,
    healthScore: (r.healthScore as number | null) ?? null,
    status: r.status as AccountStatus,
    tier: (r.tier as AccountTier | undefined) ?? "standard",
    creditCode: (r.creditCode as string | null) ?? null,
    website: (r.website as string | null) ?? null,
    employeeCount: (r.employeeCount as number | null) ?? null,
    parentId: (r.parentId as string | null) ?? null,
  };
}

/**
 * A person plus their employment, as the ContactRecord every reader still
 * expects. `link` is undefined only where the caller has no affiliation in
 * hand; the fields it supplies then read as absent rather than as wrong.
 */
function toContact(r: Record<string, unknown>, link?: Record<string, unknown>): ContactRecord {
  return {
    id: String(r.id),
    workspaceId: String(r.workspaceId),
    accountId: link ? String(link.accountId) : "",
    name: String(r.name),
    title: (link?.title as string | null) ?? null,
    department: (link?.department as string | null) ?? null,
    email: (r.email as string | null) ?? null,
    mobile: (r.mobile as string | null) ?? null,
    wechat: (r.wechat as string | null) ?? null,
    status: String(r.status),
  };
}

function toOpportunityContact(r: Record<string, unknown>): OpportunityContactRecord {
  return {
    id: String(r.id),
    workspaceId: String(r.workspaceId),
    opportunityId: String(r.opportunityId),
    personId: String(r.personId),
    buyingRole: r.buyingRole as OpportunityContactRecord["buyingRole"],
    influence: (r.influence as number | null) ?? null,
    isPrimary: Boolean(r.isPrimary),
  };
}
