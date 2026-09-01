// D4 application service: gate -> rule -> persistence for accounts.
//
// The health recompute is the interesting one. health_score is a DERIVED value
// that exists only for sorting and alerting, and the spec is explicit that it is
// never the sole basis for a business decision. Two consequences implemented
// here rather than merely documented:
//
//   - recomputeHealth() reads source data and writes the number. It never reads
//     the stored score, so a wrong value can only be replaced, never compounded.
//   - It returns the CONTRIBUTIONS alongside the number. A red account whose
//     only explanation is "the model said so" is an account nobody acts on.

import type { Entitlement } from "../../entitlement/types";
import { can, type PermissionHolder } from "../../authz/decide";
import { fail, ok, violation, type RuleResult } from "../shared/result";
import { denied } from "../pipeline/service";
import {
  type ChainCoverage,
  type HealthResult,
  type RelationEdge,
  analyzeChain,
  deriveHealth,
} from "./lib/health";
import type { Stage } from "../pipeline/lib/stage";
import type { AccountFilter, AccountRecord, AccountStore, AccountTier, ContactRecord } from "./store";
import { planContact, type ContactDraft } from "./lib/contact";

export interface AccountContext {
  workspaceId: string;
  sub: string;
  holder: PermissionHolder;
  entitlement: Entitlement;
  store: AccountStore;
}

export async function listAccounts(
  ctx: AccountContext,
  filter: AccountFilter = {},
): Promise<RuleResult<AccountRecord[]>> {
  const gate = can(ctx.holder, ctx.entitlement, "account.view", "data");
  if (!gate.allowed) return denied(gate);
  return ok(await ctx.store.listAccounts(ctx.workspaceId, filter));
}

export interface AccountDetail {
  account: AccountRecord;
  contacts: ContactRecord[];
}

/**
 * One account with its contacts, behind the same gate as the list.
 *
 * This exists because the detail PAGE previously reached the store directly.
 * The nav hides an unentitled domain, but hiding a link is not access control:
 * a workspace whose tier does not include account.manage could still read a
 * customer record and its whole contact list by typing the URL. A page holding
 * a store handle is the shape that bug takes, so the handle is removed.
 *
 * A missing account and one in another workspace are the same answer, for the
 * reason the pipeline service already gives: distinguishing them turns the
 * refusal into an oracle for which ids exist elsewhere.
 */
export async function getAccountDetail(
  ctx: AccountContext,
  accountId: string,
): Promise<RuleResult<AccountDetail>> {
  const gate = can(ctx.holder, ctx.entitlement, "account.view", "data");
  if (!gate.allowed) return denied(gate);

  const account = await ctx.store.getAccount(ctx.workspaceId, accountId);
  if (!account) {
    return fail(violation("not_found", `account ${accountId} was not found`, "accountId"));
  }
  return ok({ account, contacts: await ctx.store.listContacts(ctx.workspaceId, accountId) });
}

export interface HealthOutcome extends HealthResult {
  accountId: string;
  /** True when the recomputed number was written back. */
  persisted: boolean;
}

/**
 * Recompute and store an account's health.
 *
 * Gated on account.write rather than account.read: it writes a column. The read
 * side gets the same number for free by reading the row.
 */
export async function recomputeHealth(
  ctx: AccountContext,
  accountId: string,
  opts: { now?: Date; persist?: boolean } = {},
): Promise<RuleResult<HealthOutcome>> {
  const gate = can(ctx.holder, ctx.entitlement, "account.upsert", "data");
  if (!gate.allowed) return denied(gate);

  const account = await ctx.store.getAccount(ctx.workspaceId, accountId);
  if (!account) return fail(violation("not_found", `account ${accountId} was not found`, "accountId"));

  const inputs = await ctx.store.healthInputs(ctx.workspaceId, accountId);
  const derived = deriveHealth({
    openOpportunities: inputs.openOpportunities.map((o) => ({
      stage: o.stage as Stage,
      amount: o.amount,
    })),
    lastInteractionAt: inputs.lastInteractionAt,
    projectHealth: inputs.projectHealth,
    overdueRevenueCount: inputs.overdueRevenueCount,
    now: opts.now,
  });
  if (!derived.ok) return derived as RuleResult<HealthOutcome>;

  let persisted = false;
  if (opts.persist !== false) {
    persisted = await ctx.store.updateAccount(ctx.workspaceId, accountId, {
      healthScore: derived.value.score,
    });
  }

  return ok({ ...derived.value, accountId, persisted });
}

/**
 * The decision chain for an account: which roles are covered, who is blocking,
 * and whether the economic buyer can actually be reached.
 *
 * Gated on account.graph, which is a pro-tier capability - the relationship map
 * is the thing the tier sells, and a starter workspace sees contacts without it.
 */
export async function decisionChain(
  ctx: AccountContext,
  accountId: string,
): Promise<RuleResult<ChainCoverage>> {
  const gate = can(ctx.holder, ctx.entitlement, "account.graph.view", "data");
  if (!gate.allowed) return denied(gate);

  const account = await ctx.store.getAccount(ctx.workspaceId, accountId);
  if (!account) return fail(violation("not_found", `account ${accountId} was not found`, "accountId"));

  const [contacts, relations] = await Promise.all([
    ctx.store.listContacts(ctx.workspaceId, accountId),
    ctx.store.listRelations(ctx.workspaceId, accountId),
  ]);
  return ok(analyzeChain(contacts, relations));
}

/**
 * The chain's raw edges.
 *
 * Exposed so a caller can compute a SECOND analysis over the same graph -
 * specifically the evidence plane's recency walk - without either holding a
 * store handle or re-deriving the edges from a coverage result that has already
 * thrown them away. Same gate as decisionChain: the edges are the graph.
 */
export async function accountRelations(
  ctx: AccountContext,
  accountId: string,
): Promise<RuleResult<RelationEdge[]>> {
  const gate = can(ctx.holder, ctx.entitlement, "account.graph.view", "data");
  if (!gate.allowed) return denied(gate);
  return ok(await ctx.store.listRelations(ctx.workspaceId, accountId));
}

/**
 * Record a relationship. Append-only: there is no edit path, because the edge
 * table has no UPDATE grant and a changed relationship is a new edge.
 */
/**
 * Create a contact, or edit one.
 *
 * `account.contact.upsert` has been in the action catalogue since batch 1 with
 * nothing behind it (TD-016), and this is the sharpest instance of that shape
 * in the repo: the NEIGHBOUR works. `linkContacts` below is implemented and
 * wired to a surface, so a member could draw relations between contacts while
 * having no way to create one - and the board's headline "N decision makers
 * not reached" is computed from `decision_role`, so that figure could only
 * ever describe seed data.
 *
 * BY ID, not by a business key: two people at one customer can share a name,
 * so absent id creates and present id edits that row. An id belonging to
 * another workspace or another account updates nothing and comes back as
 * not_found - creating a row instead would quietly move a person between
 * customers.
 */
export async function upsertContact(
  ctx: AccountContext,
  accountId: string,
  input: ContactDraft,
): Promise<RuleResult<ContactRecord>> {
  const gate = can(ctx.holder, ctx.entitlement, "account.contact.upsert", "data");
  if (!gate.allowed) return denied(gate);

  const plan = planContact(input);
  if (!plan.ok) return plan as RuleResult<ContactRecord>;

  const written = await ctx.store.upsertContact(ctx.workspaceId, accountId, plan.value);
  if (!written) {
    return fail(violation("not_found", `contact ${input.id} was not found on this account`, "id"));
  }
  return ok(written);
}

export async function linkContacts(
  ctx: AccountContext,
  edge: RelationEdge,
): Promise<RuleResult<RelationEdge>> {
  const gate = can(ctx.holder, ctx.entitlement, "account.graph.link", "data");
  if (!gate.allowed) return denied(gate);

  if (edge.fromContactId === edge.toContactId) {
    // chk_account_relation_self would reject it; saying so here names the reason.
    return fail(violation("self_relation", "a contact cannot be related to itself", "toContactId"));
  }

  await ctx.store.addRelation(ctx.workspaceId, edge);
  return ok(edge);
}

/**
 * Designate an account's tier, and set the plan that goes with a strategic one.
 *
 * WHY BOTH IN ONE VERB. ADR-013's load-bearing consequence is in the judgement
 * engine: every existing rule is EVENT-TRIGGERED and needs an open opportunity,
 * which is exactly wrong for a strategic account - a locked-in customer with no
 * open deal going quiet is the most important thing to report, and no event
 * will ever fire to say so. The cadence rule is what fires instead, and it
 * reads the PLAN. So a strategic account without a plan is a designation that
 * changes nothing, and letting one exist would make the tier decorative.
 *
 * The tier column has been writable since incr/0006 and the patch type did not
 * include it, so until now nothing could set it - the tier existed, the rule
 * read it, and no path led there.
 */
/**
 * Move an account to a different owner.
 *
 * The store has been able to write `owner_sub` since the baseline and no
 * service verb ever exposed it, so an account's owner could be set when the
 * account was created and never afterwards - which made "somebody left" a
 * problem with no answer in this domain.
 *
 * GATED ON account.upsert, the same permission that edits the record. Whose
 * account this is IS the record, not a lighter fact about it, and inventing a
 * weaker gate for reassignment would let somebody hand out a book they could
 * not otherwise touch.
 *
 * NO RULE ABOUT WHO MAY RECEIVE IT lives here, deliberately. This domain knows
 * nothing about members - `local_authz` sits under it - so "is the recipient
 * still with us" is a question the caller answers before asking. The handover
 * surface does exactly that.
 */
export async function reassignAccount(
  ctx: AccountContext,
  accountId: string,
  ownerSub: string,
): Promise<RuleResult<{ accountId: string; ownerSub: string }>> {
  const gate = can(ctx.holder, ctx.entitlement, "account.upsert", "data");
  if (!gate.allowed) return denied(gate);

  if (!ownerSub.trim()) {
    return fail(violation("owner_required", "a reassignment needs somebody to reassign to", "ownerSub"));
  }

  const current = await ctx.store.getAccount(ctx.workspaceId, accountId);
  if (!current) {
    return fail(violation("not_found", `account ${accountId} was not found`, "accountId"));
  }

  await ctx.store.updateAccount(ctx.workspaceId, accountId, { ownerSub });
  return ok({ accountId, ownerSub });
}

export async function designateAccount(
  ctx: AccountContext,
  input: {
    accountId: string;
    tier: AccountTier;
    plan?: {
      period: string;
      targetAmount: number | null;
      contactCadenceDays: number;
      execCadenceDays: number;
      ownerSub: string | null;
      presalesSub: string | null;
      deliverySub: string | null;
    };
  },
): Promise<RuleResult<{ tier: AccountTier; planned: boolean }>> {
  const gate = can(ctx.holder, ctx.entitlement, "account.upsert", "data");
  if (!gate.allowed) return denied(gate);

  if (input.tier === "strategic" && !input.plan) {
    return fail(
      violation(
        "plan_required",
        "a strategic account needs a plan - the cadence rule reads it, and without one the designation changes nothing",
        "plan",
      ),
    );
  }
  if (input.plan) {
    if (!input.plan.period.trim()) {
      return fail(violation("period_required", "a plan must name its period", "period"));
    }
    for (const [field, days] of [
      ["contactCadenceDays", input.plan.contactCadenceDays],
      ["execCadenceDays", input.plan.execCadenceDays],
    ] as const) {
      if (!Number.isInteger(days) || days <= 0) {
        return fail(
          violation("cadence_positive", "a cadence of zero days is not a cadence", field),
        );
      }
    }
  }

  const moved = await ctx.store.updateAccount(ctx.workspaceId, input.accountId, {
    tier: input.tier,
  });
  if (!moved) {
    return fail(violation("not_found", `account ${input.accountId} was not found`, "accountId"));
  }

  if (input.plan) {
    await ctx.store.upsertAccountPlan(ctx.workspaceId, {
      accountId: input.accountId,
      period: input.plan.period.trim(),
      targetAmount: input.plan.targetAmount,
      contactCadenceDays: input.plan.contactCadenceDays,
      execCadenceDays: input.plan.execCadenceDays,
      ownerSub: input.plan.ownerSub,
      presalesSub: input.plan.presalesSub,
      deliverySub: input.plan.deliverySub,
      status: "active",
    });
  }
  return ok({ tier: input.tier, planned: input.plan != null });
}
