// D8 application service: gate -> rule -> persistence for the copilot.
//
// The most important function here is adjudicate(). It is the only path by which
// a proposal changes state, and it enforces the whole human-in-the-loop rule in
// one place:
//
//   - the member must hold copilot.decide AND the workspace must have bought
//     copilot.suggest (both gates, in order);
//   - the decider is taken from the session, never from the request;
//   - each row is signed individually, even in a batch;
//   - a proposal someone else already decided is skipped, not overwritten.

import type { Entitlement } from "../../entitlement/types";
import { can, type PermissionHolder } from "../../authz/decide";
import { autopilotAuthorized } from "../../authz/gate";
import { fail, ok, violation, type RuleResult } from "../shared/result";
import { denied } from "../pipeline/service";
import { decideAutonomy, isAutonomyMode, type AutonomyMode } from "./lib/autonomy";
import {
  planBatchDecision,
  planExecution,
  planExpiry,
  planFailure,
  type ActionPatch,
  type ActionStatus,
  type AgentAction,
  type Decision,
} from "./lib/action";
import { carryOut } from "./executor";
import type { CopilotStore, NewProposal, PlaybookFilter, PlaybookRecord, ProposalFilter } from "./store";

export interface CopilotContext {
  workspaceId: string;
  sub: string;
  holder: PermissionHolder;
  entitlement: Entitlement;
  store: CopilotStore;
}

export async function listProposals(
  ctx: CopilotContext,
  filter: ProposalFilter = {},
): Promise<RuleResult<AgentAction[]>> {
  // copilot.action.view, not copilot.playbook.view. The effective gate is the
  // same, but the action now NAMES what it guards - reading the proposal queue
  // is not reading the playbook catalog, and a reader of this line could not
  // previously tell whether the free tier here was intended or accidental.
  const gate = can(ctx.holder, ctx.entitlement, "copilot.action.view", "data");
  if (!gate.allowed) return denied(gate);
  return ok(await ctx.store.listProposals(ctx.workspaceId, filter));
}

/**
 * The plays the workspace has written, as a readable catalog.
 *
 * It matters that this is VIEWABLE and not just consumed. Grounding silently
 * injects workspace-authored text into the agent's prompt, and an assistant
 * whose instructions nobody can read is one nobody can correct: a rep who
 * disagrees with an answer needs to be able to find the sentence that produced
 * it. Same gate as the proposal queue - reading what the agent was told is part
 * of using the agent, not an admin privilege.
 */
export async function listPlaybooks(
  ctx: CopilotContext,
  filter: PlaybookFilter = {},
): Promise<RuleResult<PlaybookRecord[]>> {
  const gate = can(ctx.holder, ctx.entitlement, "copilot.playbook.view", "data");
  if (!gate.allowed) return denied(gate);
  return ok(await ctx.store.listPlaybooks(ctx.workspaceId, filter));
}

export interface AdjudicationResult {
  /** Ids that actually moved. */
  decided: string[];
  /** Ids skipped because they were no longer pending, with why. */
  skipped: Array<{ id: string; reason: string }>;
}

/**
 * Accept or reject proposals. Handles one and many through the same path, so a
 * single decision and a batch of two hundred cannot diverge in what they record.
 */
export async function adjudicate(
  ctx: CopilotContext,
  ids: readonly string[],
  decision: Decision,
): Promise<RuleResult<AdjudicationResult>> {
  const gate = can(ctx.holder, ctx.entitlement, "copilot.action.decide", "data");
  if (!gate.allowed) return denied(gate);
  if (ids.length === 0) return ok({ decided: [], skipped: [] });

  const actions: AgentAction[] = [];
  const skipped: AdjudicationResult["skipped"] = [];
  for (const id of ids) {
    const a = await ctx.store.getProposal(ctx.workspaceId, id);
    if (!a) skipped.push({ id, reason: "not_found" });
    else actions.push(a);
  }

  // The decider is the session's subject. A caller that could name the decider
  // could sign someone else's name to a decision.
  const batch = planBatchDecision(actions, { decision, decidedBySub: ctx.sub });
  for (const s of batch.skipped) {
    skipped.push({ id: s.id, reason: s.violations[0]?.code ?? "rejected_by_rule" });
  }

  // A decision always moves a row out of `proposed`.
  const moved = await ctx.store.applyDecision(
    ctx.workspaceId,
    batch.accepted.map((item) => ({ ...item, from: ["proposed" as const] })),
  );
  // A row that planned cleanly but did not move lost a race to another decider.
  for (const item of batch.accepted) {
    if (!moved.includes(item.id)) skipped.push({ id: item.id, reason: "already_decided" });
  }

  return ok({ decided: moved, skipped });
}

/**
 * Execute an accepted proposal, or a still-pending one under autopilot.
 *
 * Autopilot needs three independent yeses (tier, permission, workspace opt-in),
 * and this is the only place that asks for all three together. `workspaceOptIn`
 * is passed in rather than read here because it is a workspace setting, and this
 * function has no business reaching for settings.
 */
export async function execute(
  ctx: CopilotContext,
  id: string,
  // NO OPTIONS. Both used to be here - `autopilot` and `workspaceOptIn` - and
  // both were booleans the caller handed in, which is a caller declaring it has
  // authority rather than having it. The posture is the workspace's stored row
  // and whether THIS proposal may skip a person is the rule's answer.
): Promise<RuleResult<{ id: string; autonomous: boolean }>> {
  // The decide gate runs BEFORE the row is loaded. Loading first would answer
  // `not_found` to an unauthorized caller for an id that does not exist and
  // `permission_denied` for one that does - an oracle for enumerating valid
  // proposal ids. advanceStage() avoids this by the same ordering.
  //
  // The autopilot gate cannot come first: whether a call is autonomous depends
  // on the row's own status. So the decide gate is checked up front, and the
  // autopilot check - which is strictly stronger, needing three independent
  // yeses - is applied after the status is known. A caller who fails the decide
  // gate never reaches the load either way.
  const gate = can(ctx.holder, ctx.entitlement, "copilot.action.decide", "data");
  if (!gate.allowed) return denied(gate);

  const action = await ctx.store.getProposal(ctx.workspaceId, id);
  if (!action) return fail(violation("not_found", `proposal ${id} was not found`, "id"));

  // WHETHER THIS MAY RUN UNASKED IS READ, NOT PASSED. `opts.autopilot` and
  // `opts.workspaceOptIn` were both caller-supplied booleans - a caller that
  // can declare it has authority does not have authority, it has a parameter.
  // The posture now comes from the workspace's own row, and the fourth
  // question - is THIS proposal one a person should see - comes from the rule.
  const autonomous = action.status === "proposed";
  if (autonomous) {
    const stored = await ctx.store.getAutonomy(ctx.workspaceId);
    // No row means nobody authorised anything, which is ask_always: the same
    // default getAutonomy reports, decided in one place.
    const mode = stored?.mode ?? "ask_always";

    // FOUR YESES, and they are asked in this order on purpose. The first three
    // are about the workspace and the member - did you buy it, may you, did you
    // switch it on - and `autopilotAuthorized` has always required all three.
    // The fourth is about THIS proposal, and it is asked last because a
    // workspace with every authority still does not get to skip a decision the
    // rule says belongs to a person.
    // THE RULE IS ASKED FIRST, and the order is about the ANSWER rather than
    // about strictness - both still have to pass. Asked the other way round, a
    // workspace that has simply never switched autonomy on is refused by the
    // three-yes gate and told `permission_denied`, which says the MEMBER lacks
    // something. The member lacks nothing; the workspace has not authorised
    // anything. Measured: that is exactly what the first version returned.
    const verdict = decideAutonomy(action, mode);
    if (verdict.kind === "ask") {
      return fail(
        violation(
          "human_decision_required",
          `this proposal needs a person (${verdict.reasons.join(", ") || mode}); autonomy is ${mode}`,
          "status",
        ),
      );
    }

    // Then the three that were always required. A posture that permits
    // autonomy does not grant it: the workspace still has to have bought it
    // and the member still has to hold `copilot.autopilot`.
    const auth = autopilotAuthorized({
      entitlement: ctx.entitlement,
      held: ctx.holder.permissions,
      workspaceOptIn: true,
    });
    if (!auth.allowed) return denied(auth);
  }

  // The row's own eligibility is settled BEFORE anything happens to a deal.
  // planExecution refuses an expired row and an accepted one with no decider,
  // and neither of those may move an opportunity first and be refused after.
  const plan = planExecution(action, { autopilot: autonomous });
  if (!plan.ok) return plan as RuleResult<{ id: string; autonomous: boolean }>;

  // THE BUSINESS ACTION ACTUALLY HAPPENS, and it happens here.
  //
  // The owner's ruling, 2026-09-01: "采纳当然要真实发生业务动作，不能是假的".
  // Until now this function moved the row to `executed` and nothing else
  // occurred - a person signed for a stage change that never took place, and
  // the record said it had. Worth noting that the old tests could not have
  // caught it: they asserted the claim, not the effect.
  //
  // ON THE ACCEPTER'S OWN PERMISSIONS - the same ruling's first half, "人签了
  // 字，就用他的权限". `ctx` is passed straight through, so advanceStage runs
  // its own `pipeline.opportunity.advance` gate against the member who signed.
  // A member holding copilot.decide and only pipeline.read (delivery_manager
  // is the live case) is refused, with their name on the refusal; the copilot
  // never lends anyone authority they do not have. Under autonomy there is no
  // signer, and the context is the member whose turn produced the proposal -
  // the agent is never more permitted than the person it acts for.
  //
  // ORDER: DO, THEN RECORD. The reverse is unrepresentable - once the row says
  // `executed`, planFailure refuses it, so a write that claimed success first
  // could never walk the claim back. The cost is a window between the two: two
  // concurrent callers can both reach advanceStage. The stage machine closes
  // it, refusing the second with `stage_unchanged` (from = to is a database
  // CHECK), so a race ends as one move plus one honest `failed` row rather
  // than as two moves.
  const done = await carryOut(ctx, action);
  if (!done.ok) {
    // A FAILED ATTEMPT IS RECORDED, not swallowed. `failed` is terminal on
    // purpose - a retry is a new proposal - so the fact that the copilot was
    // told to do something and could not survives, instead of the row sitting
    // at `accepted` looking like it is still waiting for someone.
    const failure = planFailure(action);
    if (failure.ok) {
      await ctx.store.applyDecision(ctx.workspaceId, [
        {
          id,
          patch: failure.value,
          from: [autonomous ? ("proposed" as const) : ("accepted" as const)],
        },
      ]);
    }
    return done as RuleResult<{ id: string; autonomous: boolean }>;
  }

  // Autopilot moves straight from `proposed`; the normal path moves an
  // already-accepted row.
  const moved = await ctx.store.applyDecision(ctx.workspaceId, [
    { id, patch: plan.value, from: [autonomous ? ("proposed" as const) : ("accepted" as const)] },
  ]);
  if (moved.length === 0) return fail(violation("already_decided", `proposal ${id} moved first`, "id"));
  return ok({ id, autonomous });
}

/**
 * Record proposals the copilot produced. Always in `proposed` - this function
 * cannot create an already-accepted action, and neither can the store.
 */
export async function recordProposals(
  ctx: CopilotContext,
  proposals: readonly NewProposal[],
): Promise<RuleResult<AgentAction[]>> {
  const gate = can(ctx.holder, ctx.entitlement, "copilot.suggest", "data");
  if (!gate.allowed) return denied(gate);
  if (proposals.length === 0) return ok([]);
  return ok(await ctx.store.createProposals(ctx.workspaceId, proposals));
}

/**
 * Retire proposals nobody decided inside the decision window.
 *
 * The spec has always required this: an undecided proposal must not silently
 * disappear, it becomes `expired`, which is a VISIBLE outcome. `planExpiry` has
 * existed since batch 1 with the rule written out - and nothing called it, so
 * no proposal has ever expired. A recommendation made three months ago has been
 * sitting in the queue looking as live as one made this morning, which is the
 * failure the rule was written to prevent, arrived at from the other side.
 *
 * NOT INSIDE `listProposals`, though that would fix every reader at once. That
 * verb is called by the shell's board, which renders on every page - a sweep
 * there is a write on every navigation. It also takes a filter, so the scope of
 * the sweep would silently become whatever the caller happened to ask for.
 *
 * SO IT RUNS FROM THE QUEUE'S OWN PAGE, and the limit is worth stating rather
 * than hiding: between a proposal ageing out and somebody opening /copilot, the
 * board still counts it as pending. That direction is the safe one - it
 * over-reports work waiting on a person rather than hiding it, and
 * over-reporting is what makes somebody go and look, which is exactly what an
 * expiring proposal wants. A scheduled sweep would close the window, and this
 * repo has no scheduler for application code; building the design that needs
 * one would be another rule written and not applied.
 *
 * GATED ON `copilot.action.view`, the gate for READING the queue, not on
 * `copilot.action.decide`. Expiring is not a decision - `decidedBySub` stays
 * null and that null is the whole point of the state. It records a fact about
 * the clock that is already true. Gating it behind `decide` would make what a
 * viewer sees depend on whether somebody who can decide had visited recently.
 */
export async function expireStaleProposals(
  ctx: CopilotContext,
  opts: { now?: Date; ttlMs?: number } = {},
): Promise<RuleResult<{ expired: string[] }>> {
  const gate = can(ctx.holder, ctx.entitlement, "copilot.action.view", "data");
  if (!gate.allowed) return denied(gate);

  const pending = await ctx.store.listProposals(ctx.workspaceId, { status: "proposed" });

  // planExpiry is pure and refuses anything still inside its window, so the
  // filter IS the rule rather than a second copy of the TTL arithmetic.
  const due: { id: string; patch: ActionPatch; from: readonly ActionStatus[] }[] = [];
  for (const action of pending) {
    const plan = planExpiry(action, opts);
    if (plan.ok) due.push({ id: action.id, patch: plan.value, from: ["proposed"] });
  }
  if (due.length === 0) return ok({ expired: [] });

  // applyDecision is a compare-and-set on `from`, so a proposal somebody
  // accepted between the read and this write is left alone rather than expired
  // out from under them. Two concurrent sweeps also cannot double-expire.
  return ok({ expired: await ctx.store.applyDecision(ctx.workspaceId, due) });
}

// --- The workspace's posture toward its copilot ------------------------------

/**
 * What the copilot may do unasked, and who said so.
 *
 * READING IT NEEDS ONLY `copilot.action.view`, the gate for seeing the queue.
 * "How much is this agent allowed to do without me" is a question anybody
 * watching it is entitled to an answer to - a member who can see proposals but
 * not the posture behind them cannot tell a queue that is short because the
 * agent is quiet from one that is short because it stopped asking.
 *
 * NO ROW MEANS ask_always. The port returns null - nobody has set it - and the
 * safe reading of "nobody authorised anything" is that everything still waits
 * for a person. Supplying that here rather than defaulting the column means
 * `decidedBySub` stays null and the surface can say "nobody has set this"
 * instead of attributing today's posture to someone who never chose it.
 */
export async function getAutonomy(
  ctx: CopilotContext,
): Promise<RuleResult<{ mode: AutonomyMode; decidedBySub: string | null; set: boolean }>> {
  const gate = can(ctx.holder, ctx.entitlement, "copilot.action.view", "data");
  if (!gate.allowed) return denied(gate);

  const row = await ctx.store.getAutonomy(ctx.workspaceId);
  return ok(
    row
      ? { mode: row.mode, decidedBySub: row.decidedBySub, set: true }
      : { mode: "ask_always", decidedBySub: null, set: false },
  );
}

/**
 * Change it, and sign the change.
 *
 * `copilot.autopilot.enable` rather than `copilot.action.decide`, and the two
 * are different acts: deciding one proposal is a judgement about that
 * proposal, while deciding that proposals no longer need deciding is a
 * standing authorisation. The catalogue already separates them - only
 * sales_leader holds `copilot.autopilot` - and this is the first thing to use
 * that separation.
 *
 * The mode is validated rather than trusted. The DDL has a CHECK, but a value
 * that reached the store would fail at the driver as a constraint name, far
 * from the caller who sent it.
 */
export async function setAutonomy(
  ctx: CopilotContext,
  mode: string,
  opts: { at?: Date } = {},
): Promise<RuleResult<{ mode: AutonomyMode }>> {
  const gate = can(ctx.holder, ctx.entitlement, "copilot.autopilot.enable", "data");
  if (!gate.allowed) return denied(gate);

  if (!isAutonomyMode(mode)) {
    return fail(violation("unknown_autonomy_mode", `${mode} is not an autonomy mode`, "mode"));
  }

  const row = await ctx.store.setAutonomy(ctx.workspaceId, {
    mode,
    // WHOSE NAME GOES ON IT is the caller's, never a parameter. A signature a
    // caller could supply is not a signature.
    decidedBySub: ctx.sub,
    at: opts.at,
  });
  return ok({ mode: row.mode });
}
