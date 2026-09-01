import type { Entitlement } from "../../entitlement/types";
import type { PermissionHolder } from "../../authz/decide";
import { fail, ok, violation, type RuleResult } from "../shared/result";
import { getAccountStore, getPipelineStore } from "../shared/registry";
import { advanceStage } from "../pipeline/service";
import { fillAccountField } from "../account/service";
import { isStage } from "../pipeline/lib/stage";
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
};

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
  if (typeof to !== "string" || !isStage(to)) {
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
