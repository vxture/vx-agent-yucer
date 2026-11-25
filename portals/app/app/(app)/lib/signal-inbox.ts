import type { SignalRecord } from "../../domains/signal/store";
import { scoreSignal } from "../../domains/signal/lib/scoring";
import { isPendingSignal, signalText } from "../../domains/signal/lib/intelligence";

export interface QueueSignal {
  readonly record: SignalRecord;
  readonly recomputed: number | null;
  readonly baseWeight: number;
  readonly decay: number;
  readonly bonus: number;
  readonly ageDays: number;
}

export function enrichSignals(signals: readonly SignalRecord[], now = new Date()): QueueSignal[] {
  return signals.map(record => {
    const scored = scoreSignal({ ...record, now });
    return { record, recomputed: scored.ok ? scored.value.score : null,
      baseWeight: scored.ok ? scored.value.baseWeight : 0,
      decay: scored.ok ? scored.value.decayMultiplier : 0,
      bonus: scored.ok ? scored.value.matchBonus : 0,
      ageDays: scored.ok ? scored.value.ageDays : 0 };
  });
}

export type SignalScope = "pending" | "processed" | "all";
export function filterSignalInbox(signals: readonly QueueSignal[], filter: {
  scope: SignalScope; query: string; type: string; match: string;
}, accountNames: Readonly<Record<string, string>>): QueueSignal[] {
  const query = filter.query.trim().toLocaleLowerCase();
  return signals.filter(({ record: r }) => {
    if (filter.scope === "pending" && !isPendingSignal(r)) return false;
    if (filter.scope === "processed" && isPendingSignal(r)) return false;
    if (filter.type && r.signalType !== filter.type) return false;
    if (filter.match === "matched" && !r.accountId) return false;
    if (filter.match === "unmatched" && r.accountId) return false;
    return !query || [r.subject, signalText(r.payload, "company_name", "companyName"),
      signalText(r.payload, "summary", "abstract", "description", "brief"), r.accountId ? accountNames[r.accountId] : ""]
      .some(text => text?.toLocaleLowerCase().includes(query));
  });
}
