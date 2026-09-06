import { worseThan, type ProjectHealth } from "./delivery-stats";

// 交付检查 - what the delivery dock says about the projects being run. Pure:
// the page reads, this decides, the panel renders.
//
// THE FIRST FINDING IS THIS DOMAIN'S WHOLE POINT. A delivery team reports its
// own health; the facts - unpaid instalments, missed milestones - say their
// own thing. When the report is the better of the two, "we are fine" is
// standing next to "they have not paid", which is the most common way a
// failing engagement stays green until it is a crisis.
//
// IT NEVER REPORTS ON ANYONE'S BEHALF. Reconciling recomputes the derived
// reading from facts that already exist, which is why it can be offered as an
// act; changing what the team REPORTED is theirs to do.

export type DeliveryAdviceKind =
  /** The report is rosier than the facts. */
  | "health_downgraded"
  /** A milestone is past its date and not done. */
  | "milestone_late"
  /** Running, and nobody owns it. */
  | "no_manager"
  /** Running with no contract value - nothing to measure delivery against. */
  | "no_contract_amount"
  /** Running with no milestones at all - no plan to be late against. */
  | "no_milestones";

export interface DeliveryAdvice {
  readonly id: string;
  readonly kind: DeliveryAdviceKind;
  readonly projectId: string;
  readonly projectName: string;
  /** How many milestones are late, for the finding that states one. */
  readonly count?: number;
}

export interface DeliveryAdviceRow {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly reported: ProjectHealth;
  readonly derived: ProjectHealth;
  readonly managerSub: string | null;
  readonly contractAmount: number | null;
  /** Milestones past their due date and not completed. */
  readonly lateMilestones: number;
  readonly milestoneCount: number;
}

/** Worst first, so the dock's top item is the one to act on. */
const ORDER: readonly DeliveryAdviceKind[] = [
  "health_downgraded",
  "milestone_late",
  "no_manager",
  "no_milestones",
  "no_contract_amount",
];

export function analyseDelivery(
  rows: readonly DeliveryAdviceRow[],
): readonly DeliveryAdvice[] {
  const out: DeliveryAdvice[] = [];

  for (const r of rows) {
    // FINISHED WORK IS NOT A FINDING. A delivered, closed or cancelled project
    // has no plan left to be late against and no health left to correct;
    // saying anything about it would bury the projects still running.
    if (r.status === "delivered" || r.status === "closed" || r.status === "cancelled") {
      continue;
    }

    const at = (kind: DeliveryAdviceKind, count?: number) =>
      out.push({
        id: `${kind}:${r.id}`,
        kind,
        projectId: r.id,
        projectName: r.name,
        ...(count === undefined ? {} : { count }),
      });

    if (worseThan(r.derived, r.reported)) at("health_downgraded");
    if (r.lateMilestones > 0) at("milestone_late", r.lateMilestones);
    if (r.managerSub === null) at("no_manager");
    if (r.milestoneCount === 0) at("no_milestones");
    // Only said when there ARE milestones: a project with no plan and no
    // figure has one problem, not two, and the plan is the one to fix first.
    else if (r.contractAmount === null) at("no_contract_amount");
  }

  return out.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
}
