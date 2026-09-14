"use server";

import { revalidatePath } from "next/cache";
import { resolveAppSession } from "../lib/session";
import {
  moveContractType,
  removeContractType,
  upsertContractType,
} from "../../domains/pipeline/service";
import type { ContractTypeRecord } from "../../domains/pipeline/store";
import type { MoveDirection } from "../../domains/shared/ordering";

/* 签约类型目录的写入路径 (incr/0067).
 *
 * Gated on `pipeline.opportunityconfig.manage` inside the service - the one
 * permission all of /admin/opportunity's sections share since incr/0063.
 * Returns the violation CODE, never its sentence (TD-010).
 */
export type ContractTypeResult = { ok: boolean; error?: string; contractType?: ContractTypeRecord };

function context(session: NonNullable<Awaited<ReturnType<typeof resolveAppSession>>>) {
  return {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: session.stores.pipeline(),
  };
}

export async function saveContractType(input: {
  code: string;
  name: string;
}): Promise<ContractTypeResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };
  const r = await upsertContractType(context(session), input);
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  revalidatePath("/admin/opportunity");
  return { ok: true, contractType: r.value };
}

export async function moveContractTypeAction(
  contractTypeId: string,
  direction: MoveDirection,
): Promise<ContractTypeResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };
  const r = await moveContractType(context(session), { contractTypeId, direction });
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  revalidatePath("/admin/opportunity");
  return { ok: true };
}

export async function removeContractTypeAction(contractTypeId: string): Promise<ContractTypeResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };
  const r = await removeContractType(context(session), { contractTypeId });
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  revalidatePath("/admin/opportunity");
  return { ok: true };
}
