// D4 account persistence port.
//
// One thing here differs from the pipeline port and is worth stating: the
// relationship graph is APPEND-ONLY. yucer_core.account_relation has no UPDATE
// grant at all, so the port offers addRelation and removeRelation and no way to
// edit one. A relationship that changed is a new edge, and the old edge is
// deleted or left standing - it is never rewritten in place, because "who
// reported to whom last quarter" is a fact the decision-chain analysis reads.

import type { AccountStatus, ContactNode, ProjectHealth, RelationEdge } from "./lib/health";

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
}

export interface ContactRecord extends ContactNode {
  workspaceId: string;
  accountId: string;
  name: string;
  title: string | null;
  department: string | null;
}

export interface AccountFilter {
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
  getAccount(workspaceId: string, id: string): Promise<AccountRecord | null>;
  /** Whitelisted columns only; the adapter checks against the column-lock mirror. */
  updateAccount(
    workspaceId: string,
    id: string,
    patch: Partial<Pick<AccountRecord, "name" | "industry" | "region" | "segmentCode" | "ownerSub" | "healthScore" | "status">>,
  ): Promise<boolean>;

  listContacts(workspaceId: string, accountId: string): Promise<ContactRecord[]>;
  /** Append-only edge. There is deliberately no updateRelation. */
  addRelation(workspaceId: string, edge: RelationEdge): Promise<void>;
  removeRelation(workspaceId: string, edge: RelationEdge): Promise<void>;
  listRelations(workspaceId: string, accountId: string): Promise<RelationEdge[]>;

  /** The inputs a health recompute needs, gathered across domains. */
  healthInputs(workspaceId: string, accountId: string): Promise<HealthInputs>;
}

export class InMemoryAccountStore implements AccountStore {
  private accounts = new Map<string, AccountRecord>();
  private contacts: ContactRecord[] = [];
  private relations: Array<RelationEdge & { workspaceId: string; accountId: string }> = [];
  private inputs = new Map<string, HealthInputs>();

  seed(input: {
    accounts?: AccountRecord[];
    contacts?: ContactRecord[];
    relations?: Array<RelationEdge & { workspaceId: string; accountId: string }>;
    healthInputs?: Record<string, HealthInputs>;
  }): void {
    for (const a of input.accounts ?? []) this.accounts.set(a.id, { ...a });
    this.contacts.push(...(input.contacts ?? []));
    this.relations.push(...(input.relations ?? []));
    for (const [k, v] of Object.entries(input.healthInputs ?? {})) this.inputs.set(k, v);
  }

  async listAccounts(workspaceId: string, filter: AccountFilter = {}): Promise<AccountRecord[]> {
    let rows = [...this.accounts.values()].filter((a) => a.workspaceId === workspaceId);
    if (filter.status) rows = rows.filter((a) => a.status === filter.status);
    if (filter.ownerSub) rows = rows.filter((a) => a.ownerSub === filter.ownerSub);
    if (filter.segmentCode) rows = rows.filter((a) => a.segmentCode === filter.segmentCode);
    // Sickest first: the list exists to surface the accounts needing attention.
    rows.sort((a, b) => (a.healthScore ?? 101) - (b.healthScore ?? 101));
    return filter.limit ? rows.slice(0, filter.limit) : rows;
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
    return this.contacts.filter((c) => c.workspaceId === workspaceId && c.accountId === accountId);
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
