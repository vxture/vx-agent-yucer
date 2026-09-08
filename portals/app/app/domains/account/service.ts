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

import { isProvince } from "../shared/provinces";
import { DIVISION_TEMPLATES } from "../shared/market-division";
import type { Entitlement } from "../../entitlement/types";
import { can, type PermissionHolder } from "../../authz/decide";
import {
  accountGaps,
  fillable,
  forModel,
  FILLABLE_FIELDS,
  type AccountGap,
} from "./lib/completeness";
import type { PipelineStore } from "../pipeline/store";
import type { PlanningStore } from "../planning/store";
import type { StrategyStore } from "../strategy/store";
import { fail, ok, violation, type RuleResult } from "../shared/result";
import { planAccountParent } from "./lib/parent";
import { chainForOpportunity } from "./lib/buying-role";
import { denied } from "../pipeline/service";
import {
  type ChainCoverage,
  type ContactNode,
  type DecisionRole,
  type HealthResult,
  type RelationEdge,
  DECISION_ROLES,
  analyzeChain,
  deriveHealth,
} from "./lib/health";
import type { Stage } from "../pipeline/lib/stage";
import type {
  AccountFilter,
  AccountRecord,
  MarketDivisionRecord,
  AccountStore,
  AccountTier,
  ContactRecord,
  OpportunityContactRecord,
} from "./store";
import { planContact, type ContactDraft } from "./lib/contact";

export interface AccountContext {
  workspaceId: string;
  sub: string;
  holder: PermissionHolder;
  entitlement: Entitlement;
  store: AccountStore;
}

/**
 * How this workspace divides its market: 大区 and the provinces in each.
 *
 * GATED ON account.view, not on a new action. Reading how the customer base is
 * grouped is part of reading the customer base - a member who may list accounts
 * may see which 大区 they fall in, and one who may not has no use for the
 * grouping. Feature keys are frozen at 19 and this is not separately sellable
 * (ADR-017), so it earns no key of its own either.
 *
 * "data", not "ui": this answers a read, and the caller decides what to draw.
 */
/**
 * Replace the workspace's whole carve with a shipped one.
 *
 * REPLACES, DELIBERATELY. Both the five-way and the seven-way place all 34
 * provinces, so importing one is a statement about the entire market, not an
 * addition to it - merging would leave divisions from the old carve holding
 * provinces the new one has claimed elsewhere, which is a shape neither
 * template describes and nobody asked for. The caller is told how many
 * divisions it is about to discard before it happens.
 *
 * Divisions the template does not have are removed only AFTER their provinces
 * have been re-placed, because the foreign key refuses to drop one that still
 * holds any (ON DELETE RESTRICT) - the order here is the constraint's, not a
 * preference.
 */
export async function importDivisionTemplate(
  ctx: AccountContext,
  key: string,
): Promise<RuleResult<{ key: string; divisions: number; replaced: number }>> {
  const gate = can(ctx.holder, ctx.entitlement, "planning.territory.upsert", "data");
  if (!gate.allowed) return denied(gate);

  const template = DIVISION_TEMPLATES.find((t) => t.key === key);
  if (!template) {
    return fail(violation("template_unknown", `${key} is not a shipped carve`, "key"));
  }

  const before = await ctx.store.listMarketDivisions(ctx.workspaceId);

  for (const d of template.divisions) {
    await ctx.store.upsertMarketDivision(ctx.workspaceId, {
      code: d.code, name: d.name, sortOrder: d.sortOrder,
    });
  }
  for (const [province, code] of Object.entries(template.provinces)) {
    await ctx.store.setProvinceDivision(ctx.workspaceId, province, code);
  }
  // Now that nothing points at them.
  const keep = new Set(template.divisions.map((d) => d.code));
  let replaced = 0;
  for (const old of before) {
    if (keep.has(old.code)) continue;
    await ctx.store.removeMarketDivision(ctx.workspaceId, old.code);
    replaced += 1;
  }

  return ok({ key, divisions: template.divisions.length, replaced });
}

/**
 * Create a 大区, or rename one that exists, and set which provinces it holds.
 *
 * THE TENANT OWNS THE LIST. Five are preset because a workspace has to start
 * somewhere, not because five is right: a company that sells through a 新疆基地
 * covering one province is dividing its market correctly, and nothing here
 * should argue. Codes are the anchor - upserting an existing one renames it.
 *
 * A PROVINCE ALREADY IN ANOTHER 大区 IS MOVED, not refused (owner). Refusing
 * would make the caller go and unassign it first, which is two screens to say
 * one thing; and the primary key means it could never have been in two places
 * anyway. `moved` reports which ones changed hands, so the interface can say so
 * rather than silently reorganising somebody else's division.
 */
export async function saveMarketDivision(
  ctx: AccountContext,
  input: { code: string; name: string; sortOrder?: number; provinces: readonly string[] },
): Promise<RuleResult<{ code: string; moved: { province: string; from: string }[] }>> {
  const gate = can(ctx.holder, ctx.entitlement, "planning.territory.upsert", "data");
  if (!gate.allowed) return denied(gate);

  const code = input.code.trim();
  const name = input.name.trim();
  if (!code) return fail(violation("code_required", "a division needs a code", "code"));
  if (!name) return fail(violation("name_required", "a division needs a name", "name"));

  for (const p of input.provinces) {
    if (!isProvince(p)) {
      return fail(violation(
        "province_unknown",
        `${p} is not one of the 34 provincial-level divisions`,
        "provinces",
      ));
    }
  }

  const before = await ctx.store.listMarketDivisions(ctx.workspaceId);
  await ctx.store.upsertMarketDivision(ctx.workspaceId, { code, name, sortOrder: input.sortOrder });

  const wanted = new Set(input.provinces);
  const moved: { province: string; from: string }[] = [];

  for (const p of wanted) {
    const owner = before.find((d) => d.code !== code && d.provinces.includes(p));
    if (owner) moved.push({ province: p, from: owner.name });
    await ctx.store.setProvinceDivision(ctx.workspaceId, p, code);
  }
  /* Provinces this division used to hold and no longer claims become UNPLACED
     rather than being left behind: the form states the whole membership, so a
     province dropped from it has been deliberately removed. Unplaced is a real
     state the roster reports, not a loss. */
  const mine = before.find((d) => d.code === code)?.provinces ?? [];
  for (const p of mine) {
    if (!wanted.has(p)) await ctx.store.setProvinceDivision(ctx.workspaceId, p, null);
  }

  return ok({ code, moved });
}

/**
 * Remove a 大区.
 *
 * REFUSED WHILE IT STILL HOLDS PROVINCES, which is the foreign key's own rule
 * (ON DELETE RESTRICT) said in the product's terms. Cascading would silently
 * unplace everything it held, and those provinces would then vanish from every
 * roll-up grouped by 大区 with nothing to say why.
 */
export async function removeMarketDivision(
  ctx: AccountContext,
  code: string,
): Promise<RuleResult<{ code: string }>> {
  const gate = can(ctx.holder, ctx.entitlement, "planning.territory.upsert", "data");
  if (!gate.allowed) return denied(gate);

  const divisions = await ctx.store.listMarketDivisions(ctx.workspaceId);
  const target = divisions.find((d) => d.code === code);
  if (!target) {
    return fail(violation("division_unknown", `${code} is not a division here`, "code"));
  }
  if (target.provinces.length > 0) {
    return fail(violation(
      "division_not_empty",
      `${code} still holds ${target.provinces.length} provinces`,
      "code",
    ));
  }
  await ctx.store.removeMarketDivision(ctx.workspaceId, code);
  return ok({ code });
}

export async function listMarketDivisions(
  ctx: AccountContext,
): Promise<RuleResult<MarketDivisionRecord[]>> {
  const gate = can(ctx.holder, ctx.entitlement, "account.view", "data");
  if (!gate.allowed) return denied(gate);
  return ok(await ctx.store.listMarketDivisions(ctx.workspaceId));
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

/** One open deal and what its buying committee looks like. */
export interface OpportunityChain {
  opportunityId: string;
  opportunityName: string;
  coverage: ChainCoverage;
  /**
   * The people with THIS deal's roles resolved onto them.
   *
   * Returned rather than left to the caller because resolving is the whole
   * change: a surface that took the customer's roster and rendered it beside a
   * per-deal coverage would be showing two different deals' answers side by
   * side, which is worse than the single wrong answer this replaced.
   */
  people: ContactNode[];
}

/**
 * The decision chains at one customer: ONE PER OPEN DEAL - incr/0027.
 *
 * REPLACES a single account-level chain, which asked a question with no answer.
 * A buying committee is a fact about a purchase, so "who is the economic buyer
 * at this customer" is only meaningful once you say which purchase - and the
 * old single answer was applied to every deal at once, which is the defect
 * ADR-024 opens with.
 *
 * AN EMPTY RESULT IS A REAL STATE, not a failure: a prospect with contacts and
 * no open deal has people and no buying committee. The page says that rather
 * than rendering a committee nobody has established.
 *
 * Gated on account.graph, which is a pro-tier capability - the relationship map
 * is the thing the tier sells, and a starter workspace sees contacts without it.
 */
export async function decisionChainsByOpportunity(
  ctx: AccountContext,
  accountId: string,
  openDeals: readonly { id: string; name: string }[],
): Promise<RuleResult<OpportunityChain[]>> {
  const gate = can(ctx.holder, ctx.entitlement, "account.graph.view", "data");
  if (!gate.allowed) return denied(gate);

  const account = await ctx.store.getAccount(ctx.workspaceId, accountId);
  if (!account) return fail(violation("not_found", `account ${accountId} was not found`, "accountId"));
  if (openDeals.length === 0) return ok([]);

  const [contacts, relations, links] = await Promise.all([
    ctx.store.listContacts(ctx.workspaceId, accountId),
    ctx.store.listRelations(ctx.workspaceId, accountId),
    // ONE round trip for every deal rather than one per deal: the customer page
    // renders them together, and N queries inside the loop would make the cost
    // scale with the pipeline.
    ctx.store.listOpportunityContactsFor(ctx.workspaceId, openDeals.map((d) => d.id)),
  ]);

  return ok(
    openDeals.map((d) => ({
      opportunityId: d.id,
      opportunityName: d.name,
      ...(() => {
        const people = chainForOpportunity(
          contacts,
          links.filter((l) => l.opportunityId === d.id),
        );
        return { coverage: analyzeChain(people, relations), people };
      })(),
    })),
  );
}

// decisionChainForOpportunity IS GONE (2026-09-05 convergence). It returned
// coverage without the PEOPLE, which is exactly the information downgrade the
// chain convergence killed on the render side (four bare counts). Every caller
// now uses decisionChainsByOpportunity, which returns both - for one deal,
// pass a one-element list.


/**
 * What this deal has already said about who is who.
 *
 * The chain gives the VERDICT; this gives the statements behind it, which is
 * what a form editing them needs. Same gate as the chain: reading the roles and
 * reading their consequence are the same act.
 */
export async function buyingRolesFor(
  ctx: AccountContext,
  opportunityId: string,
): Promise<RuleResult<OpportunityContactRecord[]>> {
  const gate = can(ctx.holder, ctx.entitlement, "account.graph.view", "data");
  if (!gate.allowed) return denied(gate);
  return ok(await ctx.store.listOpportunityContacts(ctx.workspaceId, opportunityId));
}

/**
 * State what somebody is on one deal.
 *
 * The pair (deal, person) is the identity, so this replaces rather than adds -
 * two answers to "what is she on this deal" is the thing the unique index
 * refuses.
 */
export async function setBuyingRole(
  ctx: AccountContext,
  opportunityId: string,
  personId: string,
  buyingRole: DecisionRole,
  influence: number | null,
): Promise<RuleResult<{ opportunityId: string; personId: string; buyingRole: DecisionRole }>> {
  const gate = can(ctx.holder, ctx.entitlement, "account.contact.upsert", "data");
  if (!gate.allowed) return denied(gate);

  if (!(DECISION_ROLES as readonly string[]).includes(buyingRole)) {
    return fail(violation("unknown_decision_role", `${String(buyingRole)} is not a decision role`, "buyingRole"));
  }
  if (influence !== null && (!Number.isInteger(influence) || influence < 0 || influence > 100)) {
    return fail(violation("influence_range", "influence is a whole number from 0 to 100", "influence"));
  }

  const written = await ctx.store.setOpportunityContact(ctx.workspaceId, opportunityId, personId, {
    buyingRole,
    influence,
  });
  if (!written) return fail(violation("not_found", "that deal or person was not found", "opportunityId"));
  return ok({ opportunityId, personId, buyingRole });
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

/**
 * Fill one field on a customer record.
 *
 * THE WRITE BEHIND ONE-CLICK FILL. The owner's ask of 2026-09-01: the agent
 * analyses, recommends, and accepting is one click. This is what the accept
 * carries out - through the copilot's existing queue, not a second mechanism,
 * so a filled field has the same signature and the same audit trail as every
 * other thing the machine suggested.
 *
 * ONE FIELD AT A TIME, deliberately. A model that got the industry right and
 * the region wrong should have one of its two suggestions taken, and a
 * whole-record write makes that impossible - the person would have to accept
 * both or neither. The same reasoning the forecast rule uses for per-deal
 * apply.
 *
 * A CLOSED SET OF FIELDS, checked here rather than trusted. `payload` on an
 * agent_action is free-form JSON written by a model, so the field name arrives
 * as arbitrary text; without this it could name `tier` (a commercial
 * designation with its own rules and its own page) or `status`. The column
 * locks would still refuse anything outside the grant, but a refusal at the
 * database is a 500 rather than an answer.
 *
 * EMPTY IS REFUSED, not written as a blank. "Fill this in" that clears the
 * field is the opposite of the request, and a model returning an empty string
 * for an industry it could not determine is a real thing to expect.
 */
/**
 * What is missing from a customer record, and who can answer it.
 *
 * READS THREE DOMAINS AND WRITES NOTHING. Territories and deals are D2's and
 * D6's, read-only from here - the completeness question spans them by nature,
 * and answering it is not the same as owning them.
 *
 * THE POINT OF SPLITTING free from paid, which the rule does and this passes
 * through untouched: a page can show everything the data knows without a model
 * call, and asking the model stays an explicit act with a count attached rather
 * than something that happens because somebody opened a record.
 */
export async function accountCompleteness(
  ctx: AccountContext & { pipeline: PipelineStore; planning: PlanningStore; strategy: StrategyStore },
  accountId: string,
): Promise<RuleResult<{ gaps: AccountGap[]; derivable: AccountGap[]; askable: AccountGap[] }>> {
  const gate = can(ctx.holder, ctx.entitlement, "account.view", "data");
  if (!gate.allowed) return denied(gate);

  const account = await ctx.store.getAccount(ctx.workspaceId, accountId);
  if (!account) {
    return fail(violation("not_found", `account ${accountId} was not found`, "accountId"));
  }

  const [deals, territories, segments, divisions] = await Promise.all([
    ctx.pipeline.listOpportunities(ctx.workspaceId, { accountId, includeClosed: true }),
    ctx.planning.listTerritories(ctx.workspaceId),
    ctx.strategy.listSegments(ctx.workspaceId),
    ctx.store.listMarketDivisions(ctx.workspaceId),
  ]);

  const gaps = accountGaps(
    account,
    deals.map((d) => ({ territoryId: d.territoryId, ownerSub: d.ownerSub })),
    territories.map((t) => ({
      id: t.id,
      name: t.name,
      ownerSub: t.ownerSub,
      regions: t.regions ?? [],
      status: t.status,
    })),
    segments.map((sg) => ({
      code: sg.segmentCode,
      // The criteria are already typed by D1 - read them, do not re-shape them.
      industries: sg.criteria?.industries ?? [],
      regions: sg.criteria?.regions ?? [],
    })),
    provinceDivision(divisions),
  );

  return ok({ gaps, derivable: fillable(gaps), askable: forModel(gaps) });
}

/* ONE LIST, RE-EXPORTED - it was two, and they had already drifted. This module
   kept its own copy of the fillable fields beside the one in
   lib/completeness.ts, so adding `province` to the gap model left the write
   path still refusing it, and the type error was the only thing that said so.
   A second copy of a vocabulary is a second chance to be wrong about it. */
/* A RE-EXPORT, NOT AN ASSIGNMENT, and the difference is load order. Writing
   `const FILLABLE_ACCOUNT_FIELDS = FILLABLE_FIELDS` evaluates at module scope,
   so under a circular import - this module already reaches pipeline/service -
   the imported binding can still be in its temporal dead zone and the whole app
   dies with "FILLABLE_FIELDS is not defined". A re-export is a live binding:
   nothing is read until somebody actually uses it. Type-checking cannot see
   this; only running it can, which is how it was found. */
export { FILLABLE_FIELDS as FILLABLE_ACCOUNT_FIELDS };
export type FillableAccountField = (typeof FILLABLE_FIELDS)[number];

/** province -> 大区 name, as this workspace divides its market (incr/0036). */
function provinceDivision(
  divisions: readonly MarketDivisionRecord[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const d of divisions) for (const p of d.provinces) out[p] = d.name;
  return out;
}

export function isFillableAccountField(v: string): v is FillableAccountField {
  return (FILLABLE_FIELDS as readonly string[]).includes(v);
}

export async function fillAccountField(
  ctx: AccountContext,
  accountId: string,
  field: string,
  value: string,
): Promise<RuleResult<{ accountId: string; field: string; value: string }>> {
  const gate = can(ctx.holder, ctx.entitlement, "account.upsert", "data");
  if (!gate.allowed) return denied(gate);

  if (!isFillableAccountField(field)) {
    return fail(violation("field_not_fillable", `${field} is not a field this fills`, "field"));
  }
  if (!value.trim()) {
    return fail(violation("value_required", "filling a field needs a value, not a blank", "value"));
  }
  /* THE SAME VOCABULARY THE DATABASE ENFORCES. incr/0035 CHECK-constrains this
     column to the 34 provincial-level divisions, so a free-text write fails at
     the database with a constraint error nobody can act on - and in the
     in-memory store, which has no CHECK, it would succeed and quietly put a
     customer on ground the map has no shape for. Refused here, in the product's
     own terms, in both. */
  if (field === "province" && !isProvince(value.trim())) {
    return fail(violation(
      "province_unknown",
      `${value.trim()} is not one of the 34 provincial-level divisions`,
      "value",
    ));
  }

  const current = await ctx.store.getAccount(ctx.workspaceId, accountId);
  if (!current) {
    return fail(violation("not_found", `account ${accountId} was not found`, "accountId"));
  }

  await ctx.store.updateAccount(ctx.workspaceId, accountId, { [field]: value.trim() });
  return ok({ accountId, field, value: value.trim() });
}

export interface BatchCompletenessRow {
  accountId: string;
  accountName: string;
  gap: AccountGap;
}

/**
 * Every derivable gap across every customer this member can see, in one pass.
 *
 * ONLY THE DATA HALF. `forModel` gaps are excluded by construction (`fillable`
 * already does this) - a batch that also spent a model turn per account would
 * meter Atlas once per customer in the workspace on one click, which is the
 * exact "paying to be told something the database already knows" defect
 * completeness.ts warns against, multiplied by the roster. The model half
 * stays a per-account, explicit act - see askToComplete.
 *
 * ONE ROUND TRIP PER DOMAIN, not per account. accountCompleteness() re-fetches
 * territories and segments on every call, which is right for one record; doing
 * that once per row here across a whole roster would turn 3 queries into N+2.
 */
export async function workspaceCompleteness(
  ctx: AccountContext & { pipeline: PipelineStore; planning: PlanningStore; strategy: StrategyStore },
): Promise<RuleResult<BatchCompletenessRow[]>> {
  const gate = can(ctx.holder, ctx.entitlement, "account.view", "data");
  if (!gate.allowed) return denied(gate);

  // Read ONCE for the whole roster, like the territories and segments beside
  // it - the division table is the same for every row on the page.
  const [accounts, deals, territories, segments, divisions] = await Promise.all([
    ctx.store.listAccounts(ctx.workspaceId),
    ctx.pipeline.listOpportunities(ctx.workspaceId, { includeClosed: true }),
    ctx.planning.listTerritories(ctx.workspaceId),
    ctx.strategy.listSegments(ctx.workspaceId),
    ctx.store.listMarketDivisions(ctx.workspaceId),
  ]);
  const divisionOf = provinceDivision(divisions);

  const dealsByAccount = new Map<string, { territoryId: string | null; ownerSub: string | null }[]>();
  for (const d of deals) {
    const row = { territoryId: d.territoryId, ownerSub: d.ownerSub };
    const list = dealsByAccount.get(d.accountId);
    if (list) list.push(row);
    else dealsByAccount.set(d.accountId, [row]);
  }

  const territoryInputs = territories.map((t) => ({
    id: t.id,
    name: t.name,
    ownerSub: t.ownerSub,
    regions: t.regions ?? [],
    status: t.status,
  }));
  const segmentInputs = segments.map((sg) => ({
    code: sg.segmentCode,
    industries: sg.criteria?.industries ?? [],
    regions: sg.criteria?.regions ?? [],
  }));

  const rows: BatchCompletenessRow[] = [];
  for (const account of accounts) {
    const gaps = accountGaps(
      account,
      dealsByAccount.get(account.id) ?? [],
      territoryInputs,
      segmentInputs,
      divisionOf,
    );
    for (const gap of fillable(gaps)) {
      rows.push({ accountId: account.id, accountName: account.name, gap });
    }
  }
  return ok(rows);
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

/**
 * Make one customer a subsidiary of another, or detach it - incr/0025.
 *
 * BOTH GATES, in the fixed order, like every other verb here. The permission is
 * `account.upsert` and not a new one: deciding that a company belongs to a
 * group is editing the customer master record, which is exactly what that
 * permission already means. ADR-024 froze nothing about permissions, but adding
 * one that nobody can distinguish from an existing one makes the catalogue
 * bigger without making it say more.
 *
 * WHY THE WHOLE LIST IS LOADED. The cycle guard has to walk ancestry, and
 * ancestry is not local: A->B->C->A is invisible from any single row. The port
 * has no "walk parents" method and adding one would put the rule in the
 * adapter, where no test can reach it without a database.
 */
export async function setAccountParent(
  ctx: AccountContext,
  accountId: string,
  parentId: string | null,
): Promise<RuleResult<{ accountId: string; parentId: string | null }>> {
  const gate = can(ctx.holder, ctx.entitlement, "account.upsert", "data");
  if (!gate.allowed) return denied(gate);

  const all = await ctx.store.listAccounts(ctx.workspaceId);
  const plan = planAccountParent({ accountId, parentId }, all);
  if (!plan.ok) return plan as RuleResult<{ accountId: string; parentId: string | null }>;

  const written = await ctx.store.updateAccount(ctx.workspaceId, accountId, { parentId });
  if (!written) {
    return fail(violation("not_found", `account ${accountId} was not found`, "accountId"));
  }
  return ok({ accountId, parentId });
}
