// 证据新鲜度 - the second of the three times an agent must say "I don't know"
// (agent capability B4, L2 batch seven).
//
//   no data      - already said ("尚未侦察" and friends).
//   too old      - THIS FILE: "这条判断依据的是 N 天前的事实".
//   conflicting  - batch 7b, designed separately (it needs a model and a store).
//
// ON EVERY JUDGEMENT (owner, 2026-09-22), by the design's rule: a judgement is
// stale when even its NEWEST dated evidence is older than that evidence
// kind's threshold. The newest, not the oldest - one fresh note under a claim
// means the claim was looked at recently; it is when nothing under it is
// recent that the confident present tense stops being earned.
//
// Structural and computed citations carry no date and are not evidence of
// age either way; a judgement resting only on those gets no freshness at all
// (null), which is different from "fresh".

import type { Citation } from "../../judgement/lib/judgement";

/** Days per evidence kind before it counts as old. Defaults, overridable. */
export const FRESHNESS_THRESHOLD_DAYS: Readonly<Record<"interaction" | "commitment", number>> = {
  // A follow-up note three months old describes a relationship that has moved.
  interaction: 60,
  // A promise's date holds longer - it is a term, not an observation.
  commitment: 90,
};

export type Freshness =
  | { readonly stale: false; readonly daysAgo: number }
  | { readonly stale: true; readonly daysAgo: number; readonly kind: "interaction" | "commitment" };

const DAY = 86_400_000;

export function annotateFreshness(
  citations: readonly Citation[],
  now: Date,
  thresholds: Readonly<Record<"interaction" | "commitment", number>> = FRESHNESS_THRESHOLD_DAYS,
): Freshness | null {
  const dated = citations.filter(
    (c): c is Citation & { kind: "interaction" | "commitment"; when: Date } =>
      (c.kind === "interaction" || c.kind === "commitment") && c.when instanceof Date,
  );
  const [first, ...rest] = dated;
  if (!first) return null;
  const newest = rest.reduce((a, b) => (b.when > a.when ? b : a), first);
  // A commitment dated in the future is simply current: age floors at zero.
  const daysAgo = Math.max(0, Math.floor((now.getTime() - newest.when.getTime()) / DAY));
  // Strictly older than the threshold - exactly N days is still fresh.
  return daysAgo > thresholds[newest.kind]
    ? { stale: true, daysAgo, kind: newest.kind }
    : { stale: false, daysAgo };
}
