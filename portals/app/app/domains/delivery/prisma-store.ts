import { getPrismaClient } from "../../lib/db";
import { assertWritable } from "../shared/column-locks";
import { money, type Money } from "../shared/money";
import type { MilestoneStatus, ProjectHealth, RevenueStatus } from "./lib/revenue";
import type { MilestoneChangeDraft, MilestoneDraft } from "./lib/milestone";
import { DEFAULT_RENEWAL_POLICY, type EngagementType, type RenewalPolicy } from "./lib/renewal";
import type { ContractDraft, ContractStatus, PlannedContractLine } from "./lib/contract";
import type {
  ContractLinePatch,
  ContractLineRecord,
  ContractPatch,
  ContractRecord,
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

import { DEFAULT_AGEING_CUTOFFS } from "./lib/collection-stats";

const PROJECT_TABLE = "yucer_delivery.project";
const MILESTONE_TABLE = "yucer_delivery.project_milestone";
const REVENUE_TABLE = "yucer_delivery.revenue_schedule";
// incr/0042. 账龄分档, one row per workspace.
const AGEING_POLICY_TABLE = "yucer_delivery.ageing_policy";
const RENEWAL_POLICY_TABLE = "yucer_delivery.renewal_policy";
// incr/0076.
const CONTRACT_TABLE = "yucer_delivery.contract";
const CONTRACT_LINE_TABLE = "yucer_delivery.contract_line";
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

  /* --- 账龄分档 (incr/0042) --------------------------------------------------
     NO ROW READS AS THE SHIPPED CUTOFFS, for the reason 0041's thresholds do:
     the increment seeds every workspace that already has a schedule, and one
     created afterwards has none until somebody changes something. */

  async getAgeingCutoffs(workspaceId: string): Promise<number[]> {
    const p = await getPrismaClient();
    const row = await p.ageingPolicy.findUnique({ where: { workspaceId } });
    return row ? row.lateCutoffs.map(Number) : [...DEFAULT_AGEING_CUTOFFS];
  }

  async setAgeingCutoffs(workspaceId: string, cutoffs: readonly number[]): Promise<void> {
    const p = await getPrismaClient();
    const update = { lateCutoffs: [...cutoffs], updatedAt: new Date() };
    const guard = assertWritable(AGEING_POLICY_TABLE, update);
    if (!guard.ok) {
      throw new Error(
        `refusing to write a locked ageing_policy column: ${guard.violations.map((v) => v.message).join("; ")}`,
      );
    }
    await p.ageingPolicy.upsert({
      where: { workspaceId },
      update,
      create: { workspaceId, ...update },
    });
  }

  /* --- 续约提醒窗口 (incr/0066) ------------------------------------------------
     Same "no row = shipped default" discipline as ageing_policy above. */

  async getRenewalPolicy(workspaceId: string): Promise<RenewalPolicy> {
    const p = await getPrismaClient();
    const row = await p.renewalPolicy.findUnique({ where: { workspaceId } });
    return row ? { windowDays: row.windowDays } : DEFAULT_RENEWAL_POLICY;
  }

  async setRenewalPolicy(workspaceId: string, policy: RenewalPolicy): Promise<void> {
    const p = await getPrismaClient();
    const update = { windowDays: policy.windowDays, updatedAt: new Date() };
    const guard = assertWritable(RENEWAL_POLICY_TABLE, update);
    if (!guard.ok) {
      throw new Error(
        `refusing to write a locked renewal_policy column: ${guard.violations.map((v) => v.message).join("; ")}`,
      );
    }
    await p.renewalPolicy.upsert({
      where: { workspaceId },
      update,
      create: { workspaceId, ...update },
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
  /* --- 合同 (incr/0076) ------------------------------------------------------
     TWO QUERIES FOR ANY NUMBER OF CONTRACTS: the heads, then every line of
     every head in one `IN`. No Prisma relation is declared between the two
     models (the schema mirrors the DDL table-for-table and nothing more), so
     the join is done here, once. */

  async listContracts(workspaceId: string, filter: { accountId?: string } = {}): Promise<ContractRecord[]> {
    const p = await getPrismaClient();
    const heads = await p.contract.findMany({
      where: { workspaceId, ...(filter.accountId ? { accountId: filter.accountId } : {}) },
      orderBy: [{ termEnd: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    });
    return this.attachLines(workspaceId, heads as Record<string, unknown>[]);
  }

  async getContract(workspaceId: string, id: string): Promise<ContractRecord | null> {
    const p = await getPrismaClient();
    const head = await p.contract.findFirst({ where: { id, workspaceId } });
    if (!head) return null;
    return (await this.attachLines(workspaceId, [head as Record<string, unknown>]))[0] ?? null;
  }

  async contractNoTaken(workspaceId: string, contractNo: string): Promise<boolean> {
    const p = await getPrismaClient();
    const row = await p.contract.findUnique({
      where: { workspaceId_contractNo: { workspaceId, contractNo } },
      select: { id: true },
    });
    return row !== null;
  }

  async createContract(workspaceId: string, draft: ContractDraft): Promise<ContractRecord> {
    const p = await getPrismaClient();
    // The frozen keys are written HERE and only here - an INSERT is the one
    // statement the grant lets set them.
    const row = await p.contract.create({
      data: {
        workspaceId,
        contractNo: draft.contractNo,
        accountId: draft.accountId,
        opportunityId: draft.opportunityId,
        name: draft.name,
        totalAmount: draft.totalAmount,
        currency: draft.currency,
        termStart: draft.termStart,
        termEnd: draft.termEnd,
        noticeDays: draft.noticeDays,
        status: draft.status,
        signedAt: draft.signedAt,
      },
    });
    return { ...toContract(row as Record<string, unknown>), lines: [] };
  }

  async updateContract(workspaceId: string, id: string, patch: ContractPatch): Promise<boolean> {
    const p = await getPrismaClient();
    const data: Record<string, unknown> = { ...stripUndefined(patch), updatedAt: new Date() };
    const guard = assertWritable(CONTRACT_TABLE, data);
    if (!guard.ok) {
      throw new Error(
        `refusing to write a locked contract column: ${guard.violations.map((v) => v.message).join("; ")}`,
      );
    }
    const res = await p.contract.updateMany({ where: { id, workspaceId }, data });
    return res.count > 0;
  }

  async addContractLine(
    workspaceId: string,
    contractId: string,
    line: PlannedContractLine,
  ): Promise<ContractLineRecord> {
    const p = await getPrismaClient();
    const row = await p.contractLine.create({
      data: {
        workspaceId,
        contractId,
        productId: line.productId,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        amount: line.amount,
        currency: line.currency,
        termEnd: line.termEnd,
      },
    });
    return toContractLine(row as Record<string, unknown>);
  }

  async updateContractLine(workspaceId: string, lineId: string, patch: ContractLinePatch): Promise<boolean> {
    const p = await getPrismaClient();
    const data: Record<string, unknown> = { ...stripUndefined(patch), updatedAt: new Date() };
    const guard = assertWritable(CONTRACT_LINE_TABLE, data);
    if (!guard.ok) {
      throw new Error(
        `refusing to write a locked contract_line column: ${guard.violations.map((v) => v.message).join("; ")}`,
      );
    }
    const res = await p.contractLine.updateMany({ where: { id: lineId, workspaceId }, data });
    return res.count > 0;
  }

  async removeContractLine(workspaceId: string, lineId: string): Promise<boolean> {
    const p = await getPrismaClient();
    const res = await p.contractLine.deleteMany({ where: { id: lineId, workspaceId } });
    return res.count > 0;
  }

  private async attachLines(
    workspaceId: string,
    heads: Record<string, unknown>[],
  ): Promise<ContractRecord[]> {
    if (heads.length === 0) return [];
    const p = await getPrismaClient();
    const lines = await p.contractLine.findMany({
      where: { workspaceId, contractId: { in: heads.map((h) => String(h.id)) } },
      orderBy: [{ createdAt: "asc" }],
    });
    const byContract = new Map<string, ContractLineRecord[]>();
    for (const l of lines as Record<string, unknown>[]) {
      const line = toContractLine(l);
      byContract.set(line.contractId, [...(byContract.get(line.contractId) ?? []), line]);
    }
    return heads.map((h) => ({ ...toContract(h), lines: byContract.get(String(h.id)) ?? [] }));
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

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

/** NUMERIC arrives as a Decimal; the string form keeps precision. */
function num(value: unknown): number {
  return Number(String(value));
}

function toContract(r: Record<string, unknown>): Omit<ContractRecord, "lines"> {
  return {
    id: String(r.id),
    workspaceId: String(r.workspaceId),
    contractNo: String(r.contractNo),
    name: String(r.name),
    accountId: String(r.accountId),
    opportunityId: (r.opportunityId as string | null) ?? null,
    totalAmount: r.totalAmount == null ? null : num(r.totalAmount),
    currency: String(r.currency),
    termStart: (r.termStart as Date | null) ?? null,
    termEnd: (r.termEnd as Date | null) ?? null,
    noticeDays: Number(r.noticeDays),
    status: r.status as ContractStatus,
    renewedFromContractId: (r.renewedFromContractId as string | null) ?? null,
    signedAt: (r.signedAt as Date | null) ?? null,
  };
}

function toContractLine(r: Record<string, unknown>): ContractLineRecord {
  return {
    id: String(r.id),
    contractId: String(r.contractId),
    productId: String(r.productId),
    quantity: num(r.quantity),
    unitPrice: num(r.unitPrice),
    amount: num(r.amount),
    currency: String(r.currency),
    termEnd: (r.termEnd as Date | null) ?? null,
  };
}
