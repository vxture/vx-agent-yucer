"use server";

import { revalidatePath } from "next/cache";
import { resolveAppSession } from "../lib/session";
import { recordEvidence } from "../../domains/pipeline/service";
import { listInteractions } from "../../domains/account/field-service";
import { getFieldStore } from "../../domains/shared/registry";

// 购买证据槽 (incr/0085): one new version of one slot.
//
// WHAT MAY BE CITED is read here, through the field domain's own gated verb -
// this deal's follow-ups - and handed to the pipeline service, which refuses
// a citation outside that set. A statement grounded in another deal's note
// would be evidence for the wrong pursuit.

export async function recordEvidenceAction(
  opportunityId: string,
  input: { slot: string; statement: string; interactionId?: string | null },
): Promise<{ ok: boolean; error?: string }> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };
  const base = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
  };
  const notes = input.interactionId
    ? await listInteractions({ ...base, store: getFieldStore() }, { opportunityId, limit: 200 })
    : null;
  const citable = new Set(notes?.ok ? notes.value.map((n) => n.id) : []);
  const r = await recordEvidence({ ...base, store: session.stores.pipeline() }, opportunityId, input, citable);
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  revalidatePath(`/pipeline/${opportunityId}`);
  return { ok: true };
}
