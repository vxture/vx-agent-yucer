import { cache } from "react";
import { resolveNavigation } from "./navigation";
import {
  activeDomainFromPath,
  primaryHref,
  resolveFunctionalDomains,
} from "./functional-domains";
import type { Entitlement } from "../../entitlement/types";
import type { AuthzContext } from "../../authz/context";
import {
  getAccountStore,
  getCatalogStore,
  getCopilotStore,
  getDeliveryStore,
  getFieldStore,
  getPipelineStore,
  getPlanningStore,
  getSignalStore,
  getStrategyStore,
} from "../../domains/shared/registry";
import { listAccounts } from "../../domains/account/service";
import {
  listPipeline,
  listPendingReviews,
  listRenewedProjectIds,
  previewCategories,
} from "../../domains/pipeline/service";
import { listPlans, listCampaigns, listSegments } from "../../domains/strategy/service";
import {
  listTargets,
  listTerritories,
  attainment,
} from "../../domains/planning/service";
import { listSignals, listLeads } from "../../domains/signal/service";
import { listProjects, listRenewals } from "../../domains/delivery/service";
import { listProposals } from "../../domains/copilot/service";
import {
  listOpportunityLines,
  listPrices,
  listProducts as listCatalogProducts,
  listSolutions,
} from "../../domains/catalog/service";
import { judgementFeed } from "../../domains/judgement/service";
import { inPeriod, rollUp } from "../../domains/pipeline/lib/forecast";
import {
  coverage,
  resolveCoverageFloor,
} from "../../domains/planning/lib/coverage";
// NOT a static import of the Chinese constants. board.ts builds the section
// titles and metric labels the two flanks render, so it decides copy - and copy
// follows the request's locale. Both entry points await the dictionary; it is
// resolved once per render by next/headers, so two calls cost one resolution.
import { getMessages } from "./i18n/server";
import { summaryTarget } from "../../domains/planning/lib/target";
import type { AppSession } from "./session";

// The numbers behind the navigation board.
//
// The sidebar stopped being a list of links and became a set of sections that
// state where things stand. That only works if the numbers are REAL: a
// navigation panel that reports counts is making claims, and an invented or
// stale figure there is worse than no figure, because it is read as fact
// without anyone opening anything.
//
// So every number here comes from the domain's own SERVICE, not its store -
// the same call the domain's page makes, through the same two gates. A section
// a member may not read returns no numbers rather than zeros: "0 accounts" and
// "you cannot see accounts" are different statements and must not look alike.

export interface BoardMetric {
  readonly label: string;
  /** Colour carries meaning here, so it is data rather than a style choice. */
  readonly tone?: "bad" | "warn" | "good";
  /** Pre-formatted, because a number's unit is part of what it means. */
  readonly value: string;
  /**
   * The raw magnitude behind `value`, for sections that draw their numbers.
   *
   * Separate from `value` because the two are for different readers: `value` is
   * the formatted string a person reads ("253 万"), `weight` is what a bar's
   * length is computed from. Parsing the string back into a number would make
   * the chart depend on the formatting - change 万 to 亿 and the bars silently
   * become wrong.
   */
  readonly weight?: number;
}

/**
 * One module's card in the navigation.
 *
 * THE NAVIGATION IS THE BOARD NOW (2026-08-31). Until this batch the left pane
 * carried two stacked structures: a module list, which was names and icons and
 * nothing else, and a set of board cards keyed by ROUTE. A reader had to hold
 * both to answer "what is in this domain and where does it stand", and the two
 * disagreed about what a domain contains - the module list came from the
 * launcher, the cards from whatever board.ts happened to compute.
 *
 * One card per module, in the launcher's own order, each carrying the one
 * figure that is a reason to open it. `metrics` empty is the honest state for a
 * module whose gate refused: no number, never a zero.
 */
export interface BoardModuleCard {
  readonly metrics: readonly BoardMetric[];
  /** Same meaning as on a section - see the note there. */
  readonly chart?: "lede" | "bars";
}

export interface BoardSection {
  readonly key: string;
  readonly title: string;
  readonly href: string;
  /**
   * Which of the five this card belongs to, derived from its href - null means
   * it belongs to none and is shown everywhere.
   *
   * THE BOARD IS THE MENU, and before this it was one flat stack of every card
   * at once: the quota, four judgement cards and five domain blocks, on every
   * route, whatever you were doing. That is a menu for a product with no
   * domains. With five relatively independent sections the menu has to be the
   * section's own - you are in 阵地经营域, so the menu is 阵地经营域's.
   */
  readonly domain: string | null;
  /**
   * A MAP ENTRY rather than a card of this domain's own work: one row per
   * domain, shown only when you are not inside one. It is how you choose which
   * section to enter, so it must not appear once you have.
   */
  readonly isMap?: boolean;
  /** Empty when the member cannot read the domain, or nothing exists yet. */
  readonly metrics: readonly BoardMetric[];
  /** 0-100, only where a real denominator exists. */
  readonly progress?: number;
  /**
   * How this section's numbers should be DRAWN, decided here rather than in the
   * component, because it is a claim about what they mean:
   *
   *   "lede" - ONE of these figures is the reason to look, and the rest are
   *            context for it. The first metric is the lede; it is drawn large
   *            and in its own tone, the others compress onto a single muted
   *            line beneath. board.ts decides which comes first, because which
   *            number demands action is a business judgement, not a layout one.
   *   "bars" - the metrics are independent magnitudes on a common unit, so the
   *            comparison is between them (money per product line). Drawn as a
   *            row each.
   *
   * A "share" shape existed here and was removed. A stacked proportion bar
   * asserts that the SPLIT of a whole is the point, and for these numbers it
   * never was: nobody needs the ratio of today to this-week, they need "4
   * today". The encoding answered a question no one had asked, which is why it
   * read as decorative.
   *
   * Absent means the numbers do not relate to each other and drawing them would
   * assert a relationship that is not there.
   */
  readonly chart?: "lede" | "bars";
  /**
   * The two-row gauge: what the period asks for, and what is on hand to meet it.
   *
   * Its own shape rather than more metrics, because it is the one card that
   * states a RELATIONSHIP between two figures instead of listing figures. A
   * target and a pipeline printed side by side leave the reader to divide them;
   * this puts the division on screen.
   */
  readonly gauge?: {
    readonly label: string;
    readonly value: string;
    /** Coverage, or null when the target is already met. */
    readonly note: string | null;
    readonly thin: boolean;
    /**
     * The funnel, in descending confidence. Straight from rollUp() - the same
     * function the pipeline page and the snapshot writer use, so this card and
     * that page cannot report different money.
     */
    readonly funnel: readonly {
      readonly label: string;
      readonly value: string;
      readonly weight: number;
    }[];
    /**
     * The axis. Without one a bar of pipeline is just a coloured rectangle -
     * 881万 is only meaningful against what it has to cover.
     *
     * The axis is the RESOURCE TARGET - what the pool has to be, which is the
     * coverage multiple times what is still to close: 3 x (target - closed).
     * The track's full width is therefore "enough pipeline", and a track that
     * is not full IS the warning. No separate mark is needed inside it; the
     * shortfall the mark used to show is now the empty part of the track.
     */
    readonly scaleMax: number;
  };
}

export interface BoardContext {
  workspaceId: string;
  sub: string;
  holder: AuthzContext;
  entitlement: Entitlement;
  /**
   * The scoped stores, from the session.
   *
   * Passed in rather than fetched here. This module has no session, so reaching
   * for `getPipelineStore()` would silently give it an UNSCOPED one - and the
   * board is the worst place for that: it is the first screen, and it rolls the
   * numbers up.
   */
  stores: AppSession["stores"];
}

/**
 * The judgement feed, deduplicated within a request.
 *
 * The layout needs its counts for the board and the home page needs the whole
 * feed, and it is the most expensive read in the product - it walks every
 * account's notes, commitments and contacts. Without cache() the home screen
 * would compute it twice per request. React's cache() keys on the arguments,
 * so both callers share one computation and every other page pays for it once.
 */
export const cachedFeed = cache(judgementFeed);

/** A count, or nothing at all if the gate refused. */
function count(
  result: { ok: boolean; value?: unknown },
  label: string,
): BoardMetric[] {
  if (!result.ok || !Array.isArray(result.value)) return [];
  return [{ label, value: String(result.value.length) }];
}

/**
 * Group the per-route archive cards under the five functional domains.
 *
 * The grouping is READ from FUNCTIONAL_DOMAINS rather than restated: a sixth
 * domain, or a module moving between two, must not need an edit here. Only
 * `built` modules appear - a section row is part of a page already listed, and
 * a planned one has no number to carry.
 *
 * A domain with no reachable module contributes nothing, so a permission gap
 * stays as silent here as it is in the launcher.
 */
/**
 * Which domain a card belongs to, READ FROM ITS href rather than hand-assigned.
 *
 * A card links to the page its numbers came from, and that page already sits
 * in exactly one domain - so the href IS the answer, and a card moving to a
 * different page moves menus automatically. Hand-assigning would let the two
 * drift, and a card filed under a domain it does not link into is a menu
 * entry that leaves the section when clicked.
 *
 * "/" belongs to no domain: the home stream is where you land before choosing
 * one, so its card is shown in every menu.
 */
function domainOfHref(href: string): string | null {
  return activeDomainFromPath(href);
}

function archiveByDomain(
  cards: Record<string, { title: string; href: string; metrics: BoardMetric[] }>,
  ctx: BoardContext,
  groupLabel: Record<string, string>,
): BoardSection[] {
  const nav = resolveNavigation(ctx.holder, ctx.entitlement);
  const out: BoardSection[] = [];
  for (const domain of resolveFunctionalDomains(nav)) {
    const rows = domain.modules
      .filter((m): m is Extract<typeof m, { kind: "built" }> => m.kind === "built")
      .map((m) => cards[m.key])
      .filter(Boolean);
    if (rows.length === 0) continue;
    out.push({
      key: `domain-${domain.key}`,
      title: groupLabel[domain.key] ?? domain.key,
      domain: domain.key,
      isMap: true,
      // The same destination the domain name has everywhere else: its home
      // where it has one, its single page where it is that page.
      href: primaryHref(domain) ?? rows[0].href,
      metrics: rows.flatMap((r) => r.metrics),
    });
  }
  return out;
}

export interface Board {
  readonly sections: readonly BoardSection[];
  /** Keyed by module key, the same keys FUNCTIONAL_DOMAINS uses. */
  readonly modules: Record<string, BoardModuleCard>;
}

export async function boardSections(ctx: BoardContext): Promise<Board> {
  const { BOARD_TEXT, FORECAST_LABEL, DOMAIN_GROUP_LABEL } = await getMessages();
  const base = {
    workspaceId: ctx.workspaceId,
    sub: ctx.sub,
    holder: ctx.holder,
    entitlement: ctx.entitlement,
  };

  const [
    feed,
    deals,
    proposals,
    plans,
    campaigns,
    targets,
    territories,
    accounts,
    signals,
    leads,
    projects,
    lineResult,
    catalogueResult,
    segments,
    solutions,
    prices,
    unreviewed,
    renewedIds,
    categories,
  ] = await Promise.all([
    cachedFeed(base),
    listPipeline({ ...base, store: ctx.stores.pipeline() }),
    listProposals(
      { ...base, store: getCopilotStore() },
      { status: "proposed" },
    ),
    listPlans({ ...base, store: getStrategyStore() }),
    listCampaigns({ ...base, store: getStrategyStore() }),
    listTargets({ ...base, store: getPlanningStore() }),
    listTerritories({ ...base, store: getPlanningStore() }),
    listAccounts({ ...base, store: ctx.stores.account() }),
    listSignals({ ...base, store: ctx.stores.signal() }),
    listLeads({ ...base, store: ctx.stores.signal() }),
    listProjects({ ...base, store: getDeliveryStore() }),
    // THROUGH THE SERVICE, like every sibling on this list. These two were the
    // only reads on the board holding a store handle directly, which skips both
    // gates - and a board is the one surface where that is easiest to miss,
    // because every card is a number rather than a page you notice opening.
    listOpportunityLines({ ...base, store: getCatalogStore() }),
    listCatalogProducts({ ...base, store: getCatalogStore() }),
    // ADDED 2026-08-31 for the per-module navigation cards. Each nav card needs
    // the ONE figure that is a reason to open its module, and eleven of the
    // nineteen modules had no number anywhere - the board only ever computed
    // the eight it grouped into domain rows.
    //
    // All in the same Promise.all as their siblings, so the board still costs
    // one round of parallel reads rather than a waterfall. Every one goes
    // through the service, so a member who cannot read a domain gets a card
    // with no number instead of a zero - the distinction the whole board is
    // built on.
    listSegments({ ...base, store: getStrategyStore() }),
    listSolutions({ ...base, store: getCatalogStore() }),
    listPrices({ ...base, store: getCatalogStore() }),
    listPendingReviews({ ...base, store: ctx.stores.pipeline() }),
    listRenewedProjectIds({ ...base, store: ctx.stores.pipeline() }),
    previewCategories({ ...base, store: ctx.stores.pipeline() }),
  ]);

  // Renewals need D6's answer first, so this one cannot join the round above.
  // It is the only sequential read on the board and it is one hop, not a
  // waterfall - the same composition /renewal does, for the same reason: D7 has
  // no read of D6, so the caller carries the fact across.
  const renewals = await listRenewals(
    { ...base, store: getDeliveryStore() },
    renewedIds.ok ? renewedIds.value : new Set<string>(),
  );

  // Gate-aware now that these go through the service. A refused read degrades
  // to an empty card, which is what every other card on this board already
  // does - the board reports what you may see, and says nothing about the rest.
  const lines = lineResult.ok ? lineResult.value : [];
  const pendingApproval = lines.filter((l) => l.needsApproval && !l.approved);
  // Open deals only, and their value. "How many deals exist" is a database
  // fact; "what is still in play and what is it worth" is the question someone
  // opens this product with.
  const open = deals.ok ? deals.value.filter((d) => d.closedAt === null) : [];
  const worth = open.reduce((sum, d) => sum + (d.amount?.amount ?? 0), 0);
  // Attainment comes from the DOMAIN, not from arithmetic here.
  //
  // The first version summed every committed target and every won deal. Both
  // halves were wrong. Targets are HIERARCHICAL - the workspace target already
  // contains its territories - so summing them double-counted and produced a
  // denominator of 21.5M against a 12M quota. And the numerator missed every
  // closed deal, because listPipeline excludes terminal ones by default.
  //
  // planning.attainment() already reconciles a target against what actually
  // closed for that exact scope, and it keeps apart the two cases this card
  // could most easily lie about: "nobody has forecast this yet" and "attained
  // zero". Rendering both as 0% would report an unforecast quarter as a failed
  // one.
  // A MONEY target, via the shared rule. This card formats in wan and feeds
  // `coverage`, which is money arithmetic end to end; a committed new-logo
  // target picked up here would render "10 customers" as 10 wan and divide a
  // pipeline by it (TD-013). The selection lives in the rule layer because the
  // planning page needed the same one and both had written it inline.
  const wsTarget = targets.ok ? (summaryTarget(targets.value) ?? undefined) : undefined;
  const rows = wsTarget
    ? await attainment({ ...base, store: getPlanningStore() }, wsTarget.period)
    : null;
  const wsRow = rows?.ok
    ? rows.value.find((r) => r.target.id === wsTarget?.id)
    : undefined;

  // Narrowed once here rather than at the use site: proposals is a RuleResult,
  // and a member who cannot read them gets no figure rather than a zero - "0
  // proposals" and "you cannot see proposals" are different statements.
  const proposalCount = proposals.ok ? proposals.value.length : 0;

  // Coverage needs all three of pipeline, target and closed. Without a
  // committed target there is no gap to cover and the card stays as it was -
  // an invented denominator would be worse than no ratio.
  // The funnel split, from the SAME function the pipeline page and the snapshot
  // writer use. Recomputing it here with a private sum is how a board and a page
  // start reporting different money for the same quarter.
  //
  // FILTERED TO THIS QUARTER (TD-014). The card says "this quarter's commit"
  // and until now said it over every open deal in the book, including ones
  // expected to land next year. `worth` above is deliberately NOT filtered -
  // "what is still in play" is not a claim about a quarter, and its card does
  // not make one.
  // THE TARGET'S PERIOD, NOT TODAY'S. Every figure below belongs to one card,
  // and that card is about attaining ONE target: its title names the target's
  // period, `attainment` above reconciles against the target's period, and the
  // gauge divides this pool by that target's gap.
  //
  // It shipped reading `currentPeriod(new Date())` (PR #71). Today the two
  // agree, so nothing looked wrong - but on the first day of a new quarter, or
  // for a workspace that commits next quarter's target early, the gauge would
  // divide one period's pipeline by another period's gap. That is exactly the
  // numerator/denominator mismatch TD-014 existed to remove, reached by a
  // different route and silent about it.
  const window =
    deals.ok && wsTarget ? inPeriod(open, wsTarget.period) : null;
  // NO FALLBACK TO THE UNFILTERED LIST. A target whose period this product
  // cannot parse gets no gauge rather than a pool measured over the whole book:
  // falling back would restore the defect and hide it behind a rendered number.
  const quarterOpen = window ? window.kept : [];
  // THE POOL IS THIS QUARTER'S TOO, and it has to be, because the gauge divides
  // it by this quarter's gap. A deal expected to land in December does not
  // cover a September shortfall, and counting it made the coverage ratio
  // report a pool that could not do the job it was being measured against.
  //
  // `worth` above stays unfiltered: it feeds "product lines in play", which
  // claims no period and should not acquire one.
  const quarterWorth = quarterOpen.reduce((sum, d) => sum + (d.amount?.amount ?? 0), 0);

  const cover =
    wsTarget && wsRow
      ? coverage(
          quarterWorth,
          wsTarget.targetValue.amount,
          wsRow.measurement.kind === "measured" ? wsRow.measurement.achieved.amount : 0,
          resolveCoverageFloor(process.env.YUCER_COVERAGE_FLOOR),
        )
      : null;

  const sections: BoardSection[] = [
    // ONE queue. These were two cards - "today's judgements" and "awaiting my
    // adjudication" - and both restated a panel already on screen: the first
    // reproduced the centre's own tier filter figure for figure, the second
    // reproduced the agent deck's pending list. Two restatements of two
    // neighbours is not a board, it is an echo.
    //
    // They also answer one question between them: what is waiting on ME. The
    // streams behind them differ - a judgement is a conclusion the agent
    // reached, a proposal is an action it wants to take and cannot without a
    // signature (ADR-003) - but that distinction belongs where the work is
    // done, not on a standing summary that has to survive on every route.
    //
    // Deliberately NOT summed into one total: agent_action carries
    // origin_assessment_id, so a proposal can descend from a judgement, and
    // adding them would report the same piece of work twice.
    {
      key: "queue",
      title: BOARD_TEXT.queue,
      href: "/",
      domain: domainOfHref("/"),
      chart: "lede",
      metrics: feed.ok
        ? [
            // The lede, and the only figure with a deadline attached.
            {
              label: BOARD_TEXT.ledeToday,
              value: String(feed.value.counts.today),
              tone: "bad",
            },
            {
              label: BOARD_TEXT.tierWeek,
              value: String(feed.value.counts.week),
              tone: "warn",
            },
            {
              label: BOARD_TEXT.tierWatch,
              value: String(feed.value.counts.watch),
            },
            ...(proposalCount > 0
              ? [
                  {
                    label: BOARD_TEXT.proposals,
                    value: String(proposalCount),
                    tone: "warn" as const,
                  },
                ]
              : []),
          ]
        : [],
    },
    // THE ARCHIVE, GROUPED BY THE FIVE FUNCTIONAL DOMAINS.
    //
    // It used to be six flat cards - one per route, in route order, with no
    // statement about how they relate. That was the navigation of a product
    // that had no domains. The launcher, the module strip and the domain homes
    // all speak in five groupings now, and a board that kept listing routes
    // was the one surface still describing the OLD shape: a reader who learned
    // "阵地经营域 holds accounts and deals" from the launcher found them in
    // this list separated by 商机智探, which belongs to a different domain.
    //
    // Each block names its domain and carries its modules' one-number
    // summaries. The domain title links where the domain name links anywhere
    // else - its home when it has one, its single page when it is that page -
    // so the same word goes to the same place in all four surfaces.
    //
    // Domains a member cannot reach at all disappear, which resolveArchive
    // gets for free: it reads the same resolved navigation everything else
    // does, so a permission gap is silent here exactly as it is in the
    // launcher.
    ...archiveByDomain(
      {
        strategy: { title: BOARD_TEXT.strategy, href: "/strategy", metrics: count(plans, BOARD_TEXT.plans) },
        campaign: { title: BOARD_TEXT.campaign, href: "/campaign", metrics: count(campaigns, BOARD_TEXT.campaigns) },
        planning: {
          title: BOARD_TEXT.planning,
          href: "/planning",
          metrics: [...count(targets, BOARD_TEXT.targets), ...count(territories, BOARD_TEXT.territories)],
        },
        account: { title: BOARD_TEXT.account, href: "/account", metrics: count(accounts, BOARD_TEXT.accounts) },
        signal: {
          title: BOARD_TEXT.signal,
          href: "/signal",
          metrics: [...count(signals, BOARD_TEXT.signals), ...count(leads, BOARD_TEXT.leads)],
        },
        delivery: { title: BOARD_TEXT.delivery, href: "/delivery", metrics: count(projects, BOARD_TEXT.projects) },
        catalog: { title: BOARD_TEXT.catalog, href: "/catalog", metrics: count(catalogueResult, BOARD_TEXT.catalogProducts) },
        pipeline: { title: BOARD_TEXT.pipelineArchive, href: "/pipeline", metrics: count(deals, BOARD_TEXT.deals) },
      },
      ctx,
      DOMAIN_GROUP_LABEL,
    ),
  ];

  // Shown only with a workspace-scope committed target AND a snapshot behind
  // it. No target means no denominator; no snapshot means nobody has forecast
  // the period, which is not the same as having attained nothing.
  const wsMeasured =
    wsRow?.measurement.kind === "measured" && wsRow.measurement.ratio !== null
      ? wsRow.measurement
      : null;
  // THE QUOTA CARD IS GONE (2026-08-31), with the resource gauge, the product
  // composition and the allies count. All four were cards belonging to no
  // module, which is what made them homeless once the navigation became "the
  // queue, then this domain's modules". Three of them are now the /attainment
  // page - the owner's ruling was that they were never three readings but one
  // question asked three ways - and the fourth, the unreached decision-makers,
  // rides on the account module's card, since it was the only one of the four
  // with no other reading surface.

  // --- One card per module, for the navigation -------------------------------
  //
  // Ordered by nothing here: FUNCTIONAL_DOMAINS owns the order and the nav
  // reads it. This map only answers "what is this module's number".
  //
  // A metric is chosen for being a REASON TO OPEN the module, not for being
  // easy: 线索分派 carries how many leads are waiting on an owner, not how many
  // leads exist. Where the honest answer is a plain inventory count - how many
  // segments, how many products - that is what it says, because for those
  // modules the inventory IS the state.
  const openLeads = leads.ok ? leads.value.filter((l) => l.status !== "converted" && l.status !== "disqualified") : [];
  const disputed = categories.ok
    ? categories.value.filter((c) => c.verdict.kind === "suggested" && !c.verdict.agrees)
    : [];
  const dueRenewals = renewals.ok ? renewals.value.filter((r) => r.verdict.kind === "due") : [];
  const namedAccounts = accounts.ok ? accounts.value.filter((a) => a.tier !== "standard") : [];
  const inDelivery = projects.ok
    ? projects.value.filter((p) => p.status === "active" || p.status === "on_hold")
    : [];
  const deliveryValue = inDelivery.reduce((sum, p) => sum + (p.contractAmount?.amount ?? 0), 0);

  const modules: Record<string, BoardModuleCard> = {
    // 战略武备域
    strategy: { metrics: count(plans, BOARD_TEXT.plans) },
    segment: { metrics: count(segments, BOARD_TEXT.segments) },
    catalog: { metrics: count(catalogueResult, BOARD_TEXT.catalogProducts) },
    solution: { metrics: count(solutions, BOARD_TEXT.solutions) },
    pricebook: { metrics: count(prices, BOARD_TEXT.pricedProducts) },

    // 作战部署域
    territory: { metrics: count(territories, BOARD_TEXT.territories) },
    namedAccount: {
      metrics: accounts.ok
        ? [{ label: BOARD_TEXT.namedAccounts, value: String(namedAccounts.length) }]
        : [],
    },
    planning: { metrics: count(targets, BOARD_TEXT.targets) },
    forecastRule: {
      // The DISAGREEMENTS, not the deal count. A forecast-rule page with
      // nothing to argue about needs no visit, and "12 deals" would send
      // somebody to look at agreement.
      metrics: categories.ok
        ? [
            {
              label: BOARD_TEXT.forecastDisagreements,
              value: String(disputed.length),
              ...(disputed.length > 0 ? { tone: "warn" as const } : {}),
            },
          ]
        : [],
    },

    // 战场侦察域
    campaign: { metrics: count(campaigns, BOARD_TEXT.campaigns) },
    signal: { metrics: count(signals, BOARD_TEXT.signals) },
    routing: {
      metrics: leads.ok
        ? [{ label: BOARD_TEXT.unrouted, value: String(openLeads.length) }]
        : [],
    },

    // 阵地经营域
    attainment: {
      // THE ATTAINMENT, not the target. What the period asked for is a
      // constant a reader already knows; how much of it has landed is the
      // reading that changes and the reason to open the page. No committed
      // target means no denominator, so the card carries no figure rather
      // than a 0% - "nobody set a quota" and "we attained none of it" are
      // opposite statements.
      metrics:
        wsTarget && wsMeasured
          ? [
              {
                label: BOARD_TEXT.quotaOf,
                value: `${Math.max(0, Math.min(100, Math.round((wsMeasured.ratio ?? 0) * 100)))}%`,
                ...(cover?.thin ? { tone: "warn" as const } : {}),
              },
            ]
          : [],
    },
    account: {
      // The roster count, and beside it the decision-makers nobody has
      // reached. The second figure used to be a card of its own ("盟友") and
      // was the only one of the four homeless cards whose number had no other
      // reading surface - so it moved here rather than being deleted with
      // them.
      metrics: accounts.ok
        ? [
            { label: BOARD_TEXT.accounts, value: String(accounts.value.length) },
            ...(feed.ok
              ? [
                  {
                    label: BOARD_TEXT.alliesUnreachable,
                    value: String(feed.value.allies.unreachable),
                    ...(feed.value.allies.unreachable > 0 ? { tone: "warn" as const } : {}),
                  },
                ]
              : []),
          ]
        : [],
    },
    pipeline: {
      chart: "lede",
      metrics: deals.ok
        ? [
            { label: BOARD_TEXT.openDeals, value: String(open.length) },
            { label: BOARD_TEXT.deals, value: BOARD_TEXT.wan(worth) },
          ]
        : [],
    },
    quote: {
      // Lines awaiting a signature. The count of quotes is a database fact;
      // what is waiting on a person is the reason to open it.
      metrics: lineResult.ok
        ? [
            {
              label: BOARD_TEXT.quoteApprovals,
              value: String(pendingApproval.length),
              ...(pendingApproval.length > 0 ? { tone: "warn" as const } : {}),
            },
          ]
        : [],
    },
    winLossReview: {
      metrics: unreviewed.ok
        ? [
            {
              label: BOARD_TEXT.unreviewed,
              value: String(unreviewed.value.length),
              ...(unreviewed.value.length > 0 ? { tone: "warn" as const } : {}),
            },
          ]
        : [],
    },

    // 战果沉淀域
    delivery: { metrics: count(projects, BOARD_TEXT.projects) },
    collection: {
      // Contract value still in delivery. The instalment-level figure would
      // need a read per project - the port lists instalments per project only -
      // and an N+1 on a pane that renders on every page is too much to pay for
      // one number. This is the honest cheaper answer: what is out there to be
      // collected against.
      metrics: projects.ok
        ? [{ label: BOARD_TEXT.contractValue, value: BOARD_TEXT.wan(deliveryValue) }]
        : [],
    },
    renewal: {
      metrics: renewals.ok
        ? [
            {
              label: BOARD_TEXT.renewalsDue,
              value: String(dueRenewals.length),
              ...(dueRenewals.length > 0 ? { tone: "warn" as const } : {}),
            },
          ]
        : [],
    },
  };

  return { sections, modules };
}

// ---------------------------------------------------------------------------
// The right panel.
//
// Capture, and the two short lists that prove capture is working: what the
// agent has put in front of a person, and what that person last wrote down.
// It lives in the SHELL rather than on the home page because it belongs to no
// single screen - a note is worth keeping whatever you were looking at.

export interface AgentPanelData {
  /** Present when the deck is scoped to one object; names it. */
  readonly scope?: { readonly name: string };
  readonly scanned: number;
  readonly pending: readonly {
    id: string;
    title: string;
    why: string;
    source: string;
  }[];
  readonly recent: readonly { id: string; text: string; when: string }[];
}

/**
 * What the deck is looking at, when it is looking at ONE thing.
 *
 * Absent on a first-level page, where the deck reports across the workspace.
 * Present on a detail page, where a deck listing OTHER objects is not clutter
 * but a wrong answer - it tells a reader that this is what needs deciding about
 * the thing in front of them, and it is not.
 */
export interface AgentScope {
  readonly type: "account" | "opportunity";
  readonly id: string;
  readonly name: string;
  /**
   * Where this object's judgements actually live, when that is not itself.
   *
   * EVERY RULE IN judgement.ts KEYS ITS OUTPUT TO AN ACCOUNT - six of them do,
   * and the seventh is the team reading. No rule produces an
   * opportunity-subject judgement, so filtering a deal's deck by the deal's own
   * id finds nothing, forever, silently.
   *
   * The truthful nearest thing is the deal's ACCOUNT: "this account has been
   * stalled in negotiate for 59 days" is a judgement about the deal in front of
   * you, filed under the account because that is where the rule filed it. So a
   * deal passes its account id here rather than showing an empty panel and
   * implying nothing is wrong.
   */
  readonly judgementSubjectId?: string;
}

export async function agentPanel(
  ctx: BoardContext,
  now: Date,
  scope?: AgentScope,
): Promise<AgentPanelData> {
  const { BOARD_TEXT, FORECAST_LABEL } = await getMessages();
  const base = {
    workspaceId: ctx.workspaceId,
    sub: ctx.sub,
    holder: ctx.holder,
    entitlement: ctx.entitlement,
  };

  const [feed, notes] = await Promise.all([
    cachedFeed(base),
    getFieldStore().listInteractions(ctx.workspaceId, {
      limit: 3,
      // Scoped to the object when there is one. The filter is the store's, so
      // this is a narrower query rather than a wider one filtered afterwards.
      ...(scope?.type === "account" ? { accountId: scope.id } : {}),
      ...(scope?.type === "opportunity" ? { opportunityId: scope.id } : {}),
    }),
  ]);

  const day = (d: Date) => {
    const n = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
    return n <= 0 ? BOARD_TEXT.whenToday : BOARD_TEXT.whenDaysAgo(n);
  };

  return {
    scanned: feed.ok ? feed.value.scanned : 0,
    // Only what is owed a decision today. A panel that listed everything would
    // be a second copy of the queue rather than a reason to look right.
    scope: scope ? { name: scope.name } : undefined,
    pending: feed.ok
      ? feed.value.judgements
          // UNSCOPED: only what is owed a decision TODAY - a panel that listed
          // everything would be a second copy of the queue rather than a reason
          // to look right.
          //
          // SCOPED: everything about this one object, whatever its urgency. On
          // one thing the question is not "what is due today" but "what is
          // there", and a watch-tier item about the account you are reading is
          // exactly what you came to find out.
          .filter((j) =>
            scope
              ? j.subjectId === (scope.judgementSubjectId ?? scope.id)
              : j.urgency === "today",
          )
          .slice(0, 3)
          .map((j) => ({
            id: j.id,
            title: j.subjectName,
            // The claim, clipped. A queue of names says work exists without
            // saying what it is, so a reader has to open each one to find out
            // whether it is theirs to decide.
            why:
              j.claim.length > 24
                ? BOARD_TEXT.truncate(j.claim.slice(0, 24))
                : j.claim,
            // The marker travels with the row: a decision queue has to let a
            // person see whether an item was counted out or thought up before
            // they sign it.
            source:
              j.source === "rule"
                ? BOARD_TEXT.sourceRule
                : BOARD_TEXT.sourceModel,
          }))
      : [],
    recent: notes.map((n) => ({
      id: n.id,
      text:
        n.rawNote.length > 40
          ? BOARD_TEXT.truncate(n.rawNote.slice(0, 40))
          : n.rawNote,
      when: day(n.occurredAt),
    })),
  };
}
