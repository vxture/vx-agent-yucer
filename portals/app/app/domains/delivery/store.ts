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
}

export interface MilestoneRecord {
  id: string;
  projectId: string;
  name: string;
  sequence: number;
  status: MilestoneStatus;
  dueAt: Date | null;
  completedAt: Date | null;
}

export interface InstalmentRecord extends RevenueInstalment {
  id: string;
  projectId: string;
  milestoneId: string | null;
}

export interface ProjectFilter {
  status?: string;
  accountId?: string;
  managerSub?: string;
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
  private instalments: Array<InstalmentRecord & { workspaceId: string }> = [];

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
