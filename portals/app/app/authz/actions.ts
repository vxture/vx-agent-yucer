// Product action catalog - the single table that wires each concrete product
// action to its two gates.
//
// Without this table the pairing lives scattered across route handlers and page
// components, and the two gates drift apart one endpoint at a time (the classic
// failure: a mutation endpoint that checks entitlement but forgets the
// permission, or a page that hides a button the API still honours). Here the
// pairing is data, so it can be reviewed as a list and asserted in a test.
//
// `feature: null` means the action is product baseline rather than packaged
// capability - it still needs the access formula, just no feature key.
// `permission: null` would mean "any signed-in member"; nothing uses it today.

import type { FeatureKey } from "../entitlement/capability";
import type { PermCode } from "./catalog";

/** The eight capability domains, spelled as agent_playbook.scope_domain does. */
export const DOMAINS = [
  "strategy",
  "planning",
  "campaign",
  "account",
  "signal",
  "pipeline",
  "delivery",
  "copilot",
  // D9 catalogue - what we sell. ADR-014 decided this was a domain when it gave
  // it its own schema ("建一个域，不是给商机加几个字段"); the list was never
  // updated, so until 2026-08-26 a `catalog.*` action id was a type error.
  //
  // IT CARRIES NO FEATURE KEY, and that is the whole design. The 19 keys are
  // the complete commercial surface (owner, 2026-08-26) and the catalogue is
  // not one of them: it is chain infrastructure, not a sellable capability -
  // you cannot sell anything without knowing what you sell. ADR-014 says the
  // same thing from the data side: everyone reads it, nobody writes it.
  //
  // So its actions are `feature: null` and the real control moves one layer
  // down, to permissions - which is the honest question anyway. "Did you buy
  // the price book" is not a question worth asking; "may this person set the
  // floor price" very much is. See ADR-017.
  "catalog",
] as const;

export type Domain = (typeof DOMAINS)[number];

/**
 * Where an action is filed. "admin" is product administration, which is NOT a
 * capability partition - it has no feature key, no schema and no page of its
 * own; it is the settings surface the partitions share.
 *
 * The catalogue IS a partition and is in DOMAINS, even though it also carries
 * no feature key. The two are not the same case, and the difference is what the
 * partition boundary is actually for: admin owns no business object, while the
 * catalogue owns four tables that nothing else may write. "No feature key"
 * describes how it is SOLD; owning objects is what makes it a partition.
 */
export type ActionScope = Domain | "admin";

export interface ActionSpec {
  domain: ActionScope;
  /** Entitlement gate input. null = baseline, no feature key required. */
  feature: FeatureKey | null;
  /** Permission gate input. */
  permission: PermCode | null;
  /** True if the action writes. Drives the read/write assertions below. */
  writes: boolean;
}

// The surface ("ui" | "data") is deliberately NOT part of a spec: it is a
// property of the call site, not of the action. A page render passes "ui"; an
// API route serving data passes "data".
export const ACTIONS = {
  // --- D1 strategy ---------------------------------------------------------
  "strategy.plan.view": {
    domain: "strategy",
    feature: "strategy.plan",
    permission: "strategy.read",
    writes: false,
  },
  "strategy.plan.create": {
    domain: "strategy",
    feature: "strategy.plan",
    permission: "strategy.write",
    writes: true,
  },
  "strategy.plan.update": {
    domain: "strategy",
    feature: "strategy.plan",
    permission: "strategy.write",
    writes: true,
  },
  "strategy.plan.approve": {
    domain: "strategy",
    feature: "strategy.plan",
    permission: "strategy.approve",
    writes: true,
  },
  "strategy.segment.view": {
    domain: "strategy",
    feature: "strategy.segment",
    permission: "strategy.read",
    writes: false,
  },
  "strategy.segment.upsert": {
    domain: "strategy",
    feature: "strategy.segment",
    permission: "strategy.write",
    writes: true,
  },

  // --- D2 planning ---------------------------------------------------------
  "planning.territory.view": {
    domain: "planning",
    feature: "planning.territory",
    permission: "planning.read",
    writes: false,
  },
  "planning.territory.upsert": {
    domain: "planning",
    feature: "planning.territory",
    permission: "planning.write",
    writes: true,
  },
  "planning.target.view": {
    domain: "planning",
    feature: "planning.target",
    permission: "planning.read",
    writes: false,
  },
  "planning.target.create": {
    domain: "planning",
    feature: "planning.target",
    permission: "planning.write",
    writes: true,
  },
  "planning.target.update": {
    domain: "planning",
    feature: "planning.target",
    permission: "planning.write",
    writes: true,
  },
  // Attainment is computed by D6 from forecast snapshots but read on a D2
  // surface; it is gated as a planning read, not a forecast submission.
  "planning.attainment.view": {
    domain: "planning",
    feature: "planning.target",
    permission: "planning.read",
    writes: false,
  },

  // --- D3 campaign ---------------------------------------------------------
  "campaign.view": {
    domain: "campaign",
    feature: "campaign.manage",
    permission: "campaign.read",
    writes: false,
  },
  "campaign.upsert": {
    domain: "campaign",
    feature: "campaign.manage",
    permission: "campaign.write",
    writes: true,
  },
  "campaign.execution.view": {
    domain: "campaign",
    feature: "campaign.execute",
    permission: "campaign.read",
    writes: false,
  },
  "campaign.execution.upsert": {
    domain: "campaign",
    feature: "campaign.execute",
    permission: "campaign.write",
    writes: true,
  },

  // --- D4 account ----------------------------------------------------------
  "account.view": {
    domain: "account",
    feature: "account.manage",
    permission: "account.read",
    writes: false,
  },
  "account.upsert": {
    domain: "account",
    feature: "account.manage",
    permission: "account.write",
    writes: true,
  },
  "account.contact.upsert": {
    domain: "account",
    feature: "account.manage",
    permission: "account.write",
    writes: true,
  },
  // --- evidence capture (ADR-018) -------------------------------------------
  // FEATURE KEY IS account.manage - the free one - and that is a decision, not
  // an omission. ADR-006 prescribed account.interaction / account.commitment as
  // new keys and neither was ever added; ADR-018 resolves that by deciding the
  // evidence plane is NOT separately sold. Paywalling capture would make
  // /admin/adoption measure willingness to pay instead of habit formation, and
  // that reading is what ADR-012 uses to decide whether phase 2 gets built.
  //
  // The PERMISSION is its own, and that is the real fix. Recording what
  // happened is not editing the customer master record: account.write was held
  // by three roles, so a delivery manager who sat in a customer meeting could
  // not write down that it happened - a hole in exactly the evidence base the
  // kill criterion reads.
  "account.interaction.record": {
    domain: "account",
    feature: "account.manage",
    permission: "account.record",
    writes: true,
  },
  "account.commitment.upsert": {
    domain: "account",
    feature: "account.manage",
    permission: "account.record",
    writes: true,
  },
  "account.commitment.settle": {
    domain: "account",
    feature: "account.manage",
    permission: "account.record",
    writes: true,
  },
  "account.graph.view": {
    domain: "account",
    feature: "account.graph",
    permission: "account.read",
    writes: false,
  },
  "account.graph.link": {
    domain: "account",
    feature: "account.graph",
    permission: "account.write",
    writes: true,
  },

  // --- D5 signal -----------------------------------------------------------
  "signal.view": {
    domain: "signal",
    feature: "signal.inbox",
    permission: "signal.read",
    writes: false,
  },
  "signal.triage": {
    domain: "signal",
    feature: "signal.inbox",
    permission: "signal.triage",
    writes: true,
  },
  // Re-scoring is the automatic scorer, a pro-tier capability; triaging by hand
  // stays available on starter.
  "signal.rescore": {
    domain: "signal",
    feature: "signal.autoscore",
    permission: "signal.triage",
    writes: true,
  },
  "signal.feed.configure": {
    domain: "signal",
    feature: "signal.external_feed",
    permission: "admin.manage",
    writes: true,
  },
  // Ingesting is not configuring. Configuring a feed is an administrative act;
  // writing the rows it produces is triage work, and the background subject
  // that does it must not need the catalogue's strongest permission to run -
  // that is the back door ADR-010 rule 2 exists to close. Reuses signal.triage,
  // so no new permission code, no increment, no seed change.
  "signal.feed.ingest": {
    domain: "signal",
    feature: "signal.external_feed",
    permission: "signal.triage",
    writes: true,
  },
  "signal.lead.view": {
    domain: "signal",
    feature: "signal.inbox",
    permission: "signal.read",
    writes: false,
  },
  "signal.lead.upsert": {
    domain: "signal",
    feature: "signal.inbox",
    permission: "signal.triage",
    writes: true,
  },
  // Conversion creates an opportunity, so it is gated as a pipeline write even
  // though the button lives on the lead. The seam belongs to the receiving side.
  "signal.lead.convert": {
    domain: "pipeline",
    feature: "pipeline.manage",
    permission: "pipeline.write",
    writes: true,
  },

  // --- D6 pipeline ---------------------------------------------------------
  "pipeline.view": {
    domain: "pipeline",
    feature: "pipeline.manage",
    permission: "pipeline.read",
    writes: false,
  },
  "pipeline.opportunity.create": {
    domain: "pipeline",
    feature: "pipeline.manage",
    permission: "pipeline.write",
    writes: true,
  },
  "pipeline.opportunity.update": {
    domain: "pipeline",
    feature: "pipeline.manage",
    permission: "pipeline.write",
    writes: true,
  },
  // Authorising a below-floor price. Same feature key as the deal it sits on -
  // a discount approval is not separately sellable (keys frozen at 19) - but a
  // permission of its own, held by nobody who edits deals.
  "pipeline.discount.approve": {
    domain: "pipeline",
    feature: "pipeline.manage",
    permission: "pipeline.discount",
    writes: true,
  },
  "pipeline.opportunity.advance": {
    domain: "pipeline",
    feature: "pipeline.manage",
    permission: "pipeline.write",
    writes: true,
  },
  "pipeline.forecast.view": {
    domain: "pipeline",
    feature: "pipeline.forecast",
    permission: "pipeline.read",
    writes: false,
  },
  // Submitting a snapshot is a commitment upward, which is why it needs the
  // dedicated pipeline.forecast permission rather than pipeline.write.
  "pipeline.forecast.snapshot": {
    domain: "pipeline",
    feature: "pipeline.forecast",
    permission: "pipeline.forecast",
    writes: true,
  },
  "pipeline.forecast.categorize": {
    domain: "pipeline",
    feature: "pipeline.forecast",
    permission: "pipeline.forecast",
    writes: true,
  },
  "pipeline.winloss.view": {
    domain: "pipeline",
    feature: "pipeline.winloss",
    permission: "pipeline.read",
    writes: false,
  },
  "pipeline.winloss.record": {
    domain: "pipeline",
    feature: "pipeline.winloss",
    permission: "pipeline.write",
    writes: true,
  },
  // 商机阶段 (incr/0057/0059). Viewing the catalog is pipeline.read - the same
  // authority as viewing the deals on it. Not a new feature key: the stage
  // catalog is configuration behind the existing pipeline.manage key, the same
  // way pipeline.discount governs a facet of it without its own key.
  "pipeline.stage.view": {
    domain: "pipeline",
    feature: "pipeline.manage",
    permission: "pipeline.read",
    writes: false,
  },
  // RENAME/REORDER/ADD/REMOVE A STAGE USED TO BE HERE, GATED ON ITS OWN
  // pipeline.stage.manage (incr/0059). Deleted (incr/0063): upsertStageDefinition
  // /moveStageDefinition/removeStageDefinition are exclusively called from
  // /admin/opportunity, which now gates on pipeline.opportunityconfig.manage
  // instead - nothing else ever checked this ActionId, so it is genuinely
  // dead rather than merely unused. The PermCode pipeline.stage itself is
  // NOT retired (still granted to its original 14 roles in the DB/catalog
  // mirror) - only this now-orphaned ActionId wrapper around it is gone.
  //
  // 签约类型 and 业务形态 (incr/0067) - the two axes 商机类型 (incr/0060) put
  // in one list. Viewing either catalog is pipeline.read, the same shape
  // pipeline.dealtype.view had and pipeline.stage.view still has. Neither is a
  // new feature key: both are configuration behind the existing
  // pipeline.manage one.
  "pipeline.contracttype.view": {
    domain: "pipeline",
    feature: "pipeline.manage",
    permission: "pipeline.read",
    writes: false,
  },
  "pipeline.businessform.view": {
    domain: "pipeline",
    feature: "pipeline.manage",
    permission: "pipeline.read",
    writes: false,
  },
  // RENAME/REORDER/ADD/REMOVE A DEAL TYPE USED TO BE HERE TOO (incr/0061),
  // GATED ON ITS OWN pipeline.dealtype.manage. Deleted (incr/0063) for the
  // same reason as pipeline.stage.manage above: the vocabulary-CRUD verbs
  // that checked it are exclusively called from /admin/opportunity, which now
  // gates on pipeline.opportunityconfig.manage instead. /pipeline/[id] also
  // checked this ActionId for a DIFFERENT question ("may this member set
  // which type a deal is") - fixed in that page to check
  // pipeline.opportunity.update instead, the permission updateCommercialTerms
  // actually enforces for that field (it was never pipeline.dealType; folding
  // dealTypeId into the general edit gate predates this batch). With both
  // uses gone, this ActionId is genuinely dead - the PermCode pipeline.dealType
  // itself is NOT retired (still granted to its original 12 roles in the
  // DB/catalog mirror).
  //
  // 商机配置 (PR4 of the batch, later unified incr/0063): the ASSEMBLY page
  // bundling 赢丢原因/商机类型/商机阶段/预测阈值/账龄分档/计价货币. Resolves
  // to plain pipeline.read, no feature key beyond the FREE-tier
  // pipeline.manage every page in this product carries - reaching the page
  // widens nobody's read access, and (owner principle, 2026-09-13: admin
  // configuration stays simple and open; tier complexity belongs on the real
  // business pages that USE these settings, not the page that only
  // configures them) none of the six sections layer a paid-tier gate on top
  // of this any more either - see listWinLossReasonsForConfig/
  // ageingCutoffsForConfig in service.ts for the two that used to.
  "pipeline.opportunityconfig.view": {
    domain: "pipeline",
    feature: "pipeline.manage",
    permission: "pipeline.read",
    writes: false,
  },
  // The one write permission for all six sections (incr/0063), replacing the
  // six each inherited from once being its own standalone route
  // (pipeline.dealType / pipeline.stage / pipeline.write / pipeline.forecast
  // / delivery.write / catalog.price - see incr/0063's own note for why the
  // SERVICE verbs behind this page's six save actions could move off those
  // without touching any other page). No feature key, same reasoning as the
  // view action above.
  "pipeline.opportunityconfig.manage": {
    domain: "pipeline",
    feature: null,
    permission: "pipeline.opportunityConfig",
    writes: true,
  },

  // --- D7 delivery ---------------------------------------------------------
  "delivery.project.view": {
    domain: "delivery",
    feature: "delivery.project",
    permission: "delivery.read",
    writes: false,
  },
  "delivery.project.upsert": {
    domain: "delivery",
    feature: "delivery.project",
    permission: "delivery.write",
    writes: true,
  },
  "delivery.milestone.upsert": {
    domain: "delivery",
    feature: "delivery.project",
    permission: "delivery.write",
    writes: true,
  },
  "delivery.revenue.view": {
    domain: "delivery",
    feature: "delivery.revenue",
    permission: "delivery.read",
    writes: false,
  },
  "delivery.revenue.upsert": {
    domain: "delivery",
    feature: "delivery.revenue",
    permission: "delivery.write",
    writes: true,
  },

  // --- D8 copilot ----------------------------------------------------------
  "copilot.session.open": {
    domain: "copilot",
    feature: "copilot.ask",
    permission: "copilot.use",
    writes: true,
  },
  "copilot.ask": {
    domain: "copilot",
    feature: "copilot.ask",
    permission: "copilot.use",
    writes: true,
  },
  // Asking for proposals is a higher tier than asking a question: a proposal is
  // the copilot reaching into the domain, an answer is not.
  "copilot.suggest": {
    domain: "copilot",
    feature: "copilot.suggest",
    permission: "copilot.use",
    writes: true,
  },
  "copilot.action.decide": {
    domain: "copilot",
    feature: "copilot.suggest",
    permission: "copilot.decide",
    writes: true,
  },
  "copilot.action.decide_batch": {
    domain: "copilot",
    feature: "copilot.suggest",
    permission: "copilot.decide",
    writes: true,
  },
  "copilot.autopilot.enable": {
    domain: "copilot",
    feature: "copilot.autopilot",
    permission: "copilot.autopilot",
    writes: true,
  },
  "copilot.playbook.view": {
    domain: "copilot",
    feature: "copilot.ask",
    permission: "copilot.use",
    writes: false,
  },
  // Reading the proposal QUEUE, which is not the same thing as reading the
  // playbooks it used to borrow its gate from. Deliberately free-tier: nothing
  // can CREATE a proposal below pro (recordProposals needs copilot.suggest) and
  // nothing can decide one, so the queue is empty at free tier unless the
  // workspace DOWNGRADED - and letting a downgraded workspace still see what
  // the agent proposed while they were paying is the retention surface, not a
  // giveaway. Costs nothing to serve: the rows already exist.
  "copilot.action.view": {
    domain: "copilot",
    feature: "copilot.ask",
    permission: "copilot.use",
    writes: false,
  },
  "copilot.playbook.upsert": {
    domain: "copilot",
    feature: "copilot.suggest",
    permission: "admin.manage",
    writes: true,
  },

  // --- D9 catalog (baseline, no feature key) --------------------------------
  // See the note on DOMAINS above and ADR-017: the catalogue is a partition
  // that is not sold separately, so every action here is `feature: null`.
  "catalog.product.view": {
    domain: "catalog",
    feature: null,
    permission: "catalog.read",
    writes: false,
  },
  "catalog.product.upsert": {
    domain: "catalog",
    feature: null,
    permission: "catalog.write",
    writes: true,
  },
  "catalog.solution.view": {
    domain: "catalog",
    feature: null,
    permission: "catalog.read",
    writes: false,
  },
  "catalog.solution.upsert": {
    domain: "catalog",
    feature: null,
    permission: "catalog.write",
    writes: true,
  },
  "catalog.pricebook.view": {
    domain: "catalog",
    feature: null,
    permission: "catalog.read",
    writes: false,
  },
  // THE FLOOR PRICE GETS ITS OWN PERMISSION, and it is the reason this
  // increment exists. `price_book_entry.floor_price` decides whether a discount
  // needs a signature - domains/catalog/lib/pricing.ts already computes that -
  // so whoever can move the floor can silently approve every discount in the
  // product. Same shape as pipeline.forecast splitting off pipeline.write:
  // "may edit the catalogue" and "may set what we will not go below" are two
  // different jobs.
  "catalog.pricebook.upsert": {
    domain: "catalog",
    feature: null,
    permission: "catalog.price",
    writes: true,
  },

  // --- Product administration (baseline, no feature key) --------------------
  // Role assignment must not be tier-gated: a workspace that can use the product
  // at all must be able to say who does what inside it.
  "admin.member.view": {
    domain: "admin",
    feature: null,
    permission: "admin.manage",
    writes: false,
  },
  // 安全审计 (owner, 2026-09-17): a browsable record of CONFIGURATION changes
  // only - who changed a role/member/permission, when, what it was. Not a
  // business-data audit (copilot.ask rides the same append-only table for an
  // unrelated reason, X-3 cost tracing, and this view excludes it) - workspace
  // administration, no feature key, admin.manage rather than a new PermCode.
  "admin.audit.view": {
    domain: "admin",
    feature: null,
    permission: "admin.manage",
    writes: false,
  },
  // 系统验证 > 平台对接 (owner, 2026-09-17): read the nine C1/C2/C3 probes
  // (app/api/platform-check/check.ts) inside the app shell instead of only at
  // the pre-shell /(demo)/platform-check bootstrap route. Workspace
  // administration, no feature key - same reasoning as every other admin.*
  // read.
  "admin.diagnostics.view": {
    domain: "admin",
    feature: null,
    permission: "admin.manage",
    writes: false,
  },
  // The ONE probe that spends (checklist #5, C3 replay) is gated separately
  // from viewing the page - it consumes one real yucer.copilot.turns unit
  // against the workspace's quota, at most once a day, and "may see this page"
  // should not silently double as "may spend against our quota". Same split
  // as catalog.write / catalog.price.
  "admin.diagnostics.probe": {
    domain: "admin",
    feature: null,
    permission: "admin.manage",
    writes: true,
  },
  // 提醒阈值 (incr/0065-0066): how many days of silence count as quiet/stale,
  // a decision-chain contact's warmth window, and how early a renewal
  // surfaces. All three are workspace administration, not a sales capability
  // - same reasoning as admin.audit.view - so no feature key, and view/
  // manage share admin.manage rather than minting a new PermCode the way
  // pipeline.opportunityConfig did (that one existed to replace six PAID-TIER
  // gates; these three were never tier-gated to begin with).
  "admin.reminderthreshold.view": {
    domain: "admin",
    feature: null,
    permission: "admin.manage",
    writes: false,
  },
  "admin.reminderthreshold.manage": {
    domain: "admin",
    feature: null,
    permission: "admin.manage",
    writes: true,
  },
  "admin.member.role.assign": {
    domain: "admin",
    feature: null,
    permission: "admin.manage",
    writes: true,
  },
  "admin.member.role.revoke": {
    domain: "admin",
    feature: null,
    permission: "admin.manage",
    writes: true,
  },
  // Deactivation needs NO new permission. Whoever may revoke a role can already
  // reach the same access outcome one role at a time, so inventing a stronger
  // permission for the shortcut would be a gate that guards nothing - and the
  // catalogue grows only when "who inside a workspace may do this" has a new
  // answer, not when a new button appears.
  "admin.member.deactivate": {
    domain: "admin",
    feature: null,
    permission: "admin.manage",
    writes: true,
  },
  "admin.member.reactivate": {
    domain: "admin",
    feature: null,
    permission: "admin.manage",
    writes: true,
  },
  // Deciding what somebody may SEE, beside deciding what they may DO. Same
  // permission for the same reason deactivation reuses it: whoever grants a
  // role already makes this class of decision about a colleague.
  "admin.member.scope": {
    domain: "admin",
    feature: null,
    permission: "admin.manage",
    writes: true,
  },
  // 角色管理 (incr/0046, owner 2026-09-09: 支持新建，排序，授权). Two verbs,
  // one permission: whoever may say who holds a role may also say what the
  // role is. NO NEW PERMISSION for the same reason deactivation got none - the
  // catalogue grows when "who inside a workspace may do this" has a new
  // answer, and it does not: admin.manage already names the person who
  // administers roles.
  "admin.role.upsert": {
    domain: "admin",
    feature: null,
    permission: "admin.manage",
    writes: true,
  },
  "admin.role.remove": {
    domain: "admin",
    feature: null,
    permission: "admin.manage",
    writes: true,
  },
  // 组织结构 (incr/0051, owner 2026-09-10). Same permission, same reasoning as
  // the roles: whoever administers members decides what units exist and who
  // belongs where. Reading rides admin.member.view.
  "admin.org.upsert": {
    domain: "admin",
    feature: null,
    permission: "admin.manage",
    writes: true,
  },
  "admin.org.remove": {
    domain: "admin",
    feature: null,
    permission: "admin.manage",
    writes: true,
  },
} as const satisfies Record<string, ActionSpec>;

export type ActionId = keyof typeof ACTIONS;

export const ACTION_IDS = Object.keys(ACTIONS) as ActionId[];

export function specFor(action: ActionId): ActionSpec {
  return ACTIONS[action];
}
