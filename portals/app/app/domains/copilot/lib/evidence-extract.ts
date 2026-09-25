import { EVIDENCE_SLOTS, EVIDENCE_MAX, type EvidenceSlot } from "../../pipeline/lib/evidence";
import { COMMITMENT_ACTION_TYPE, EVIDENCE_ACTION_TYPE, ROLE_ACTION_TYPE } from "./action";

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

/** A person on the customer's roster, as the extraction may name them (4c). */
export interface RosterPerson {
  readonly id: string;
  readonly name: string;
  readonly title: string | null;
  /** This deal's current role and stance for them; "unknown" / null when not stated or not readable. */
  readonly buyingRole: string;
  readonly stance: string | null;
}

/** Roles a proposal may set - the ones a person picks in the form (no "blocker": stance says that). */
export const PROPOSABLE_ROLES = ["economic", "user", "technical", "coach"] as const;
export const PROPOSABLE_STANCES = ["champion", "supporter", "neutral", "antagonist"] as const;

/** The instruction for one extraction. English, like every prompt in this repo. */
export function evidenceQuestion(input: {
  readonly dealName: string;
  readonly opportunityId: string;
  readonly note: { readonly id: string; readonly text: string; readonly occurredOn?: string };
  readonly current: Readonly<Partial<Record<EvidenceSlot, string>>>;
  readonly roster?: readonly RosterPerson[];
  readonly openCommitments?: readonly string[];
}): string {
  const slots = EVIDENCE_SLOTS.map((s) => `  - ${s}: ${SLOT_MEANING[s]}. Currently: ${input.current[s] ? `"${input.current[s]}"` : "(not written)"}`);
  const roster = (input.roster ?? []).map(
    (p) => `  - ${p.id}: ${p.name}${p.title ? ` (${p.title})` : ""} - role ${p.buyingRole}, stance ${p.stance ?? "not stated"}`,
  );
  const promises = (input.openCommitments ?? []).map((c) => `"${c}"`).join("; ") || "(none)";
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
    `never fill a slot from general knowledge.`,
    ``,
    `PEOPLE. The customer's people on record (id: name - this deal's role and stance):`,
    ...(roster.length > 0 ? roster : ["  (none on record)"]),
    `If the note shows one of THESE people's role on this purchase (${PROPOSABLE_ROLES.join(", ")}) or stance`,
    `toward us (${PROPOSABLE_STANCES.join(", ")}) differently from what is recorded, propose action_type`,
    `"${ROLE_ACTION_TYPE}" with payload { "personId": "<id from the list>", "buyingRole": "<the role - repeat the`,
    `current one if only the stance changes>", "stance": "<stance or null>", "quote": "<exact words>",`,
    `"interactionId": "${input.note.id}" }. Never propose people who are not on the list.`,
    ``,
    `PROMISES. Open promises already recorded: ${promises}.`,
    `If the note records a NEW concrete promise with a date - by them to us, or by us to them - propose`,
    `action_type "${COMMITMENT_ACTION_TYPE}" with payload { "direction": "they_owe" | "we_owe", "statement":`,
    `"<what was promised>", "dueAt": "<YYYY-MM-DD>", "quote": "<exact words>", "interactionId":`,
    `"${input.note.id}" }. The note was written on ${input.note.occurredOn ?? "an unknown date"}; resolve relative dates`,
    `("this Friday") against it. A promise with no date you can resolve is not proposed.`,
    ``,
    `If the note adds nothing, propose nothing.`,
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

/** Is this role/stance proposal about a person on the roster, supported by the note, and new? */
export function verifyRoleProposal(
  payload: unknown,
  note: { readonly id: string; readonly text: string },
  roster: readonly RosterPerson[],
  seen: ReadonlySet<string>,
): boolean {
  const p = payload as { personId?: unknown; buyingRole?: unknown; stance?: unknown; quote?: unknown; interactionId?: unknown } | null;
  if (!p || typeof p.personId !== "string" || typeof p.quote !== "string" || p.interactionId !== note.id) return false;
  const person = roster.find((r) => r.id === p.personId);
  if (!person || typeof p.buyingRole !== "string") return false;
  // A new role must be one a person could pick; keeping the recorded one is always fine.
  const roleOk = (PROPOSABLE_ROLES as readonly string[]).includes(p.buyingRole) || p.buyingRole === person.buyingRole;
  const stance = p.stance === undefined || p.stance === null || p.stance === "" ? null : p.stance;
  const stanceOk = stance === null || (typeof stance === "string" && (PROPOSABLE_STANCES as readonly string[]).includes(stance));
  if (!roleOk || !stanceOk) return false;
  const changes = p.buyingRole !== person.buyingRole || (stance !== null && stance !== person.stance);
  if (!changes || !contains(note.text, p.quote)) return false;
  return !seen.has(roleSeenKey(p.personId, p.quote));
}

/** Is this a new, dated promise the note supports? */
export function verifyCommitmentProposal(
  payload: unknown,
  note: { readonly id: string; readonly text: string },
  openCommitments: readonly string[],
  seen: ReadonlySet<string>,
): boolean {
  const p = payload as { direction?: unknown; statement?: unknown; dueAt?: unknown; quote?: unknown; interactionId?: unknown } | null;
  if (!p || (p.direction !== "they_owe" && p.direction !== "we_owe")) return false;
  if (typeof p.statement !== "string" || !p.statement.trim() || typeof p.quote !== "string" || p.interactionId !== note.id) return false;
  if (typeof p.dueAt !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(p.dueAt) || Number.isNaN(Date.parse(p.dueAt))) return false;
  if (!contains(note.text, p.quote)) return false;
  const norm = (x: string) => x.replace(/\s+/g, "");
  if (openCommitments.some((c) => norm(c) === norm(p.statement as string))) return false;
  return !seen.has(commitmentSeenKey(p.quote));
}

export function roleSeenKey(personId: string, quote: string): string {
  return `role|${personId}|${quote.replace(/\s+/g, " ").trim()}`;
}

export function commitmentSeenKey(quote: string): string {
  return `commit|${quote.replace(/\s+/g, " ").trim()}`;
}
