import { fail, ok, violation, type RuleResult } from "../../shared/result";

// 购买证据槽 (incr/0085, YC-065 R1/R4) - the pure half.

export const EVIDENCE_SLOTS = ["pain", "metrics", "status_quo", "decision_process", "paper_process"] as const;
export type EvidenceSlot = (typeof EVIDENCE_SLOTS)[number];

/** 购买理由 in 栏2 - why they would buy, and the pull of doing nothing. */
export const REASON_SLOTS: readonly EvidenceSlot[] = ["pain", "metrics", "status_quo"];
/** 决策流程's lower half in 栏1 - how they decide and how they sign. */
export const PROCESS_SLOTS: readonly EvidenceSlot[] = ["decision_process", "paper_process"];

export const EVIDENCE_MAX = 2000;

export interface EvidenceVersion {
  readonly id: string;
  readonly slot: EvidenceSlot;
  /** '' = cleared - a version too. */
  readonly statement: string;
  readonly interactionId: string | null;
  readonly authorSub: string;
  readonly source: "manual" | "model_accepted";
  readonly proposalId: string | null;
  readonly recordedAt: Date;
}

export interface SlotState {
  readonly slot: EvidenceSlot;
  /** The latest version, or null when the slot was never written. */
  readonly current: EvidenceVersion | null;
  /** Filled = the latest statement is not empty. Grounded or said, both count (R1). */
  readonly filled: boolean;
  /** 有据: the latest cites a follow-up. 口述: it does not. */
  readonly grounded: boolean;
  /** Every version, newest first. */
  readonly history: readonly EvidenceVersion[];
}

export function isEvidenceSlot(v: string): v is EvidenceSlot {
  return (EVIDENCE_SLOTS as readonly string[]).includes(v);
}

/** One state per slot, from every version of a deal's evidence. */
export function slotStates(versions: readonly EvidenceVersion[]): Record<EvidenceSlot, SlotState> {
  const out = {} as Record<EvidenceSlot, SlotState>;
  for (const slot of EVIDENCE_SLOTS) {
    const history = versions
      .filter((v) => v.slot === slot)
      .sort((a, b) => b.recordedAt.getTime() - a.recordedAt.getTime());
    const current = history[0] ?? null;
    const filled = current !== null && current.statement.trim() !== "";
    out[slot] = { slot, current, filled, grounded: filled && current!.interactionId !== null, history };
  }
  return out;
}

/**
 * Plan one new version. The same statement and citation as the latest is not
 * a new version - saving twice must not make the history look like two
 * findings. Returns null for that no-op.
 */
export function planEvidence(
  input: { readonly slot: string; readonly statement: string; readonly interactionId?: string | null },
  latest: EvidenceVersion | null,
): RuleResult<{ slot: EvidenceSlot; statement: string; interactionId: string | null } | null> {
  if (!isEvidenceSlot(input.slot)) return fail(violation("evidence_slot_unknown", `no slot ${input.slot}`, "slot"));
  const statement = input.statement.trim();
  if (statement.length > EVIDENCE_MAX) {
    return fail(violation("evidence_too_long", `a statement is at most ${EVIDENCE_MAX} characters`, "statement"));
  }
  // A cleared slot cites nothing.
  const interactionId = statement === "" ? null : (input.interactionId ?? null);
  if (latest && latest.statement === statement && latest.interactionId === interactionId) return ok(null);
  // Clearing a slot that was never written is not a version either.
  if (!latest && statement === "") return ok(null);
  return ok({ slot: input.slot, statement, interactionId });
}
