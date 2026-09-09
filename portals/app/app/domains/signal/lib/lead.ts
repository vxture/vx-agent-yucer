import { fail, ok, violation, type RuleResult } from "../../shared/result";

// Moving a lead along its own lifecycle: new -> working -> qualified, plus the
// two ends it can fall out at.
//
// CONVERSION IS NOT HERE. `planConversion` (pipeline/lib/attribution.ts) owns
// the step from qualified to an opportunity, because that step is about
// ATTRIBUTION - which campaign gets the credit, frozen at the moment of
// handover. This file is about the step before it: whether a lead is ready to
// be called qualified at all.
//
// THE TWO PAGES USED TO BE UNRELATED, and the owner closed that on 2026-09-06.
// 线索分派 writes `ownerSub`; 商机智探 walks the status. Nothing joined them,
// so a lead could go new -> qualified -> converted having never been assigned
// to anybody - the routing page was a tool you could simply not use, and the
// queue it drew was advisory in the weakest sense.
//
// The join is at QUALIFY rather than at convert, which is a decision worth
// stating: qualifying is the judgement ("this is real, we should pursue it"),
// and a judgement nobody owns is a judgement nobody made. Catching it at
// conversion instead would let a lead accumulate a whole history of unowned
// decisions and then refuse at the last step, which is the expensive place to
// find out.

export type LeadStage = "new" | "working" | "qualified" | "disqualified";

export interface AdvancingLead {
  readonly id: string;
  readonly status: string;
  /** Who the lead was assigned to - null until 线索分派 has placed it. */
  readonly ownerSub: string | null;
}

/**
 * Can this lead move to `to`?
 *
 * Pure: the service reads, this decides, the store writes.
 */
export function planLeadAdvance(lead: AdvancingLead, to: LeadStage): RuleResult<{ status: LeadStage }> {
  // A converted lead already produced an opportunity. Moving it again would
  // let one piece of demand be counted twice.
  if (lead.status === "converted") {
    return fail(violation("lead_converted", "a converted lead is final", "status"));
  }

  // AN UNOWNED LEAD CANNOT BE QUALIFIED (owner, 2026-09-06).
  //
  // Only this one transition is gated. Working an unowned lead is fine - that
  // is somebody picking it up before the paperwork catches up - and
  // disqualifying one is fine too, because "this is not real" is a conclusion
  // that needs no owner and refusing it would trap junk in the queue.
  if (to === "qualified" && !lead.ownerSub) {
    return fail(
      violation(
        // NOT `owner_required`, which already exists in this domain and
        // means "the assignment you just made names nobody". Same words,
        // opposite subject: that one is about the input to an assign, this is
        // about a lead having none. One code, one sentence - reusing it would
        // have rendered "分派必须指到具体的人" at somebody trying to qualify.
        "lead_unowned",
        "a lead nobody owns cannot be qualified - assign it first",
        "ownerSub",
      ),
    );
  }

  return ok({ status: to });
}

/**
 * May this lead be deleted outright?
 *
 * DELETION IS FOR RECORDS THAT SHOULD NEVER HAVE EXISTED - a duplicate, a
 * mis-typed company, a test row. It is NOT how a lead ends: a lead that was
 * real and went nowhere is `disqualified`, which keeps the record and the
 * reason. Deleting those would erase the denominator every funnel number is
 * measured against, and next quarter's "we qualified 60%" would be counted
 * against whatever survived.
 *
 * A CONVERTED LEAD CANNOT BE DELETED, and that one is not a preference. The
 * opportunity it produced carries attribution copied from it at conversion and
 * frozen there (ADR-016); the lead is the only record of where that came from.
 * Deleting it leaves a deal whose provenance cannot be checked by anybody,
 * ever - which is exactly what the frozen keys exist to prevent.
 */
export function planLeadDeletion(lead: AdvancingLead): RuleResult<{ id: string }> {
  if (lead.status === "converted") {
    return fail(
      violation(
        "lead_converted",
        "a converted lead is the only record of where its deal came from",
        "status",
      ),
    );
  }
  return ok({ id: lead.id });
}
