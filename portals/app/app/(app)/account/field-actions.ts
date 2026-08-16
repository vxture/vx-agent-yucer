"use server";

import { revalidatePath } from "next/cache";
import { resolveAppSession } from "../lib/session";
import { getFieldStore } from "../../domains/shared/registry";
import {
  closeCommitment,
  createCommitment,
  recordInteraction,
} from "../../domains/account/field-service";
import { isChannel, isDirection } from "../../domains/account/lib/commitment";

// The evidence plane's write paths.
//
// The actor and the waiver are NOT in these signatures. Both come from the
// session inside the service: an interaction that could name someone else as
// its author is not evidence, and a caller who could name the waiver could sign
// off someone else's decision to let a promise go.

export interface FieldResult {
  ok: boolean;
  error?: string;
}

/**
 * Every surface that reads the evidence plane, invalidated together.
 *
 * Capture happens on two pages and is read on four. Revalidating only the page
 * the form sits on is how a rep records a call and then sees the account list
 * still claiming last contact was six weeks ago - which teaches them the form
 * does not work, and the kill criterion measures exactly that lesson.
 */
function revalidateField(accountId: string, opportunityId?: string | null): void {
  revalidatePath(`/account/${accountId}`);
  revalidatePath("/account");
  if (opportunityId) revalidatePath(`/pipeline/${opportunityId}`);
}

function ctx(session: NonNullable<Awaited<ReturnType<typeof resolveAppSession>>>) {
  return {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: getFieldStore(),
  };
}

/** Recording a follow-up. One dump, no fields beyond what it happened through. */
export async function recordFollowUp(
  accountId: string,
  input: { channel: string; occurredAt: string; rawNote: string; opportunityId?: string },
): Promise<FieldResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };
  if (!isChannel(input.channel)) return { ok: false, error: "unknown_channel" };

  const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();
  if (Number.isNaN(occurredAt.getTime())) return { ok: false, error: "date_invalid" };

  const r = await recordInteraction(ctx(session), {
    accountId,
    channel: input.channel,
    occurredAt,
    rawNote: input.rawNote,
    opportunityId: input.opportunityId || null,
    captureMode: "manual",
  });
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };

  // Health reads lastInteractionAt, so the account list moves too - not only
  // the page the form is on. And when the follow-up was recorded from a deal,
  // that deal's page is the one the rep is looking at.
  revalidateField(accountId, input.opportunityId);
  return { ok: true };
}

export async function addCommitment(
  accountId: string,
  input: { direction: string; statement: string; dueAt: string; opportunityId?: string },
): Promise<FieldResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };
  if (!isDirection(input.direction)) return { ok: false, error: "unknown_direction" };

  const dueAt = new Date(input.dueAt);
  if (Number.isNaN(dueAt.getTime())) return { ok: false, error: "date_invalid" };

  const r = await createCommitment(ctx(session), {
    accountId,
    direction: input.direction,
    statement: input.statement,
    dueAt,
    opportunityId: input.opportunityId || null,
  });
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };

  revalidateField(accountId, input.opportunityId);
  return { ok: true };
}

/**
 * Closing one.
 *
 * `met` carries the interaction that proves it. The form cannot submit without
 * one, and if it somehow did, the rule and then the database would both refuse.
 */
export async function settleCommitment(
  accountId: string,
  id: string,
  input: { to: string; evidenceInteractionId?: string; waiveReason?: string; opportunityId?: string },
): Promise<FieldResult> {
  const opportunityId = input.opportunityId;
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };

  const to = input.to;
  if (to !== "met" && to !== "missed" && to !== "waived") {
    return { ok: false, error: "unknown_status" };
  }

  const r = await closeCommitment(ctx(session), id, {
    to,
    evidence:
      to === "met" && input.evidenceInteractionId
        ? { kind: "interaction", id: input.evidenceInteractionId }
        : undefined,
    waiveReason: input.waiveReason,
  });
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };

  revalidateField(accountId, opportunityId);
  return { ok: true };
}
