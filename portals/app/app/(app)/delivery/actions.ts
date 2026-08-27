"use server";

import { revalidatePath } from "next/cache";
import { resolveAppSession } from "../lib/session";
import { getDeliveryStore } from "../../domains/shared/registry";
import {
  reconcileProjectHealth,
  transitionInstalment,
} from "../../domains/delivery/service";
import { money } from "../../domains/shared/money";
import {
  REVENUE_STATUSES,
  type RevenueStatus,
} from "../../domains/delivery/lib/revenue";

// Reconciling a project's reported health against what its own rows say.
//
// `deriveProjectHealth` reads the instalments and milestones and returns the
// health they imply; `reported` is what a person typed. The demo data carries
// the case this exists for on purpose - a project reporting GREEN while holding
// an overdue instalment - and until now nothing could resolve it, because the
// verb had no server action and no caller.
//
// THE VERB DOES NOT LIE IN EITHER DIRECTION. It writes only when the derived
// value differs, and it returns `because` - the reason the derivation overrode
// the report - so the interface can say what changed and why rather than just
// repainting a badge.

export interface ReconcileResult {
  ok: boolean;
  health?: string;
  /** True when the stored value actually moved. */
  changed?: boolean;
  /** Why the derivation disagreed with the report. Null when it agreed. */
  because?: string | null;
  error?: string;
}

export async function reconcileHealth(
  projectId: string,
): Promise<ReconcileResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };

  const result = await reconcileProjectHealth(
    {
      workspaceId: session.workspaceId,
      sub: session.user.sub,
      holder: session.authz,
      entitlement: session.entitlement,
      store: getDeliveryStore(),
    },
    projectId,
  );

  if (!result.ok) {
    return { ok: false, error: result.violations.map((v) => v.message).join("; ") };
  }
  revalidatePath("/delivery");
  return {
    ok: true,
    health: result.value.health,
    changed: result.value.changed,
    because: result.value.because,
  };
}

export interface InstalmentResult {
  ok: boolean;
  status?: string;
  error?: string;
}

/**
 * Moving an instalment along the collections machine.
 *
 * `settled` REQUIRES the amount actually received, and that is the rule this
 * whole surface exists to honour. A collections record that assumed the planned
 * amount arrived would report money nobody has - short payment is normal, and
 * the difference between "invoiced 1,000" and "received 850" is the entire
 * value of tracking collections at all.
 */
export async function moveInstalment(input: {
  projectId: string;
  instalmentId: string;
  to: string;
  actualAmount?: number;
  currency?: string;
}): Promise<InstalmentResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };
  if (!(REVENUE_STATUSES as readonly string[]).includes(input.to)) {
    return { ok: false, error: "unknown_status" };
  }

  const result = await transitionInstalment(
    {
      workspaceId: session.workspaceId,
      sub: session.user.sub,
      holder: session.authz,
      entitlement: session.entitlement,
      store: getDeliveryStore(),
    },
    {
      projectId: input.projectId,
      instalmentId: input.instalmentId,
      to: input.to as RevenueStatus,
      ...(input.actualAmount !== undefined
        ? { actualAmount: money(input.actualAmount, input.currency) }
        : {}),
    },
  );

  // The CODE, not the prose - TD-010. The sentence belongs to the dictionary.
  if (!result.ok) {
    return { ok: false, error: result.violations[0]?.code ?? "denied" };
  }
  revalidatePath("/delivery");
  return { ok: true, status: result.value.status };
}
