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
import { DEFAULT_RENEWAL_POLICY, type EngagementType, type RenewalPolicy } from "./lib/renewal";
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
import { DEFAULT_AGEING_CUTOFFS } from "./lib/collection-stats";
import type { ContractDraft, ContractFacts, PlannedContractLine, RenewalEventType } from "./lib/contract";

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
  /**
   * incr/0077. The contract this delivery runs under, when anyone has said.
   * Read by the renewal window (L4 batch two): a project WITH a contract takes
   * its renewal date from the contract; one without keeps its own end date.
   */
  contractId: string | null;
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

/**
 * incr/0076. 合同 - metadata only, never contract text.
 *
 * THE LINES TRAVEL WITH THE CONTRACT. Every reader of a contract wants its
 * lines (the tab renders them, 已购态 folds them), so the port returns them
 * together and the adapter reads them in ONE query for all contracts on the
 * page - not one query per contract, the N+1 the panorama read budget names.
 */
export interface ContractRecord extends ContractFacts {
  workspaceId: string;
  name: string;
  totalAmount: number | null;
  noticeDays: number;
  /** incr/0076 lineage. Frozen, and written by batch two's renewal, not here. */
  renewedFromContractId: string | null;
  /** incr/0078 batch two. The contract that renewed this one, if any -
   *  derived from the successor's renewed_from_contract_id, never stored. */
  renewedBy: string | null;
  signedAt: Date | null;
  lines: ContractLineRecord[];
  /** incr/0078. Oldest first - it is a history. */
  events: RenewalEventRecord[];
}

export interface RenewalEventRecord {
  id: string;
  contractId: string;
  eventType: RenewalEventType;
  successorContractId: string | null;
  reason: string | null;
  actorSub: string | null;
  occurredAt: Date;
}

export type RenewalEventDraft = Omit<RenewalEventRecord, "id" | "occurredAt">;

export interface ContractLineRecord extends PlannedContractLine {
  id: string;
  contractId: string;
}

/** The writable columns (incr/0076 grant), and nothing the grant leaves out. */
export type ContractPatch = Partial<
  Pick<ContractDraft, "name" | "totalAmount" | "currency" | "termStart" | "termEnd" | "noticeDays" | "status" | "signedAt">
>;

export type ContractLinePatch = Partial<
  Pick<PlannedContractLine, "quantity" | "unitPrice" | "amount" | "currency" | "termEnd">
>;

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

  /* --- 账龄分档 (incr/0042) --------------------------------------------------
     One row per workspace, so no list and no delete: `get` answers with the
     shipped cutoffs where no row exists, and `set` writes it either way. */
  getAgeingCutoffs(workspaceId: string): Promise<number[]>;
  setAgeingCutoffs(workspaceId: string, cutoffs: readonly number[]): Promise<void>;

  /* --- 续约提醒窗口 (incr/0066) ----------------------------------------------
     Same one-row-per-workspace shape as ageing_policy above. */
  getRenewalPolicy(workspaceId: string): Promise<RenewalPolicy>;
  setRenewalPolicy(workspaceId: string, policy: RenewalPolicy): Promise<void>;

  /* --- 合同 (incr/0076) ------------------------------------------------------
     Create and edit are separate verbs: contract_no is the anchor, and an
     upsert by it would let a number typed twice edit the wrong contract. */
  listContracts(workspaceId: string, filter?: { accountId?: string }): Promise<ContractRecord[]>;
  getContract(workspaceId: string, id: string): Promise<ContractRecord | null>;
  contractNoTaken(workspaceId: string, contractNo: string): Promise<boolean>;
  /** `renewedFrom` is set here and only here: the column is frozen after INSERT. */
  createContract(workspaceId: string, draft: ContractDraft, renewedFrom?: string | null): Promise<ContractRecord>;
  /** incr/0078. Append-only: there is no update or delete verb for events. */
  appendRenewalEvent(workspaceId: string, event: RenewalEventDraft): Promise<RenewalEventRecord>;
  updateContract(workspaceId: string, id: string, patch: ContractPatch): Promise<boolean>;
  addContractLine(workspaceId: string, contractId: string, line: PlannedContractLine): Promise<ContractLineRecord>;
  updateContractLine(workspaceId: string, lineId: string, patch: ContractLinePatch): Promise<boolean>;
  removeContractLine(workspaceId: string, lineId: string): Promise<boolean>;
}

export class InMemoryDeliveryStore implements DeliveryStore {
  private projects = new Map<string, ProjectRecord>();
  private milestones: Array<MilestoneRecord & { workspaceId: string }> = [];
  private seq = 0;
  private instalments: Array<InstalmentRecord & { workspaceId: string }> = [];
  private changes: Array<MilestoneChangeRecord & { workspaceId: string }> = [];
  /* incr/0042. The workspace's ageing policy, which the database holds in
     yucer_delivery.ageing_policy. */
  private cutoffs = new Map<string, number[]>();
  /* incr/0066. The workspace's renewal policy, yucer_delivery.renewal_policy. */
  private renewalPolicies = new Map<string, RenewalPolicy>();
  private contracts = new Map<string, Omit<ContractRecord, "lines" | "events" | "renewedBy">>();
  private renewalEvents: Array<RenewalEventRecord & { workspaceId: string }> = [];
  private contractLines: Array<ContractLineRecord & { workspaceId: string }> = [];

  async getAgeingCutoffs(workspaceId: string): Promise<number[]> {
    return this.cutoffs.get(workspaceId) ?? [...DEFAULT_AGEING_CUTOFFS];
  }

  async setAgeingCutoffs(workspaceId: string, cutoffs: readonly number[]): Promise<void> {
    this.cutoffs.set(workspaceId, [...cutoffs]);
  }

  async getRenewalPolicy(workspaceId: string): Promise<RenewalPolicy> {
    return this.renewalPolicies.get(workspaceId) ?? DEFAULT_RENEWAL_POLICY;
  }

  async setRenewalPolicy(workspaceId: string, policy: RenewalPolicy): Promise<void> {
    this.renewalPolicies.set(workspaceId, { ...policy });
  }

  seed(input: {
    projects?: ProjectRecord[];
    milestones?: Array<MilestoneRecord & { workspaceId: string }>;
    instalments?: Array<InstalmentRecord & { workspaceId: string }>;
    contracts?: ContractRecord[];
    renewalEvents?: Array<RenewalEventRecord & { workspaceId: string }>;
  }): void {
    this.renewalEvents.push(...(input.renewalEvents ?? []));
    for (const c of input.contracts ?? []) {
      const { lines, events: _events, renewedBy: _renewedBy, ...head } = c;
      this.contracts.set(c.id, { ...head });
      this.contractLines.push(...lines.map((l) => ({ ...l, workspaceId: c.workspaceId })));
    }
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
  private withLines(head: Omit<ContractRecord, "lines" | "events" | "renewedBy">): ContractRecord {
    const lines = this.contractLines
      .filter((l) => l.workspaceId === head.workspaceId && l.contractId === head.id)
      .map(({ workspaceId: _ws, ...l }) => ({ ...l }));
    const events = this.renewalEvents
      .filter((e) => e.workspaceId === head.workspaceId && e.contractId === head.id)
      .map(({ workspaceId: _ws, ...e }) => ({ ...e }));
    const successor = [...this.contracts.values()].find(
      (c) => c.workspaceId === head.workspaceId && c.renewedFromContractId === head.id,
    );
    return { ...head, lines, events, renewedBy: successor?.id ?? null };
  }

  async appendRenewalEvent(workspaceId: string, event: RenewalEventDraft): Promise<RenewalEventRecord> {
    const row = { ...event, id: `re_${++this.seq}`, workspaceId, occurredAt: new Date() };
    this.renewalEvents.push(row);
    const { workspaceId: _ws, ...out } = row;
    return out;
  }

  async listContracts(workspaceId: string, filter: { accountId?: string } = {}): Promise<ContractRecord[]> {
    return [...this.contracts.values()]
      .filter((c) => c.workspaceId === workspaceId)
      .filter((c) => !filter.accountId || c.accountId === filter.accountId)
      // Newest term first, undated drafts last - the same order the adapter uses.
      .sort((a, b) => (b.termEnd?.getTime() ?? -Infinity) - (a.termEnd?.getTime() ?? -Infinity))
      .map((c) => this.withLines(c));
  }

  async getContract(workspaceId: string, id: string): Promise<ContractRecord | null> {
    const c = this.contracts.get(id);
    return c && c.workspaceId === workspaceId ? this.withLines(c) : null;
  }

  async contractNoTaken(workspaceId: string, contractNo: string): Promise<boolean> {
    return [...this.contracts.values()].some(
      (c) => c.workspaceId === workspaceId && c.contractNo === contractNo,
    );
  }

  async createContract(
    workspaceId: string,
    draft: ContractDraft,
    renewedFrom: string | null = null,
  ): Promise<ContractRecord> {
    // The unique index, as the in-memory store's own refusal - so a test
    // against this store cannot pass a double renewal the database rejects.
    if (
      renewedFrom &&
      [...this.contracts.values()].some((c) => c.workspaceId === workspaceId && c.renewedFromContractId === renewedFrom)
    ) {
      // Shaped like Prisma's P2002, so the service's handling is exercised
      // against this store exactly as it is against the database.
      throw Object.assign(new Error("unique violation: uidx_contract_renewed_from"), { code: "P2002" });
    }
    const head = {
      ...draft,
      id: `ct_${++this.seq}`,
      workspaceId,
      renewedFromContractId: renewedFrom,
    };
    this.contracts.set(head.id, head);
    return this.withLines(head);
  }

  async updateContract(workspaceId: string, id: string, patch: ContractPatch): Promise<boolean> {
    const c = this.contracts.get(id);
    if (!c || c.workspaceId !== workspaceId) return false;
    Object.assign(c, patch);
    return true;
  }

  async addContractLine(
    workspaceId: string,
    contractId: string,
    line: PlannedContractLine,
  ): Promise<ContractLineRecord> {
    const row = { ...line, id: `cl_${++this.seq}`, contractId, workspaceId };
    this.contractLines.push(row);
    const { workspaceId: _ws, ...out } = row;
    return out;
  }

  async updateContractLine(workspaceId: string, lineId: string, patch: ContractLinePatch): Promise<boolean> {
    const row = this.contractLines.find((l) => l.id === lineId && l.workspaceId === workspaceId);
    if (!row) return false;
    Object.assign(row, patch);
    return true;
  }

  async removeContractLine(workspaceId: string, lineId: string): Promise<boolean> {
    const at = this.contractLines.findIndex((l) => l.id === lineId && l.workspaceId === workspaceId);
    if (at < 0) return false;
    this.contractLines.splice(at, 1);
    return true;
  }
}
