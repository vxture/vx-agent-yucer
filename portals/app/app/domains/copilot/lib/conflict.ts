// 说法核对 - the third time the agent must say "I don't know": two records
// disagree (agent capability B4, L2 batch 7b).
//
// Owner rulings, 2026-09-22:
//   - ON DEMAND. A person presses 核对说法; nothing scans on its own.
//   - STORED AS PROPOSALS. Each suspected conflict is a `flag_conflict`
//     agent_action in the queue that exists: accepting says "yes, these
//     disagree", rejecting says "no they don't". Nothing executes either way.
//   - THE LATEST 20 FOLLOW-UPS, SAME FACTS ONLY: a person's title or stance,
//     a budget figure, a date promised, who decides. Opinions and moods are
//     not facts and two different ones are not a conflict.
//
// QUOTE OR IT DID NOT HAPPEN. The model is told to quote both notes; this file
// is what makes that a rule rather than a request. A proposal whose quotes do
// not appear verbatim in the notes it names is dropped before it is written -
// a conflict nobody can find in the record is the model's invention, and
// filing it would be the exact fault this batch exists to stop.

export const CONFLICT_ACTION_TYPE = "flag_conflict";
/** ADR-015 capability group for these proposals. */
export const CONFLICT_CAPABILITY = "account.consistency";
export const CONSISTENCY_NOTE_WINDOW = 20;
/** Marks the copilot session a check runs in, so "last checked" can be read back. */
export const CONSISTENCY_SESSION_MARK = "[consistency-check]";

export interface ConflictSide {
  interactionId: string;
  quote: string;
}

export interface ConflictPayload {
  topic: string;
  a: ConflictSide;
  b: ConflictSide;
}

/** The instruction for one check. English, like every prompt in this repo. */
export function consistencyQuestion(accountName: string): string {
  return [
    `${CONSISTENCY_SESSION_MARK} Check the recorded follow-ups for "${accountName}" for places where`,
    `two notes state DIFFERENT VALUES FOR THE SAME FACT. Only these facts count:`,
    `a named person's title, role or stance; a budget or price figure; a date or deadline`,
    `someone committed to; who makes the decision. Differences of opinion, tone or mood`,
    `are NOT conflicts. A later note that updates an earlier one is still a conflict to`,
    `flag - a person decides which is current.`,
    ``,
    `For each conflict, propose it with \`propose_action\` using action_type "${CONFLICT_ACTION_TYPE}",`,
    `subject_type "account". The payload must be:`,
    `  { "topic": "<the fact, e.g. Liu Min's title>",`,
    `    "a": { "interactionId": "<note id>", "quote": "<exact words copied from that note>" },`,
    `    "b": { "interactionId": "<other note id>", "quote": "<exact words copied from that note>" } }`,
    `Quotes must be copied character for character from the note text; a proposal whose`,
    `quotes cannot be found in the notes will be discarded. The rationale says in one`,
    `sentence what the two notes disagree about. If nothing conflicts, propose nothing and`,
    `say so.`,
  ].join("\n");
}

/** Whitespace-insensitive containment: line breaks in a quote are not a mismatch. */
function contains(haystack: string, needle: string): boolean {
  const norm = (s: string) => s.replace(/\s+/g, " ").trim();
  const n = norm(needle);
  return n.length >= 2 && norm(haystack).includes(n);
}

/**
 * Is this a conflict the record actually shows? Two DIFFERENT notes from the
 * set that was checked, each quote found verbatim in its own note.
 */
export function verifyConflict(
  payload: unknown,
  notes: ReadonlyMap<string, string>,
): payload is ConflictPayload {
  const p = payload as Partial<ConflictPayload> | null;
  if (!p || typeof p.topic !== "string" || !p.topic.trim()) return false;
  const sides = [p.a, p.b];
  if (sides.some((s) => !s || typeof s.interactionId !== "string" || typeof s.quote !== "string")) return false;
  const [a, b] = sides as ConflictSide[];
  if (a.interactionId === b.interactionId) return false;
  const textA = notes.get(a.interactionId);
  const textB = notes.get(b.interactionId);
  return textA !== undefined && textB !== undefined && contains(textA, a.quote) && contains(textB, b.quote);
}

/** When this account was last checked, from the sessions a check runs in. */
export function lastConsistencyCheck(
  sessions: ReadonlyArray<{ subjectId: string | null; title: string | null; updatedAt: Date }>,
  accountId: string,
): Date | null {
  const runs = sessions.filter(
    (s) => s.subjectId === accountId && (s.title ?? "").startsWith(CONSISTENCY_SESSION_MARK),
  );
  return runs.length === 0 ? null : runs.reduce((a, b) => (b.updatedAt > a.updatedAt ? b : a), runs[0]).updatedAt;
}
