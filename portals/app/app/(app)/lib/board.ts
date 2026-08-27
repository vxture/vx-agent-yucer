import { cache } from "react";
import type { Entitlement } from "../../entitlement/types";
import type { AuthzContext } from "../../authz/context";
import {
  getAccountStore,
  getCopilotStore,
  getDeliveryStore,
  getPipelineStore,
  getPlanningStore,
  getSignalStore,
  getStrategyStore,
  getFieldStore,
} from "../../domains/shared/registry";
import { listAccounts } from "../../domains/account/service";
import { listPipeline } from "../../domains/pipeline/service";
import { listPlans, listCampaigns } from "../../domains/strategy/service";
import {
  listTargets,
  listTerritories,
  attainment,
} from "../../domains/planning/service";
import { listSignals, listLeads } from "../../domains/signal/service";
import { listProjects } from "../../domains/delivery/service";
import { getCatalogStore } from "../../domains/shared/registry";
import { byProduct } from "../../domains/catalog/lib/pricing";
import { listProposals, listPlaybooks } from "../../domains/copilot/service";
import {
  listOpportunityLines,
  listProducts as listCatalogProducts,
} from "../../domains/catalog/service";
import { judgementFeed } from "../../domains/judgement/service";
import { rollUp } from "../../domains/pipeline/lib/forecast";
import {
  coverage,
  resolveCoverageFloor,
} from "../../domains/planning/lib/coverage";
// NOT a static import of the Chinese constants. board.ts builds the section
// titles and metric labels the two flanks render, so it decides copy - and copy
// follows the request's locale. Both entry points await the dictionary; it is
// resolved once per render by next/headers, so two calls cost one resolution.
import { getMessages } from "./i18n/server";

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

export interface BoardSection {
  readonly key: string;
  readonly title: string;
  readonly href: string;
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

export async function boardSections(
  ctx: BoardContext,
): Promise<BoardSection[]> {
  const { BOARD_TEXT, FORECAST_LABEL } = await getMessages();
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
    playbooks,
    lineResult,
    catalogueResult,
  ] = await Promise.all([
    cachedFeed(base),
    listPipeline({ ...base, store: getPipelineStore() }),
    listProposals(
      { ...base, store: getCopilotStore() },
      { status: "proposed" },
    ),
    listPlans({ ...base, store: getStrategyStore() }),
    listCampaigns({ ...base, store: getStrategyStore() }),
    listTargets({ ...base, store: getPlanningStore() }),
    listTerritories({ ...base, store: getPlanningStore() }),
    listAccounts({ ...base, store: getAccountStore() }),
    listSignals({ ...base, store: getSignalStore() }),
    listLeads({ ...base, store: getSignalStore() }),
    listProjects({ ...base, store: getDeliveryStore() }),
    listPlaybooks({ ...base, store: getCopilotStore() }),
    // THROUGH THE SERVICE, like every sibling on this list. These two were the
    // only reads on the board holding a store handle directly, which skips both
    // gates - and a board is the one surface where that is easiest to miss,
    // because every card is a number rather than a page you notice opening.
    listOpportunityLines({ ...base, store: getCatalogStore() }),
    listCatalogProducts({ ...base, store: getCatalogStore() }),
  ]);

  // Gate-aware now that these go through the service. A refused read degrades
  // to an empty card, which is what every other card on this board already
  // does - the board reports what you may see, and says nothing about the rest.
  const lines = lineResult.ok ? lineResult.value : [];
  const catalogue = catalogueResult.ok ? catalogueResult.value : [];

  // Open deals only, and their value. "How many deals exist" is a database
  // fact; "what is still in play and what is it worth" is the question someone
  // opens this product with.
  const open = deals.ok ? deals.value.filter((d) => d.closedAt === null) : [];
  const worth = open.reduce((sum, d) => sum + (d.amount?.amount ?? 0), 0);
  const openIds = new Set(open.map((d) => d.id));

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
  const wsTarget = targets.ok
    ? targets.value.find(
        (t) => t.scopeType === "workspace" && t.status === "committed",
      )
    : undefined;
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
  const totals = deals.ok ? rollUp(open) : null;

  const cover =
    wsTarget && wsRow
      ? coverage(
          worth,
          wsTarget.targetAmount.amount,
          wsRow.closed?.amount ?? 0,
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
    {
      key: "resource",
      title: BOARD_TEXT.resource,
      href: "/pipeline",
      // TWO ROWS, because this card states a relationship rather than a list.
      // What the period asks for, then what is on hand to meet it - and the
      // pool broken into the funnel, because 881万 of commit and 881万 of
      // early-stage pipeline are not the same 881万.
      gauge:
        cover && cover.ratio !== null && totals?.ok
          ? {
              label: BOARD_TEXT.poolRow,
              value: BOARD_TEXT.wan(worth),
              // Read against the resource target, not against the gap, so the
              // figure and the bar say the same thing. They are the same
              // judgement either way: pool < floor x gap is exactly pool <
              // scaleMax, so "under 100% here" and "thin" are one condition.
              note: BOARD_TEXT.coverageOf(
                Math.round((worth / (cover.gap * cover.floor)) * 100),
              ),
              thin: cover.thin,
              // Descending confidence: what is committed, what is being worked,
              // what is merely held. The order IS the meaning, so it is fixed
              // here rather than sorted by size.
              funnel: [
                {
                  label: FORECAST_LABEL.commit,
                  value: BOARD_TEXT.wan(totals.value.commitAmount.amount),
                  weight: totals.value.commitAmount.amount,
                },
                {
                  label: FORECAST_LABEL.best_case,
                  value: BOARD_TEXT.wan(totals.value.bestCaseAmount.amount),
                  weight: totals.value.bestCaseAmount.amount,
                },
                {
                  label: FORECAST_LABEL.pipeline,
                  value: BOARD_TEXT.wan(totals.value.pipelineAmount.amount),
                  weight: totals.value.pipelineAmount.amount,
                },
              ],
              // The target itself is NOT repeated here - the quota card above
              // already carries it. What is missing from every other card is
              // the SHORTFALL, and that is the number this pool has to answer.
              scaleMax: cover.gap * cover.floor,
            }
          : undefined,
      metrics: cover
        ? []
        : [
            ...(deals.ok
              ? [
                  { label: BOARD_TEXT.dealsOpen, value: String(open.length) },
                  {
                    label: BOARD_TEXT.dealsWorth,
                    value: BOARD_TEXT.wan(worth),
                  },
                ]
              : []),
            ...count(playbooks, BOARD_TEXT.playbooks),
          ],
    },
    // Who is on our side, from the coverage the feed already computed. Shown
    // only when at least one chain was readable: on a tier that cannot see
    // decision chains, "0 coaches" would be a claim about the customers rather
    // than about the subscription.
    ...(feed.ok && feed.value.allies.accounts > 0
      ? [
          {
            key: "allies",
            title: BOARD_TEXT.allies,
            chart: "lede" as const,
            href: "/account",
            // Unreached decision-makers lead. This card exists to raise an
            // alarm, and the alarm is that a deal has nobody in it who can say
            // yes - not that some coaches were built. Coaches and blockers are
            // the context that tells you how bad it is.
            metrics: [
              {
                label: BOARD_TEXT.alliesUnreachable,
                value: String(feed.value.allies.unreachable),
                tone:
                  feed.value.allies.unreachable > 0
                    ? ("bad" as const)
                    : undefined,
              },
              {
                label: BOARD_TEXT.alliesCoaches,
                value: String(feed.value.allies.coaches),
                tone: "good" as const,
              },
              ...(feed.value.allies.blockers > 0
                ? [
                    {
                      label: BOARD_TEXT.alliesBlockers,
                      value: String(feed.value.allies.blockers),
                      tone: "warn" as const,
                    },
                  ]
                : []),
            ],
          },
        ]
      : []),
    // What the open money is actually FOR. A single open-pipeline total says
    // nothing about
    // which product line carries it - that is the whole reason opportunity_line
    // exists (ADR-014). Only open deals, and only the top lines, because a
    // sidebar card is a glance rather than a report.
    ...(lines.length > 0
      ? [
          {
            key: "products",
            title: BOARD_TEXT.productLines,
            href: "/pipeline",
            chart: "bars" as const,
            metrics: [
              ...[
                ...byProduct(lines.filter((l) => openIds.has(l.opportunityId))),
              ]
                .sort((a, b) => b[1].amount - a[1].amount)
                .slice(0, 3)
                .map(([productId, agg]) => ({
                  label:
                    catalogue.find((p) => p.id === productId)?.name ??
                    productId,
                  value: BOARD_TEXT.wan(agg.amount),
                  weight: agg.amount,
                })),
              // Below-floor lines are a decision someone owes, so they belong
              // beside the money rather than buried in a deal.
              ...(lines.some((l) => l.needsApproval)
                ? [
                    {
                      label: BOARD_TEXT.needsApproval,
                      value: String(
                        lines.filter((l) => l.needsApproval).length,
                      ),
                      tone: "warn" as const,
                    },
                  ]
                : []),
            ],
          },
        ]
      : []),
    // The archive, each with the one number that says whether it is worth
    // opening.
    {
      key: "strategy",
      title: BOARD_TEXT.strategy,
      href: "/strategy",
      metrics: count(plans, BOARD_TEXT.plans),
    },
    {
      key: "campaign",
      title: BOARD_TEXT.campaign,
      href: "/campaign",
      metrics: count(campaigns, BOARD_TEXT.campaigns),
    },
    {
      key: "planning",
      title: BOARD_TEXT.planning,
      href: "/planning",
      metrics: [
        ...count(targets, BOARD_TEXT.targets),
        ...count(territories, BOARD_TEXT.territories),
      ],
    },
    {
      key: "account",
      title: BOARD_TEXT.account,
      href: "/account",
      metrics: count(accounts, BOARD_TEXT.accounts),
    },
    {
      key: "signal",
      title: BOARD_TEXT.signal,
      href: "/signal",
      metrics: [
        ...count(signals, BOARD_TEXT.signals),
        ...count(leads, BOARD_TEXT.leads),
      ],
    },
    {
      key: "delivery",
      title: BOARD_TEXT.delivery,
      href: "/delivery",
      metrics: count(projects, BOARD_TEXT.projects),
    },
  ];

  // Shown only with a workspace-scope committed target AND a snapshot behind
  // it. No target means no denominator; no snapshot means nobody has forecast
  // the period, which is not the same as having attained nothing.
  if (wsTarget && wsRow?.hasSnapshot && wsRow.ratio !== null) {
    sections.unshift({
      key: "quota",
      title: BOARD_TEXT.quota(wsTarget.period),
      href: "/planning",
      // Attainment rides as a THIRD figure rather than as a caption under the
      // track. It is a reading in its own right - the one a leader quotes - and
      // as a caption it cost the card a whole row to say what the other two
      // already imply. Three figures over one track is also exactly the density
      // of the resource card, which is the shape this board settled on.
      metrics: [
        {
          label: BOARD_TEXT.quotaWon,
          value: BOARD_TEXT.wan(wsRow.closed?.amount ?? 0),
          tone: "warn",
        },
        {
          label: BOARD_TEXT.quotaTarget,
          value: BOARD_TEXT.wan(wsTarget.targetAmount.amount),
        },
        {
          label: BOARD_TEXT.quotaOf,
          value: BOARD_TEXT.quotaLeft(
            Math.max(0, Math.min(100, Math.round(wsRow.ratio * 100))),
          ),
        },
      ],
      progress: Math.max(0, Math.min(100, Math.round(wsRow.ratio * 100))),
    });
  }

  return sections;
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
