import type { Entitlement } from "../../entitlement/types";
import type { PermissionHolder } from "../../authz/decide";
import { fail, ok, violation, type RuleResult } from "../shared/result";
import { getAccountStore, getFieldStore, getPipelineStore } from "../shared/registry";
import { advanceStage, recordEvidence } from "../pipeline/service";
import { fillAccountField, getAccountDetail, setBuyingRole } from "../account/service";
import { DECISION_ROLES, STANCES, type DecisionRole, type Stance } from "../account/lib/health";
import { createCommitment, listInteractions, recordInteraction } from "../account/field-service";
import { isChannel } from "../account/lib/commitment";
import { isStage } from "../pipeline/lib/stage";
import { DEFAULT_STAGE_DEFINITIONS } from "../pipeline/lib/stage-vocab";
import { toStageCatalog } from "../pipeline/store";
import type { AgentAction } from "./lib/action";
import { EXECUTABLE_ACTIONS } from "./lib/autonomy";

// Carrying out what the copilot proposed.
//
// The owner's ruling, 2026-09-01: "采纳当然要真实发生业务动作" - accepting has
// to do the thing. Until now accepting moved a row to `accepted` and the deal
// did not move, which made the whole adjudication theatre: a person signed for
// an outcome that never happened.
//
// THROUGH THE DOMAIN SERVICE, never the store. `advanceStage` runs the stage
// machine, journals the move in opportunity_stage_event and enforces the
// win/loss review rule. An executor that wrote the column itself would be the
// shortcut past all three, and it would be the only writer in the product that
// skipped them.
//
// WITH THE ACCEPTER'S OWN PERMISSIONS (the owner's other ruling). The context
// handed in is the session's, so a member who accepts a recommendation they are
// not allowed to carry out gets a refusal with their name on it - the copilot
// never borrows the service role to do something its human could not. Under
// autonomy there is no accepter, and the context is then the member whose turn
// produced the proposal: the agent is never more permitted than the person it
// is acting for.

export interface ExecutionContext {
  workspaceId: string;
  sub: string;
  holder: PermissionHolder;
  entitlement: Entitlement;
}

// THE LIST LIVES IN THE RULE, NOT HERE. `EXECUTABLE_ACTIONS` is the same
// constant the autonomy rule calls safe, imported rather than restated, so
// "auto-approved" and "performable" cannot drift apart. A second copy here
// would be a copy somebody eventually updates on one side only, and the
// failure it produces is the quiet one: nobody looked at the proposal AND
// nothing happened.
//
// THE ALLOWLIST IS THE AUTHORITY, not the handler map. A handler that exists
// but is not listed does not run - which is the safe direction, because adding
// a handler is a wiring change while adding to the list is the decision that
// this may happen without a person. `executor.test.ts` asserts the two sets
// are equal, so the unsafe direction is a failure and the wasteful one (a
// handler nothing can reach) is too.

type Handler = (
  ctx: ExecutionContext,
  action: AgentAction,
) => Promise<RuleResult<{ actionType: string }>>;

const HANDLERS: Readonly<Record<string, Handler>> = {
  advance_stage: advanceStageAction,
  fill_account_field: fillAccountFieldAction,
  record_interaction: recordInteractionAction,
  record_evidence: recordEvidenceAction,
  set_buying_role: setBuyingRoleAction,
  add_commitment: addCommitmentAction,
  // Deal batch 5c: an accepted plan step is a commitment on the deal - the
  // same write, with no origin note (it came from the plan, not a meeting).
  plan_step: addCommitmentAction,
};

/** The deal a proposal is about, and its customer - read through the gated verb. */
async function dealOf(ctx: ExecutionContext, action: AgentAction) {
  if (action.subjectType !== "opportunity") return null;
  return getPipelineStore().getOpportunity(ctx.workspaceId, action.subjectId);
}

/**
 * A person accepted a role or stance 证据抽取 read in a note (deal batch 4c).
 * The person must be on the deal's customer's roster, read through the
 * account domain's gated verb. Influence is carried over from what is
 * recorded - the proposal never states one, and writing null would erase it.
 */
async function setBuyingRoleAction(
  ctx: ExecutionContext,
  action: AgentAction,
): Promise<RuleResult<{ actionType: string }>> {
  const deal = await dealOf(ctx, action);
  if (!deal) return fail(violation("subject_mismatch", "set_buying_role belongs to a deal", "subjectType"));
  const p = action.payload as { personId?: unknown; buyingRole?: unknown; stance?: unknown };
  if (typeof p.personId !== "string" || typeof p.buyingRole !== "string" || !(DECISION_ROLES as readonly string[]).includes(p.buyingRole)) {
    return fail(violation("payload_invalid", "set_buying_role needs a person and a role", "payload"));
  }
  const stance = typeof p.stance === "string" && (STANCES as readonly string[]).includes(p.stance) ? (p.stance as Stance) : undefined;
  const accountCtx = { ...ctx, store: getAccountStore() };
  const account = await getAccountDetail(accountCtx, deal.accountId);
  if (!account.ok) return account as RuleResult<{ actionType: string }>;
  if (!account.value.contacts.some((c) => c.id === p.personId)) {
    return fail(violation("contact_not_on_account", "that person is not on this deal's customer", "personId"));
  }
  const held = (await getAccountStore().listOpportunityContacts(ctx.workspaceId, deal.id)).find((r) => r.personId === p.personId);
  const set = await setBuyingRole(accountCtx, deal.id, p.personId, p.buyingRole as DecisionRole, held?.influence ?? null, stance);
  if (!set.ok) return set as RuleResult<{ actionType: string }>;
  return ok({ actionType: action.actionType });
}

/**
 * A person accepted a promise 证据抽取 read in a note (deal batch 4c): a
 * commitment on this deal whose origin is that note - the link the schema
 * has carried since incr/0004.
 */
async function addCommitmentAction(
  ctx: ExecutionContext,
  action: AgentAction,
): Promise<RuleResult<{ actionType: string }>> {
  const deal = await dealOf(ctx, action);
  if (!deal) return fail(violation("subject_mismatch", "add_commitment belongs to a deal", "subjectType"));
  const p = action.payload as { direction?: unknown; statement?: unknown; dueAt?: unknown; interactionId?: unknown };
  const due = typeof p.dueAt === "string" ? new Date(`${p.dueAt}T00:00:00Z`) : null;
  if (typeof p.direction !== "string" || typeof p.statement !== "string" || !due || Number.isNaN(due.getTime())) {
    return fail(violation("payload_invalid", "add_commitment needs a direction, a statement and a due date", "payload"));
  }
  const fieldCtx = { ...ctx, store: getFieldStore() };
  const interactionId = typeof p.interactionId === "string" ? p.interactionId : null;
  if (interactionId) {
    const notes = await listInteractions(fieldCtx, { opportunityId: deal.id, limit: 200 });
    if (!notes.ok || !notes.value.some((n) => n.id === interactionId)) {
      return fail(violation("evidence_citation_foreign", "a promise can only come from a note on this deal", "interactionId"));
    }
  }
  const made = await createCommitment(fieldCtx, {
    accountId: deal.accountId,
    opportunityId: deal.id,
    originInteractionId: interactionId,
    direction: p.direction as "we_owe" | "they_owe",
    statement: p.statement,
    dueAt: due,
  });
  if (!made.ok) return made as RuleResult<{ actionType: string }>;
  return ok({ actionType: action.actionType });
}

/**
 * A person accepted what 证据抽取 read in a follow-up (deal batch 4b).
 *
 * THROUGH recordEvidence, with the accepter's permissions: the version is
 * appended (never an overwrite), marked model_accepted with this proposal's
 * id, and its citation must still be one of THIS deal's follow-ups - read
 * through the field domain's gated verb, the same check a typed version gets.
 */
async function recordEvidenceAction(
  ctx: ExecutionContext,
  action: AgentAction,
): Promise<RuleResult<{ actionType: string }>> {
  if (action.subjectType !== "opportunity") {
    return fail(
      violation("subject_mismatch", `record_evidence on a ${action.subjectType} - evidence belongs to a deal`, "subjectType"),
    );
  }
  const p = action.payload as { slot?: unknown; statement?: unknown; interactionId?: unknown };
  if (typeof p.slot !== "string" || typeof p.statement !== "string" || !p.statement.trim()) {
    return fail(violation("payload_invalid", "record_evidence needs a slot and a statement", "payload"));
  }
  const interactionId = typeof p.interactionId === "string" ? p.interactionId : null;
  const notes = interactionId
    ? await listInteractions({ ...ctx, store: getFieldStore() }, { opportunityId: action.subjectId, limit: 200 })
    : null;
  const recorded = await recordEvidence(
    { ...ctx, store: getPipelineStore() },
    action.subjectId,
    { slot: p.slot, statement: p.statement, interactionId },
    new Set(notes?.ok ? notes.value.map((n) => n.id) : []),
    { proposalId: action.id },
  );
  if (!recorded.ok) return recorded as RuleResult<{ actionType: string }>;
  return ok({ actionType: action.actionType });
}

/** The dispatch table's keys, for the guard test. */
export function handledActions(): readonly string[] {
  return Object.keys(HANDLERS);
}

/**
 * Perform one accepted proposal, or say why it could not be.
 *
 * A REFUSAL IS A RESULT, not a throw. The caller turns it into `failed`, which
 * is terminal on purpose: a retry is a new proposal, so the record of the
 * attempt survives instead of being overwritten.
 */
export async function carryOut(
  ctx: ExecutionContext,
  action: AgentAction,
): Promise<RuleResult<{ actionType: string }>> {
  const handler = EXECUTABLE_ACTIONS.includes(action.actionType)
    ? HANDLERS[action.actionType]
    : undefined;
  if (!handler) {
    // Not an accident, and not a TODO. `promote_signal` is the case this
    // refusal was written for: agent_action's subject_type CHECK allows
    // account, lead, opportunity, project, campaign and plan - there is no
    // `signal` - so a proposal cannot name the signal it wants promoted. The
    // demo seeds one against a LEAD id, which `promoteSignal` would read as a
    // signal id and not find. Making it executable is a modelling decision
    // (widen the CHECK, or redefine the action), not a wiring job.
    return fail(
      violation(
        "not_executable_type",
        `nothing here knows how to carry out ${action.actionType}`,
        "actionType",
      ),
    );
  }
  return handler(ctx, action);
}

/**
 * The model filled in something about a customer, and a person accepted it.
 *
 * THE PAYLOAD IS MODEL-WRITTEN JSON, so every part of it is checked rather than
 * trusted: the subject must actually be an account, and the field must be one
 * of the four this fills. `fillAccountField` checks the field again - a model
 * naming `tier` would otherwise reach a commercial designation that has its own
 * rules and its own page.
 */
async function fillAccountFieldAction(
  ctx: ExecutionContext,
  action: AgentAction,
): Promise<RuleResult<{ actionType: string }>> {
  if (action.subjectType !== "account") {
    return fail(
      violation(
        "subject_mismatch",
        `fill_account_field on a ${action.subjectType} - only a customer record has these fields`,
        "subjectType",
      ),
    );
  }
  const payload = action.payload as { field?: unknown; value?: unknown };
  if (typeof payload.field !== "string" || typeof payload.value !== "string") {
    return fail(
      violation("payload_invalid", "fill_account_field needs a field and a value", "payload"),
    );
  }

  const filled = await fillAccountField(
    { ...ctx, store: getAccountStore() },
    action.subjectId,
    payload.field,
    payload.value,
  );
  if (!filled.ok) return filled as RuleResult<{ actionType: string }>;
  return ok({ actionType: action.actionType });
}

async function advanceStageAction(
  ctx: ExecutionContext,
  action: AgentAction,
): Promise<RuleResult<{ actionType: string }>> {
  // The subject IS the opportunity - agent_action carries subject_type and
  // subject_id, and a proposal about a deal names that deal. Checked rather
  // than assumed: a proposal whose type says one thing and whose subject says
  // another is a proposal nobody should act on.
  if (action.subjectType !== "opportunity") {
    return fail(
      violation(
        "subject_mismatch",
        `advance_stage on a ${action.subjectType} - only an opportunity has a stage`,
        "subjectType",
      ),
    );
  }
  const to = (action.payload as { to?: unknown }).to;
  // Against the WORKSPACE's catalog (YC-065 R3), not the shipped seven: a
  // proposal to move into a stage the workspace configured is valid.
  const stageRows = await getPipelineStore().listStageDefinitions(ctx.workspaceId);
  const stageCatalog = stageRows.length > 0 ? toStageCatalog(stageRows) : DEFAULT_STAGE_DEFINITIONS;
  if (typeof to !== "string" || !isStage(to, stageCatalog)) {
    return fail(
      violation(
        "payload_invalid",
        `advance_stage needs a stage to move to, got ${String(to)}`,
        "payload",
      ),
    );
  }

  const moved = await advanceStage({ ...ctx, store: getPipelineStore() }, action.subjectId, {
    to,
    // THE REASON IS THE MODEL'S OWN RATIONALE, carried into the journal.
    // opportunity_stage_event.reason is what somebody reads months later asking
    // why this deal moved; "the copilot said so" without the sentence it said
    // would make the journal worse than a blank.
    ...(action.rationale ? { reason: action.rationale } : {}),
  });
  if (!moved.ok) return moved as RuleResult<{ actionType: string }>;
  return ok({ actionType: action.actionType });
}

async function recordInteractionAction(
  ctx: ExecutionContext,
  action: AgentAction,
): Promise<RuleResult<{ actionType: string }>> {
  if (action.subjectType !== "account") {
    return fail(
      violation(
        "subject_mismatch",
        `record_interaction on a ${action.subjectType} - interactions belong to an account`,
        "subjectType",
      ),
    );
  }
  const p = action.payload as {
    channel?: unknown;
    occurredAt?: unknown;
    rawNote?: unknown;
    summary?: unknown;
    subject?: unknown;
    opportunityId?: unknown;
    projectId?: unknown;
    participants?: unknown;
  };
  if (typeof p.channel !== "string" || !isChannel(p.channel)) {
    return fail(
      violation("payload_invalid", "record_interaction needs a valid channel", "payload"),
    );
  }
  if (typeof p.occurredAt !== "string" || Number.isNaN(Date.parse(p.occurredAt))) {
    return fail(
      violation("payload_invalid", "record_interaction needs an occurredAt ISO date", "payload"),
    );
  }
  if (typeof p.rawNote !== "string" || !p.rawNote.trim()) {
    return fail(
      violation("payload_invalid", "record_interaction needs a non-empty rawNote", "payload"),
    );
  }

  const participants =
    Array.isArray(p.participants)
      ? p.participants
          .filter((x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null)
          .map((x) => ({
            ...(typeof x.contactId === "string" ? { contactId: x.contactId } : {}),
            ...(typeof x.memberSub === "string" ? { memberSub: x.memberSub } : {}),
            ...(typeof x.externalName === "string" ? { externalName: x.externalName } : {}),
            ...(typeof x.roleAtTime === "string" ? { roleAtTime: x.roleAtTime } : {}),
          }))
      : undefined;

  const recorded = await recordInteraction(
    { ...ctx, store: getFieldStore() },
    {
      accountId: action.subjectId,
      channel: p.channel,
      occurredAt: new Date(p.occurredAt),
      rawNote: p.rawNote,
      summary: typeof p.summary === "string" ? p.summary : undefined,
      subject: typeof p.subject === "string" ? p.subject : undefined,
      opportunityId: typeof p.opportunityId === "string" ? p.opportunityId : undefined,
      projectId: typeof p.projectId === "string" ? p.projectId : undefined,
      captureMode: "agent_drafted",
      participants,
    },
  );
  if (!recorded.ok) return recorded as RuleResult<{ actionType: string }>;
  return ok({ actionType: action.actionType });
}
