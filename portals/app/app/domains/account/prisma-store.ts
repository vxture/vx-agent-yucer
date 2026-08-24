import { getPrismaClient } from "../../lib/db";
import { assertWritable } from "../shared/column-locks";
import type { AccountStatus, ProjectHealth, RelationEdge, RelationType } from "./lib/health";
import type {
  AccountFilter,
  AccountPlanRecord,
  AccountRecord,
  AccountStore,
  AccountTier,
  ContactRecord,
  HealthInputs,
} from "./store";

// Prisma-backed AccountStore over yucer_core.
//
// healthInputs() is the one method that reaches across schemas: it reads open
// opportunities from yucer_pipeline and project health plus overdue instalments
// from yucer_delivery. That is deliberate and does not violate the ownership
// rule - D4 owns the account and only READS the other domains, which is exactly
// what "one object, one owning domain; everyone else references it read-only"
// permits. Writing any of those rows from here would be the violation.

const ACCOUNT_TABLE = "yucer_core.account";

export class PrismaAccountStore implements AccountStore {
  async listAccounts(workspaceId: string, filter: AccountFilter = {}): Promise<AccountRecord[]> {
    const p = await getPrismaClient();
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
    return rows.map((r: Record<string, unknown>) => toAccount(r));
  }

  async getAccount(workspaceId: string, id: string): Promise<AccountRecord | null> {
    const p = await getPrismaClient();
    const row = await p.account.findFirst({ where: { id, workspaceId, deletedAt: null } });
    return row ? toAccount(row as Record<string, unknown>) : null;
  }

  async updateAccount(
    workspaceId: string,
    id: string,
    patch: Partial<AccountRecord>,
  ): Promise<boolean> {
    const p = await getPrismaClient();
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

  async listContacts(workspaceId: string, accountId: string): Promise<ContactRecord[]> {
    const p = await getPrismaClient();
    const rows = await p.contact.findMany({
      where: { workspaceId, accountId, deletedAt: null },
      orderBy: { influence: { sort: "desc", nulls: "last" } },
    });
    return rows.map((r: Record<string, unknown>) => ({
      id: String(r.id),
      workspaceId: String(r.workspaceId),
      accountId: String(r.accountId),
      name: String(r.name),
      title: (r.title as string | null) ?? null,
      department: (r.department as string | null) ?? null,
      decisionRole: r.decisionRole as ContactRecord["decisionRole"],
      influence: (r.influence as number | null) ?? null,
      status: String(r.status),
    }));
  }

  async addRelation(workspaceId: string, edge: RelationEdge): Promise<void> {
    const p = await getPrismaClient();
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
    const p = await getPrismaClient();
    await p.accountRelation.deleteMany({
      where: {
        workspaceId,
        fromContactId: edge.fromContactId,
        toContactId: edge.toContactId,
        relationType: edge.relationType,
      },
    });
  }

  async listRelations(workspaceId: string, accountId: string): Promise<RelationEdge[]> {
    const p = await getPrismaClient();
    const contacts = await p.contact.findMany({
      where: { workspaceId, accountId },
      select: { id: true },
    });
    if (contacts.length === 0) return [];
    const ids = contacts.map((c: { id: string }) => c.id);

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

  async healthInputs(workspaceId: string, accountId: string): Promise<HealthInputs> {
    const p = await getPrismaClient();

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
    const p = await getPrismaClient();
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
}

function toAccount(r: Record<string, unknown>): AccountRecord {
  return {
    id: String(r.id),
    workspaceId: String(r.workspaceId),
    accountNo: String(r.accountNo),
    name: String(r.name),
    industry: (r.industry as string | null) ?? null,
    region: (r.region as string | null) ?? null,
    segmentCode: (r.segmentCode as string | null) ?? null,
    ownerSub: (r.ownerSub as string | null) ?? null,
    healthScore: (r.healthScore as number | null) ?? null,
    status: r.status as AccountStatus,
    tier: (r.tier as AccountTier | undefined) ?? "standard",
  };
}
