"use server";
import { revalidatePath } from "next/cache";
import { resolveFreshAppSession } from "../lib/session";
import { recordCooperationHistory } from "../../domains/account/cooperation-service";
import type { CooperationInput } from "../../domains/account/lib/cooperation";

export async function saveCooperationHistory(
  accountId: string,
  input: CooperationInput,
) {
  const session = await resolveFreshAppSession();
  if (!session) return { ok: false as const, error: "signed_out" };
  try {
    const result = await recordCooperationHistory(
      {
        workspaceId: session.workspaceId,
        sub: session.user.sub,
        holder: session.authz,
        entitlement: session.entitlement,
        store: session.stores.account(),
        pipeline: session.stores.pipeline(),
      },
      accountId,
      input,
    );
    if (!result.ok)
      return {
        ok: false as const,
        error: result.violations[0]?.code ?? "invalid_input",
      };
    revalidatePath("/attainment");
    revalidatePath(`/account/${accountId}`);
    return { ok: true as const };
  } catch {
    return { ok: false as const, error: "save_failed" };
  }
}

export async function saveCustomerActionResult(
  input: import("../../domains/planning/action-result").PlanActionResultInput,
) {
  const session = await resolveFreshAppSession();
  if (!session) return { ok: false as const, error: "signed_out" };
  try {
    const { recordPlanActionResult } =
      await import("../../domains/planning/action-result");
    const { getSalesPlanStore } = await import("../../domains/shared/registry");
    await recordPlanActionResult(
      {
        workspaceId: session.workspaceId,
        sub: session.user.sub,
        holder: session.authz,
        entitlement: session.entitlement,
        scope: session.scope,
        store: getSalesPlanStore(),
        accounts: session.stores.account(),
      },
      input,
    );
    revalidatePath("/attainment");
    revalidatePath(`/named/${input.accountId}`);
    return { ok: true as const };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error && error.message === "request_conflict"
          ? "request_conflict"
          : "save_failed",
    };
  }
}
