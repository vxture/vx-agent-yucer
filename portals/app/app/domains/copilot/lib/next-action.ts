import { PLAN_STEP_ACTION_TYPE } from "./action";
import { verifyPlanStep } from "./plan-draft";

// 下一步最佳动作 (deal batch 8c, YC-066 S6): ONE action for us, with who, by
// when, why and how sure - "理由指向某条未满足条件或卡点" (YC-070).
//
// It is a plan step with one more discipline, so it rides the plan step's
// action type: accepted, it is our commitment, through the executor that
// already turns a plan step into one. What makes it the NEXT action:
//
//   - exactly one survives;
//   - it is ours (we_owe) - the buyer's move is not ours to schedule;
//   - it is due within NEXT_ACTION_DAYS, not somewhere in the half year a plan
//     may span;
//   - its reason names one goal: a criterion this stage has not met (or, when
//     every one is met, the next stage's), or the stall point when the rule
//     calls the deal stalled.
//
// The capability key is its own (deal.next_action), so the deck can tell it
// from 推进计划's steps and its accuracy is countable on its own.

export const NEXT_ACTION_CAPABILITY = "deal.next_action";
export const NEXT_ACTION_MARK = "[next-action]";
/** The follow-ups it reads, newest first. */
export const NEXT_ACTION_NOTE_WINDOW = 10;
export const NEXT_ACTION_DAYS = 14;
const DAY = 86_400_000;

export interface NextActionInput {
  readonly dealName: string;
  readonly opportunityId: string;
  readonly stage: string;
  /** Unmet criteria of this stage (else the next stage's), then the stall point - by the exact words shown. */
  readonly goals: readonly string[];
  readonly openCommitments: readonly { readonly direction: string; readonly statement: string; readonly dueAt: string }[];
  readonly notes: readonly { readonly date: string; readonly text: string }[];
  readonly today: string;
}

/** The instruction for one run. English, like every prompt in this repo. */
export function nextActionQuestion(input: NextActionInput): string {
  return [
    `${NEXT_ACTION_MARK} Choose the ONE next action for our side on the deal "${input.dealName}", now in stage "${input.stage}".`,
    `Today is ${input.today}. It must move exactly one of these goals:`,
    ...input.goals.map((g) => `  - ${g}`),
    `Promises already open (do not repeat them):`,
    ...(input.openCommitments.length > 0
      ? input.openCommitments.map((c) => `  - ${c.direction} by ${c.dueAt}: ${c.statement}`)
      : ["  (none)"]),
    `Recent follow-up notes, newest first:`,
    ...(input.notes.length > 0 ? input.notes.map((n) => `  ${n.date}: ${n.text}`) : ["  (none)"]),
    ``,
    `Propose exactly one action with \`propose_action\`, action_type "${PLAN_STEP_ACTION_TYPE}",`,
    `subject_type "opportunity", subject_id "${input.opportunityId}", payload:`,
    `  { "direction": "we_owe", "statement": "<who on our side does what with whom, in the deal's language>",`,
    `    "dueAt": "<YYYY-MM-DD, between today and ${NEXT_ACTION_DAYS} days from now>",`,
    `    "forCriterion": "<exactly one goal from the list above, copied verbatim>" }`,
    `The rationale says in one sentence why this action, now, moves that goal. Give your confidence.`,
  ].join("\n");
}

/** Is this the next action the rule admits? `taken` counts actions already admitted in this run. */
export function verifyNextAction(
  payload: unknown,
  goals: readonly string[],
  today: Date,
  openStatements: readonly string[],
  taken: number,
): boolean {
  if (taken >= 1) return false;
  if (!verifyPlanStep(payload, goals, today, openStatements, 0)) return false;
  const p = payload as { direction: string; dueAt: string };
  if (p.direction !== "we_owe") return false;
  const start = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Date.parse(`${p.dueAt}T00:00:00Z`) <= start + NEXT_ACTION_DAYS * DAY;
}
