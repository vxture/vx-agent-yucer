// D7 delivery persistence port.
//
// The revenue schedule is where the chain terminates: the gap between planned
// and actual is the final measure of whether a strategy landed. Two shapes here
// follow from that:
//
//   - `sequence` never appears in an update signature. It is part of
//     uidx_revenue_schedule_seq and is the row's identity; reordering
//     instalments means writing new rows.
//   - projectHealth() returns the DERIVED health next to the reported one, so a
//     caller can see that a green report was downgraded and why, rather than
//     silently receiving a different colour than the delivery team submitted.

import type { Money } from "../shared/money";
import type { EngagementType } from "./lib/renewal";
import type {
  MilestoneAcceptance,
  MilestoneChangeDraft,
  MilestoneDraft,
} from "./lib/milestone";
import type {
  MilestoneStatus,
  ProjectHealth,
  RevenueInstalment,
  RevenueStatus,
} from "./lib/revenue";

export interface ProjectRecord {
  id: string;
  workspaceId: string;
  projectNo: string;
  name: string;
  opportunityId: string | null;
  accountId: string;
  managerSub: string | null;
  contractAmount: Money | null;
  /** What the delivery team reports. deriveProjectHealth may downgrade it. */
  health: ProjectHealth;
  status: string;
  currency: string;
  /**
   * When the engagement ends - the term for a subscription, the handover for
   * a one-off. Exposed because the renewal derivation cannot exist without
   * it: "is this term nearly up" has no other source.
   */
  endsAt: Date | null;
  /**
   * Whether this comes back round. Added by 0018 rather than derived, because
   * `endsAt` means the same thing for both shapes and guessing the commercial
   * form of a deal from a date invents renewals nobody owes.
   */
  engagementType: EngagementType;
}

export interface MilestoneRecord {
  id: string;
  projectId: string;
  name: string;
  sequence: number;
  status: MilestoneStatus;
  dueAt: Date | null;
  completedAt: Date | null;
  /** incr/0032. What was committed - immutable, and null on gates written
   * before anyone dated them. */
  baselineDueAt: Date | null;
  /** incr/0032. The customer's sign-off as OUR user recorded it; never
   * entered by the customer, who does not use this system. */
  acceptance: MilestoneAcceptance | null;
}

export interface InstalmentRecord extends RevenueInstalment {
  id: string;
  projectId: string;
  /** incr/0032 - NOT NULL. Every instalment names the gate that releases it. */
  milestoneId: string;
}

/** One recorded move of the plan. Append-only: there is no update or delete. */
export interface MilestoneChangeRecord extends MilestoneChangeDraft {
  id: string;
  milestoneId: string;
  changedAt: Date;
}

export interface ProjectFilter {
  status?: string;
  accountId?: string;
  managerSub?: string;
  /** Narrow to the shape that can be renewed at all. */
  engagementType?: EngagementType;
  limit?: number;
}

export interface DeliveryStore {
  listProjects(workspaceId: string, filter?: ProjectFilter): Promise<ProjectRecord[]>;
  getProject(workspaceId: string, id: string): Promise<ProjectRecord | null>;
  updateProject(
    workspaceId: string,
    id: string,
    patch: Partial<Pick<ProjectRecord, "name" | "managerSub" | "contractAmount" | "health" | "status">>,
  ): Promise<boolean>;

  listMilestones(workspaceId: string, projectId: string): Promise<MilestoneRecord[]>;
  /**
   * Create a milestone, or edit the one at that sequence.
   *
   * UPSERT BY (project, sequence). `sequence` is UNIQUE per project in the DDL
   * and carries no UPDATE grant, so it is the anchor - the same shape as a
   * territory code or a product code. Re-importing a delivery plan updates it
   * rather than producing a second copy of every step.
   */
  upsertMilestone(
    workspaceId: string,
    projectId: string,
    input: MilestoneDraft,
  ): Promise<MilestoneRecord>;

  /**
   * Record what moved in the plan and why.
   *
   * SEPARATE FROM THE UPSERT, not folded into it, because the two have
   * different powers: the milestone row is edited, the change log is only ever
   * appended to (no UPDATE and no DELETE grant, incr/0032). A port verb that
   * did both would let a caller believe a correction could be an edit.
   */
  appendMilestoneChanges(
    workspaceId: string,
    milestoneId: string,
    changes: readonly MilestoneChangeDraft[],
  ): Promise<void>;

  /**
   * Every recorded move on ONE PROJECT's plan, newest first.
   *
   * BY PROJECT, NOT BY MILESTONE. The plan is read as a whole - a card grid of
   * gates, not one gate at a time - so a per-milestone verb would have the
   * page issue a query per card to render a line of text on each.
   */
  listMilestoneChanges(workspaceId: string, projectId: string): Promise<MilestoneChangeRecord[]>;
  listInstalments(workspaceId: string, projectId: string): Promise<InstalmentRecord[]>;

  /** Whitelisted columns only; `sequence` is deliberately not among them. */
  updateInstalment(
    workspaceId: string,
    id: string,
    patch: { status?: RevenueStatus; actualAmount?: Money; settledAt?: Date | null },
  ): Promise<boolean>;
}

export class InMemoryDeliveryStore implements DeliveryStore {
  private projects = new Map<string, ProjectRecord>();
  private milestones: Array<MilestoneRecord & { workspaceId: string }> = [];
  private seq = 0;
  private instalments: Array<InstalmentRecord & { workspaceId: string }> = [];
  private changes: Array<MilestoneChangeRecord & { workspaceId: string }> = [];

  seed(input: {
    projects?: ProjectRecord[];
    milestones?: Array<MilestoneRecord & { workspaceId: string }>;
    instalments?: Array<InstalmentRecord & { workspaceId: string }>;
  }): void {
    for (const p of input.projects ?? []) this.projects.set(p.id, { ...p });
    this.milestones.push(...(input.milestones ?? []));
    this.instalments.push(...(input.instalments ?? []));
  }

  async listProjects(workspaceId: string, filter: ProjectFilter = {}): Promise<ProjectRecord[]> {
    let rows = [...this.projects.values()].filter((p) => p.workspaceId === workspaceId);
    if (filter.status) rows = rows.filter((p) => p.status === filter.status);
    if (filter.accountId) rows = rows.filter((p) => p.accountId === filter.accountId);
    if (filter.managerSub) rows = rows.filter((p) => p.managerSub === filter.managerSub);
    if (filter.engagementType) {
      rows = rows.filter((p) => p.engagementType === filter.engagementType);
    }
    return filter.limit ? rows.slice(0, filter.limit) : rows;
  }

  async getProject(workspaceId: string, id: string): Promise<ProjectRecord | null> {
    const p = this.projects.get(id);
    return p && p.workspaceId === workspaceId ? { ...p } : null;
  }

  async updateProject(
    workspaceId: string,
    id: string,
    patch: Partial<ProjectRecord>,
  ): Promise<boolean> {
    const p = this.projects.get(id);
    if (!p || p.workspaceId !== workspaceId) return false;
    Object.assign(p, patch);
    return true;
  }

  async upsertMilestone(
    workspaceId: string,
    projectId: string,
    input: MilestoneDraft,
  ): Promise<MilestoneRecord> {
    const held = this.milestones.find(
      (m) =>
        m.workspaceId === workspaceId &&
        m.projectId === projectId &&
        m.sequence === input.sequence,
    );
    if (held) {
      held.name = input.name;
      held.dueAt = input.dueAt;
      held.completedAt = input.completedAt;
      held.status = input.status;
      held.acceptance = input.acceptance;
      // baselineDueAt is deliberately NOT assigned. The column carries no
      // UPDATE grant, so writing it here would make this store disagree with
      // the database it stands in for - and the disagreement would only show
      // up as a driver error in an environment that has one.
      return held;
    }
    const created = { ...input, id: `ms_${++this.seq}`, projectId, workspaceId };
    this.milestones.push(created);
    return created;
  }

  async appendMilestoneChanges(
    workspaceId: string,
    milestoneId: string,
    changes: readonly MilestoneChangeDraft[],
  ): Promise<void> {
    for (const c of changes) {
      this.changes.push({
        ...c,
        id: `mc_${++this.seq}`,
        milestoneId,
        workspaceId,
        changedAt: new Date(),
      });
    }
  }

  async listMilestoneChanges(
    workspaceId: string,
    projectId: string,
  ): Promise<MilestoneChangeRecord[]> {
    const mine = new Set(
      this.milestones.filter((m) => m.projectId === projectId).map((m) => m.id),
    );
    return this.changes
      .filter((c) => c.workspaceId === workspaceId && mine.has(c.milestoneId))
      .sort((a, b) => b.changedAt.getTime() - a.changedAt.getTime());
  }

  async listMilestones(workspaceId: string, projectId: string): Promise<MilestoneRecord[]> {
    return this.milestones
      .filter((m) => m.workspaceId === workspaceId && m.projectId === projectId)
      .sort((a, b) => a.sequence - b.sequence);
  }

  async listInstalments(workspaceId: string, projectId: string): Promise<InstalmentRecord[]> {
    return this.instalments
      .filter((i) => i.workspaceId === workspaceId && i.projectId === projectId)
      .sort((a, b) => a.sequence - b.sequence);
  }

  async updateInstalment(
    workspaceId: string,
    id: string,
    patch: { status?: RevenueStatus; actualAmount?: Money; settledAt?: Date | null },
  ): Promise<boolean> {
    const row = this.instalments.find((i) => i.id === id && i.workspaceId === workspaceId);
    if (!row) return false;
    if (patch.status !== undefined) row.status = patch.status;
    if (patch.actualAmount !== undefined) row.actualAmount = patch.actualAmount;
    if (patch.settledAt !== undefined) row.settledAt = patch.settledAt;
    return true;
  }
}
