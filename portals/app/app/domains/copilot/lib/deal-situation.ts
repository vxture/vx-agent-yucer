import { admitSentences, allowFigures, figuresConsistent, type AllowedFigures } from "./figures";

// 局势简报 · 风险解读 · 卡点诊断 (deal batch 8b, YC-066 S3/S5) - the 参谋's
// half of 本单参谋, one run over one deal.
//
// THE RULE HAS ALREADY JUDGED. Every dimension's score and every indicator's
// level come from 商机评估 (lib/deal-score.ts), and who a stalled deal is
// stuck on comes from stallHolder (pipeline/lib/brief.ts). The model writes
// three things over them and none of them moves a level (YC-070: "展开前后档位
// 不变"):
//
//   summary  three sentences: where this deal stands now;
//   risks    for each dimension that is not full, why it is where it is and
//            what would change it;
//   stall    only when the rule says the deal is stalled: WHY it is stuck,
//            beside the rule's who, with the buyer's own words.
//
// THE RULE ADMITS. A figure the rule did not produce drops its sentence; a
// citation to a note that was not given drops what carries it; a quote must
// be in its note verbatim; a dimension the rule calls full gets no
// explanation. Nothing surviving is no situation.

export const SITUATION_CAPABILITY = "deal.brief";
export const SITUATION_MARK = "[deal-brief]";
/** The follow-ups the brief reads, newest first. */
export const SITUATION_NOTE_WINDOW = 20;
const MAX_SUMMARY = 3;

export interface SituationInput {
  readonly dealName: string;
  readonly stage: string;
  readonly currency: string;
  readonly amount: number | null;
  readonly budget: number | null;
  readonly expectedCloseAt: string | null;
  /** 商机评估分, 0-100. */
  readonly score: number;
  readonly dimensions: readonly {
    readonly key: string;
    readonly label: string;
    /** 0-100, null = nothing known. */
    readonly score: number | null;
    readonly indicators: readonly { readonly label: string; readonly verdict: string; readonly gap: string | null }[];
  }[];
  /** Present only when the rule calls the deal stalled. */
  readonly stall: { readonly days: number; readonly line: number; readonly holder: string } | null;
  readonly promises: readonly { readonly direction: string; readonly statement: string; readonly dueAt: string }[];
  readonly notes: readonly { readonly id: string; readonly date: string; readonly text: string }[];
}

export interface Situation {
  readonly summary: readonly { readonly text: string; readonly noteIds: readonly string[] }[];
  readonly risks: readonly {
    readonly dimension: string;
    readonly why: string;
    readonly change: string;
    readonly noteIds: readonly string[];
  }[];
  readonly stall: { readonly why: string; readonly quote: { readonly noteId: string; readonly text: string } | null } | null;
  /** Sentences, explanations, citations and quotes the rule refused. */
  readonly dropped: number;
}

/** A dimension the rule did not call full - the only ones explained. */
const explainable = (d: SituationInput["dimensions"][number]) => d.score === null || d.score < 100;

/** The instruction for one run. English, like every prompt in this repo. */
export function situationQuestion(input: SituationInput): string {
  const money = (n: number | null) => (n === null ? "unknown" : `${n}`);
  return [
    `${SITUATION_MARK} Brief the deal "${input.dealName}" (stage ${input.stage}, currency ${input.currency}).`,
    `Amount ${money(input.amount)}; customer budget ${money(input.budget)}; expected close ${input.expectedCloseAt ?? "unknown"}.`,
    `The rule's assessment - every level below is final; explain it, never change it. Overall ${input.score}/100.`,
    ...input.dimensions.flatMap((d) => [
      `  [${d.key}] ${d.label}: ${d.score === null ? "unknown" : `${d.score}/100`}`,
      ...d.indicators.map((i) => `      ${i.label}: ${i.verdict}${i.gap ? ` - ${i.gap}` : ""}`),
    ]),
    input.stall
      ? `STALLED: ${input.stall.days} days at this stage, past the ${input.stall.line}-day line. The rule says: ${input.stall.holder}`
      : `Not stalled.`,
    `Open promises:`,
    ...(input.promises.length === 0 ? [`  none`] : input.promises.map((p) => `  ${p.direction}, due ${p.dueAt}: ${p.statement}`)),
    `Follow-up notes, newest first:`,
    ...(input.notes.length === 0 ? [`  none`] : input.notes.map((n) => `  [${n.id}] ${n.date}: ${n.text}`)),
    ``,
    `Answer with ONE JSON object and nothing else:`,
    `{"summary": [{"text": "<one sentence>", "notes": ["<note id>"]}],`,
    ` "risks": [{"dimension": "<dimension key from the brackets>", "why": "<why it is at this level>", "change": "<what would raise it>", "notes": ["<note id>"]}],`,
    input.stall
      ? ` "stall": {"why": "<why it is stuck, beyond who>", "noteId": "<note id>", "quote": "<the buyer's words, copied exactly>"}}`
      : ` "stall": null}`,
    `At most ${MAX_SUMMARY} summary sentences; one risk per dimension, only for dimensions below 100 or unknown.`,
    `Cite only note ids from the brackets; use only the figures above - never invent an amount, score or date.`,
    `Write in the language of the notes.`,
  ].join("\n");
}

export function situationFigures(input: SituationInput): AllowedFigures {
  const amounts: (number | null)[] = [input.amount, input.budget, input.score];
  for (const d of input.dimensions) amounts.push(d.score);
  if (input.stall) amounts.push(input.stall.days, input.stall.line);
  return allowFigures({ amounts, ratios: [] });
}

const idsOf = (v: unknown): string[] | null => {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) return null;
  return v.every((x) => typeof x === "string") ? (v as string[]) : null;
};

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** The model's answer, admitted - or null when it is not the JSON asked for, or nothing survives. */
export function admitSituation(answer: string, input: SituationInput): Situation | null {
  const start = answer.indexOf("{");
  const end = answer.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let raw: { summary?: unknown; risks?: unknown; stall?: unknown };
  try {
    raw = JSON.parse(answer.slice(start, end + 1)) as typeof raw;
  } catch {
    return null;
  }
  const allowed = situationFigures(input);
  const notes = new Map(input.notes.map((n) => [n.id, n.text]));
  const cited = (v: unknown) => {
    const ids = idsOf(v);
    return ids !== null && ids.every((id) => notes.has(id)) ? [...new Set(ids)] : null;
  };
  let dropped = 0;

  const summary: { text: string; noteIds: string[] }[] = [];
  for (const s of Array.isArray(raw.summary) ? raw.summary : []) {
    const o = (s ?? {}) as { text?: unknown; notes?: unknown };
    const body = text(o.text);
    const ids = cited(o.notes);
    if (body === "") continue;
    // One sentence per entry: a second one rides only if it too is clean.
    const parts = admitSentences(body, allowed);
    if (ids === null || parts.dropped > 0 || summary.length >= MAX_SUMMARY) {
      dropped += 1;
      continue;
    }
    summary.push({ text: parts.kept.join("").trim(), noteIds: ids });
  }

  const open = new Map(input.dimensions.filter(explainable).map((d) => [d.key, d]));
  const risks: { dimension: string; why: string; change: string; noteIds: string[] }[] = [];
  for (const r of Array.isArray(raw.risks) ? raw.risks : []) {
    const o = (r ?? {}) as { dimension?: unknown; why?: unknown; change?: unknown; notes?: unknown };
    const dimension = text(o.dimension);
    const why = text(o.why);
    const change = text(o.change);
    const ids = cited(o.notes);
    if (
      !open.has(dimension) ||
      risks.some((x) => x.dimension === dimension) ||
      why === "" ||
      ids === null ||
      !figuresConsistent(why, allowed) ||
      (change !== "" && !figuresConsistent(change, allowed))
    ) {
      dropped += 1;
      continue;
    }
    risks.push({ dimension, why, change, noteIds: ids });
  }
  // The rule's order, not the model's.
  const order = input.dimensions.map((d) => d.key);
  risks.sort((a, b) => order.indexOf(a.dimension) - order.indexOf(b.dimension));

  let stall: Situation["stall"] = null;
  if (raw.stall && typeof raw.stall === "object") {
    const o = raw.stall as { why?: unknown; noteId?: unknown; quote?: unknown };
    const why = text(o.why);
    if (!input.stall || why === "" || !figuresConsistent(why, allowed)) {
      // A diagnosis of a deal the rule does not call stalled is not shown.
      dropped += 1;
    } else {
      const noteId = text(o.noteId);
      const quote = text(o.quote);
      const source = notes.get(noteId);
      const verbatim = quote !== "" && source !== undefined && source.includes(quote);
      if (quote !== "" && !verbatim) dropped += 1;
      stall = { why, quote: verbatim ? { noteId, text: quote } : null };
    }
  }

  if (summary.length === 0 && risks.length === 0 && stall === null) return null;
  return { summary, risks, stall, dropped };
}
