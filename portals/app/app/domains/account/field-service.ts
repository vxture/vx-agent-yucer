// D4 evidence-plane service: gate -> rule -> persistence (ADR-006).
//
// No new feature key and no new permission. Interactions and commitments are
// account data, so they ride the account.manage feature and the existing
// account.read / account.write permissions.
//
// That is deliberate rather than lazy. The capability matrix and the role
// catalog are filled blank-zone slots that change by ADR, and stage 1 has a
// KILL CRITERION - six weeks of measured capture decides whether stage 2 is
// built at all. Expanding the commercial surface before knowing whether the
// habit forms would be selling a capability we might withdraw.

import type { Entitlement } from "../../entitlement/types";
import { can, type PermissionHolder } from "../../authz/decide";
import { fail, ok, violation, type RuleResult } from "../shared/result";
import { denied } from "../pipeline/service";
import {
  isDirection,
  planCommitmentClosure,
  reliability,
  validateInteraction,
  type CloseInput,
  type Reliability,
} from "./lib/commitment";
import type { EvidenceGrounding } from "../../agent/orchestrator/prompt";
import { analyzeChainRecency, type ChainRecency, type ContactNode, type RelationEdge } from "./lib/health";
import {
  CAPTURE_CRITERION,
  assessCapture,
  captureByWeek,
  dealsTouched,
  type CaptureAssessment,
  type CaptureWeek,
  type OpportunityWindow,
} from "./lib/capture-metric";
import type {
  CommitmentFilter,
  CommitmentRecord,
  FieldStore,
  InteractionFilter,
  InteractionRecord,
  NewCommitment,
  NewInteraction,
} from "./field-store";

export interface FieldContext {
  workspaceId: string;
  sub: string;
  holder: PermissionHolder;
  entitlement: Entitlement;
  store: FieldStore;
}

// --- Recording what happened ------------------------------------------------

/**
 * Record one interaction.
 *
 * The actor is the session subject, never a parameter - the same reason a stage
 * change takes its actor from the context. An interaction is evidence, and
 * evidence that can name someone else as its author is not evidence.
 */
export async function recordInteraction(
  ctx: FieldContext,
  input: Omit<NewInteraction, "actorSub">,
): Promise<RuleResult<InteractionRecord>> {
  const gate = can(ctx.holder, ctx.entitlement, "account.upsert", "data");
  if (!gate.allowed) return denied(gate);

  const valid = validateInteraction({
    channel: input.channel,
    occurredAt: input.occurredAt,
    rawNote: input.rawNote,
  });
  if (!valid.ok) return valid as RuleResult<InteractionRecord>;

  const row = await ctx.store.recordInteraction(ctx.workspaceId, {
    ...input,
    // From the session. Evidence that can name someone else as its author is
    // not evidence.
    actorSub: ctx.sub,
    // The person recording is a participant by definition; recording a meeting
    // you were not at is a different act and needs an explicit participant row.
    participants: input.participants ?? [{ memberSub: ctx.sub }],
  });
  return ok(row);
}

export async function listInteractions(
  ctx: FieldContext,
  filter: InteractionFilter = {},
): Promise<RuleResult<InteractionRecord[]>> {
  const gate = can(ctx.holder, ctx.entitlement, "account.view", "data");
  if (!gate.allowed) return denied(gate);
  return ok(await ctx.store.listInteractions(ctx.workspaceId, filter));
}

// --- Promises ---------------------------------------------------------------

export async function createCommitment(
  ctx: FieldContext,
  input: NewCommitment,
): Promise<RuleResult<CommitmentRecord>> {
  const gate = can(ctx.holder, ctx.entitlement, "account.upsert", "data");
  if (!gate.allowed) return denied(gate);

  if (!isDirection(input.direction)) {
    return fail(violation("unknown_direction", `${input.direction} is not a direction`, "direction"));
  }
  if (!input.statement.trim()) {
    return fail(violation("statement_required", "a commitment says what was promised", "statement"));
  }

  return ok(
    await ctx.store.createCommitment(ctx.workspaceId, {
      ...input,
      statement: input.statement.trim(),
      // Ours defaults to the person making it. Theirs has no owner_sub at all.
      ownerSub: input.direction === "we_owe" ? (input.ownerSub ?? ctx.sub) : null,
    }),
  );
}

export async function listCommitments(
  ctx: FieldContext,
  filter: CommitmentFilter = {},
): Promise<RuleResult<CommitmentRecord[]>> {
  const gate = can(ctx.holder, ctx.entitlement, "account.view", "data");
  if (!gate.allowed) return denied(gate);
  return ok(await ctx.store.listCommitments(ctx.workspaceId, filter));
}

/**
 * Close a commitment.
 *
 * The waiver is taken from the session, not the request: a caller who could
 * name the waiver could sign off someone else's decision to let a promise go.
 *
 * `met` needs evidence and the rule refuses without it - and so does the
 * database (chk_commitment_met_needs_evidence). Two layers, because this is the
 * single rule that separates a commitment from a to-do item.
 */
export async function closeCommitment(
  ctx: FieldContext,
  id: string,
  input: Omit<CloseInput, "waivedBySub">,
): Promise<RuleResult<CommitmentRecord>> {
  const gate = can(ctx.holder, ctx.entitlement, "account.upsert", "data");
  if (!gate.allowed) return denied(gate);

  const current = await ctx.store.getCommitment(ctx.workspaceId, id);
  if (!current) {
    return fail(violation("not_found", `commitment ${id} was not found`, "id"));
  }

  const plan = planCommitmentClosure(
    { status: current.status, direction: current.direction, dueAt: current.dueAt },
    { ...input, waivedBySub: input.to === "waived" ? ctx.sub : undefined },
  );
  if (!plan.ok) return plan as RuleResult<CommitmentRecord>;

  const applied = await ctx.store.applyClosure(ctx.workspaceId, id, plan.value);
  if (!applied) return fail(violation("not_found", `commitment ${id} was not found`, "id"));

  const updated = await ctx.store.getCommitment(ctx.workspaceId, id);
  if (!updated) return fail(violation("not_found", `commitment ${id} was not found`, "id"));
  return ok(updated);
}

// --- What the plane says about a relationship -------------------------------

export interface RelationshipEvidence {
  lastContactAt: Date | null;
  reliability: Reliability;
  interactionCount: number;
}

/**
 * The evidence summary for one account.
 *
 * This is what replaces "last contact = last time someone dragged a card". It
 * is deliberately counts and dates rather than a score: "they have missed two
 * of the three things they promised" is actionable, and a number between 0 and
 * 100 is not.
 */
export async function relationshipEvidence(
  ctx: FieldContext,
  accountId: string,
  now = new Date(),
): Promise<RuleResult<RelationshipEvidence>> {
  const gate = can(ctx.holder, ctx.entitlement, "account.view", "data");
  if (!gate.allowed) return denied(gate);

  const [lastContactAt, commitments, interactions] = await Promise.all([
    ctx.store.lastContactAt(ctx.workspaceId, accountId),
    ctx.store.listCommitments(ctx.workspaceId, { accountId }),
    ctx.store.listInteractions(ctx.workspaceId, { accountId }),
  ]);

  return ok({
    lastContactAt,
    reliability: reliability(commitments, now),
    interactionCount: interactions.length,
  });
}

// --- Whether any of this is being used --------------------------------------

/**
 * The adoption reading behind ADR-006's kill criterion.
 *
 * Takes the opportunity windows as an argument rather than reaching for the
 * pipeline store: this service owns the evidence plane, and a function that
 * held handles to two domains' stores would be the first place the one-object-
 * one-owning-domain rule started leaking. The caller joins them.
 *
 * Gated on admin.manage, not on a sales permission. It is a statement about the
 * workspace's use of the product, and the honest audience for it is whoever
 * decides whether to keep paying for it.
 */
export async function captureAdoption(
  ctx: FieldContext,
  opportunities: readonly OpportunityWindow[],
  options: { now?: Date; weeks?: number } = {},
): Promise<
  RuleResult<{ weeks: CaptureWeek[]; assessment: CaptureAssessment; touched: string[] }>
> {
  const gate = can(ctx.holder, ctx.entitlement, "admin.adoption.view", "data");
  if (!gate.allowed) return denied(gate);

  const interactions = await ctx.store.listInteractions(ctx.workspaceId, {});
  const weeks = captureByWeek(interactions, opportunities, {
    now: options.now,
    weeks: options.weeks ?? CAPTURE_CRITERION.windowWeeks,
  });
  const from = weeks[0]?.weekStart ?? new Date(0);
  const to = weeks[weeks.length - 1]?.weekEnd ?? new Date(0);
  return ok({
    weeks,
    assessment: assessCapture(weeks),
    // Named deals, not just percentages. Computed over the whole window rather
    // than per week: a deal touched once in six weeks is not dark, it is slow,
    // and conflating the two would send a manager after the wrong thing.
    touched: [...dealsTouched(interactions, from, to)],
  });
}

/**
 * Who on the decision chain anyone has actually spoken to.
 *
 * Lives here rather than in the account service because the join it needs is
 * the evidence plane's - interaction_participant is what turns "we contacted
 * this company" into "we contacted this person". The caller pairs it with
 * decisionChain(); the two are deliberately separate results, because
 * structural coverage and recorded contact are different claims and merging
 * them would let a gap in our own record-keeping read as a gap in the
 * relationship.
 */
export async function chainRecency(
  ctx: FieldContext,
  accountId: string,
  contacts: readonly ContactNode[],
  relations: readonly RelationEdge[],
  options: { now?: Date; windowDays?: number } = {},
): Promise<RuleResult<ChainRecency>> {
  const gate = can(ctx.holder, ctx.entitlement, "account.view", "data");
  if (!gate.allowed) return denied(gate);

  const last = await ctx.store.lastContactByContact(ctx.workspaceId, accountId);
  // Every active contact gets an entry. A contact missing from the map has no
  // recorded interaction, and that must arrive as an explicit null rather than
  // as an absent key the rule has to interpret.
  const activity = contacts.map((c) => ({
    contactId: c.id,
    lastContactAt: last.get(c.id) ?? null,
  }));
  return ok(analyzeChainRecency(contacts, relations, activity, options));
}

/**
 * The evidence plane, shaped for a prompt.
 *
 * Assembled HERE, behind this domain's gate, rather than inside the copilot
 * turn: a customer's recorded words reaching a model must pass the same
 * account.view check as a person reading the same page. The copilot receives a
 * finished, already-authorised block and never holds a handle to this store.
 *
 * The cap is declared in the result rather than applied silently. A model shown
 * a window with no note that it is a window will reason as though it has the
 * whole history, and "nothing happened before this" is exactly the confident
 * fiction the evidence plane exists to stop.
 */
export async function evidenceForPrompt(
  ctx: FieldContext,
  accountId: string,
  accountName: string,
  options: { now?: Date; maxNotes?: number; opportunityId?: string } = {},
): Promise<RuleResult<EvidenceGrounding>> {
  const gate = can(ctx.holder, ctx.entitlement, "account.view", "data");
  if (!gate.allowed) return denied(gate);

  const now = options.now ?? new Date();
  const maxNotes = options.maxNotes ?? 12;
  const scope = options.opportunityId
    ? { accountId, opportunityId: options.opportunityId }
    : { accountId };

  const [all, commitments, lastContactAt] = await Promise.all([
    ctx.store.listInteractions(ctx.workspaceId, scope),
    ctx.store.listCommitments(ctx.workspaceId, scope),
    ctx.store.lastContactAt(ctx.workspaceId, accountId),
  ]);

  const notes = all.slice(0, maxNotes);
  return ok({
    accountName,
    notes: notes.map((n) => ({
      id: n.id,
      channel: n.channel,
      occurredAt: n.occurredAt,
      actorSub: n.actorSub,
      rawNote: n.rawNote,
    })),
    omittedNotes: all.length - notes.length,
    // Open promises first, and only the open ones carry a days-overdue number -
    // a settled promise has no countdown and printing one would invite the
    // model to treat a closed matter as outstanding.
    promises: commitments.map((c) => ({
      direction: c.direction,
      statement: c.statement,
      dueAt: c.dueAt,
      status: c.status,
      daysOverdue:
        c.status === "open" ? Math.floor((now.getTime() - c.dueAt.getTime()) / 86_400_000) : null,
    })),
    daysSinceContact:
      lastContactAt === null
        ? null
        : Math.floor((now.getTime() - lastContactAt.getTime()) / 86_400_000),
  });
}
