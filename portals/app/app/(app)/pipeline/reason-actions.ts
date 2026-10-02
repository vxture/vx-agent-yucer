"use server";

import { revalidatePath } from "next/cache";
import { resolveAppSession } from "../lib/session";
import {
  moveWinLossReason,
  removeCompetitor,
  removeWinLossReason,
  saveCompetitor,
  upsertWinLossReason,
} from "../../domains/pipeline/service";
import type { MoveDirection } from "../../domains/shared/ordering";

/* 赢丢原因的写入路径 (incr/0039).
 *
 * Gated on `pipeline.winloss.record` inside the service, which is the same
 * permission the review itself needs: whoever writes post-mortems says what
 * the reasons are. Returns the violation CODE, never its sentence (TD-010).
 */
export type ReasonResult = { ok: boolean; error?: string };

function context(session: NonNullable<Awaited<ReturnType<typeof resolveAppSession>>>) {
  return {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: session.stores.pipeline(),
  };
}

export async function saveWinLossReason(input: {
  reasonCode: string;
  name: string;
  forWon: boolean;
  forLost: boolean;
}): Promise<ReasonResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };
  const r = await upsertWinLossReason(context(session), input);
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  revalidatePath("/admin/opportunity");
  revalidatePath("/winloss");
  return { ok: true };
}

export async function moveWinLossReasonAction(
  reasonId: string,
  direction: MoveDirection,
): Promise<ReasonResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };
  const r = await moveWinLossReason(context(session), { reasonId, direction });
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  revalidatePath("/admin/opportunity");
  return { ok: true };
}

export async function removeWinLossReasonAction(reasonId: string): Promise<ReasonResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };
  const r = await removeWinLossReason(context(session), { reasonId });
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  revalidatePath("/admin/opportunity");
  return { ok: true };
}

/* 竞争对手 - renamed or removed here. Gated inside the service on
 * `pipeline.opportunityconfig.manage`. A rival any deal or review has named
 * cannot be deleted; the service says so with `competitor_in_use`. */
export async function saveCompetitorAction(input: {
  id: string | null;
  name: string;
  aliases: string[];
}): Promise<ReasonResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };
  const r = await saveCompetitor(context(session), input);
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  revalidatePath("/admin/opportunity");
  return { ok: true };
}

export async function removeCompetitorAction(id: string): Promise<ReasonResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };
  const r = await removeCompetitor(context(session), id);
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  revalidatePath("/admin/opportunity");
  return { ok: true };
}
