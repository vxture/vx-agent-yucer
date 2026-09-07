import { getPrismaClient } from "../../lib/db";
import { assertWritable } from "../shared/column-locks";
import { money, type Money } from "../shared/money";
import type { MilestoneStatus, ProjectHealth, RevenueStatus } from "./lib/revenue";
import type { MilestoneChangeDraft, MilestoneDraft } from "./lib/milestone";
import type { EngagementType } from "./lib/renewal";
import type {
  DeliveryStore,
  InstalmentRecord,
  MilestoneChangeRecord,
  MilestoneRecord,
  ProjectFilter,
  ProjectRecord,
} from "./store";

// Prisma-backed DeliveryStore over yucer_delivery.
//
// `sequence` never reaches a data object here, on either table. It is part of
// uidx_project_milestone_seq / uidx_revenue_schedule_seq and is the row's
// identity; reordering instalments means writing new rows, not renumbering old
// ones. The column-lock mirror would catch an attempt, and the method
// signatures make it unexpressible in the first place.

const PROJECT_TABLE = "yucer_delivery.project";
const MILESTONE_TABLE = "yucer_delivery.project_milestone";
const REVENUE_TABLE = "yucer_delivery.revenue_schedule";
// yucer_delivery.milestone_change has no constant here on purpose: assertWritable
// guards an UPDATE's column list, and this table has no UPDATE to guard. Its
// entry in APPEND_ONLY_TABLES is what the mirror checks.

/** NUMERIC arrives as a Decimal; parsing from its string form keeps precision. */
function toMoney(value: unknown, currency: string): Money | null {
  return value == null ? null : money(Number(String(value)), currency);
}

export class PrismaDeliveryStore implements DeliveryStore {
  async listProjects(workspaceId: string, filter: ProjectFilter = {}): Promise<ProjectRecord[]> {
    const p = await getPrismaClient();
    const rows = await p.project.findMany({
      where: {
        workspaceId,
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.accountId ? { accountId: filter.accountId } : {}),
        ...(filter.managerSub ? { managerSub: filter.managerSub } : {}),
        ...(filter.engagementType ? { engagementType: filter.engagementType } : {}),
      },
      orderBy: [{ createdAt: "desc" }],
      ...(filter.limit ? { take: filter.limit } : {}),
    });
    return rows.map((r: Record<string, unknown>) => toProject(r));
  }

  async getProject(workspaceId: string, id: string): Promise<ProjectRecord | null> {
    const p = await getPrismaClient();
    const row = await p.project.findFirst({ where: { id, workspaceId } });
    return row ? toProject(row as Record<string, unknown>) : null;
  }

  async updateProject(
    workspaceId: string,
    id: string,
    patch: Partial<ProjectRecord>,
  ): Promise<boolean> {
    const p = await getPrismaClient();
    const data: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.name !== undefined) data.name = patch.name;
    if (patch.managerSub !== undefined) data.managerSub = patch.managerSub;
    if (patch.health !== undefined) data.health = patch.health;
    if (patch.status !== undefined) data.status = patch.status;
    if (patch.contractAmount !== undefined) {
      data.contractAmount = patch.contractAmount?.amount ?? null;
      data.currency = patch.contractAmount?.currency;
    }

    const guard = assertWritable(PROJECT_TABLE, data);
    if (!guard.ok) {
      throw new Error(
        `refusing to write locked columns: ${guard.violations.map((v) => v.message).join("; ")}`,
      );
    }

    const res = await p.project.updateMany({ where: { id, workspaceId }, data });
    return res.count > 0;
  }

  async listMilestones(workspaceId: string, projectId: string): Promise<MilestoneRecord[]> {
    const p = await getPrismaClient();
    const rows = await p.projectMilestone.findMany({
      where: { workspaceId, projectId },
      orderBy: { sequence: "asc" },
    });
    return rows.map((r: Record<string, unknown>) => toMilestone(r));
  }

  async upsertMilestone(
    workspaceId: string,
    projectId: string,
    input: MilestoneDraft,
  ): Promise<MilestoneRecord> {
    const p = await getPrismaClient();
    const writable = {
      name: input.name,
      dueAt: input.dueAt,
      completedAt: input.completedAt,
      status: input.status,
      // incr/0032. Recorded by one of our users about the customer's sign-off,
      // and moving as a set - the CHECK constraint refuses a partial one.
      acceptedAt: input.acceptance?.at ?? null,
      acceptedBy: input.acceptance?.by ?? null,
      acceptanceRecordedBySub: input.acceptance?.recordedBySub ?? null,
      updatedAt: new Date(),
    };
    // The update half only. `sequence` is the anchor and carries no UPDATE
    // grant, which is exactly what the mirror is checking here.
    const guard = assertWritable(MILESTONE_TABLE, writable);
    if (!guard.ok) {
      throw new Error(
        `refusing to write a locked milestone column: ${guard.violations.map((v) => v.message).join("; ")}`,
      );
    }

    const row = await p.projectMilestone.upsert({
      where: { projectId_sequence: { projectId, sequence: input.sequence } },
      update: writable,
      // baselineDueAt IS IN THE CREATE AND NOT IN THE UPDATE, which is the
      // whole mechanism: the column has no UPDATE grant, so an edit that tried
      // to restate it would be refused by Postgres - and the mirror check
      // below would refuse it before that.
      create: {
        workspaceId,
        projectId,
        sequence: input.sequence,
        baselineDueAt: input.baselineDueAt,
        ...writable,
      },
    });
    return toMilestone(row as Record<string, unknown>);
  }

  async appendMilestoneChanges(
    workspaceId: string,
    milestoneId: string,
    changes: readonly MilestoneChangeDraft[],
  ): Promise<void> {
    if (changes.length === 0) return;
    const p = await getPrismaClient();
    // createMany, and no update path anywhere in this method. The table has
    // neither an UPDATE nor a DELETE grant (incr/0032), so append is the only
    // thing the service role can do here - the code says the same.
    await p.milestoneChange.createMany({
      data: changes.map((c) => ({
        workspaceId,
        milestoneId,
        changedBySub: c.changedBySub,
        field: c.field,
        fromValue: c.fromValue,
        toValue: c.toValue,
        reason: c.reason,
      })),
    });
  }

  async listMilestoneChanges(
    workspaceId: string,
    projectId: string,
  ): Promise<MilestoneChangeRecord[]> {
    const p = await getPrismaClient();
    // Through the milestones, because milestone_change carries no project of
    // its own - the gate it hangs off already knows, and copying the project
    // onto the log would be a second place for it to be wrong.
    const gates = await p.projectMilestone.findMany({
      where: { workspaceId, projectId },
      select: { id: true },
    });
    if (gates.length === 0) return [];
    const rows = await p.milestoneChange.findMany({
      where: { workspaceId, milestoneId: { in: gates.map((g: { id: string }) => g.id) } },
      orderBy: { changedAt: "desc" },
    });
    return rows.map((r: Record<string, unknown>) => ({
      id: String(r.id),
      milestoneId: String(r.milestoneId),
      changedBySub: String(r.changedBySub),
      field: r.field as MilestoneChangeDraft["field"],
      fromValue: (r.fromValue as string | null) ?? null,
      toValue: (r.toValue as string | null) ?? null,
      reason: String(r.reason),
      changedAt: r.changedAt as Date,
    }));
  }

  async listInstalments(workspaceId: string, projectId: string): Promise<InstalmentRecord[]> {
    const p = await getPrismaClient();
    const rows = await p.revenueSchedule.findMany({
      where: { workspaceId, projectId },
      orderBy: { sequence: "asc" },
    });
    return rows.map((r: Record<string, unknown>) => {
      const currency = String(r.currency);
      return {
        id: String(r.id),
        projectId: String(r.projectId),
        milestoneId: String(r.milestoneId),
        sequence: Number(r.sequence),
        status: r.status as RevenueStatus,
        plannedAmount: toMoney(r.plannedAmount, currency) ?? money(0, currency),
        actualAmount: toMoney(r.actualAmount, currency),
        dueAt: (r.dueAt as Date | null) ?? null,
        settledAt: (r.settledAt as Date | null) ?? null,
      };
    });
  }

  async updateInstalment(
    workspaceId: string,
    id: string,
    patch: { status?: RevenueStatus; actualAmount?: Money; settledAt?: Date | null },
  ): Promise<boolean> {
    const p = await getPrismaClient();
    const data: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.status !== undefined) data.status = patch.status;
    if (patch.settledAt !== undefined) data.settledAt = patch.settledAt;
    if (patch.actualAmount !== undefined) {
      data.actualAmount = patch.actualAmount.amount;
      data.currency = patch.actualAmount.currency;
    }

    const guard = assertWritable(REVENUE_TABLE, data);
    if (!guard.ok) {
      throw new Error(
        `refusing to write locked columns: ${guard.violations.map((v) => v.message).join("; ")}`,
      );
    }

    const res = await p.revenueSchedule.updateMany({ where: { id, workspaceId }, data });
    return res.count > 0;
  }
}

function toProject(r: Record<string, unknown>): ProjectRecord {
  const currency = String(r.currency);
  return {
    id: String(r.id),
    workspaceId: String(r.workspaceId),
    projectNo: String(r.projectNo),
    name: String(r.name),
    opportunityId: (r.opportunityId as string | null) ?? null,
    accountId: String(r.accountId),
    managerSub: (r.managerSub as string | null) ?? null,
    contractAmount: toMoney(r.contractAmount, currency),
    health: r.health as ProjectHealth,
    status: String(r.status),
    currency,
    endsAt: (r.endsAt as Date | null) ?? null,
    // The DDL default is one_off, so a row written before 0018 reads as
    // one_off here too rather than as undefined - which would make
    // assessRenewal's first branch depend on how old the row is.
    engagementType: (r.engagementType as EngagementType | undefined) ?? "one_off",
  };
}

function toMilestone(r: Record<string, unknown>): MilestoneRecord {
  return {
    id: String(r.id),
    projectId: String(r.projectId),
    name: String(r.name),
    sequence: Number(r.sequence),
    status: r.status as MilestoneStatus,
    dueAt: (r.dueAt as Date | null) ?? null,
    completedAt: (r.completedAt as Date | null) ?? null,
    baselineDueAt: (r.baselineDueAt as Date | null) ?? null,
    // All three columns or none - the CHECK guarantees it, so reading one is
    // enough to decide whether there is a record here at all.
    acceptance:
      r.acceptedAt == null
        ? null
        : {
            at: r.acceptedAt as Date,
            by: String(r.acceptedBy),
            recordedBySub: String(r.acceptanceRecordedBySub),
          },
  };
}
