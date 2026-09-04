"use server";

import { revalidatePath } from "next/cache";
import { resolveAppSession } from "../lib/session";
import { getAccountStore } from "../../domains/shared/registry";
import {
  designateAccount,
  linkContacts,
  upsertContact,
  recomputeHealth,
} from "../../domains/account/service";
import { ACCOUNT_TIERS, type AccountTier } from "../../domains/account/store";
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
      store: session.stores.account(),
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
      store: session.stores.account(),
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

export interface DesignateResult {
  ok: boolean;
  tier?: string;
  planned?: boolean;
  error?: string;
}

/**
 * Designating a strategic account, with the plan that makes it mean something.
 *
 * The plan is not optional for `strategic` and the rule layer says so: the
 * cadence rule (ADR-013) is what fires for an account with no open deal, and it
 * reads the plan. A strategic designation without one is a label.
 */
export async function designateAccountTier(input: {
  accountId: string;
  tier: string;
  plan?: {
    period: string;
    targetAmount: number | null;
    contactCadenceDays: number;
    execCadenceDays: number;
  };
}): Promise<DesignateResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };
  if (!(ACCOUNT_TIERS as readonly string[]).includes(input.tier)) {
    return { ok: false, error: "unknown_tier" };
  }

  const result = await designateAccount(
    {
      workspaceId: session.workspaceId,
      sub: session.user.sub,
      holder: session.authz,
      entitlement: session.entitlement,
      store: session.stores.account(),
    },
    {
      accountId: input.accountId,
      tier: input.tier as AccountTier,
      ...(input.plan
        ? {
            plan: {
              ...input.plan,
              // The three roles default to the person doing the designating.
              // A plan is a commitment about who works the account, and an
              // unowned commitment is the thing the cadence rule cannot chase.
              ownerSub: session.user.sub,
              presalesSub: null,
              deliverySub: null,
            },
          }
        : {}),
    },
  );

  if (!result.ok) {
    return { ok: false, error: result.violations[0]?.code ?? "denied" };
  }
  revalidatePath(`/account/${input.accountId}`);
  revalidatePath("/account");
  return { ok: true, tier: result.value.tier, planned: result.value.planned };
}

/**
 * Creating or editing a contact.
 *
 * The neighbour of `linkAccountContacts` above, which shipped first and could
 * only ever link people that seed data had put there (TD-016).
 *
 * The role and status arrive as plain strings from two selects and are checked
 * against the value domains in the rule layer, not here - a server action that
 * validates is a second place the rule lives, and the two drift.
 */
export async function saveContact(
  accountId: string,
  input: {
    id: string | null;
    name: string;
    title: string | null;
    department: string | null;
    decisionRole: string;
    influence: number | null;
    // incr/0024. REQUIRED, like title and department above, and for the reason
    // that makes this boundary different from a patch: upsertContact replaces
    // the whole row. An optional field here would read as "unchanged by me"
    // and behave as "cleared" - somebody editing a decision role would silently
    // wipe the phone number for the person who signs.
    email: string | null;
    mobile: string | null;
    wechat: string | null;
    status: string;
  },
): Promise<{ ok: boolean; error?: string }> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };

  const result = await upsertContact(
    {
      workspaceId: session.workspaceId,
      sub: session.user.sub,
      holder: session.authz,
      entitlement: session.entitlement,
      store: session.stores.account(),
    },
    accountId,
    {
      id: input.id,
      name: input.name,
      title: input.title,
      department: input.department,
      decisionRole: input.decisionRole as never,
      influence: input.influence,
      email: input.email,
      mobile: input.mobile,
      wechat: input.wechat,
      status: input.status as never,
    },
  );

  if (!result.ok) {
    return { ok: false, error: result.violations[0]?.code ?? "denied" };
  }
  revalidatePath(`/account/${accountId}`);
  revalidatePath("/");
  return { ok: true };
}
