// The deal brief: every rule this product holds about ONE deal, converged into
// one ranked verdict - the war-room ruling of 2026-09-05.
//
// WHAT WAS WRONG BEFORE THIS FILE. The rules already existed and already
// answered "what should happen next": suggestCategory could catch a rep
// contradicting themselves, isOverdue knew which promises were broken,
// analyzeChain knew nobody could reach the buyer, needsApproval knew a line
// was under the floor. But each answer lived where it was COMPUTED - the
// forecast review page, the commitment list, the chain panel - and the deal
// page, where the decisions actually get made, showed panels of data and let
// the person do the convergence in their head. Intelligence at report time,
// none at decision time.
//
// THIS FUNCTION IS THE CONVERGENCE POINT. It calls the existing rules - it
// re-implements none of them - and returns two things:
//
//   cells    the verdict strip: five dimensions, each with a tone and the
//            reason in the rule's own terms. The page-level "how is this deal"
//            answered at a glance.
//   actions  the next-best-actions: every red/amber finding that has a
//            LEGITIMATE one-click response, described as data (kind + params).
//            The UI maps each kind to a server action that already exists and
//            already carries its own gates; this file knows nothing about UI.
//
// WHAT AN ACTION IS ALLOWED TO BE. Only something the product already lets a
// person do deliberately: apply the rule's forecast category, settle a
// commitment, approve a below-floor line, adjudicate a queued proposal, state
// a buying role. The brief NEVER proposes what the rules cannot justify - no
// invented urgency, no "reach out" fluff - and every action carries the
// finding's reason, because a recommendation without a reason is an order
// (the AssistPanel contract, at operation scale).
//
// Pure function. Inputs are rows the deal page already loads; tests need no
// store and no clock games beyond passing `now`.

import { isOverdue, type CommitmentDirection, type CommitmentStatus } from "../../account/lib/commitment";
import type { ChainCoverage } from "../../account/lib/health";
import { daysAtStage, suggestCategory, STALL_DAYS, type CategorizableDeal } from "./forecast-rule";
import type { ForecastCategory } from "./forecast";
import { OPEN_STAGE_ORDER, type Stage } from "./stage";

export type BriefTone = "good" | "warn" | "bad";

export interface BriefCell {
  readonly key: "stage" | "forecast" | "chain" | "commitment" | "price";
  readonly tone: BriefTone;
  /** The finding, one line, already in business terms. */
  readonly headline: string;
  /** The evidence, in the underlying rule's own terms. */
  readonly detail: string;
}

/**
 * A one-click response the product can already justify. `kind` + params only:
 * the UI decides which server action answers each kind, and that action
 * re-runs its own gates - the brief RANKS, it never authorises.
 */
export type BriefAction =
  | {
      readonly kind: "apply_category";
      readonly to: ForecastCategory;
      readonly severity: BriefTone;
      readonly reason: string;
    }
  | {
      readonly kind: "settle_commitment";
      readonly commitmentId: string;
      readonly statement: string;
      readonly direction: CommitmentDirection;
      readonly overdueDays: number;
      readonly severity: BriefTone;
      readonly reason: string;
    }
  | {
      readonly kind: "approve_discount";
      readonly pendingLines: number;
      readonly severity: BriefTone;
      readonly reason: string;
    }
  | {
      readonly kind: "state_roles";
      readonly missing: readonly string[];
      readonly severity: BriefTone;
      readonly reason: string;
    }
  | {
      readonly kind: "adjudicate";
      readonly proposalIds: readonly string[];
      readonly severity: BriefTone;
      readonly reason: string;
    };

export interface DealBriefInput {
  readonly deal: CategorizableDeal & { readonly status: string };
  /** This deal's chain, already resolved per-deal (chainForOpportunity). */
  readonly chain: ChainCoverage | null;
  /** Whether anyone has stated a role ON THIS DEAL at all. */
  readonly rolesStated: boolean;
  readonly commitments: readonly {
    readonly id: string;
    readonly direction: CommitmentDirection;
    readonly status: CommitmentStatus;
    readonly dueAt: Date;
    readonly statement: string;
  }[];
  readonly lines: readonly { readonly needsApproval: boolean; readonly approved: boolean }[];
  /** Queued copilot proposals whose subject is this deal. */
  readonly proposals: readonly { readonly id: string; readonly title: string }[];
  readonly text: BriefText;
  readonly now: Date;
}

/**
 * Every sentence the brief emits, injected. The rule layer's own messages are
 * for its own reader (TD-010); what a PERSON sees comes from the dictionary,
 * so the brief takes the sentences as input and stays translation-free.
 */
export interface BriefText {
  stageMoving(stage: string, days: number | null): string;
  stageStalled(stage: string, days: number): string;
  stageTerminal(stage: string): string;
  forecastAgrees(category: string): string;
  forecastDisagrees(filed: string, suggested: string): string;
  forecastSettled: string;
  forecastWhy(caps: readonly string[], probability: number, isHuman: boolean): string;
  chainHealthy(coaches: number): string;
  chainMissing(roles: readonly string[]): string;
  chainUnreachable: string;
  chainUnstated: string;
  commitmentClear(open: number): string;
  commitmentOverdue(ours: number, theirs: number): string;
  priceClean(lines: number): string;
  pricePending(pending: number): string;
  settleReason(direction: CommitmentDirection, days: number): string;
  applyCategoryReason(basis: string): string;
  approveReason(pending: number): string;
  stateRolesReason: string;
  adjudicateReason(count: number): string;
}

export interface DealBrief {
  readonly cells: readonly BriefCell[];
  /** Ranked worst-first; ties keep input order (commitments by due date). */
  readonly actions: readonly BriefAction[];
}

const DAY = 86_400_000;

export function dealBrief(input: DealBriefInput): DealBrief {
  const { deal, chain, commitments, lines, proposals, text, now } = input;
  const cells: BriefCell[] = [];
  const actions: BriefAction[] = [];
  const terminal = deal.status !== "open";

  // --- stage ---------------------------------------------------------------
  const days = daysAtStage(deal, now);
  const stalled = !terminal && days !== null && days > STALL_DAYS;
  cells.push({
    key: "stage",
    tone: terminal ? "good" : stalled ? "bad" : "good",
    headline: terminal
      ? text.stageTerminal(deal.stage)
      : stalled
        ? text.stageStalled(deal.stage, days)
        : text.stageMoving(deal.stage, days),
    detail: stageDetail(deal.stage),
  });

  // --- forecast ------------------------------------------------------------
  // The rule that can catch a person contradicting THEMSELVES - a human 35%
  // on a deal filed as commit. It ran only on the forecast review page until
  // now; the deal page is where the category is actually chosen.
  const verdict = suggestCategory(deal, now);
  if (verdict.kind === "settled") {
    cells.push({ key: "forecast", tone: "good", headline: text.forecastSettled, detail: "" });
  } else {
    const capNames = verdict.basis.caps;
    const detail = text.forecastWhy(capNames, verdict.basis.probability, verdict.basis.probabilityIsHuman);
    if (verdict.agrees) {
      cells.push({
        key: "forecast",
        tone: "good",
        headline: text.forecastAgrees(deal.forecastCategory),
        detail,
      });
    } else {
      cells.push({
        key: "forecast",
        tone: "warn",
        headline: text.forecastDisagrees(deal.forecastCategory, verdict.category),
        detail,
      });
      actions.push({
        kind: "apply_category",
        to: verdict.category,
        severity: "warn",
        reason: text.applyCategoryReason(detail),
      });
    }
  }

  // --- chain ---------------------------------------------------------------
  if (!terminal) {
    if (!input.rolesStated) {
      // Nothing stated ON THIS DEAL. Since incr/0027 there is no customer-level
      // fallback, so "unknown everywhere" is a true statement about this deal -
      // and the action is to go say who is who, not to pretend coverage.
      cells.push({ key: "chain", tone: "bad", headline: text.chainUnstated, detail: "" });
      actions.push({
        kind: "state_roles",
        missing: chain?.missing ?? [],
        severity: "bad",
        reason: text.stateRolesReason,
      });
    } else if (chain) {
      const tone: BriefTone =
        chain.missing.length > 0 || chain.economicBuyerUnreachable
          ? chain.economicBuyerUnreachable
            ? "bad"
            : "warn"
          : "good";
      cells.push({
        key: "chain",
        tone,
        headline:
          tone === "good"
            ? text.chainHealthy(chain.coaches.length)
            : chain.economicBuyerUnreachable
              ? text.chainUnreachable
              : text.chainMissing(chain.missing),
        detail: "",
      });
      if (tone !== "good") {
        actions.push({
          kind: "state_roles",
          missing: chain.missing,
          severity: tone,
          reason: chain.economicBuyerUnreachable ? text.chainUnreachable : text.stateRolesReason,
        });
      }
    }
  }

  // --- commitments ---------------------------------------------------------
  const open = commitments.filter((c) => c.status === "open");
  const overdue = open
    .filter((c) => isOverdue(c, now))
    .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
  const oursLate = overdue.filter((c) => c.direction === "we_owe").length;
  const theirsLate = overdue.length - oursLate;
  cells.push({
    key: "commitment",
    tone: overdue.length === 0 ? "good" : oursLate > 0 ? "bad" : "warn",
    headline:
      overdue.length === 0 ? text.commitmentClear(open.length) : text.commitmentOverdue(oursLate, theirsLate),
    detail: "",
  });
  for (const c of overdue) {
    const lateDays = Math.floor((now.getTime() - c.dueAt.getTime()) / DAY);
    actions.push({
      kind: "settle_commitment",
      commitmentId: c.id,
      statement: c.statement,
      direction: c.direction,
      overdueDays: lateDays,
      // OURS is the worse colour: a promise WE broke is in our hands to fix,
      // and it is what the reliability figure debits.
      severity: c.direction === "we_owe" ? "bad" : "warn",
      reason: text.settleReason(c.direction, lateDays),
    });
  }

  // --- price ---------------------------------------------------------------
  const pending = lines.filter((l) => l.needsApproval && !l.approved).length;
  cells.push({
    key: "price",
    tone: pending === 0 ? "good" : "warn",
    headline: pending === 0 ? text.priceClean(lines.length) : text.pricePending(pending),
    detail: "",
  });
  if (pending > 0) {
    actions.push({
      kind: "approve_discount",
      pendingLines: pending,
      severity: "warn",
      reason: text.approveReason(pending),
    });
  }

  // --- queued proposals ----------------------------------------------------
  // Not a cell: proposals are the machine's findings, and the strip is the
  // rules'. They join the ACTION list because adjudicating them is a thing a
  // person can do here, one click, without leaving the deal.
  if (proposals.length > 0) {
    actions.push({
      kind: "adjudicate",
      proposalIds: proposals.map((p) => p.id),
      severity: "warn",
      reason: text.adjudicateReason(proposals.length),
    });
  }

  // Worst first. Within a severity the push order above is already the
  // business order: forecast self-contradiction, then the chain, then broken
  // promises oldest-first, then money, then the machine's queue.
  const rank: Record<BriefTone, number> = { bad: 0, warn: 1, good: 2 };
  return {
    cells,
    actions: [...actions].sort((a, b) => rank[a.severity] - rank[b.severity]),
  };
}

/** Where this stage sits on the road, for the strip's detail line. */
function stageDetail(stage: Stage): string {
  const i = OPEN_STAGE_ORDER.indexOf(stage);
  return i === -1 ? "" : `${i + 1}/${OPEN_STAGE_ORDER.length}`;
}
