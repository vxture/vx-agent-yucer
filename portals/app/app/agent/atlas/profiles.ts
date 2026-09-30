// Call profiles: what yucer sends with EVERY model call, per kind of work.
//
// Atlas splits the decision in two (v0.7.8, "路由选哪一档模型，参数定这一次怎么
// 答"): the operator decides which model sits behind an endpoint, and the
// caller decides, per call, whether the model reasons, how much it may write
// and how long the call may take. endpoints.ts is the first half; this file is
// the second.
//
// Before this file no call sent `thinking`, so every call ran on the upstream
// default - which is ON for DeepSeek V4 and Doubao Seed. Atlas measured such a
// step at 4137 output tokens on average, 3232 of them reasoning, p95 94 s. A
// synchronous call only gets its response headers once generation ends, so
// anything past this client's 60 s deadline was aborted locally and reached the
// member as a generic failure.
//
// WHICH WORK REASONS is an owner decision (2026-09-30): 价格参谋, 下一步建议,
// 推进计划 and 说法核对 reason; everything else does not. Those four carry the
// `judgement` profile in CAPABILITY_SPEC; nothing else may, without a new
// ruling. Numbers are a starting point, tuned from Atlas's own latency and
// token logs once live - each is overridable by environment for that reason.

import type { CopilotTask } from "./endpoints";

type EnvLike = Record<string, string | undefined>;

export type ThinkingMode = "off" | "on";

export type CallProfile =
  /** A member is waiting for the answer. */
  | "dialogue"
  /** A conclusion a person signs for. Quality over speed and cost. */
  | "judgement"
  /** A templated JSON draft that rule functions then check. */
  | "drafting"
  /** Bulk scoring and classification. Cost per call dominates. */
  | "triage";

export const CALL_PROFILES: readonly CallProfile[] = ["dialogue", "judgement", "drafting", "triage"];

export interface ProfileSettings {
  /** The routing task - which endpointCode serves it (endpoints.ts). */
  readonly task: CopilotTask;
  readonly thinking: ThinkingMode;
  /**
   * Reasoning tokens count against this budget. Too small on a reasoning
   * profile and the model spends it all before writing a word: Atlas answers
   * 422 OUTPUT_BUDGET_EXHAUSTED with no body at all.
   */
  readonly maxTokens: number;
  /**
   * The WHOLE call's budget, primary model and fallbacks together. Atlas
   * cancels the upstream call when it runs out (no more generation, no more
   * spend) and answers 504 DEADLINE_EXCEEDED. Range 1000-600000.
   */
  readonly timeoutMs: number;
}

const DEFAULTS: Record<CallProfile, ProfileSettings> = {
  dialogue: { task: "chat", thinking: "off", maxTokens: 1500, timeoutMs: 45_000 },
  judgement: { task: "propose", thinking: "on", maxTokens: 6000, timeoutMs: 150_000 },
  drafting: { task: "summarize", thinking: "off", maxTokens: 2500, timeoutMs: 60_000 },
  triage: { task: "score", thinking: "off", maxTokens: 400, timeoutMs: 20_000 },
};

/** Atlas's accepted timeoutMs range (CHAT_TIMEOUT_INVALID outside it). */
export const ATLAS_TIMEOUT_MIN_MS = 1_000;
export const ATLAS_TIMEOUT_MAX_MS = 600_000;

/**
 * How much longer this client waits than the budget it hands Atlas. Atlas
 * should always be the one to stop: it cancels the upstream generation and
 * answers with a code. The local timer only covers a connection that died.
 */
export const LOCAL_DEADLINE_MARGIN_MS = 10_000;

function envKey(profile: CallProfile, field: string): string {
  return `ATLAS_PROFILE_${profile.toUpperCase()}_${field}`;
}

function positiveInt(raw: string | undefined): number | undefined {
  if (!raw || !raw.trim()) return undefined;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

function clampTimeout(ms: number): number {
  return Math.min(ATLAS_TIMEOUT_MAX_MS, Math.max(ATLAS_TIMEOUT_MIN_MS, ms));
}

/** One profile's settings, with any environment override applied. */
export function profileSettings(profile: CallProfile, env: EnvLike = process.env): ProfileSettings {
  const base = DEFAULTS[profile];
  const thinking = env[envKey(profile, "THINKING")]?.trim();
  return {
    task: base.task,
    thinking: thinking === "on" || thinking === "off" ? thinking : base.thinking,
    maxTokens: positiveInt(env[envKey(profile, "MAX_TOKENS")]) ?? base.maxTokens,
    timeoutMs: clampTimeout(positiveInt(env[envKey(profile, "TIMEOUT_MS")]) ?? base.timeoutMs),
  };
}
