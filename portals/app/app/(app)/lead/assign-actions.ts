"use server";

import { revalidatePath } from "next/cache";
import { resolveAppSession } from "../lib/session";
import { getPlanningStore } from "../../domains/shared/registry";
import { assignLead, createLead, previewRouting } from "../../domains/signal/service";
import { listTerritories } from "../../domains/planning/service";
import { listAccounts } from "../../domains/account/service";
import { analyseRouting, type RoutingAdvice } from "../../domains/signal/lib/routing-advice";

// 线索分派 - a button-level function of 线索管理, not a module (owner,
// 2026-09-06: 线索管理为基础，应该包括进去线索分派…无需过度拆分).
//
// It was its own page for one afternoon. Assigning is one column on a lead
// (`owner_sub`) and one question - "who works this" - and a whole module for
// one column split the lead's own page in two: you judged a lead in one place
// and handed it over in another.

/**
 * Hand one lead to one person.
 *
 * ONE AT A TIME, and that is the design rather than a limitation. A "route
 * everything" button moves dozens of leads on a click with no record of which
 * the person actually looked at - and the owner of a lead is who gets asked
 * about it, so this is dozens of individual decisions wearing the costume of
 * a batch.
 */
export async function applyAssignment(input: {
  leadId: string;
  ownerSub: string;
}): Promise<{ ok: boolean; error?: string }> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };

  const result = await assignLead(
    {
      workspaceId: session.workspaceId,
      sub: session.user.sub,
      holder: session.authz,
      entitlement: session.entitlement,
      store: session.stores.signal(),
    },
    input.leadId,
    input.ownerSub,
  );

  if (!result.ok) return { ok: false, error: result.violations[0]?.code ?? "denied" };
  revalidatePath("/lead");
  return { ok: true };
}


/** One proposed move, in the shape the panel renders. */
export interface AssignmentProposal {
  readonly leadId: string;
  readonly leadNo: string;
  readonly companyName: string;
  readonly currentOwner: string | null;
  readonly suggestedOwner: string;
  readonly region: string;
  readonly territoryName: string;
  readonly contenders: number;
  readonly load: number;
}

/**
 * 智能分配 - run the router on demand and hand back what it proposes.
 *
 * ON DEMAND, NOT ON RENDER (owner, 2026-09-06). The page is a list of leads;
 * the analysis is something somebody ASKS for, and its result belongs in the
 * assistant rather than spread across the page as extra columns and charts.
 *
 * IT PROPOSES AND STOPS. Nothing here writes: every move still goes through
 * applyAssignment one lead at a time, because the machine proposes and a
 * person decides (ADR-003). Returning a list is the whole of this action.
 *
 * RECOMPUTED, NOT REPLAYED. It re-reads territories, accounts and leads each
 * time, so 重新分析 answers with today's facts rather than re-rendering the
 * snapshot the page was built from - which is the only thing that makes
 * "analyse again" different from "look again".
 *
 * ONLY THE ROWS THAT WOULD MOVE. A lead already sitting with the person the
 * rule would choose is not a proposal, and one the rule cannot place is not
 * one either - those are holes in the territory map, and they are reported as
 * findings beside this list rather than as moves nobody can accept.
 */
export async function analyseAssignments(): Promise<{
  ok: boolean;
  error?: string;
  proposals?: AssignmentProposal[];
  /** What the analysis could NOT propose, and why - one result, not two
   * panels. A lead nobody can place is a hole in the territory map, and
   * reporting it as a move nobody can accept would be worse than silence. */
  findings?: RoutingAdvice[];
}> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };

  const base = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
  };

  const [territories, accounts] = await Promise.all([
    listTerritories({ ...base, store: getPlanningStore() }),
    listAccounts({ ...base, store: session.stores.account() }),
  ]);
  // A PARTIAL MAP IS WORSE THAN NO ANSWER. Territories ARE the rule here, so
  // routing against half of them would propose moves computed from ground the
  // reader cannot see - and this action's whole output is proposals somebody
  // is about to accept.
  if (!territories.ok) return { ok: false, error: territories.violations[0]?.code ?? "denied" };
  if (!accounts.ok) return { ok: false, error: accounts.violations[0]?.code ?? "denied" };

  const regionOf = new Map(accounts.value.map((a) => [a.id, a.region]));
  const plan = await previewRouting(
    { ...base, store: session.stores.signal() },
    territories.value,
    regionOf,
  );
  if (!plan.ok) return { ok: false, error: plan.violations[0]?.code ?? "denied" };

  const proposals = plan.value.flatMap((p) =>
    p.outcome.kind === "assigned" && p.outcome.ownerSub !== p.currentOwner
      ? [
          {
            leadId: p.leadId,
            leadNo: p.leadNo,
            companyName: p.companyName,
            currentOwner: p.currentOwner,
            suggestedOwner: p.outcome.ownerSub,
            region: p.outcome.basis.region,
            territoryName: p.outcome.basis.territoryName,
            contenders: p.outcome.basis.contenders,
            load: p.outcome.basis.load,
          },
        ]
      : [],
  );

  const findings = analyseRouting(
    plan.value.map((p) => ({
      currentOwner: p.currentOwner,
      suggestedOwner: p.outcome.kind === "assigned" ? p.outcome.ownerSub : null,
      unroutableReason: p.outcome.kind === "unroutable" ? p.outcome.reason : null,
      region: p.region,
    })),
    // `pending_assignments` is dropped here: the proposals ARE the pending
    // ones, listed right above with a button each. Saying "2 are waiting" over
    // a list of 2 waiting things is the page counting itself.
  ).filter((f) => f.kind !== "pending_assignments");

  return { ok: true, proposals, findings };
}


/** 添加线索 - the hand-entered lead. See createLead for why it arrives
 * unowned, unscored and with no campaign. */
export async function saveLead(input: {
  companyName: string;
  contactName: string | null;
  accountId: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };

  const r = await createLead(
    {
      workspaceId: session.workspaceId,
      sub: session.user.sub,
      holder: session.authz,
      entitlement: session.entitlement,
      store: session.stores.signal(),
    },
    input,
  );
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  revalidatePath("/lead");
  return { ok: true };
}
