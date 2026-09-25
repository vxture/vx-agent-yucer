import { PLAN_STEP_ACTION_TYPE } from "./action";

// 推进计划生成 (deal batch 5c, YC-066 §04): 3-6 dated steps toward what this
// stage has not yet got us. Each step names the exit criterion it serves; an
// accepted step becomes a commitment - the plan IS the two sides' promises
// (YC-069 §06: 承诺只在推进计划里).
//
// THE MODEL DRAFTS, THE RULE ADMITS, A PERSON DECIDES. A step is dropped when
// it serves no named goal, has no date or one outside the next half year, has
// no side, or repeats a promise already open. At most PLAN_MAX_STEPS survive.

export const PLAN_CAPABILITY = "deal.plan";
export const PLAN_SESSION_MARK = "[plan-draft]";
export const PLAN_MAX_STEPS = 6;
const HORIZON_DAYS = 180;

export interface PlanStepPayload {
  readonly direction: "we_owe" | "they_owe";
  readonly statement: string;
  readonly dueAt: string;
  /** The exit criterion this step serves - by its name, as the page shows it. */
  readonly forCriterion: string;
}

/** The instruction for one draft. English, like every prompt in this repo. */
export function planQuestion(input: {
  readonly dealName: string;
  readonly opportunityId: string;
  readonly stageName: string;
  /** Unmet criteria of the current stage, then the next stage's - by name. */
  readonly goals: readonly string[];
  readonly openCommitments: readonly { readonly direction: string; readonly statement: string; readonly dueAt: string }[];
  readonly today: string;
}): string {
  const promises = input.openCommitments.map((c) => `  - ${c.direction} by ${c.dueAt}: ${c.statement}`);
  return [
    `${PLAN_SESSION_MARK} Draft the next steps for the deal "${input.dealName}", now in stage "${input.stageName}".`,
    `Today is ${input.today}. The steps must move these goals (the stage's exit criteria not yet met, then`,
    `the next stage's):`,
    ...input.goals.map((g) => `  - ${g}`),
    `Promises already open (do not repeat them):`,
    ...(promises.length > 0 ? promises : ["  (none)"]),
    ``,
    `Propose 3 to ${PLAN_MAX_STEPS} concrete steps with \`propose_action\`, each action_type "${PLAN_STEP_ACTION_TYPE}",`,
    `subject_type "opportunity", subject_id "${input.opportunityId}", payload:`,
    `  { "direction": "we_owe" | "they_owe", "statement": "<who does what, in the deal's language>",`,
    `    "dueAt": "<YYYY-MM-DD, between today and ${HORIZON_DAYS} days from now>",`,
    `    "forCriterion": "<exactly one goal from the list above, copied verbatim>" }`,
    `The rationale says in one sentence how the step moves that goal. Steps in date order.`,
  ].join("\n");
}

const DAY = 86_400_000;

/** Is this a step the rule admits? `taken` counts the steps already admitted in this draft. */
export function verifyPlanStep(
  payload: unknown,
  goals: readonly string[],
  today: Date,
  openStatements: readonly string[],
  taken: number,
): payload is PlanStepPayload {
  if (taken >= PLAN_MAX_STEPS) return false;
  const p = payload as Partial<PlanStepPayload> | null;
  if (!p || (p.direction !== "we_owe" && p.direction !== "they_owe")) return false;
  if (typeof p.statement !== "string" || !p.statement.trim()) return false;
  if (typeof p.forCriterion !== "string" || !goals.includes(p.forCriterion)) return false;
  if (typeof p.dueAt !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(p.dueAt)) return false;
  const due = Date.parse(`${p.dueAt}T00:00:00Z`);
  const start = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  if (Number.isNaN(due) || due < start || due > start + HORIZON_DAYS * DAY) return false;
  const norm = (x: string) => x.replace(/\s+/g, "");
  return !openStatements.some((s) => norm(s) === norm(p.statement as string));
}
