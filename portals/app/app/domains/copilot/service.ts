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
import {
  planBatchDecision,
  planExecution,
  type AgentAction,
  type Decision,
} from "./lib/action";
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
  opts: { autopilot?: boolean; workspaceOptIn?: boolean } = {},
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

  const autonomous = Boolean(opts.autopilot) && action.status === "proposed";
  if (autonomous) {
    const auth = autopilotAuthorized({
      entitlement: ctx.entitlement,
      held: ctx.holder.permissions,
      workspaceOptIn: Boolean(opts.workspaceOptIn),
    });
    if (!auth.allowed) return denied(auth);
  }

  const plan = planExecution(action, { autopilot: autonomous });
  if (!plan.ok) return plan as RuleResult<{ id: string; autonomous: boolean }>;

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
