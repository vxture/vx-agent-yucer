import { EVIDENCE_SLOTS, EVIDENCE_MAX, type EvidenceSlot } from "../../pipeline/lib/evidence";
import { EVIDENCE_ACTION_TYPE } from "./action";

// 证据抽取 (deal batch 4b, YC-066 §04): one new follow-up on a deal, read for
// what it says about the buying-evidence slots (incr/0085).
//
// THE MODEL READS, THE RULE CHECKS, A PERSON DECIDES (ADR-003). The model is
// told to quote; this file makes the quote a rule: a proposal whose quote is
// not in the note, that names a slot that does not exist, or that repeats
// what the slot already says - or what a person already rejected - is
// dropped before it is written. "原文里没有就不出提案" (YC-066 §06): nothing is
// filled in from industry common sense.

export const EVIDENCE_CAPABILITY = "deal.evidence";
/** Marks the copilot session an extraction runs in. */
export const EVIDENCE_SESSION_MARK = "[evidence-extract]";

export interface EvidencePayload {
  readonly slot: EvidenceSlot;
  readonly statement: string;
  readonly quote: string;
  readonly interactionId: string;
}

const SLOT_MEANING: Record<EvidenceSlot, string> = {
  pain: "the problem the customer wants solved (pain)",
  metrics: "the quantified value of solving it - money, time, percentages (metrics)",
  status_quo: 'signals of doing nothing - "wait", "budget frozen", "not now" (status_quo)',
  decision_process: "how the customer decides - who votes, who can veto, which meetings (decision_process)",
  paper_process: "how the customer signs - procurement, legal, contract steps (paper_process)",
};

/** The instruction for one extraction. English, like every prompt in this repo. */
export function evidenceQuestion(input: {
  readonly dealName: string;
  readonly opportunityId: string;
  readonly note: { readonly id: string; readonly text: string };
  readonly current: Readonly<Partial<Record<EvidenceSlot, string>>>;
}): string {
  const slots = EVIDENCE_SLOTS.map((s) => `  - ${s}: ${SLOT_MEANING[s]}. Currently: ${input.current[s] ? `"${input.current[s]}"` : "(not written)"}`);
  return [
    `${EVIDENCE_SESSION_MARK} A new follow-up was recorded on the deal "${input.dealName}".`,
    `Read ONLY this note and say what it tells us about the deal's buying evidence:`,
    ...slots,
    ``,
    `Note ${input.note.id}:`,
    `"""`,
    input.note.text,
    `"""`,
    ``,
    `For each slot the note says something NEW about, propose it with \`propose_action\` using`,
    `action_type "${EVIDENCE_ACTION_TYPE}", subject_type "opportunity", subject_id "${input.opportunityId}".`,
    `The payload must be:`,
    `  { "slot": "<one of ${EVIDENCE_SLOTS.join(", ")}>", "statement": "<the slot's new content, one or two`,
    `    sentences in the note's language>", "quote": "<exact words copied from the note>",`,
    `    "interactionId": "${input.note.id}" }`,
    `The quote must be copied character for character from the note; a proposal whose quote`,
    `cannot be found is discarded. Propose nothing for a slot the note says nothing about, and`,
    `never fill a slot from general knowledge. If the note adds nothing, propose nothing.`,
  ].join("\n");
}

/** Whitespace-insensitive containment: line breaks in a quote are not a mismatch. */
function contains(haystack: string, needle: string): boolean {
  const norm = (s: string) => s.replace(/\s+/g, " ").trim();
  const n = norm(needle);
  return n.length >= 2 && norm(haystack).includes(n);
}

/**
 * Is this a proposal the note actually supports, and new? The slot exists,
 * the statement is short enough to be written, the quote is in THIS note,
 * the statement differs from what the slot says, and no pending or rejected
 * proposal already made the same point from the same words.
 */
export function verifyEvidenceProposal(
  payload: unknown,
  note: { readonly id: string; readonly text: string },
  current: Readonly<Partial<Record<EvidenceSlot, string>>>,
  seen: ReadonlySet<string>,
): payload is EvidencePayload {
  const p = payload as Partial<EvidencePayload> | null;
  if (!p || typeof p.slot !== "string" || !(EVIDENCE_SLOTS as readonly string[]).includes(p.slot)) return false;
  if (typeof p.statement !== "string" || !p.statement.trim() || p.statement.trim().length > EVIDENCE_MAX) return false;
  if (typeof p.quote !== "string" || p.interactionId !== note.id) return false;
  if (!contains(note.text, p.quote)) return false;
  if ((current[p.slot as EvidenceSlot] ?? "").trim() === p.statement.trim()) return false;
  return !seen.has(evidenceSeenKey(p.slot, p.quote));
}

/** What makes two proposals the same point: the slot and the words they rest on. */
export function evidenceSeenKey(slot: string, quote: string): string {
  return `${slot}|${quote.replace(/\s+/g, " ").trim()}`;
}
