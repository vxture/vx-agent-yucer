import { admitSentences, allowFigures, figuresConsistent, type AllowedFigures } from "./figures";

// 预测会简报 (deal batch 9e, YC-066 预测 / YC-069 section 11 ③): what changed
// since the last snapshot, which commitments do not stand up, and what to ask
// each owner - "数字全部来自规则，模型只写叙述".
//
// The model gets the board's own figures (the same ones 预测检视台 shows, from
// forecast/board.ts) and writes the narrative. THE RULE ADMITS: a sentence or
// question with a figure the board does not show is dropped, and a question
// must be addressed to an owner on the board - about a deal on it, if it names
// one. Nothing here judges; the board already did.

export const FORECAST_BRIEF_CAPABILITY = "forecast.brief";
export const FORECAST_BRIEF_MARK = "[forecast-brief]";
const MAX_SUMMARY = 3;
const MAX_PER_OWNER = 2;
const MAX_QUESTIONS = 8;

export interface ForecastBriefInput {
  readonly period: string;
  readonly totals: { readonly commit: number; readonly bestCase: number; readonly pipeline: number; readonly closed: number };
  /** The latest manager's call in the period, if one was given. */
  readonly call: number | null;
  readonly change: {
    readonly since: string;
    readonly commit: { readonly total: number; readonly byKind: Readonly<Record<string, number>>; readonly unexplained: number };
    readonly bestCase: { readonly total: number; readonly byKind: Readonly<Record<string, number>>; readonly unexplained: number };
  } | null;
  readonly unverified: readonly {
    readonly category: string;
    readonly total: number;
    readonly unverified: number;
    readonly deals: readonly { readonly id: string; readonly name: string; readonly ownerSub: string | null; readonly amount: number; readonly lacks: readonly string[] }[];
  }[];
  readonly owners: readonly { readonly sub: string; readonly name: string; readonly commit: number; readonly bestCase: number }[];
}

export interface ForecastBrief {
  readonly summary: readonly string[];
  readonly questions: readonly { readonly ownerSub: string; readonly dealId: string | null; readonly text: string }[];
  readonly dropped: number;
}

export function forecastBriefQuestion(input: ForecastBriefInput): string {
  const kinds = (b: Readonly<Record<string, number>>) =>
    Object.entries(b)
      .filter(([, v]) => v !== 0)
      .map(([k, v]) => `${k} ${v}`)
      .join(", ") || "none";
  return [
    `${FORECAST_BRIEF_MARK} Brief the forecast meeting for ${input.period}. Every figure below is the rule's; repeat them exactly and never invent one.`,
    `Totals: commit ${input.totals.commit}, best case ${input.totals.bestCase}, pipeline ${input.totals.pipeline}, closed ${input.totals.closed}` +
      (input.call !== null ? `; the manager's latest call ${input.call}.` : "."),
    input.change
      ? `Since the snapshot of ${input.change.since}: commit ${input.change.commit.total} (${kinds(input.change.commit.byKind)}; unexplained ${input.change.commit.unexplained}); best case ${input.change.bestCase.total} (${kinds(input.change.bestCase.byKind)}; unexplained ${input.change.bestCase.unexplained}).`
      : `No earlier snapshot of this period and scope.`,
    `Unverified - deals the rule cannot stand behind, with what each lacks:`,
    ...input.unverified.flatMap((u) => [
      `  ${u.category}: ${u.unverified} of ${u.total}`,
      ...u.deals.map((d) => `    [${d.id}] ${d.name}, owner ${d.ownerSub ?? "none"}, ${d.amount}: ${d.lacks.join("; ")}`),
    ]),
    `Owners (sub, name, commit, best case):`,
    ...input.owners.map((o) => `  [${o.sub}] ${o.name}: ${o.commit}, ${o.bestCase}`),
    ``,
    `Answer with ONE JSON object and nothing else:`,
    `{"summary": "<at most ${MAX_SUMMARY} sentences: what moved, and which commitments do not stand up>",`,
    ` "questions": [{"owner": "<owner sub from the brackets>", "deal": "<deal id from the brackets, or empty>", "question": "<what to ask them>"}]}`,
    `At most ${MAX_PER_OWNER} questions per owner and ${MAX_QUESTIONS} in all. Write in Chinese.`,
  ].join("\n");
}

export function briefFigures(input: ForecastBriefInput): AllowedFigures {
  const amounts: (number | null)[] = [input.totals.commit, input.totals.bestCase, input.totals.pipeline, input.totals.closed, input.call];
  const ratios: (number | null)[] = [];
  if (input.change) {
    for (const c of [input.change.commit, input.change.bestCase]) {
      amounts.push(c.total, Math.abs(c.total), c.unexplained, Math.abs(c.unexplained));
      for (const v of Object.values(c.byKind)) amounts.push(v, Math.abs(v));
    }
  }
  for (const u of input.unverified) {
    amounts.push(u.total, u.unverified);
    ratios.push(u.total > 0 ? u.unverified / u.total : null);
    for (const d of u.deals) amounts.push(d.amount);
  }
  for (const o of input.owners) amounts.push(o.commit, o.bestCase);
  return allowFigures({ amounts, ratios });
}

/** The model's answer, admitted - or null when it is not the JSON asked for or nothing survives. */
export function admitForecastBrief(answer: string, input: ForecastBriefInput): ForecastBrief | null {
  const start = answer.indexOf("{");
  const end = answer.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let raw: { summary?: unknown; questions?: unknown };
  try {
    raw = JSON.parse(answer.slice(start, end + 1)) as typeof raw;
  } catch {
    return null;
  }
  const allowed = briefFigures(input);
  const summaryParts = admitSentences(typeof raw.summary === "string" ? raw.summary : "", allowed);
  let dropped = summaryParts.dropped + Math.max(0, summaryParts.kept.length - MAX_SUMMARY);
  const summary = summaryParts.kept.slice(0, MAX_SUMMARY).map((s) => s.trim());

  const owners = new Set(input.owners.map((o) => o.sub));
  const deals = new Set(input.unverified.flatMap((u) => u.deals.map((d) => d.id)));
  const perOwner = new Map<string, number>();
  const questions: { ownerSub: string; dealId: string | null; text: string }[] = [];
  for (const q of Array.isArray(raw.questions) ? raw.questions : []) {
    const o = q as { owner?: unknown; deal?: unknown; question?: unknown };
    const ownerSub = typeof o.owner === "string" ? o.owner : "";
    const dealId = typeof o.deal === "string" && o.deal.trim() !== "" ? o.deal.trim() : null;
    const text = typeof o.question === "string" ? o.question.trim() : "";
    const count = perOwner.get(ownerSub) ?? 0;
    if (
      text === "" ||
      !owners.has(ownerSub) ||
      (dealId !== null && !deals.has(dealId)) ||
      !figuresConsistent(text, allowed) ||
      count >= MAX_PER_OWNER ||
      questions.length >= MAX_QUESTIONS
    ) {
      dropped += 1;
      continue;
    }
    perOwner.set(ownerSub, count + 1);
    questions.push({ ownerSub, dealId, text });
  }
  if (summary.length === 0 && questions.length === 0) return null;
  return { summary, questions, dropped };
}
