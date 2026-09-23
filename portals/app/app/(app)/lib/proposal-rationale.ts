import type { Dictionary } from "./i18n/dictionary";
import { CHASE_COMMITMENT_ACTION_TYPE, UPSELL_ACTION_TYPE } from "../../domains/copilot/lib/action";

// WHAT A PROPOSAL'S RATIONALE READS AS, on screen (TD-010, third sighting).
//
// The two rule sweeps write their rationale in English - the column is
// agent_action.rationale, immutable once written (ADR-003), and a domain
// module has no dictionary. The upsell sweep's "Not yet running X. 7 of 12
// same-industry customers..." was then rendered verbatim inside the Chinese
// customer page's 作战方案, and the commitment sweep's "They promised: ..."
// inside the copilot queue.
//
// The stored sentence stays as the audit record. What a PERSON reads is
// rebuilt from the payload, which carries every fact the sentence was made
// of, through the dictionary. A model-written rationale is the model's own
// words and passes through untouched; so does a rule proposal whose payload
// is not the shape expected (older rows) - the stored text beats nothing.

export interface RationaleSource {
  readonly actionType: string;
  readonly payload: unknown;
  readonly rationale: string | null;
}

type RationaleText = Dictionary["RATIONALE_TEXT"];

const str = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function displayRationale(a: RationaleSource, t: RationaleText): string | null {
  const p = (a.payload ?? {}) as Record<string, unknown>;
  if (a.actionType === UPSELL_ACTION_TYPE && str(p.productName) && num(p.owners) && num(p.peers)) {
    return t.upsell(p.productName, p.owners, p.peers);
  }
  if (
    a.actionType === CHASE_COMMITMENT_ACTION_TYPE &&
    (p.direction === "they_owe" || p.direction === "we_owe") &&
    str(p.statement) &&
    str(p.dueAt) &&
    num(p.daysOverdue)
  ) {
    return t.chase(p.direction, p.statement, p.dueAt.slice(0, 10), p.daysOverdue);
  }
  return a.rationale;
}
