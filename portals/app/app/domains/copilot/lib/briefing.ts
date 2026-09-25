import { createHash } from "node:crypto";

// 参谋生成缓存的键 (incr/0083, YC-042 §04).
//
// A RUN IS NAMED BY WHAT IT WAS ASKED. The fingerprint covers the capability,
// the subject and the input itself, serialised canonically - object keys
// sorted - so the same question asked twice, by a retry, a double click or a
// concurrent save, is one fingerprint: one cache row, one run id, one usage
// event. A random run id would turn every re-trigger into a new charge nobody
// could trace (the reason yucer.copilot.turns moved to object keys, 2026-09-15).

export const BRIEFING_SUBJECTS = ["opportunity", "forecast_scope", "account"] as const;
export type BriefingSubject = (typeof BRIEFING_SUBJECTS)[number];

export const BRIEFING_KINDS = [
  "situation",
  "risk_explain",
  "meeting_pack",
  "review_draft",
  "forecast_brief",
  "consistency_check",
  // incr/0086 - 证据抽取: one new follow-up against the deal's slots.
  "evidence_extract",
  // incr/0089 - 推进计划生成: the deal's unmet criteria and open promises.
  "plan_draft",
] as const;
export type BriefingKind = (typeof BRIEFING_KINDS)[number];

export interface BriefingKey {
  readonly subjectType: BriefingSubject;
  readonly subjectId: string;
  readonly kind: BriefingKind;
  readonly inputHash: string;
}

export interface BriefingRecord extends BriefingKey {
  readonly id: string;
  readonly capability: string;
  /** What came back - paragraphs with citations, or a result summary. */
  readonly content: unknown;
  readonly model: string;
  readonly generatedAt: Date;
}

/** JSON with object keys sorted at every depth; arrays keep their order. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

/** sha-256 hex of the canonical run description - the cache key and the run id's source. */
export function inputFingerprint(run: {
  readonly capability: string;
  readonly kind: BriefingKind;
  readonly subjectType: BriefingSubject;
  readonly subjectId: string;
  readonly input: unknown;
}): string {
  return createHash("sha256").update(canonicalJson(run)).digest("hex");
}

/**
 * The run id: the fingerprint, shaped as a UUID so it reads like every other
 * id the platform sees in businessId and the idempotency key. Deterministic -
 * see the file header.
 */
export function runIdOf(fingerprint: string): string {
  const h = fingerprint.slice(0, 32);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}
