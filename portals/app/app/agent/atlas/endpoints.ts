// Model routing: yucer's copilot tasks -> Atlas endpoint codes.
//
// The product names TASKS; the operator decides which model serves each. That
// split is the entire point of routing by endpointCode instead of modelCode: an
// operator can move `yucer/propose` onto a better model, and this repo does not
// change. Pinning a modelCode here would also forfeit the endpoint's fallback
// chain, because on Atlas the fallback belongs to the endpoint - a model's own
// fallbackModelCodes stop applying the moment you route by endpoint.
//
// Every code is overridable by environment so a beta stack can point a task at
// a cheaper model without a deploy of this app.

/** Env reader shape. Matches lib/status.ts rather than NodeJS.ProcessEnv:
 * once next-env.d.ts is generated ProcessEnv requires NODE_ENV, so a caller
 * passing a small literal for a test would stop type-checking. These readers
 * only ever look up named keys. */
type EnvLike = Record<string, string | undefined>;

export type CopilotTask =
  /** Answering a member's question in a session. Highest volume, lowest stakes. */
  | "chat"
  /** Producing agent_action proposals against a domain object. A proposal is
   *  read by a human who then signs for it, so this task carries the reasoning
   *  load and is worth a stronger model. */
  | "propose"
  /** Scoring a signal for the detective domain. Runs in bulk over a feed, so
   *  cost per call dominates quality per call. */
  | "score"
  /** Condensing a win/loss review or an account history into grounding text. */
  | "summarize";

export const COPILOT_TASKS: readonly CopilotTask[] = ["chat", "propose", "score", "summarize"];

const DEFAULTS: Record<CopilotTask, string> = {
  chat: "chat/default",
  propose: "chat/reasoning",
  score: "chat/fast",
  summarize: "chat/default",
};

const ENV_KEYS: Record<CopilotTask, string> = {
  chat: "ATLAS_ENDPOINT_CHAT",
  propose: "ATLAS_ENDPOINT_PROPOSE",
  score: "ATLAS_ENDPOINT_SCORE",
  summarize: "ATLAS_ENDPOINT_SUMMARIZE",
};

export function endpointFor(task: CopilotTask, env: EnvLike = process.env): string {
  const override = env[ENV_KEYS[task]];
  return override && override.trim() ? override.trim() : DEFAULTS[task];
}

/** The full task -> endpoint resolution, for the status page and diagnostics. */
export function endpointMap(env: EnvLike = process.env): Record<CopilotTask, string> {
  return {
    chat: endpointFor("chat", env),
    propose: endpointFor("propose", env),
    score: endpointFor("score", env),
    summarize: endpointFor("summarize", env),
  };
}
