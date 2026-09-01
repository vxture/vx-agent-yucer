// D4 commitments and interactions - the evidence-plane rules (ADR-006).
//
// One rule carries this whole file, and it is the reason a commitment is worth
// having at all:
//
//   A COMMITMENT CANNOT BE CLOSED BY ASSERTION. `met` requires evidence that
//   something happened. Everything else on a sales floor is a to-do list, and a
//   to-do list has never diagnosed a stalled deal - because the person who owes
//   the task is also the person who ticks it off.
//
// The asymmetry with `missed` is deliberate and worth stating: success must be
// evidenced, failure is simply what happens when nothing does. A promise that
// quietly expires is the single most predictive stall signal in B2B, and it
// costs nobody an action to record.
//
// The database enforces the same thing (chk_commitment_met_needs_evidence), so
// these rules give a usable message rather than being the only line of defence.

import { fail, ok, violation, type RuleResult } from "../../shared/result";

export const COMMITMENT_STATUSES = ["open", "met", "missed", "waived"] as const;
export type CommitmentStatus = (typeof COMMITMENT_STATUSES)[number];

/** Who owes it. The direction is the whole analytical value of the table. */
export const COMMITMENT_DIRECTIONS = ["we_owe", "they_owe"] as const;
export type CommitmentDirection = (typeof COMMITMENT_DIRECTIONS)[number];

export const CLOSURE_EVIDENCE_KINDS = ["interaction", "stage_event"] as const;
export type ClosureEvidenceKind = (typeof CLOSURE_EVIDENCE_KINDS)[number];

/**
 * `met` and `waived` are terminal. `missed` is NOT: a customer who missed a
 * deadline can still deliver late, and rewriting that as though it were never
 * missed would erase exactly the signal the table exists to capture. So a
 * missed promise can still be met - and the miss stays on the record.
 */
const ALLOWED: Record<CommitmentStatus, readonly CommitmentStatus[]> = {
  open: ["met", "missed", "waived"],
  missed: ["met", "waived"],
  met: [],
  waived: [],
};

export interface CommitmentSnapshot {
  status: CommitmentStatus;
  direction: CommitmentDirection;
  dueAt: Date;
}

export interface CommitmentClosure {
  status: CommitmentStatus;
  closureEvidenceKind?: ClosureEvidenceKind;
  closureEvidenceId?: string;
  metAt?: Date;
  waivedBySub?: string;
  waiveReason?: string;
}

export interface CloseInput {
  to: CommitmentStatus;
  /** Required for `met`: the thing that proves it happened. */
  evidence?: { kind: ClosureEvidenceKind; id: string };
  /** Required for `waived`. The actor comes from the session, never the body. */
  waivedBySub?: string;
  waiveReason?: string;
  at?: Date;
}

export function isCommitmentStatus(v: string): v is CommitmentStatus {
  return (COMMITMENT_STATUSES as readonly string[]).includes(v);
}

export function isDirection(v: string): v is CommitmentDirection {
  return (COMMITMENT_DIRECTIONS as readonly string[]).includes(v);
}

/** Open and past due. The definition the sweep and the UI must agree on. */
export function isOverdue(c: Pick<CommitmentSnapshot, "status" | "dueAt">, now: Date): boolean {
  return c.status === "open" && c.dueAt.getTime() < now.getTime();
}

export function planCommitmentClosure(
  current: CommitmentSnapshot,
  input: CloseInput,
): RuleResult<CommitmentClosure> {
  const at = input.at ?? new Date();

  if (!isCommitmentStatus(input.to)) {
    return fail(violation("unknown_status", `${String(input.to)} is not a commitment status`, "status"));
  }
  if (input.to === current.status) {
    return fail(violation("status_unchanged", `already ${input.to}`, "status"));
  }
  if (!ALLOWED[current.status].includes(input.to)) {
    return fail(
      violation("illegal_transition", `a ${current.status} commitment cannot become ${input.to}`, "status"),
    );
  }

  if (input.to === "met") {
    // The rule. Without evidence this is someone marking their own homework.
    if (!input.evidence) {
      return fail(
        violation(
          "evidence_required",
          "a commitment is met when something happened, not when someone says so - cite the interaction or the stage change",
          "evidence",
        ),
      );
    }
    if (!(CLOSURE_EVIDENCE_KINDS as readonly string[]).includes(input.evidence.kind)) {
      return fail(violation("unknown_evidence_kind", `${input.evidence.kind} is not closure evidence`, "evidence"));
    }
    return ok({
      status: "met",
      closureEvidenceKind: input.evidence.kind,
      closureEvidenceId: input.evidence.id,
      metAt: at,
    });
  }

  if (input.to === "waived") {
    // Waiving is a decision. An anonymous waive is indistinguishable from the
    // promise never having been made, which is the outcome it must not have.
    if (!input.waivedBySub) {
      return fail(violation("waiver_required", "waiving a commitment names who waived it", "waivedBySub"));
    }
    if (!input.waiveReason?.trim()) {
      return fail(violation("reason_required", "waiving a commitment requires a reason", "waiveReason"));
    }
    return ok({ status: "waived", waivedBySub: input.waivedBySub, waiveReason: input.waiveReason.trim() });
  }

  // missed. Deliberately needs nothing: it is what happens when nothing does.
  if (!isOverdue({ status: current.status, dueAt: current.dueAt }, at)) {
    return fail(
      violation("not_yet_due", "a commitment cannot be missed before it is due", "dueAt"),
    );
  }
  return ok({ status: "missed" });
}

// --- What the evidence plane tells you about a relationship ----------------

export interface ReliabilityInput {
  status: CommitmentStatus;
  direction: CommitmentDirection;
  dueAt: Date;
}

export interface Reliability {
  /** Promises they made and did not keep. The stall signal. */
  theyMissed: number;
  /** Promises we made and did not keep. The other half of the story. */
  weMissed: number;
  /** Open and past due right now, either side. */
  overdue: number;
  /** Their kept-rate, null when they have made no closable promise yet. */
  theirKeptRate: number | null;
}

/**
 * Counted, not scored.
 *
 * Deliberately returns raw counts rather than a single number: "they have
 * missed two of the last three things they promised" is a sentence a
 * salesperson can act on, and a health index between 0 and 100 is not. The one
 * ratio here is null rather than 1 when nothing has resolved, because a
 * relationship with no history is not a perfect one.
 */
export function reliability(rows: readonly ReliabilityInput[], now: Date): Reliability {
  let theyMissed = 0;
  let weMissed = 0;
  let overdue = 0;
  let theirClosed = 0;
  let theirMet = 0;

  for (const c of rows) {
    if (isOverdue(c, now)) overdue += 1;
    const missed = c.status === "missed" || isOverdue(c, now);

    if (c.direction === "they_owe") {
      if (missed) theyMissed += 1;
      if (c.status === "met" || c.status === "missed") {
        theirClosed += 1;
        if (c.status === "met") theirMet += 1;
      }
    } else if (missed) {
      weMissed += 1;
    }
  }

  return {
    theyMissed,
    weMissed,
    overdue,
    theirKeptRate: theirClosed === 0 ? null : theirMet / theirClosed,
  };
}

// --- Interactions -----------------------------------------------------------

export const INTERACTION_CHANNELS = ["meeting", "call", "visit", "email", "im", "event", "other"] as const;
export type InteractionChannel = (typeof INTERACTION_CHANNELS)[number];

export function isChannel(v: string): v is InteractionChannel {
  return (INTERACTION_CHANNELS as readonly string[]).includes(v);
}

export interface NewInteractionInput {
  channel: string;
  occurredAt: Date;
  rawNote: string;
  now?: Date;
}

/**
 * What a recorded interaction must satisfy.
 *
 * The future check matters more than it looks: a meeting logged for next week
 * would reset "last contact" to a date on which nothing has happened, which is
 * precisely the lie this whole plane exists to stop telling.
 */
export function validateInteraction(input: NewInteractionInput): RuleResult<true> {
  const now = input.now ?? new Date();
  if (!isChannel(input.channel)) {
    return fail(violation("unknown_channel", `${input.channel} is not an interaction channel`, "channel"));
  }
  if (!input.rawNote.trim()) {
    return fail(
      violation("note_required", "an interaction with no note records that it happened and nothing else", "rawNote"),
    );
  }
  if (input.occurredAt.getTime() > now.getTime()) {
    return fail(
      violation("occurred_in_future", "an interaction cannot have happened later than now", "occurredAt"),
    );
  }
  return ok(true);
}

/**
 * Days since the most recent interaction, or null when there has never been one.
 *
 * TAKES THE DATE, NOT THE LIST, and that is why it had no callers for months.
 * It used to reduce an array of occurredAts, a shape nobody has: the store
 * answers `lastContactAt` with a single date (a MAX in the Prisma adapter, so
 * the reduction never crosses the wire), and every reader therefore holds one
 * Date or null. A helper shaped for a caller that does not exist stays unused
 * while the thing it was written for gets restated inline - which is exactly
 * what happened, in the judgement rules and in the field evidence panel.
 *
 * NULL IS NOT ZERO, and keeping them apart is the whole point. "Never contacted"
 * and "contacted today" are opposite facts, and a helper that returned 0 for
 * both would let a quiet-account rule fire on an account nobody has ever
 * called - or, worse, stay silent about one.
 */
export function daysSinceLastContact(lastContactAt: Date | null, now: Date): number | null {
  if (lastContactAt === null) return null;
  return Math.floor((now.getTime() - lastContactAt.getTime()) / 86_400_000);
}
