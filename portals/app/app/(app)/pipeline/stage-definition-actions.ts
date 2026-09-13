"use server";

import { revalidatePath } from "next/cache";
import { resolveAppSession } from "../lib/session";
import {
  moveStageDefinition,
  removeStageDefinition,
  upsertStageDefinition,
} from "../../domains/pipeline/service";
import type { MoveDirection } from "../../domains/shared/ordering";

/* 商机阶段目录的写入路径 (incr/0057-0059).
 *
 * Gated on `pipeline.stage.manage` inside the service - a dedicated
 * permission, not `pipeline.write`, because redefining the catalog is a
 * workspace-wide commitment rather than a rep's own deal. Returns the
 * violation CODE, never its sentence (TD-010).
 */
export type StageDefinitionResult = { ok: boolean; error?: string };

function context(session: NonNullable<Awaited<ReturnType<typeof resolveAppSession>>>) {
  return {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: session.stores.pipeline(),
  };
}

export async function saveStageDefinition(input: {
  code: string;
  name: string;
  defaultProbability: number;
  isWon: boolean;
  isTerminal: boolean;
}): Promise<StageDefinitionResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };
  const r = await upsertStageDefinition(context(session), input);
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  revalidatePath("/admin/opportunity");
  return { ok: true };
}

export async function moveStageDefinitionAction(
  stageId: string,
  direction: MoveDirection,
): Promise<StageDefinitionResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };
  const r = await moveStageDefinition(context(session), { stageId, direction });
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  revalidatePath("/admin/opportunity");
  return { ok: true };
}

export async function removeStageDefinitionAction(stageId: string): Promise<StageDefinitionResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };
  const r = await removeStageDefinition(context(session), { stageId });
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  revalidatePath("/admin/opportunity");
  return { ok: true };
}
