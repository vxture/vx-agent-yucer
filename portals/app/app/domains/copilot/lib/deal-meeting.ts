import { allowFigures, figuresConsistent } from "./figures";
import type { DealMeetingPack } from "../../pipeline/lib/deal-meeting-pack";

// 商机会前包 - the 参谋's half (YC-066 S6, deal batch 11a): agenda, a talk
// track per attendee, likely objections, questions to ask - written over the
// rule half (buildDealMeetingPack) and the deal's recent follow-ups.
//
// ADMITTED BY THE RULE: a talk track is kept only for an attendee who was
// actually chosen; any line carrying a figure that is not the deal's own is
// dropped (lib/figures.ts); each part is capped.

export const MEETING_CAPABILITY = "deal.meeting";
export const MEETING_MARK = "[meeting-pack]";
const CAPS = { agenda: 5, objections: 4, questions: 5 } as const;

export interface DealMeetingInput {
  readonly dealName: string;
  readonly stage: string;
  readonly pack: DealMeetingPack;
  readonly notes: readonly { readonly id: string; readonly date: string; readonly text: string }[];
  readonly rivals: readonly string[];
  /** The deal's own amounts - the only figures the advice may repeat. */
  readonly amounts: readonly (number | null)[];
}

export interface DealMeetingAdvice {
  readonly agenda: readonly string[];
  readonly tracks: readonly { readonly contactId: string; readonly text: string }[];
  readonly objections: readonly string[];
  readonly questions: readonly string[];
  readonly dropped: number;
}

export function meetingQuestion(input: DealMeetingInput): string {
  const p = input.pack;
  return [
    `${MEETING_MARK} Prepare the next meeting on the deal "${input.dealName}" (stage "${input.stage}").`,
    p.goal ? `The meeting's goal: get "${p.goal.criterion}" (${p.goal.from === "current" ? "this stage's" : "the next stage's"} exit criterion).` : `No exit criterion is defined for this stage.`,
    `Attendees (id, name, title, role on this deal, stance, days since last contact):`,
    ...p.attendees.map((a) => `  [${a.contactId}] ${a.name}, ${a.title ?? "-"}, ${a.role ?? "no role"}, ${a.stance ?? "stance unknown"}, ${a.lastDays ?? "never"}`),
    `Open promises (direction, due, statement):`,
    ...(p.promises.length ? p.promises.map((c) => `  ${c.direction} ${c.dueAt}: ${c.statement}`) : ["  none"]),
    `Rivals on record: ${input.rivals.length ? input.rivals.join(", ") : "none"}.`,
    `Recent follow-up notes, newest first:`,
    ...input.notes.map((n) => `  [${n.id}] ${n.date}: ${n.text}`),
    ``,
    `Answer with ONE JSON object and nothing else:`,
    `{"agenda": ["<item>", ...], "tracks": [{"contact": "<attendee id>", "text": "<what to say to them>"}],`,
    ` "objections": ["<likely objection and how to answer it>", ...], "questions": ["<what to ask>", ...]}`,
    `At most ${CAPS.agenda} agenda items, one track per attendee, ${CAPS.objections} objections, ${CAPS.questions} questions.`,
    `Use no figure that is not in the notes or the deal; never invent prices or dates. Write in the language of the notes.`,
  ].join("\n");
}

export function admitMeetingAdvice(answer: string, input: DealMeetingInput): DealMeetingAdvice | null {
  const start = answer.indexOf("{");
  const end = answer.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let raw: { agenda?: unknown; tracks?: unknown; objections?: unknown; questions?: unknown };
  try {
    raw = JSON.parse(answer.slice(start, end + 1)) as typeof raw;
  } catch {
    return null;
  }
  const allowed = allowFigures({ amounts: input.amounts, ratios: [] });
  let dropped = 0;
  const lines = (v: unknown, cap: number) => {
    const out: string[] = [];
    for (const s of Array.isArray(v) ? v : []) {
      const text = typeof s === "string" ? s.trim() : "";
      if (text === "") continue;
      if (out.length >= cap || !figuresConsistent(text, allowed)) {
        dropped += 1;
        continue;
      }
      out.push(text);
    }
    return out;
  };
  const agenda = lines(raw.agenda, CAPS.agenda);
  const objections = lines(raw.objections, CAPS.objections);
  const questions = lines(raw.questions, CAPS.questions);
  const chosen = new Set(input.pack.attendees.map((a) => a.contactId));
  const tracks: { contactId: string; text: string }[] = [];
  for (const t of Array.isArray(raw.tracks) ? raw.tracks : []) {
    const o = t as { contact?: unknown; text?: unknown };
    const contactId = typeof o.contact === "string" ? o.contact : "";
    const text = typeof o.text === "string" ? o.text.trim() : "";
    if (text === "" || !chosen.has(contactId) || tracks.some((x) => x.contactId === contactId) || !figuresConsistent(text, allowed)) {
      dropped += 1;
      continue;
    }
    tracks.push({ contactId, text });
  }
  if (agenda.length + tracks.length + objections.length + questions.length === 0) return null;
  return { agenda, tracks, objections, questions, dropped };
}
