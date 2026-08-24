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
import { listTargets, listTerritories, attainment } from "../../domains/planning/service";
import { listSignals, listLeads } from "../../domains/signal/service";
import { listProjects } from "../../domains/delivery/service";
import { getCatalogStore } from "../../domains/shared/registry";
import { byProduct } from "../../domains/catalog/lib/pricing";
import { capabilityLabel } from "../../domains/copilot/lib/capability";
import { listProposals, listPlaybooks } from "../../domains/copilot/service";
import { judgementFeed } from "../../domains/judgement/service";
import { BOARD_TEXT } from "./messages";

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
   *   "share" - the metrics partition one population, so their relative sizes
   *             are the point (today/week/watch is every open judgement, split
   *             three ways). Drawn as one bar in segments.
   *   "bars"  - the metrics are independent magnitudes on a common unit, so the
   *             comparison is between them (money per product line). Drawn as a
   *             row each.
   *
   * Absent means the numbers do not relate to each other and drawing them would
   * assert a relationship that is not there.
   */
  readonly chart?: "share" | "bars";
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

const ACTION_LABEL: Record<string, string> = {
  advance_stage: BOARD_TEXT.actAdvance,
  draft_outreach: BOARD_TEXT.actOutreach,
  promote_signal: BOARD_TEXT.actPromote,
};

/**
 * What is waiting, by what it would DO.
 *
 * A lone "4" says work exists without saying what kind, and these are not
 * interchangeable: waving through a stage advance and signing off an outreach
 * draft are different acts with different risk. Grouped by action type, which
 * is a fact on the row - not by a confidence threshold, which would be a
 * number invented here.
 */
function proposalBreakdown(result: { ok: boolean; value?: unknown }): BoardMetric[] {
  if (!result.ok || !Array.isArray(result.value)) return [];
  const rows = result.value as { actionType: string; capability: string | null }[];
  if (rows.length === 0) return [];
  // Grouped by CAPABILITY where one is recorded, falling back to the action
  // type. ADR-015: the action type says what would be DONE (advance a stage),
  // the capability says what expertise concluded it should be - and those are
  // the units accuracy is measured and noise is muted in.
  //
  // Rows without a capability show as unlabelled rather than being folded into
  // a guess: they are the history from before the key existed, and inventing
  // one would put manufactured data next to measured data.
  const byKind = new Map<string, number>();
  for (const r of rows) {
    const label = r.capability
      ? capabilityLabel(r.capability, BOARD_TEXT.capabilityLabels, BOARD_TEXT.capUnlabelled)
      : (ACTION_LABEL[r.actionType] ?? BOARD_TEXT.actOther);
    byKind.set(label, (byKind.get(label) ?? 0) + 1);
  }
  return [
    // No weight: this is the total the segments below add up to, so drawing it
    // as one of them would double the population.
    { label: BOARD_TEXT.pending, value: String(rows.length), tone: "warn" },
    ...[...byKind].map(([label, n]) => ({ label, value: String(n), weight: n })),
  ];
}

/** A count, or nothing at all if the gate refused. */
function count(result: { ok: boolean; value?: unknown }, label: string): BoardMetric[] {
  if (!result.ok || !Array.isArray(result.value)) return [];
  return [{ label, value: String(result.value.length) }];
}

export async function boardSections(ctx: BoardContext): Promise<BoardSection[]> {
  const base = {
    workspaceId: ctx.workspaceId,
    sub: ctx.sub,
    holder: ctx.holder,
    entitlement: ctx.entitlement,
  };

  const [feed, deals, proposals, plans, campaigns, targets, territories, accounts, signals, leads, projects, playbooks, lines, catalogue] =
    await Promise.all([
      cachedFeed(base),
      listPipeline({ ...base, store: getPipelineStore() }),
      listProposals({ ...base, store: getCopilotStore() }, { status: "proposed" }),
      listPlans({ ...base, store: getStrategyStore() }),
      listCampaigns({ ...base, store: getStrategyStore() }),
      listTargets({ ...base, store: getPlanningStore() }),
      listTerritories({ ...base, store: getPlanningStore() }),
      listAccounts({ ...base, store: getAccountStore() }),
      listSignals({ ...base, store: getSignalStore() }),
      listLeads({ ...base, store: getSignalStore() }),
      listProjects({ ...base, store: getDeliveryStore() }),
      listPlaybooks({ ...base, store: getCopilotStore() }),
      getCatalogStore().allLines(ctx.workspaceId),
      getCatalogStore().listProducts(ctx.workspaceId),
    ]);

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
    ? targets.value.find((t) => t.scopeType === "workspace" && t.status === "committed")
    : undefined;
  const rows = wsTarget
    ? await attainment({ ...base, store: getPlanningStore() }, wsTarget.period)
    : null;
  const wsRow =
    rows?.ok
      ? rows.value.find((r) => r.target.id === wsTarget?.id)
      : undefined;

  const sections: BoardSection[] = [
    {
      key: "today",
      title: BOARD_TEXT.today,
      href: "/",
      chart: "share",
      metrics: feed.ok
        ? [
            { label: BOARD_TEXT.tierToday, value: String(feed.value.counts.today), tone: "bad", weight: feed.value.counts.today },
            { label: BOARD_TEXT.tierWeek, value: String(feed.value.counts.week), tone: "warn", weight: feed.value.counts.week },
            { label: BOARD_TEXT.tierWatch, value: String(feed.value.counts.watch), weight: feed.value.counts.watch },
          ]
        : [],
    },
    {
      key: "resource",
      title: BOARD_TEXT.resource,
      href: "/pipeline",
      metrics: [
        ...(deals.ok
          ? [
              { label: BOARD_TEXT.dealsOpen, value: String(open.length) },
              { label: BOARD_TEXT.dealsWorth, value: BOARD_TEXT.wan(worth) },
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
            chart: "share" as const,
            href: "/account",
            metrics: [
              {
                label: BOARD_TEXT.alliesCoaches,
                value: String(feed.value.allies.coaches),
                tone: "good" as const,
                weight: feed.value.allies.coaches,
              },
              {
                label: BOARD_TEXT.alliesUnreachable,
                value: String(feed.value.allies.unreachable),
                tone: feed.value.allies.unreachable > 0 ? ("bad" as const) : undefined,
                weight: feed.value.allies.unreachable,
              },
              ...(feed.value.allies.blockers > 0
                ? [
                    {
                      label: BOARD_TEXT.alliesBlockers,
                      value: String(feed.value.allies.blockers),
                      tone: "warn" as const,
                      weight: feed.value.allies.blockers,
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
              ...[...byProduct(lines.filter((l) => openIds.has(l.opportunityId)))]
                .sort((a, b) => b[1].amount - a[1].amount)
                .slice(0, 3)
                .map(([productId, agg]) => ({
                  label: catalogue.find((p) => p.id === productId)?.name ?? productId,
                  value: BOARD_TEXT.wan(agg.amount),
                  weight: agg.amount,
                })),
              // Below-floor lines are a decision someone owes, so they belong
              // beside the money rather than buried in a deal.
              ...(lines.some((l) => l.needsApproval)
                ? [
                    {
                      label: BOARD_TEXT.needsApproval,
                      value: String(lines.filter((l) => l.needsApproval).length),
                      tone: "warn" as const,
                    },
                  ]
                : []),
            ],
          },
        ]
      : []),
    {
      key: "adjudicate",
      title: BOARD_TEXT.adjudicate,
      href: "/copilot",
      chart: "share",
      // Proposals awaiting a person, under ADR-003: the agent proposes and a
      // human decides, so this is work owed by a person, not by the system.
      metrics: proposalBreakdown(proposals),
    },
    // The archive, each with the one number that says whether it is worth
    // opening.
    { key: "strategy", title: BOARD_TEXT.strategy, href: "/strategy", metrics: count(plans, BOARD_TEXT.plans) },
    { key: "campaign", title: BOARD_TEXT.campaign, href: "/campaign", metrics: count(campaigns, BOARD_TEXT.campaigns) },
    {
      key: "planning",
      title: BOARD_TEXT.planning,
      href: "/planning",
      metrics: [...count(targets, BOARD_TEXT.targets), ...count(territories, BOARD_TEXT.territories)],
    },
    { key: "account", title: BOARD_TEXT.account, href: "/account", metrics: count(accounts, BOARD_TEXT.accounts) },
    {
      key: "signal",
      title: BOARD_TEXT.signal,
      href: "/signal",
      metrics: [...count(signals, BOARD_TEXT.signals), ...count(leads, BOARD_TEXT.leads)],
    },
    { key: "delivery", title: BOARD_TEXT.delivery, href: "/delivery", metrics: count(projects, BOARD_TEXT.projects) },
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
        { label: BOARD_TEXT.quotaWon, value: BOARD_TEXT.wan(wsRow.closed?.amount ?? 0), tone: "warn" },
        { label: BOARD_TEXT.quotaTarget, value: BOARD_TEXT.wan(wsTarget.targetAmount.amount) },
        {
          label: BOARD_TEXT.quotaOf,
          value: BOARD_TEXT.quotaLeft(Math.max(0, Math.min(100, Math.round(wsRow.ratio * 100)))),
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
  readonly scanned: number;
  readonly pending: readonly { id: string; title: string; why: string; source: string }[];
  readonly recent: readonly { id: string; text: string; when: string }[];
}

export async function agentPanel(ctx: BoardContext, now: Date): Promise<AgentPanelData> {
  const base = {
    workspaceId: ctx.workspaceId,
    sub: ctx.sub,
    holder: ctx.holder,
    entitlement: ctx.entitlement,
  };

  const [feed, notes] = await Promise.all([
    cachedFeed(base),
    getFieldStore().listInteractions(ctx.workspaceId, { limit: 3 }),
  ]);

  const day = (d: Date) => {
    const n = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
    return n <= 0 ? BOARD_TEXT.whenToday : BOARD_TEXT.whenDaysAgo(n);
  };

  return {
    scanned: feed.ok ? feed.value.scanned : 0,
    // Only what is owed a decision today. A panel that listed everything would
    // be a second copy of the queue rather than a reason to look right.
    pending: feed.ok
      ? feed.value.judgements
          .filter((j) => j.urgency === "today")
          .slice(0, 3)
          .map((j) => ({
            id: j.id,
            title: j.subjectName,
            // The claim, clipped. A queue of names says work exists without
            // saying what it is, so a reader has to open each one to find out
            // whether it is theirs to decide.
            why: j.claim.length > 24 ? BOARD_TEXT.truncate(j.claim.slice(0, 24)) : j.claim,
            // The marker travels with the row: a decision queue has to let a
            // person see whether an item was counted out or thought up before
            // they sign it.
            source: j.source === "rule" ? BOARD_TEXT.sourceRule : BOARD_TEXT.sourceModel,
          }))
      : [],
    recent: notes.map((n) => ({
      id: n.id,
      text: n.rawNote.length > 40 ? BOARD_TEXT.truncate(n.rawNote.slice(0, 40)) : n.rawNote,
      when: day(n.occurredAt),
    })),
  };
}
