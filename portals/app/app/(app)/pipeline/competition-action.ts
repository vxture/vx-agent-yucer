"use server";

import { revalidatePath } from "next/cache";
import { resolveAppSession } from "../lib/session";
import {
  recordCompetitor,
  removeDecisionCriterion,
  saveDecisionCriterion,
} from "../../domains/pipeline/service";
import { listInteractions } from "../../domains/account/field-service";
import { getFieldStore } from "../../domains/shared/registry";

// 竞争位置 (incr/0094, deal batch 7b): the deal page's three writes. Each one
// re-runs its gate in the service (pipeline.competition.record); what may be
// cited is this deal's follow-ups, read through the field domain's own verb -
// the evidence-action.ts pattern.

type Result = { ok: boolean; error?: string };

async function base() {
  const session = await resolveAppSession();
  if (!session) return null;
  return {
    session,
    ctx: {
      workspaceId: session.workspaceId,
      sub: session.user.sub,
      holder: session.authz,
      entitlement: session.entitlement,
    },
  };
}

export async function recordCompetitorAction(
  opportunityId: string,
  input: { competitorId?: string | null; competitorName?: string; isIncumbent?: boolean; present?: boolean; interactionId?: string | null },
): Promise<Result> {
  const b = await base();
  if (!b) return { ok: false, error: "not_authenticated" };
  const notes = input.interactionId
    ? await listInteractions({ ...b.ctx, store: getFieldStore() }, { opportunityId, limit: 200 })
    : null;
  const citable = new Set(notes?.ok ? notes.value.map((n) => n.id) : []);
  const r = await recordCompetitor({ ...b.ctx, store: b.session.stores.pipeline() }, opportunityId, input, citable);
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  revalidatePath(`/pipeline/${opportunityId}`);
  return { ok: true };
}

export async function saveCriterionAction(
  opportunityId: string,
  input: { id?: string | null; statement: string; shapedBy?: string; fit?: string | null; fitNote?: string | null },
): Promise<Result> {
  const b = await base();
  if (!b) return { ok: false, error: "not_authenticated" };
  const r = await saveDecisionCriterion({ ...b.ctx, store: b.session.stores.pipeline() }, opportunityId, input);
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  revalidatePath(`/pipeline/${opportunityId}`);
  return { ok: true };
}

export async function removeCriterionAction(opportunityId: string, id: string): Promise<Result> {
  const b = await base();
  if (!b) return { ok: false, error: "not_authenticated" };
  const r = await removeDecisionCriterion({ ...b.ctx, store: b.session.stores.pipeline() }, opportunityId, id);
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  revalidatePath(`/pipeline/${opportunityId}`);
  return { ok: true };
}
