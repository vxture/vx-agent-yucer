// D5 opportunity-detection persistence port.
//
// The signal table is SEMI-IMMUTABLE and the port says so in its method names:
// there is `recordSignal` and there is `resolveSignal`, and nothing that takes
// evidence for a row that already exists. Evidence (source, source_ref,
// signal_type, subject, payload, detected_at) is frozen at the database; only
// the resolution (matched account, score, lifecycle status) moves.
//
// That is not a formality. A signal is the product's claim that something
// happened in the world. Rewriting it is fabricating evidence, and the whole
// value of the detective domain is that its inputs can be trusted later.

import type { SignalStatus, SignalType } from "./lib/scoring";
import { asc, by, desc } from "../shared/order";

export interface SignalRecord {
  id: string;
  workspaceId: string;
  /** Evidence - frozen after creation. */
  source: string;
  sourceRef: string | null;
  signalType: SignalType;
  subject: string;
  payload: Record<string, unknown>;
  detectedAt: Date;
  /** Resolution - writable. */
  accountId: string | null;
  score: number | null;
  status: SignalStatus;
}

/** What a new signal carries. There is no id and no status: the store assigns
 * both, and a signal cannot be born already promoted. */
export interface NewSignal {
  source: string;
  sourceRef: string | null;
  signalType: SignalType;
  subject: string;
  payload?: Record<string, unknown>;
  detectedAt?: Date;
  accountId?: string | null;
}

export type LeadStatus = "new" | "working" | "qualified" | "converted" | "disqualified";

export interface LeadRecord {
  id: string;
  workspaceId: string;
  leadNo: string;
  companyName: string;
  contactName: string | null;
  accountId: string | null;
  /** Attribution - frozen after creation. */
  signalId: string | null;
  campaignId: string | null;
  score: number | null;
  ownerSub: string | null;
  status: LeadStatus;
  convertedOpportunityId: string | null;
}

export interface NewLead {
  companyName: string;
  contactName?: string | null;
  accountId: string | null;
  signalId: string | null;
  campaignId: string | null;
  score: number | null;
  ownerSub?: string | null;
}

export interface SignalFilter {
  status?: SignalStatus;
  signalType?: SignalType;
  accountId?: string;
  /** Only signals scoring at or above this. */
  minScore?: number;
  limit?: number;
}

export interface LeadFilter {
  status?: LeadStatus;
  ownerSub?: string;
  limit?: number;
}

export interface SignalStore {
  /** Returns null when the dedup key already exists - the same external record
   * enters once per workspace, and a duplicate is not an error. */
  recordSignal(workspaceId: string, signal: NewSignal): Promise<SignalRecord | null>;
  listSignals(workspaceId: string, filter?: SignalFilter): Promise<SignalRecord[]>;
  getSignal(workspaceId: string, id: string): Promise<SignalRecord | null>;
  /** Resolution columns only. There is deliberately no way to write evidence. */
  resolveSignal(
    workspaceId: string,
    id: string,
    patch: { accountId?: string | null; score?: number; status?: SignalStatus },
  ): Promise<boolean>;

  createLead(workspaceId: string, lead: NewLead): Promise<LeadRecord>;
  listLeads(workspaceId: string, filter?: LeadFilter): Promise<LeadRecord[]>;
  getLead(workspaceId: string, id: string): Promise<LeadRecord | null>;
  updateLead(
    workspaceId: string,
    id: string,
    patch: {
      companyName?: string;
      contactName?: string | null;
      accountId?: string | null;
      score?: number;
      ownerSub?: string | null;
      status?: LeadStatus;
      convertedOpportunityId?: string | null;
    },
  ): Promise<boolean>;
}

export class InMemorySignalStore implements SignalStore {
  private signals = new Map<string, SignalRecord>();
  private leads = new Map<string, LeadRecord>();
  private seq = 0;

  seed(input: { signals?: SignalRecord[]; leads?: LeadRecord[] }): void {
    for (const s of input.signals ?? []) this.signals.set(s.id, { ...s });
    for (const l of input.leads ?? []) this.leads.set(l.id, { ...l });
  }

  async recordSignal(workspaceId: string, signal: NewSignal): Promise<SignalRecord | null> {
    // uidx_signal_ws_source_ref. A feed replaying the same record is normal
    // traffic, not a failure, so this reports "already known" rather than throws.
    const duplicate = [...this.signals.values()].some(
      (s) =>
        s.workspaceId === workspaceId &&
        s.source === signal.source &&
        s.sourceRef === signal.sourceRef &&
        s.sourceRef !== null,
    );
    if (duplicate) return null;

    this.seq += 1;
    const record: SignalRecord = {
      id: `sig_${this.seq}`,
      workspaceId,
      source: signal.source,
      sourceRef: signal.sourceRef,
      signalType: signal.signalType,
      subject: signal.subject,
      payload: signal.payload ?? {},
      detectedAt: signal.detectedAt ?? new Date(),
      accountId: signal.accountId ?? null,
      score: null,
      // Always `new`. The store has no parameter for anything else.
      status: "new",
    };
    this.signals.set(record.id, record);
    return record;
  }

  async listSignals(workspaceId: string, filter: SignalFilter = {}): Promise<SignalRecord[]> {
    let rows = [...this.signals.values()].filter((s) => s.workspaceId === workspaceId);
    if (filter.status) rows = rows.filter((s) => s.status === filter.status);
    if (filter.signalType) rows = rows.filter((s) => s.signalType === filter.signalType);
    if (filter.accountId) rows = rows.filter((s) => s.accountId === filter.accountId);
    if (filter.minScore != null) rows = rows.filter((s) => (s.score ?? -1) >= filter.minScore!);
    // Highest score first: the inbox exists to put the best lead at the top.
    // Nulls LAST: an unscored signal is not a high-scoring one. Postgres would
    // put it first on a bare DESC, so both adapters say so explicitly.
    rows.sort(
      by(
        desc((s: SignalRecord) => s.score, { nulls: "last" }),
        desc((s: SignalRecord) => s.detectedAt),
      ),
    );
    return filter.limit ? rows.slice(0, filter.limit) : rows;
  }

  async getSignal(workspaceId: string, id: string): Promise<SignalRecord | null> {
    const s = this.signals.get(id);
    return s && s.workspaceId === workspaceId ? { ...s } : null;
  }

  async resolveSignal(
    workspaceId: string,
    id: string,
    patch: { accountId?: string | null; score?: number; status?: SignalStatus },
  ): Promise<boolean> {
    const s = this.signals.get(id);
    if (!s || s.workspaceId !== workspaceId) return false;
    if (patch.accountId !== undefined) s.accountId = patch.accountId;
    if (patch.score !== undefined) s.score = patch.score;
    if (patch.status !== undefined) s.status = patch.status;
    return true;
  }

  async createLead(workspaceId: string, lead: NewLead): Promise<LeadRecord> {
    this.seq += 1;
    const record: LeadRecord = {
      id: `lead_${this.seq}`,
      workspaceId,
      leadNo: `LEAD-${String(this.seq).padStart(5, "0")}`,
      companyName: lead.companyName,
      contactName: lead.contactName ?? null,
      accountId: lead.accountId,
      signalId: lead.signalId,
      campaignId: lead.campaignId,
      score: lead.score,
      ownerSub: lead.ownerSub ?? null,
      status: "new",
      convertedOpportunityId: null,
    };
    this.leads.set(record.id, record);
    return record;
  }

  async listLeads(workspaceId: string, filter: LeadFilter = {}): Promise<LeadRecord[]> {
    let rows = [...this.leads.values()].filter((l) => l.workspaceId === workspaceId);
    if (filter.status) rows = rows.filter((l) => l.status === filter.status);
    if (filter.ownerSub) rows = rows.filter((l) => l.ownerSub === filter.ownerSub);
    rows.sort(by(desc((l: LeadRecord) => l.score, { nulls: "last" })));
    return filter.limit ? rows.slice(0, filter.limit) : rows;
  }

  async getLead(workspaceId: string, id: string): Promise<LeadRecord | null> {
    const l = this.leads.get(id);
    return l && l.workspaceId === workspaceId ? { ...l } : null;
  }

  async updateLead(
    workspaceId: string,
    id: string,
    patch: Partial<LeadRecord>,
  ): Promise<boolean> {
    const l = this.leads.get(id);
    if (!l || l.workspaceId !== workspaceId) return false;
    // signal_id and campaign_id are absent from the patch type on purpose; this
    // guard is the runtime half of the same rule.
    const { signalId, campaignId, id: _id, workspaceId: _ws, leadNo: _no, ...writable } = patch;
    void signalId;
    void campaignId;
    void _id;
    void _ws;
    void _no;
    Object.assign(l, writable);
    return true;
  }
}
