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
import { analyzeChain, deriveHealth, type ChainCoverage, type HealthResult } from "./lib/health";
import type { Stage } from "../pipeline/lib/stage";
import type { AccountFilter, AccountRecord, AccountStore, ContactRecord } from "./store";
import type { RelationEdge } from "./lib/health";

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
