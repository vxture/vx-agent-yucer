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
