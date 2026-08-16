// D4 account health (docs/20-specs/30-business-rules.md section 5).
//
// health_score is a DERIVED value. It is stored only so accounts can be sorted
// and alerted on, and the spec is explicit that it is never the sole basis for a
// business decision. Two consequences that are implemented rather than merely
// documented:
//
//   1. It is always recomputable from source data. Nothing here reads the stored
//      score, so a corrupted or stale value can only ever be replaced, never
//      compounded.
//   2. The result carries its CONTRIBUTIONS. A number between 0 and 100 with no
//      explanation is a number nobody acts on - the first question a salesperson
//      asks about a red account is "why", and an answer of "the model said so"
//      is how a derived score gets ignored.

import { ok, type RuleResult } from "../../shared/result";
import { isTerminal, OPEN_STAGE_ORDER, type Stage } from "../../pipeline/lib/stage";

export type AccountStatus = "prospect" | "active" | "dormant" | "churned";
export type ProjectHealth = "green" | "amber" | "red";

export const DECISION_ROLES = ["economic", "technical", "user", "coach", "blocker", "unknown"] as const;
export type DecisionRole = (typeof DECISION_ROLES)[number];

export interface HealthInput {
  /** Open opportunities on this account, with their stages. */
  openOpportunities: Array<{ stage: Stage; amount?: number | null }>;
  /** When anyone last touched this account. Null = never. */
  lastInteractionAt: Date | null;
  /** Health of delivery projects currently running for this account. */
  projectHealth: ProjectHealth[];
  /** Count of revenue instalments in `overdue`. */
  overdueRevenueCount: number;
  now?: Date;
}

export interface HealthContribution {
  factor: "pipeline" | "recency" | "delivery" | "collections";
  /** Signed points this factor moved the score by. */
  points: number;
  detail: string;
}

export interface HealthResult {
  score: number;
  contributions: HealthContribution[];
  /** The single biggest negative contributor, or null if nothing is negative. */
  primaryConcern: HealthContribution | null;
}

/** Neutral starting point: an account with no data is neither healthy nor sick. */
export const BASE_SCORE = 50;

/** Days without contact before recency starts costing points. */
export const STALE_AFTER_DAYS = 30;
export const VERY_STALE_AFTER_DAYS = 90;

export function deriveHealth(input: HealthInput): RuleResult<HealthResult> {
  const now = input.now ?? new Date();
  const contributions: HealthContribution[] = [];

  // Pipeline: having live deals is good, and late-stage deals are better. This
  // reads stage rather than amount because a large deal stuck at qualify says
  // less about the relationship than a small one at negotiate.
  const open = input.openOpportunities.filter((o) => !isTerminal(o.stage));
  if (open.length === 0) {
    contributions.push({
      factor: "pipeline",
      points: -15,
      detail: "no open opportunities",
    });
  } else {
    const depth = open.reduce((best, o) => Math.max(best, OPEN_STAGE_ORDER.indexOf(o.stage)), -1);
    const points = Math.min(25, 8 + depth * 4 + Math.min(open.length - 1, 2) * 2);
    contributions.push({
      factor: "pipeline",
      points,
      detail: `${open.length} open opportunit${open.length === 1 ? "y" : "ies"}, furthest at ${
        OPEN_STAGE_ORDER[Math.max(0, depth)]
      }`,
    });
  }

  // Recency: silence is the cheapest early warning there is.
  if (input.lastInteractionAt == null) {
    contributions.push({ factor: "recency", points: -20, detail: "no recorded interaction" });
  } else {
    const days = Math.max(0, (now.getTime() - input.lastInteractionAt.getTime()) / 86_400_000);
    if (days > VERY_STALE_AFTER_DAYS) {
      contributions.push({
        factor: "recency",
        points: -25,
        detail: `no contact for ${Math.round(days)} days`,
      });
    } else if (days > STALE_AFTER_DAYS) {
      contributions.push({
        factor: "recency",
        points: -10,
        detail: `no contact for ${Math.round(days)} days`,
      });
    } else {
      contributions.push({ factor: "recency", points: 15, detail: `contacted ${Math.round(days)} days ago` });
    }
  }

  // Delivery: an unhappy delivery is the strongest predictor of a lost renewal,
  // and it is invisible to anyone looking only at the pipeline.
  const red = input.projectHealth.filter((h) => h === "red").length;
  const amber = input.projectHealth.filter((h) => h === "amber").length;
  if (red > 0) {
    contributions.push({ factor: "delivery", points: -30, detail: `${red} project(s) red` });
  } else if (amber > 0) {
    contributions.push({ factor: "delivery", points: -12, detail: `${amber} project(s) amber` });
  } else if (input.projectHealth.length > 0) {
    contributions.push({
      factor: "delivery",
      points: 12,
      detail: `${input.projectHealth.length} project(s) green`,
    });
  }

  // Collections: money that has not arrived is the least ambiguous bad news on
  // this list, so it is weighted accordingly.
  if (input.overdueRevenueCount > 0) {
    contributions.push({
      factor: "collections",
      points: -Math.min(30, 15 * input.overdueRevenueCount),
      detail: `${input.overdueRevenueCount} overdue instalment(s)`,
    });
  }

  const raw = contributions.reduce((n, c) => n + c.points, BASE_SCORE);
  const negatives = contributions.filter((c) => c.points < 0).sort((a, b) => a.points - b.points);

  return ok({
    score: Math.min(100, Math.max(0, Math.round(raw))),
    contributions,
    primaryConcern: negatives[0] ?? null,
  });
}

// --- Decision chain ---------------------------------------------------------

export interface ContactNode {
  id: string;
  decisionRole: DecisionRole;
  influence: number | null;
  status: string;
}

/** Mirrors chk_account_relation_type. A value outside this set is refused by
 * the database, so the surface offers exactly these and nothing else. */
export const RELATION_TYPES = [
  "reports_to",
  "peer_of",
  "allied_with",
  "opposed_to",
  "referred_by",
] as const;

export type RelationType = (typeof RELATION_TYPES)[number];

export function isRelationType(v: string): v is RelationType {
  return (RELATION_TYPES as readonly string[]).includes(v);
}

export interface RelationEdge {
  fromContactId: string;
  toContactId: string;
  relationType: RelationType;
}

export interface ChainCoverage {
  /** Roles with at least one active contact. */
  covered: DecisionRole[];
  /** Roles the deal needs and does not have. */
  missing: DecisionRole[];
  /** Contacts marked as actively opposed. */
  blockers: ContactNode[];
  /** Contacts who can be asked for help, ordered by influence. */
  coaches: ContactNode[];
  /** True when there is no path from any coach to the economic buyer. */
  economicBuyerUnreachable: boolean;
}

/** The roles a deal genuinely needs. `user` and `unknown` are not gaps. */
export const REQUIRED_ROLES: readonly DecisionRole[] = ["economic", "technical", "coach"];

/**
 * What the decision chain is missing, and whether the economic buyer can
 * actually be reached.
 *
 * "We have an economic buyer on file" and "someone can introduce us to them" are
 * different facts, and only the second one advances a deal. The reachability
 * walk is what separates them.
 */
export function analyzeChain(
  contacts: readonly ContactNode[],
  relations: readonly RelationEdge[],
): ChainCoverage {
  // A contact who has left is not coverage. Counting them is how a deal ends up
  // believing it has a champion it lost two months ago.
  const active = contacts.filter((c) => c.status === "active");
  const byRole = new Set(active.map((c) => c.decisionRole));

  const coaches = active
    .filter((c) => c.decisionRole === "coach")
    .sort((a, b) => (b.influence ?? 0) - (a.influence ?? 0));
  const economic = active.filter((c) => c.decisionRole === "economic");

  return {
    covered: DECISION_ROLES.filter((r) => r !== "unknown" && byRole.has(r)),
    missing: REQUIRED_ROLES.filter((r) => !byRole.has(r)),
    blockers: active.filter((c) => c.decisionRole === "blocker"),
    coaches,
    economicBuyerUnreachable:
      economic.length === 0 || !anyPathExists(coaches, economic, relations, new Set(active.map((c) => c.id))),
  };
}

/**
 * Is any economic buyer reachable from any coach?
 *
 * Traversal is undirected and skips `opposed_to`: an introduction travels along
 * a relationship in either direction, but not through someone who is against
 * the deal. Edges touching an inactive contact are dropped for the same reason
 * inactive contacts are not coverage.
 */
function anyPathExists(
  from: readonly ContactNode[],
  to: readonly ContactNode[],
  relations: readonly RelationEdge[],
  activeIds: ReadonlySet<string>,
): boolean {
  if (from.length === 0 || to.length === 0) return false;

  const adjacency = new Map<string, string[]>();
  for (const e of relations) {
    if (e.relationType === "opposed_to") continue;
    if (!activeIds.has(e.fromContactId) || !activeIds.has(e.toContactId)) continue;
    push(adjacency, e.fromContactId, e.toContactId);
    push(adjacency, e.toContactId, e.fromContactId);
  }

  const targets = new Set(to.map((c) => c.id));
  const seen = new Set<string>();
  const queue = from.map((c) => c.id);

  while (queue.length > 0) {
    const id = queue.shift()!;
    if (targets.has(id)) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const next of adjacency.get(id) ?? []) if (!seen.has(next)) queue.push(next);
  }
  return false;
}

function push(map: Map<string, string[]>, key: string, value: string): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}
