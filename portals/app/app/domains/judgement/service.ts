// Assembling the judgement stream.
//
// This is the one service that reads across domains, and it does so through
// their SERVICES rather than their stores - so every gate that guards a page
// guards this too. A home screen that could show what a detail page refuses to
// is a hole shaped exactly like the nav-link-hiding mistake this repo already
// fixed once: hiding a link is not access control, and neither is summarising.
//
// It reads a lot. That is inherent - a judgement about "which of my deals is
// rotting" cannot be made from one table - but it means this is the first place
// to look when the home screen gets slow, and the narrow-port work registered
// after the self-review lands here first.

import type { Entitlement } from "../../entitlement/types";
import { can, type PermissionHolder } from "../../authz/decide";
import { ok, type RuleResult } from "../shared/result";
import { denied, listPipeline } from "../pipeline/service";
import { getAccountStore, getCopilotStore, getFieldStore, getPipelineStore } from "../shared/registry";
import type { CopilotStore } from "../copilot/store";
import {
  listAccounts,
  decisionChainsByOpportunity,
  accountRelations,
  type OpportunityChain,
} from "../account/service";
import { captureAdoption } from "../account/field-service";
import {
  deriveJudgements,
  countByUrgency,
  resolveScope,
  type Judgement,
  type Scope,
  type Urgency,
} from "./lib/judgement";

export interface JudgementContext {
  workspaceId: string;
  sub: string;
  holder: PermissionHolder;
  entitlement: Entitlement;
}

export interface JudgementFeed {
  judgements: Judgement[];
  counts: Record<Urgency, number>;
  /** How many accounts were actually read, so an empty feed is explicable. */
  scanned: number;
  /**
   * Who is on our side, across the accounts just read.
   *
   * Reported from the decision-chain coverage this feed already computes, so
   * the shell can state it without a second pass over every account. `reach`
   * is deliberately the count of accounts where the economic buyer CANNOT be
   * reached: the useful number is the gap, not the coverage.
   */
  allies: { coaches: number; blockers: number; unreachable: number; accounts: number };
  /**
   * WHICH accounts have no reachable economic buyer, not just how many.
   *
   * The count alone was enough while this fact lived on one board card. Now it
   * has to be readable where it changes a decision - beside a deal at
   * negotiate, beside an account on the roster - and a count cannot say which
   * row. The fact was already computed per account; only the ids were being
   * thrown away.
   *
   * Accounts whose chain could not be READ are absent rather than included:
   * "nobody has reached the buyer" and "this tier cannot see contact chains"
   * are different statements, and the second must not be rendered as the first.
   */
  unreachableAccountIds: readonly string[];
  /**
   * The scope actually used. Not an echo of the request: when the caller does
   * not pin one this is where the choice was made, and the filter control has
   * to show the state the feed is really in.
   */
  scope: Scope;
}

/** Ranked, so "did the tier get worse" is a comparison rather than a lookup. */
const URGENCY_RANK: Record<Urgency, number> = { watch: 0, week: 1, today: 2 };

/**
 * Defer one judgement out of this member's queue.
 *
 * Gated on account.view, the same permission the feed itself needs: a member
 * who may not read a conclusion may not act on it either.
 *
 * SEVEN DAYS, and the caller does not get to choose. A snooze whose length is
 * a parameter becomes a way to bury something - the point of the control is
 * "not now", not "not ever", and the two must not be the same button.
 */
export async function snoozeJudgement(
  ctx: JudgementContext & { store: CopilotStore },
  input: { judgementId: string; urgency: Urgency },
  now: Date = new Date(),
): Promise<RuleResult<null>> {
  const gate = can(ctx.holder, ctx.entitlement, "account.view", "data");
  if (!gate.allowed) return denied(gate);

  await ctx.store.snoozeJudgement(ctx.workspaceId, {
    sub: ctx.sub,
    judgementId: input.judgementId,
    urgency: input.urgency,
    until: new Date(now.getTime() + SNOOZE_DAYS * DAY),
  });
  return ok(null);
}

const SNOOZE_DAYS = 7;

export interface FeedOptions {
  now?: Date;
  /**
   * "mine" restricts to accounts this member owns. Omit to let ownership
   * decide - see the derivation below, which is the honest default.
   */
  scope?: Scope;
}

const DAY = 86_400_000;

/**
 * The home screen's whole payload.
 *
 * Gated on account.view, the same permission the account list needs: every
 * judgement here is a statement about accounts, and a member who may not read
 * the accounts may not read conclusions drawn from them either.
 */
export async function judgementFeed(
  ctx: JudgementContext,
  options: FeedOptions = {},
): Promise<RuleResult<JudgementFeed>> {
  const gate = can(ctx.holder, ctx.entitlement, "account.view", "data");
  if (!gate.allowed) return denied(gate);

  const now = options.now ?? new Date();
  const base = { workspaceId: ctx.workspaceId, sub: ctx.sub, holder: ctx.holder, entitlement: ctx.entitlement };
  const accountCtx = { ...base, store: getAccountStore() };
  const fieldStore = getFieldStore();

  const [accountsResult, dealsResult] = await Promise.all([
    listAccounts(accountCtx),
    listPipeline({ ...base, store: getPipelineStore() }, { includeClosed: true }),
  ]);
  if (!accountsResult.ok) return accountsResult as RuleResult<JudgementFeed>;

  const accounts = accountsResult.ok ? accountsResult.value : [];
  const deals = dealsResult.ok ? dealsResult.value : [];
  // Which accounts this member is asking about.
  //
  // The default is DERIVED, not "mine". A sales_leader owns no accounts by
  // design - they carry the team's - so a hardcoded "mine" made the flagship
  // screen render empty for a whole role while the data sat one filter away.
  // An empty result caused by a default nobody chose is indistinguishable from
  // "nothing is wrong", which is the one thing this screen must never say by
  // accident.
  //
  // So: own something and the default is your own book; own nothing and the
  // only scope that can answer anything is the team's. An explicit request
  // always wins - the filter control still means what it says.
  const owned = accounts.filter((a) => a.ownerSub === ctx.sub);
  const scope = resolveScope(options.scope, owned.length);
  const mine = scope === "all" ? accounts : owned;

  const inputs = await Promise.all(
    mine.map(async (a) => {
      const [notes, commitments, lastContactAt, contactActivity, relations] = await Promise.all([
        fieldStore.listInteractions(ctx.workspaceId, { accountId: a.id, limit: 3 }),
        fieldStore.listCommitments(ctx.workspaceId, { accountId: a.id }),
        fieldStore.lastContactAt(ctx.workspaceId, a.id),
        fieldStore.lastContactByContact(ctx.workspaceId, a.id),
        accountRelations(accountCtx, a.id),
      ]);
      const open = deals.filter((d) => d.accountId === a.id && d.closedAt === null);
      // Pro-tier; a starter workspace simply gets no decision-chain judgements
      // rather than an error on the home screen.
      //
      // ONE CHAIN PER OPEN DEAL since incr/0027. An account no longer has a
      // single chain to fetch - a buying committee is a fact about a purchase -
      // so this returns as many as the account has live deals, and none for a
      // prospect. `.ok` is still the tier gate; the array is what it gates.
      const chain = await decisionChainsByOpportunity(
        accountCtx,
        a.id,
        open.map((d) => ({ id: d.id, name: d.name })),
      );
      const contacts = chain.ok ? await getAccountStore().listContacts(ctx.workspaceId, a.id) : [];
      // The coverage itself was being computed and thrown away - only `.ok` was
      // read. It is the most expensive call in this loop, and it is exactly
      // what the shell needs to say who is on our side, so it is carried out
      // rather than recomputed by a second caller.
      const coverages = chain.ok ? chain.value : null;

      // The plan, only for strategic accounts - it is what lets rule 5 fire on
      // an absence. Read here rather than in a second pass because everything
      // it needs to be USEFUL (contacts and their last-contact times) is
      // already in hand on this iteration.
      const plan =
        a.tier === "strategic" ? await getAccountStore().getAccountPlan(ctx.workspaceId, a.id) : null;

      // Last contact with a DECISION MAKER, not with anyone. Computed from the
      // contacts already fetched: an account can be busy at working level for
      // months while the person who signs has not been seen once, and that gap
      // is the one the cadence exists to catch.
      // WHO COUNTS AS "the decision maker" for the cadence rule, now that being
      // one is a fact about a deal. Anyone who signs on ANY open deal - a
      // meeting with the person who signs the warehouse project is still a
      // decision-maker meeting even if they merely use the other one.
      //
      // Empty for a customer with no open deal, and that is not a regression:
      // the cadence rule treats "never met" as late by definition, which is the
      // same verdict it reached before and for a better reason.
      const execIds = new Set(
        (coverages ?? []).flatMap((c) =>
          c.people.filter((x) => x.decisionRole === "economic").map((x) => x.id),
        ),
      );
      const execTimes = [...contactActivity]
        .filter(([id, at]) => execIds.has(id) && at !== null)
        .map(([, at]) => (at as Date).getTime());

      return {
        coverages,
        plan: plan
          ? {
              period: plan.period,
              contactCadenceDays: plan.contactCadenceDays,
              execCadenceDays: plan.execCadenceDays,
              lastExecContactAt: execTimes.length > 0 ? new Date(Math.max(...execTimes)) : null,
            }
          : null,
        accountId: a.id,
        accountName: a.name,
        ownerSub: a.ownerSub,
        openDeals: open.map((d) => ({
          id: d.id,
          name: d.name,
          stage: d.stage,
          amount: d.amount?.amount ?? null,
          stageDays: Math.floor((now.getTime() - d.createdAt.getTime()) / DAY),
        })),
        lastContactAt,
        commitments: commitments.map((c) => ({
          id: c.id,
          direction: c.direction,
          status: c.status,
          statement: c.statement,
          dueAt: c.dueAt,
        })),
        contacts,
        // incr/0027. Fetched for every open deal at once rather than per deal:
        // the feed already assembles one bundle per account, and N round trips
        // inside that loop would make the cost of the fix scale with the
        // pipeline rather than with the customer list.
        buyingRoles: await getAccountStore().listOpportunityContactsFor(
          ctx.workspaceId,
          open.map((d) => d.id),
        ),
        relations: relations.ok ? relations.value : [],
        contactActivity: contacts.map((c) => ({
          contactId: c.id,
          lastContactAt: contactActivity.get(c.id) ?? null,
        })),
        notes: notes.map((n) => ({
          id: n.id,
          occurredAt: n.occurredAt,
          channel: n.channel,
          who: n.actorSub,
          text: n.rawNote,
        })),
      };
    }),
  );

  // The team judgement rides the adoption reading, which is admin-gated. A
  // member without admin.manage gets the object judgements and not that one -
  // the feed degrades rather than refusing.
  const adoption = await captureAdoption({ ...base, store: fieldStore }, deals.map((d) => ({
    id: d.id,
    createdAt: d.createdAt,
    closedAt: d.closedAt,
  })), { now });

  // What this member has deferred, and what it looked like when they did.
  const snoozed = new Map(
    (await getCopilotStore().listSnoozes(ctx.workspaceId, ctx.sub, now)).map((r) => [
      r.judgementId,
      r.urgency as Urgency,
    ]),
  );

  const judgements = deriveJudgements({
    accounts: inputs,
    captureWeeks: adoption.ok ? adoption.value.weeks : undefined,
    now,
  });

  // Only accounts whose chain was actually readable count as the denominator -
  // a starter workspace gets no coverage at all, and reporting "0 coaches" for
  // a tier that cannot see chains would be a claim about the customers rather
  // than about the subscription.
  const withChain = inputs.filter((i) => i.coverages !== null);
  // AGGREGATED OVER DEALS - incr/0027. An account counts here if ANY of its open
  // deals does, because that is the only account-level statement the per-deal
  // facts support. An account with no open deal has no chains and so counts for
  // nothing, which is right: it has people, not a buying committee.
  const anyDeal = (i: (typeof inputs)[number], f: (c: OpportunityChain) => boolean) =>
    (i.coverages ?? []).some(f);
  const allies = {
    coaches: withChain.filter((i) => anyDeal(i, (c) => c.coverage.coaches.length > 0)).length,
    blockers: withChain.filter((i) => anyDeal(i, (c) => c.coverage.blockers.length > 0)).length,
    unreachable: withChain.filter((i) => anyDeal(i, (c) => c.coverage.economicBuyerUnreachable)).length,
    accounts: withChain.length,
  };
  const unreachableAccountIds = withChain
    .filter((i) => anyDeal(i, (c) => c.coverage.economicBuyerUnreachable))
    .map((i) => i.accountId);

  // A snooze holds only while the situation is no worse than when it was made.
  // Comparing tiers rather than facts is deliberate: facts drift every night -
  // "50 days quiet" becomes 51 - so a fingerprint over them would expire within
  // a day and make the control useless, while the tier moves only when the
  // situation materially does. That is the event worth re-interrupting someone
  // for, and it is what stops "not now" from quietly becoming "never".
  const visible = judgements.filter((j) => {
    const at = snoozed.get(j.id);
    if (at === undefined) return true;
    return URGENCY_RANK[j.urgency] > URGENCY_RANK[at];
  });

  return ok({
    judgements: visible,
    counts: countByUrgency(visible),
    scanned: mine.length,
    scope,
    allies,
    unreachableAccountIds,
  });
}
