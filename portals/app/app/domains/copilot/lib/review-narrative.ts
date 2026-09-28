import { admitSentences, allowFigures } from "./figures";
import type { ReviewDraft } from "../../pipeline/lib/review-draft";

// 复盘底稿 - the 参谋's half (YC-066 S7, deal batch 12b): a short narrative of
// the whole deal written over the rule's four sections, and a SUGGESTED
// reason code. "原因码不预选": the suggestion is shown as a button the
// reviewer may press; it is never filled into the form for them.
//
// ADMITTED BY THE RULE: sentences carrying a figure the draft does not hold are
// dropped; a suggested reason that is not one of the reasons fitting this
// outcome is no suggestion at all.

export const REVIEW_CAPABILITY = "deal.review";
export const REVIEW_MARK = "[review-draft]";
const MAX_SENTENCES = 4;

export interface ReviewNarrativeInput {
  readonly dealName: string;
  readonly outcome: string;
  readonly draft: ReviewDraft;
  /** The reasons that can explain THIS outcome, by id. */
  readonly reasons: readonly { readonly id: string; readonly name: string }[];
}

export interface ReviewNarrative {
  readonly narrative: readonly string[];
  readonly reasonId: string | null;
  readonly dropped: number;
}

export function reviewQuestion(input: ReviewNarrativeInput): string {
  const d = input.draft;
  return [
    `${REVIEW_MARK} Write the review of the deal "${input.dealName}", closed as ${input.outcome}. Every fact below is the record's; use no other figure.`,
    `Where it slipped: ${d.slip.firstAt ? `from ${d.slip.firstAt}${d.slip.stageThen ? ` in ${d.slip.stageThen}` : ""}` : "no change for the worse"}.`,
    ...d.slip.events.map((e) => `  ${e.at} ${e.field}: ${e.from ?? "-"} -> ${e.to ?? "-"}`),
    `Promises not kept: ${d.promises.length ? "" : "none"}`,
    ...d.promises.map((p) => `  ${p.dueAt} ${p.direction}: ${p.statement} (${p.state})`),
    `Missing roles: ${d.coverage.missingRoles.join(", ") || "none"}; cold before the close: ${d.coverage.cold.map((c) => `${c.name} (${c.role}, ${c.lastDays ?? "never"})`).join(", ") || "none"}.`,
    `Discount signatures: ${d.concessions.rounds}; amount cuts: ${d.concessions.cuts.map((c) => `${c.from} -> ${c.to}`).join(", ") || "none"}.`,
    ...d.concessions.signatures.map((s) => `  ${s.at} ${s.product}: ${s.belowFloor} below the floor`),
    `Reasons that can explain this outcome (id: name):`,
    ...input.reasons.map((r) => `  ${r.id}: ${r.name}`),
    ``,
    `Answer with ONE JSON object and nothing else:`,
    `{"narrative": "<at most ${MAX_SENTENCES} sentences: what happened and why, from the facts above>", "reason": "<one id from the list, or empty>"}`,
    `Write in Chinese.`,
  ].join("\n");
}

function draftFigures(d: ReviewDraft) {
  const nums = (s: string | null) => (s === null || Number.isNaN(Number(s)) ? null : Number(s));
  return allowFigures({
    amounts: [
      ...d.slip.events.flatMap((e) => (e.field === "amount" ? [nums(e.from), nums(e.to)] : [])),
      ...d.concessions.signatures.map((s) => s.belowFloor),
      ...d.concessions.cuts.flatMap((c) => [nums(c.from), nums(c.to)]),
    ],
    ratios: [],
  });
}

export function admitReviewNarrative(answer: string, input: ReviewNarrativeInput): ReviewNarrative | null {
  const start = answer.indexOf("{");
  const end = answer.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let raw: { narrative?: unknown; reason?: unknown };
  try {
    raw = JSON.parse(answer.slice(start, end + 1)) as typeof raw;
  } catch {
    return null;
  }
  const parts = admitSentences(typeof raw.narrative === "string" ? raw.narrative : "", draftFigures(input.draft));
  const narrative = parts.kept.slice(0, MAX_SENTENCES).map((s) => s.trim());
  let dropped = parts.dropped + Math.max(0, parts.kept.length - MAX_SENTENCES);
  const offered = typeof raw.reason === "string" ? raw.reason.trim() : "";
  const reasonId = input.reasons.some((r) => r.id === offered) ? offered : null;
  if (offered !== "" && reasonId === null) dropped += 1;
  if (narrative.length === 0 && reasonId === null) return null;
  return { narrative, reasonId, dropped };
}
