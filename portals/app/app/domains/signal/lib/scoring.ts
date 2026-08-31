// D5 signal scoring (docs/20-specs/30-business-rules.md section 3).
//
// The spec deliberately does NOT fix the weights - they are model-side config -
// and locks exactly three things instead. Those three are what this file
// implements, and the weights below are the product's current defaults, not the
// contract:
//
//   1. An unmatched account MUST NOT zero the score. "We don't recognize this
//      company" is the single most valuable thing the detective domain can find:
//      an existing customer's signal is useful, a stranger's signal is a new
//      logo. A scorer that zeroes strangers has quietly become a CRM report.
//   2. The score decays with age. A hiring post from eighteen months ago is not
//      evidence of anything current.
//   3. The score is recomputable and writable; the EVIDENCE never is. Rewriting
//      evidence is fabricating it, which is why the column locks freeze source,
//      source_ref, signal_type, subject, payload and detected_at.

import { fail, ok, violation, type RuleResult } from "../../shared/result";

export const SIGNAL_TYPES = [
  "tender",
  "compliance",
  "intent",
  "hiring",
  "funding",
  "tech_change",
  "engagement",
  "referral",
  "other",
] as const;
export type SignalType = (typeof SIGNAL_TYPES)[number];

export const SIGNAL_STATUSES = ["new", "scored", "promoted", "dismissed", "duplicate"] as const;
export type SignalStatus = (typeof SIGNAL_STATUSES)[number];

/**
 * Base weight per signal type, 0-100. These say how strongly each kind of
 * evidence predicts a real buying process:
 *
 *   tender      a procurement is ALREADY RUNNING, with a budget and a deadline
 *   referral    a human vouched
 *   intent      active research on the problem we solve
 *   funding     budget just appeared
 *   compliance  policy or accreditation forcing a purchase
 *   tech_change a migration window opened
 *   hiring      capability being built, but slow to convert
 *   engagement  they touched our content; weak on its own
 *
 * TENDER OUTRANKS REFERRAL, and that is a deliberate judgement rather than an
 * ordering accident. A vouch means SOMEBODY IS WILLING TO HELP US; a tender
 * means THE MONEY IS ALREADY MOVING THROUGH A PROCESS. The first is a
 * relationship, the second is a fact. See ADR-016.
 */
export const TYPE_WEIGHT: Record<SignalType, number> = {
  tender: 95,
  referral: 90,
  intent: 80,
  funding: 70,
  compliance: 65,
  tech_change: 60,
  hiring: 45,
  engagement: 35,
  other: 25,
};

/** Days after which a signal has decayed to half its base weight. */
export const HALF_LIFE_DAYS = 30;

/**
 * Floor on the decay multiplier. Old evidence loses weight but never becomes
 * worthless: a long-lived pattern of weak signals from one account is itself a
 * signal, and a multiplier that reaches zero erases it.
 */
export const MIN_DECAY = 0.15;

/**
 * How a matched account moves the score.
 *
 * A match is a BONUS, never a precondition - see rule 1. An unmatched signal
 * keeps its full type weight and simply misses the bonus.
 */
export const MATCH_BONUS = 15;

export interface ScoreInput {
  signalType: SignalType;
  detectedAt: Date;
  /** Resolved account, when the signal was matched to one. */
  accountId?: string | null;
  /** 0-100 confidence that this signal is about the account it was matched to. */
  matchConfidence?: number | null;
  now?: Date;
}

export interface ScoreBreakdown {
  score: number;
  baseWeight: number;
  decayMultiplier: number;
  matchBonus: number;
  ageDays: number;
}

/** Exponential decay to a floor: half the weight every HALF_LIFE_DAYS. */
export function decayMultiplier(ageDays: number, halfLifeDays: number = HALF_LIFE_DAYS): number {
  if (ageDays <= 0) return 1;
  const decayed = Math.pow(0.5, ageDays / halfLifeDays);
  return Math.max(MIN_DECAY, decayed);
}

export function scoreSignal(input: ScoreInput): RuleResult<ScoreBreakdown> {
  if (!(SIGNAL_TYPES as readonly string[]).includes(input.signalType)) {
    return fail(violation("unknown_signal_type", `${String(input.signalType)} is not a signal type`, "signalType"));
  }

  const now = input.now ?? new Date();
  const ageMs = now.getTime() - input.detectedAt.getTime();
  // Future-dated evidence is treated as fresh rather than rejected: clock skew
  // in an external feed must not throw away a real signal.
  const ageDays = Math.max(0, ageMs / 86_400_000);

  const baseWeight = TYPE_WEIGHT[input.signalType];
  const decay = decayMultiplier(ageDays);

  // The bonus scales with match confidence, so a shaky match does not get the
  // same lift as a certain one. No match at all means no bonus - and no penalty.
  const confidence = input.accountId ? (input.matchConfidence ?? 100) : 0;
  const matchBonus = Math.round((MATCH_BONUS * clamp(confidence, 0, 100)) / 100);

  const raw = baseWeight * decay + matchBonus;
  return ok({
    score: clamp(Math.round(raw), 0, 100),
    baseWeight,
    decayMultiplier: decay,
    matchBonus,
    ageDays,
  });
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** The dedup identity: one external record enters once per workspace. */
export function dedupKey(input: { workspaceId: string; source: string; sourceRef: string | null }): string {
  return `${input.workspaceId}|${input.source}|${input.sourceRef ?? ""}`;
}

// --- Evidence immutability --------------------------------------------------

const EVIDENCE_KEYS = [
  "source",
  "sourceRef",
  "source_ref",
  "signalType",
  "signal_type",
  "subject",
  "payload",
  "detectedAt",
  "detected_at",
] as const;

// --- Lifecycle --------------------------------------------------------------

export interface SignalSnapshot {
  status: SignalStatus;
  score: number | null;
  accountId: string | null;
}

export interface SignalPatch {
  status?: SignalStatus;
  score?: number;
  accountId?: string | null;
}

/**
 * Transitions. `new -> scored -> promoted` is the happy path; `dismissed` and
 * `duplicate` are terminal side exits.
 *
 * Re-scoring an already-scored signal is allowed and expected - the score decays
 * and the model improves - which is why `scored -> scored` is legal here even
 * though the stage machine forbids self-transitions. A signal has no journal
 * table, so there is no empty event to write.
 */
const ALLOWED_TRANSITIONS: Record<SignalStatus, readonly SignalStatus[]> = {
  new: ["scored", "dismissed", "duplicate"],
  scored: ["scored", "promoted", "dismissed", "duplicate"],
  promoted: ["dismissed"],
  dismissed: [],
  duplicate: [],
};

export function planRescore(
  current: SignalSnapshot,
  breakdown: Pick<ScoreBreakdown, "score">,
  opts: { accountId?: string | null } = {},
): RuleResult<SignalPatch> {
  if (current.status === "dismissed" || current.status === "duplicate") {
    return fail(violation("signal_closed", `a ${current.status} signal is not rescored`, "status"));
  }
  const patch: SignalPatch = { score: breakdown.score };
  // Staying `promoted` matters: a promoted signal already produced a lead, and
  // knocking it back to `scored` would make it look eligible for promotion twice.
  if (current.status === "new") patch.status = "scored";
  if (opts.accountId !== undefined) patch.accountId = opts.accountId;
  return ok(patch);
}

export function planStatusChange(current: SignalSnapshot, to: SignalStatus): RuleResult<SignalPatch> {
  if (!(SIGNAL_STATUSES as readonly string[]).includes(to)) {
    return fail(violation("unknown_status", `${String(to)} is not a signal status`, "status"));
  }
  if (!ALLOWED_TRANSITIONS[current.status].includes(to)) {
    return fail(
      violation("illegal_transition", `a ${current.status} signal cannot become ${to}`, "status"),
    );
  }
  // Promotion is the moment a signal becomes demand; doing it unscored means
  // nobody judged whether it was worth anyone's time.
  if (to === "promoted" && current.score == null) {
    return fail(violation("score_required", "score the signal before promoting it", "score"));
  }
  return ok({ status: to });
}

export interface LeadDraft {
  companyName: string;
  accountId: string | null;
  signalId: string;
  campaignId: string | null;
  score: number | null;
  status: "new";
}

/**
 * Promote a signal into a lead.
 *
 * lead.signal_id points back at the evidence and lead.campaign_id is captured
 * here, once. Both are frozen from this moment (98_column_locks.sql), which is
 * what makes the chain from campaign to closed revenue a join rather than a
 * manual tally.
 */
export function planPromotion(input: {
  signal: SignalSnapshot & { id: string; source: string; sourceRef: string | null; subject: string };
  companyName?: string;
}): RuleResult<{ patch: SignalPatch; lead: LeadDraft }> {
  const status = planStatusChange(input.signal, "promoted");
  if (!status.ok) return status as RuleResult<{ patch: SignalPatch; lead: LeadDraft }>;

  const companyName = input.companyName?.trim() || input.signal.subject.trim();
  if (!companyName) {
    return fail(violation("company_required", "a lead needs a company name", "companyName"));
  }

  return ok({
    patch: status.value,
    lead: {
      companyName,
      accountId: input.signal.accountId,
      signalId: input.signal.id,
      // A campaign-sourced signal carries its campaign in source_ref; anything
      // else has no campaign lineage and must not invent one.
      campaignId: input.signal.source === "campaign" ? input.signal.sourceRef : null,
      score: input.signal.score,
      status: "new",
    },
  });
}
