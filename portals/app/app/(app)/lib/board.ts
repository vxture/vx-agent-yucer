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
} from "../../domains/shared/registry";
import { listAccounts } from "../../domains/account/service";
import { listPipeline } from "../../domains/pipeline/service";
import { listPlans, listCampaigns } from "../../domains/strategy/service";
import { listTargets, listTerritories } from "../../domains/planning/service";
import { listSignals, listLeads } from "../../domains/signal/service";
import { listProjects } from "../../domains/delivery/service";
import { listProposals } from "../../domains/copilot/service";
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
  /** Pre-formatted, because a number's unit is part of what it means. */
  readonly value: string;
}

export interface BoardSection {
  readonly key: string;
  readonly title: string;
  readonly href: string;
  /** Empty when the member cannot read the domain, or nothing exists yet. */
  readonly metrics: readonly BoardMetric[];
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

  const [feed, deals, proposals, plans, campaigns, targets, territories, accounts, signals, leads, projects] =
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
    ]);

  // Open deals only, and their value. "How many deals exist" is a database
  // fact; "what is still in play and what is it worth" is the question someone
  // opens this product with.
  const open = deals.ok ? deals.value.filter((d) => d.closedAt === null) : [];
  const worth = open.reduce((sum, d) => sum + (d.amount?.amount ?? 0), 0);

  return [
    {
      key: "today",
      title: BOARD_TEXT.today,
      href: "/",
      metrics: feed.ok
        ? [
            { label: BOARD_TEXT.tierToday, value: String(feed.value.counts.today) },
            { label: BOARD_TEXT.tierWeek, value: String(feed.value.counts.week) },
            { label: BOARD_TEXT.tierWatch, value: String(feed.value.counts.watch) },
          ]
        : [],
    },
    {
      key: "adjudicate",
      title: BOARD_TEXT.adjudicate,
      href: "/copilot",
      // Pending proposals are the human's queue under ADR-003 - the agent
      // proposes and a person decides, so this number is work owed by a
      // person, not by the system.
      metrics: count(proposals, BOARD_TEXT.pending),
    },
    {
      key: "mydeals",
      title: BOARD_TEXT.mydeals,
      href: "/pipeline",
      metrics: deals.ok
        ? [
            { label: BOARD_TEXT.dealsOpen, value: String(open.length) },
            { label: BOARD_TEXT.dealsWorth, value: BOARD_TEXT.wan(worth) },
          ]
        : [],
    },
    {
      key: "strategy",
      title: BOARD_TEXT.strategy,
      href: "/strategy",
      metrics: count(plans, BOARD_TEXT.plans),
    },
    {
      // D3 keeps its OWN section. Folding its count into strategy's would have
      // left /campaign unreachable from the shell, and "one of the eight
      // domains has no entry" is exactly the invariant ADR-001 fixes - a
      // grouping decision must not quietly delete a domain.
      key: "campaign",
      title: BOARD_TEXT.campaign,
      href: "/campaign",
      metrics: count(campaigns, BOARD_TEXT.campaigns),
    },
    {
      key: "planning",
      title: BOARD_TEXT.planning,
      href: "/planning",
      metrics: [...count(targets, BOARD_TEXT.targets), ...count(territories, BOARD_TEXT.territories)],
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
      metrics: [...count(signals, BOARD_TEXT.signals), ...count(leads, BOARD_TEXT.leads)],
    },
    {
      key: "delivery",
      title: BOARD_TEXT.delivery,
      href: "/delivery",
      metrics: count(projects, BOARD_TEXT.projects),
    },
  ];
}
