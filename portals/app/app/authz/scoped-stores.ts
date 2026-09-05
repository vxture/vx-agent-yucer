import type { DataScope } from "./scope";
import { canSeeRow, visibleRows } from "./visibility";
import type { AccountStore } from "../domains/account/store";
import type { PipelineStore } from "../domains/pipeline/store";
import type { SignalStore } from "../domains/signal/store";

// Applying the scope, once, where the store is handed out.
//
// WHY A WRAPPER AND NOT A CHECK IN EVERY VERB. Scope is a second isolation key
// - the same kind of thing as workspace_id - and workspace_id is not something
// a service remembers to check: it is a parameter of every store call, so no
// verb can forget it. A per-verb scope check would mean every list, every read
// by id and every verb written next year remembering, and a forgotten one is a
// SILENT confidentiality hole. That is the worst failure this feature could
// have, because the setting is believed.
//
// THE COMPILER IS WHAT MAKES THE COVERAGE STRUCTURAL. These classes declare
// `implements PipelineStore` and friends, so a method added to a port later
// does not compile until it is written here - and writing it forces the author
// to decide, at that moment, whether the rows it returns are scoped. A
// decorator that spread the original with `...store` would have taken the new
// method silently and unscoped, which is the version of this idea that does not
// work.
//
// PASS-THROUGH IS DELIBERATE, NOT LAZINESS. Most methods either write (a write
// is already gated by permission, and writing a row you cannot see is refused
// by the read that precedes it) or return rows carrying no owner - stage
// events, snapshots, catalogue joins. Each pass-through below says which.
//
// WORKSPACE SCOPE COSTS NOTHING: the wrapper is not applied at all, so the
// default configuration has no runtime footprint whatsoever.

/** Wrap a store so every scoped read is narrowed. `workspace` returns as-is. */
export function scopePipelineStore(store: PipelineStore, scope: DataScope): PipelineStore {
  return scope.kind === "workspace" ? store : new ScopedPipelineStore(store, scope);
}

export function scopeAccountStore(store: AccountStore, scope: DataScope): AccountStore {
  return scope.kind === "workspace" ? store : new ScopedAccountStore(store, scope);
}

export function scopeSignalStore(store: SignalStore, scope: DataScope): SignalStore {
  return scope.kind === "workspace" ? store : new ScopedSignalStore(store, scope);
}

class ScopedPipelineStore implements PipelineStore {
  constructor(
    private readonly inner: PipelineStore,
    private readonly scope: DataScope,
  ) {}

  // --- scoped reads ---------------------------------------------------------
  async listOpportunities(
    ...args: Parameters<PipelineStore["listOpportunities"]>
  ): ReturnType<PipelineStore["listOpportunities"]> {
    return visibleRows(this.scope, await this.inner.listOpportunities(...args));
  }

  async getOpportunity(
    ...args: Parameters<PipelineStore["getOpportunity"]>
  ): ReturnType<PipelineStore["getOpportunity"]> {
    const row = await this.inner.getOpportunity(...args);
    // NULL, NOT A REFUSAL. Every caller already turns null into `not_found`,
    // and that is the right answer: distinguishing "does not exist" from "not
    // yours" turns the scope into an existence oracle - the same reasoning
    // advanceStage gives for answering not_found across workspaces.
    return row && canSeeRow(this.scope, row) ? row : null;
  }

  // --- pass-through ---------------------------------------------------------
  // Writes. A write to a row this member cannot see is already impossible: every
  // write path reads the row first, through the scoped read above.
  createOpportunity: PipelineStore["createOpportunity"] = (...a) => this.inner.createOpportunity(...a);
  applyStageChange: PipelineStore["applyStageChange"] = (...a) => this.inner.applyStageChange(...a);
  updateCommercialTerms: PipelineStore["updateCommercialTerms"] = (...a) =>
    this.inner.updateCommercialTerms(...a);
  appendForecastSnapshot: PipelineStore["appendForecastSnapshot"] = (...a) =>
    this.inner.appendForecastSnapshot(...a);
  saveWinLossReview: PipelineStore["saveWinLossReview"] = (...a) => this.inner.saveWinLossReview(...a);

  // Rows carrying no owner of their own. A stage event belongs to the deal, a
  // snapshot to the workspace; both are reached through something already
  // scoped, or are workspace-level facts by design.
  listStageEvents: PipelineStore["listStageEvents"] = (...a) => this.inner.listStageEvents(...a);
  latestStageChangeAt: PipelineStore["latestStageChangeAt"] = (...a) =>
    this.inner.latestStageChangeAt(...a);
  listForecastSnapshots: PipelineStore["listForecastSnapshots"] = (...a) =>
    this.inner.listForecastSnapshots(...a);
  getWinLossReview: PipelineStore["getWinLossReview"] = (...a) => this.inner.getWinLossReview(...a);
  listRenewalSourceProjectIds: PipelineStore["listRenewalSourceProjectIds"] = (...a) =>
    this.inner.listRenewalSourceProjectIds(...a);

  // listUnreviewedClosed returns CLOSED deals owed a win/loss review. Left
  // unscoped on purpose: the review debt is a workspace obligation, and hiding
  // a colleague's unreviewed loss from the person chasing reviews would make
  // the list wrong rather than private.
  listUnreviewedClosed: PipelineStore["listUnreviewedClosed"] = (...a) =>
    this.inner.listUnreviewedClosed(...a);
}

class ScopedAccountStore implements AccountStore {
  constructor(
    private readonly inner: AccountStore,
    private readonly scope: DataScope,
  ) {}

  async listAccounts(
    ...args: Parameters<AccountStore["listAccounts"]>
  ): ReturnType<AccountStore["listAccounts"]> {
    // An account is its own parent, so it carries no accountId to inherit
    // through - `id` is what the own-scope reachability set names.
    const rows = await this.inner.listAccounts(...args);
    return rows.filter((a) => canSeeRow(this.scope, { ownerSub: a.ownerSub, accountId: a.id }));
  }

  async getAccount(
    ...args: Parameters<AccountStore["getAccount"]>
  ): ReturnType<AccountStore["getAccount"]> {
    const row = await this.inner.getAccount(...args);
    if (!row) return null;
    return canSeeRow(this.scope, { ownerSub: row.ownerSub, accountId: row.id }) ? row : null;
  }

  // --- pass-through ---------------------------------------------------------
  // Everything below is reached THROUGH an account: a plan, a contact, a
  // relation and a health input all name an accountId, and the caller reached
  // that id through the two scoped reads above.
  getAccountPlan: AccountStore["getAccountPlan"] = (...a) => this.inner.getAccountPlan(...a);
  upsertAccountPlan: AccountStore["upsertAccountPlan"] = (...a) => this.inner.upsertAccountPlan(...a);
  listContacts: AccountStore["listContacts"] = (...a) => this.inner.listContacts(...a);
  upsertContact: AccountStore["upsertContact"] = (...a) => this.inner.upsertContact(...a);
  listRelations: AccountStore["listRelations"] = (...a) => this.inner.listRelations(...a);
  addRelation: AccountStore["addRelation"] = (...a) => this.inner.addRelation(...a);
  removeRelation: AccountStore["removeRelation"] = (...a) => this.inner.removeRelation(...a);
  healthInputs: AccountStore["healthInputs"] = (...a) => this.inner.healthInputs(...a);
  updateAccount: AccountStore["updateAccount"] = (...a) => this.inner.updateAccount(...a);
  // incr/0027. Reached through an OPPORTUNITY rather than an account, and that
  // is still the same argument: a caller holds an opportunity id because a
  // scoped pipeline read gave it to them. Filtering again here would need this
  // store to resolve a deal to its owner - a D6 question asked from D4's
  // wrapper - and would answer it from data D4 has no scoped read for.
  listOpportunityContacts: AccountStore["listOpportunityContacts"] = (...a) =>
    this.inner.listOpportunityContacts(...a);
  listOpportunityContactsFor: AccountStore["listOpportunityContactsFor"] = (...a) =>
    this.inner.listOpportunityContactsFor(...a);
  setOpportunityContact: AccountStore["setOpportunityContact"] = (...a) =>
    this.inner.setOpportunityContact(...a);
}

class ScopedSignalStore implements SignalStore {
  constructor(
    private readonly inner: SignalStore,
    private readonly scope: DataScope,
  ) {}

  async listLeads(
    ...args: Parameters<SignalStore["listLeads"]>
  ): ReturnType<SignalStore["listLeads"]> {
    return visibleRows(this.scope, await this.inner.listLeads(...args));
  }

  async getLead(...args: Parameters<SignalStore["getLead"]>): ReturnType<SignalStore["getLead"]> {
    const row = await this.inner.getLead(...args);
    return row && canSeeRow(this.scope, row) ? row : null;
  }

  // --- pass-through ---------------------------------------------------------
  // A SIGNAL IS NOT SOMEBODY'S BOOK. It is inbound evidence with no owner until
  // it is promoted into a lead, and the lead is where ownership starts. Hiding
  // signals would hide the queue that feeds everyone.
  listSignals: SignalStore["listSignals"] = (...a) => this.inner.listSignals(...a);
  recordSignal: SignalStore["recordSignal"] = (...a) => this.inner.recordSignal(...a);
  resolveSignal: SignalStore["resolveSignal"] = (...a) => this.inner.resolveSignal(...a);
  getSignal: SignalStore["getSignal"] = (...a) => this.inner.getSignal(...a);
  createLead: SignalStore["createLead"] = (...a) => this.inner.createLead(...a);
  updateLead: SignalStore["updateLead"] = (...a) => this.inner.updateLead(...a);
}
