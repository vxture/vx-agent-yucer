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
import { denied } from "../pipeline/service";
import { getAccountStore, getFieldStore, getPipelineStore } from "../shared/registry";
import { listAccounts, decisionChain, accountRelations } from "../account/service";
import { listPipeline } from "../pipeline/service";
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
   * The scope actually used. Not an echo of the request: when the caller does
   * not pin one this is where the choice was made, and the filter control has
   * to show the state the feed is really in.
   */
  scope: Scope;
}

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
      // decisionChain is pro-tier; a starter workspace simply gets no
      // decision-chain judgements rather than an error on the home screen.
      const chain = await decisionChain(accountCtx, a.id);
      const contacts = chain.ok ? await getAccountStore().listContacts(ctx.workspaceId, a.id) : [];
      // The coverage itself was being computed and thrown away - only `.ok` was
      // read. It is the most expensive call in this loop, and it is exactly
      // what the shell needs to say who is on our side, so it is carried out
      // rather than recomputed by a second caller.
      const coverage = chain.ok ? chain.value : null;

      const open = deals.filter((d) => d.accountId === a.id && d.closedAt === null);
      return {
        coverage,
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

  const judgements = deriveJudgements({
    accounts: inputs,
    captureWeeks: adoption.ok ? adoption.value.weeks : undefined,
    now,
  });

  // Only accounts whose chain was actually readable count as the denominator -
  // a starter workspace gets no coverage at all, and reporting "0 coaches" for
  // a tier that cannot see chains would be a claim about the customers rather
  // than about the subscription.
  const withChain = inputs.filter((i) => i.coverage !== null);
  const allies = {
    coaches: withChain.filter((i) => (i.coverage?.coaches.length ?? 0) > 0).length,
    blockers: withChain.filter((i) => (i.coverage?.blockers.length ?? 0) > 0).length,
    unreachable: withChain.filter((i) => i.coverage?.economicBuyerUnreachable).length,
    accounts: withChain.length,
  };

  return ok({
    judgements,
    counts: countByUrgency(judgements),
    scanned: mine.length,
    scope,
    allies,
  });
}
