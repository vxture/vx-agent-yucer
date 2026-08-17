import type { PermCode } from "../../authz/catalog";
import { getEntitlementResolver } from "../../entitlement/resolver";
import { getCopilotStore, getFieldStore } from "../shared/registry";
import { recordProposals } from "../copilot/service";
import type { NewProposal } from "../copilot/store";
import { isOverdue } from "./lib/commitment";
import type { CommitmentRecord } from "./field-store";

// The overdue-commitment sweep (ADR-010 + ADR-006).
//
// WHAT IT DOES NOT DO, AND WHY THAT IS THE DESIGN.
//
// The obvious sweep marks every open, past-due commitment as `missed`. It is
// wrong twice.
//
// First, it destroys the meaning of the column. `missed` currently means
// somebody observed that a promise was not kept. If a timer sets it, `missed`
// degrades into "the clock passed" - and reliability() already derives exactly
// that from `open` plus a due date, so the write would add no information while
// removing the distinction between "we know it did not happen" and "nobody has
// looked".
//
// Second, it is a machine writing a verdict. ADR-003 is explicit that the
// copilot proposes and a human decides, and a promise being broken is precisely
// the sort of judgement a customer will be confronted with.
//
// So the sweep PROPOSES. It files an agent_action in the queue that already
// exists, where someone reads it and decides. Nothing about the commitment
// changes until they do.
//
// SUBJECT TYPE. chk_agent_action_subject allows account / lead / opportunity /
// project / campaign / plan - there is no `commitment`. That constraint is
// respected rather than widened: the thing a human acts on is the deal or the
// customer, and the commitment id travels in the payload. Widening a CHECK to
// avoid writing a payload field would be spending an increment on nothing.

/** Named so a reader of the queue can tell a swept proposal from a model's. */
export const SWEEP_SUBJECT = "svc:commitment-sweep";

/**
 * Exactly what the job needs. Hardcoded rather than borrowed from a role, for
 * the same reason the arda sync subject is: a role would carry a dozen
 * permissions this job has no business holding.
 */
export const SWEEP_PERMISSIONS: readonly PermCode[] = ["copilot.use"];

/** The action type. One value, so the queue can be filtered on it and so the
 * dedup below has something exact to match. */
export const SWEEP_ACTION_TYPE = "chase_overdue_commitment";

export interface SweepLedger {
  /** Open commitments past their due date. */
  overdue: number;
  /** Proposals filed this run. */
  proposed: number;
  /** Overdue commitments that already had an undecided proposal. */
  alreadyQueued: number;
  /** Workspaces the entitlement gate refused. Counted, never omitted. */
  skipped: number;
  failed: number;
}

export interface SweepOptions {
  workspaces: readonly { workspaceId: string }[];
  now?: Date;
}

export async function runCommitmentSweep(options: SweepOptions): Promise<SweepLedger> {
  const now = options.now ?? new Date();
  const field = getFieldStore();
  const copilot = getCopilotStore();
  const resolver = getEntitlementResolver();
  const holder = { permissions: new Set(SWEEP_PERMISSIONS) };

  const ledger: SweepLedger = {
    overdue: 0,
    proposed: 0,
    alreadyQueued: 0,
    skipped: 0,
    failed: 0,
  };

  for (const ws of options.workspaces) {
    try {
      const overdue = await field.listCommitments(ws.workspaceId, { overdueAt: now });
      ledger.overdue += overdue.length;
      if (overdue.length === 0) continue;

      const entitlement = await resolver.resolve(ws.workspaceId);

      // Dedup against what is already waiting for a human. A daily sweep that
      // re-proposed the same broken promise every morning would bury the queue
      // in a week, and a queue nobody can face is a queue nobody reads.
      //
      // Matched on the commitment id in the payload rather than on the subject,
      // because one account can carry several overdue promises and they are
      // different decisions.
      const pending = await copilot.listProposals(ws.workspaceId, { status: "proposed" });
      const queued = new Set<string>();
      for (const p of pending) {
        if (p.actionType !== SWEEP_ACTION_TYPE) continue;
        const id = (p.payload as { commitmentId?: unknown }).commitmentId;
        if (typeof id === "string") queued.add(id);
      }

      const fresh = overdue.filter((c) => !queued.has(c.id));
      ledger.alreadyQueued += overdue.length - fresh.length;
      if (fresh.length === 0) continue;

      const result = await recordProposals(
        {
          workspaceId: ws.workspaceId,
          sub: SWEEP_SUBJECT,
          holder,
          entitlement,
          store: copilot,
        },
        fresh.map((c) => proposalFor(c, now)),
      );

      if (!result.ok) {
        ledger.skipped += 1;
        continue;
      }
      ledger.proposed += result.value.length;
    } catch {
      ledger.failed += 1;
    }
  }

  return ledger;
}

const DAY = 86_400_000;

function proposalFor(c: CommitmentRecord, now: Date): NewProposal {
  const days = Math.floor((now.getTime() - c.dueAt.getTime()) / DAY);
  return {
    sessionId: null,
    actionType: SWEEP_ACTION_TYPE,
    // The deal when there is one, otherwise the customer. Both are values the
    // subject CHECK allows.
    subjectType: c.opportunityId ? "opportunity" : "account",
    subjectId: c.opportunityId ?? c.accountId,
    payload: {
      commitmentId: c.id,
      direction: c.direction,
      statement: c.statement,
      dueAt: c.dueAt.toISOString(),
      daysOverdue: days,
      accountId: c.accountId,
    },
    // Facts only, in the order a reader needs them. No recommendation about
    // what to do - the sweep knows a date passed, it does not know whether the
    // customer is stalling or on holiday, and a proposal that guessed would
    // teach people to stop reading the rationale.
    rationale:
      c.direction === "they_owe"
        ? `They promised: ${c.statement}. Due ${c.dueAt.toISOString().slice(0, 10)}, ${days} days ago, and nothing recorded has closed it.`
        : `We promised: ${c.statement}. Due ${c.dueAt.toISOString().slice(0, 10)}, ${days} days ago, and nothing recorded has closed it.`,
    // NULL, deliberately. Confidence is a model's report on its own output; a
    // rule that fired on a date comparison has none. Writing 100 here would
    // make a deterministic derivation indistinguishable from a model that was
    // very sure, and the queue sorts and filters on this field.
    confidence: null,
  };
}

/**
 * Whether a commitment is in scope for the sweep. Exported so the rule the job
 * uses and the rule the UI shows are the same one.
 */
export function sweepable(c: CommitmentRecord, now: Date): boolean {
  return isOverdue({ status: c.status, dueAt: c.dueAt }, now);
}
