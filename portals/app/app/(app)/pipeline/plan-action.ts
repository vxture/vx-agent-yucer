"use server";

import { revalidatePath } from "next/cache";
import { resolveAppSession } from "../lib/session";
import { draftPlan, type PlanDraftResult } from "./plan-draft";

/** 生成计划草案 - a person asked for a plan draft (deal batch 5c). */
export async function generatePlanAction(opportunityId: string): Promise<PlanDraftResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };
  const r = await draftPlan(session, opportunityId);
  if (r.ok) revalidatePath(`/pipeline/${opportunityId}`);
  return r;
}
