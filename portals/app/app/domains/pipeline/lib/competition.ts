import { fail, ok, violation, type RuleResult } from "../../shared/result";

// 竞争位置 (incr/0094, YC-065 R4, YC-067 section 09) - the pure half.
//
// Who the rivals are (a workspace vocabulary, so a name is normalised and a
// win rate can be counted), who is competing on a deal (versions, like 0085
// evidence), and the buyer's decision criteria line by line. Rival momentum and
// the historical win rate are computed here at read time, never stored.

export const COMPETITOR_NAME_MAX = 128;
export const CRITERION_MAX = 500;
export const FIT_NOTE_MAX = 255;
/** Below this many decided reviews against a rival, no win rate is given. */
export const WIN_RATE_MIN_SAMPLE = 5;

export const SHAPED_BY = ["us", "buyer", "rfp", "unknown"] as const;
export type ShapedBy = (typeof SHAPED_BY)[number];
export const FITS = ["met", "partial", "unmet"] as const;
export type Fit = (typeof FITS)[number];

export interface CompetitorRecord {
  readonly id: string;
  readonly name: string;
  readonly aliases: readonly string[];
  readonly sortOrder: number;
}

/** One version of "who is competing on this deal". competitorId null = only us. */
export interface CompetitorEntry {
  readonly id: string;
  readonly competitorId: string | null;
  readonly isIncumbent: boolean;
  readonly present: boolean;
  readonly interactionId: string | null;
  readonly authorSub: string;
  readonly source: "manual" | "model_accepted";
  readonly proposalId: string | null;
  readonly recordedAt: Date;
}

export interface CriterionRecord {
  readonly id: string;
  readonly statement: string;
  readonly shapedBy: ShapedBy;
  /** null = not assessed yet. */
  readonly fit: Fit | null;
  readonly fitNote: string | null;
  readonly sortOrder: number;
  readonly updatedBySub: string | null;
  readonly updatedAt: Date;
}

/** The deal's competitive field as of now, from every version. */
export interface CompetitiveField {
  /** Rivals still in the running - the latest version of each is present. */
  readonly rivals: readonly { readonly competitorId: string; readonly isIncumbent: boolean; readonly since: Date; readonly grounded: boolean }[];
  /** Rivals that dropped out (their latest version says so). */
  readonly out: readonly string[];
  /** Somebody confirmed "only us", and no rival has been recorded since. */
  readonly onlyUs: boolean;
  /** Nothing recorded at all - 未知, never read as "no competition". */
  readonly unknown: boolean;
}

export function competitiveField(entries: readonly CompetitorEntry[]): CompetitiveField {
  const byTime = [...entries].sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());
  const latest = new Map<string, CompetitorEntry>();
  let lastOnlyUs: Date | null = null;
  for (const e of byTime) {
    if (e.competitorId === null) lastOnlyUs = e.recordedAt;
    else latest.set(e.competitorId, e);
  }
  const rivals = [...latest.values()]
    .filter((e) => e.present)
    .map((e) => ({ competitorId: e.competitorId!, isIncumbent: e.isIncumbent, since: e.recordedAt, grounded: e.interactionId !== null }));
  const out = [...latest.values()].filter((e) => !e.present).map((e) => e.competitorId!);
  // "Only us" holds while no rival is present - recording one ends it.
  const onlyUs = lastOnlyUs !== null && rivals.length === 0;
  return { rivals, out, onlyUs, unknown: entries.length === 0 };
}

/**
 * Plan one new version of a rival's standing on a deal (or "only us" when
 * competitorId is null). The same standing as the latest version is not a new
 * version - saving twice must not look like two findings; returns null then.
 */
export function planCompetitorEntry(
  input: { readonly competitorId: string | null; readonly isIncumbent?: boolean; readonly present?: boolean; readonly interactionId?: string | null },
  entries: readonly CompetitorEntry[],
  known: readonly CompetitorRecord[],
): RuleResult<{ competitorId: string | null; isIncumbent: boolean; present: boolean; interactionId: string | null } | null> {
  const present = input.present ?? true;
  const isIncumbent = input.isIncumbent ?? false;
  if (input.competitorId !== null && !known.some((c) => c.id === input.competitorId)) {
    return fail(violation("competitor_not_found", "no such competitor in this workspace", "competitorId"));
  }
  if (input.competitorId === null && (isIncumbent || !present)) {
    return fail(violation("only_us_is_plain", "'only us' cannot be an incumbent or drop out", "competitorId"));
  }
  const field = competitiveField(entries);
  if (input.competitorId === null && field.rivals.length > 0) {
    return fail(violation("only_us_with_rivals", "rivals are still recorded as present - mark them out first", "competitorId"));
  }
  const latest = [...entries]
    .filter((e) => e.competitorId === input.competitorId)
    .sort((a, b) => b.recordedAt.getTime() - a.recordedAt.getTime())[0];
  const interactionId = input.interactionId ?? null;
  if (latest && latest.present === present && latest.isIncumbent === isIncumbent && (interactionId === null || latest.interactionId === interactionId)) {
    return ok(null);
  }
  // Marking out a rival that was never in is not a finding either.
  if (!latest && !present) return ok(null);
  return ok({ competitorId: input.competitorId, isIncumbent, present, interactionId });
}

export interface CriterionDraft {
  readonly statement: string;
  readonly shapedBy?: string;
  readonly fit?: string | null;
  readonly fitNote?: string | null;
}

export function planDecisionCriterion(d: CriterionDraft): RuleResult<{ statement: string; shapedBy: ShapedBy; fit: Fit | null; fitNote: string | null }> {
  const statement = d.statement.trim();
  if (statement === "") return fail(violation("criterion_required", "a criterion needs a statement", "statement"));
  if (statement.length > CRITERION_MAX) {
    return fail(violation("criterion_too_long", `a criterion is at most ${CRITERION_MAX} characters`, "statement"));
  }
  const shapedBy = (d.shapedBy ?? "unknown") as ShapedBy;
  if (!(SHAPED_BY as readonly string[]).includes(shapedBy)) {
    return fail(violation("shaped_by_unknown", `no such shaper ${d.shapedBy}`, "shapedBy"));
  }
  const fit = d.fit === undefined || d.fit === null || d.fit === "" ? null : (d.fit as Fit);
  if (fit !== null && !(FITS as readonly string[]).includes(fit)) {
    return fail(violation("fit_unknown", `no such fit ${d.fit}`, "fit"));
  }
  const fitNote = d.fitNote?.trim() || null;
  if (fitNote !== null && fitNote.length > FIT_NOTE_MAX) {
    return fail(violation("fit_note_too_long", `a fit note is at most ${FIT_NOTE_MAX} characters`, "fitNote"));
  }
  return ok({ statement, shapedBy, fit, fitNote });
}

/** Normalise a rival name for matching: trimmed, case-folded, inner spaces collapsed. */
function norm(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}

/** The vocabulary row a typed name means - by name or by any alias. */
export function matchCompetitor(name: string, known: readonly CompetitorRecord[]): CompetitorRecord | null {
  const n = norm(name);
  if (n === "") return null;
  return known.find((c) => norm(c.name) === n || c.aliases.some((a) => norm(a) === n)) ?? null;
}

/** A new rival for the vocabulary. Refused when the name is already a rival or an alias of one. */
export function planCompetitor(
  input: { readonly name: string; readonly aliases?: readonly string[] },
  known: readonly CompetitorRecord[],
  selfId?: string,
): RuleResult<{ name: string; aliases: string[] }> {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name === "") return fail(violation("competitor_name_required", "a competitor needs a name", "name"));
  if (name.length > COMPETITOR_NAME_MAX) {
    return fail(violation("competitor_name_too_long", `a name is at most ${COMPETITOR_NAME_MAX} characters`, "name"));
  }
  const aliases = [...new Set((input.aliases ?? []).map((a) => a.trim().replace(/\s+/g, " ")).filter((a) => a !== "" && norm(a) !== norm(name)))];
  const others = known.filter((c) => c.id !== selfId);
  for (const candidate of [name, ...aliases]) {
    if (matchCompetitor(candidate, others)) {
      return fail(violation("competitor_taken", `${candidate} already names a competitor`, "name"));
    }
  }
  return ok({ name, aliases });
}

/**
 * How often we have won against a rival, from decided reviews that name it.
 * Null when there are fewer than WIN_RATE_MIN_SAMPLE - a rate from three deals
 * is noise dressed as a number (YC-067: 样本不足 5 单不给数).
 */
export function winRateAgainst(
  reviews: readonly { readonly competitorId: string | null; readonly outcome: string; readonly reviewedAt: Date }[],
  competitorId: string,
  since: Date,
): { readonly won: number; readonly decided: number; readonly rate: number | null } {
  const decided = reviews.filter(
    (r) => r.competitorId === competitorId && r.reviewedAt >= since && (r.outcome === "won" || r.outcome === "lost"),
  );
  const won = decided.filter((r) => r.outcome === "won").length;
  return { won, decided: decided.length, rate: decided.length >= WIN_RATE_MIN_SAMPLE ? won / decided.length : null };
}
