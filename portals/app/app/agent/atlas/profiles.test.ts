import { test } from "node:test";
import assert from "node:assert/strict";
import { CALL_PROFILES, profileSettings } from "./profiles";

test("only judgement reasons by default", () => {
  const reasoning = CALL_PROFILES.filter((p) => profileSettings(p, {}).thinking === "on");
  assert.deepEqual(reasoning, ["judgement"]);
});

test("a reasoning profile's output budget leaves room for the reasoning", () => {
  // Reasoning tokens count against maxTokens; a small budget ends in
  // 422 OUTPUT_BUDGET_EXHAUSTED with no answer at all.
  assert.ok(profileSettings("judgement", {}).maxTokens >= 4000);
});

test("environment overrides apply, and nonsense falls back to the default", () => {
  const env = {
    ATLAS_PROFILE_DIALOGUE_THINKING: "on",
    ATLAS_PROFILE_DIALOGUE_MAX_TOKENS: "900",
    ATLAS_PROFILE_DIALOGUE_TIMEOUT_MS: "30000",
    ATLAS_PROFILE_DRAFTING_THINKING: "maybe",
    ATLAS_PROFILE_DRAFTING_MAX_TOKENS: "-3",
  };
  assert.deepEqual(profileSettings("dialogue", env), { task: "chat", thinking: "on", maxTokens: 900, timeoutMs: 30_000 });
  const drafting = profileSettings("drafting", env);
  assert.equal(drafting.thinking, "off");
  assert.equal(drafting.maxTokens, 2500);
});

test("timeoutMs stays inside Atlas's accepted range", () => {
  assert.equal(profileSettings("triage", { ATLAS_PROFILE_TRIAGE_TIMEOUT_MS: "999999999" }).timeoutMs, 600_000);
  assert.equal(profileSettings("triage", { ATLAS_PROFILE_TRIAGE_TIMEOUT_MS: "5" }).timeoutMs, 1_000);
});
