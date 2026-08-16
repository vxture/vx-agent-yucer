"use server";

import { revalidatePath } from "next/cache";
import { resolveAppSession } from "../lib/session";
import { getAccountStore } from "../../domains/shared/registry";
import { linkContacts, recomputeHealth } from "../../domains/account/service";
import { isRelationType } from "../../domains/account/lib/health";

// Recomputing an account's health.
//
// health_score is derived, so this reads source data and writes the number. It
// never reads the stored score, which is why a wrong value can only be replaced
// and never compounded.

export interface RecomputeResult {
  ok: boolean;
  error?: string;
  score?: number;
}

export async function recomputeAccountHealth(accountId: string): Promise<RecomputeResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };

  const result = await recomputeHealth(
    {
      workspaceId: session.workspaceId,
      sub: session.user.sub,
      holder: session.authz,
      entitlement: session.entitlement,
      store: getAccountStore(),
    },
    accountId,
  );

  if (!result.ok) return { ok: false, error: result.violations[0]?.code ?? "denied" };
  revalidatePath(`/account/${accountId}`);
  revalidatePath("/account");
  return { ok: true, score: result.value.score };
}

// Recording a relationship.
//
// The decision chain's whole message is REACHABILITY - "there is a buyer on
// file and nobody can introduce you to them". Until now it said that and
// offered nothing to do about it, so the one action that changes the answer was
// unreachable from the product.
//
// The edge is APPEND-ONLY: yucer_core.account_relation has no UPDATE grant, so
// a relationship that changed is a new edge and the old one is deleted or left
// standing. It is never rewritten, because "who reported to whom last quarter"
// is a fact the chain analysis reads.

export interface LinkResult {
  ok: boolean;
  error?: string;
}

export async function linkAccountContacts(
  accountId: string,
  input: { fromContactId: string; toContactId: string; relationType: string },
): Promise<LinkResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };

  // Checked here so an unknown value is a clean refusal rather than a CHECK
  // constraint violation surfacing from Postgres.
  if (!isRelationType(input.relationType)) {
    return { ok: false, error: "unknown_relation_type" };
  }

  const result = await linkContacts(
    {
      workspaceId: session.workspaceId,
      sub: session.user.sub,
      holder: session.authz,
      entitlement: session.entitlement,
      store: getAccountStore(),
    },
    {
      fromContactId: input.fromContactId,
      toContactId: input.toContactId,
      relationType: input.relationType,
    },
  );

  if (!result.ok) return { ok: false, error: result.violations[0]?.code ?? "denied" };
  revalidatePath(`/account/${accountId}`);
  return { ok: true };
}
