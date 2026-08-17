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
import { listTargets, listTerritories } from "../../domains/planning/service";
import { listSignals, listLeads } from "../../domains/signal/service";
import { listProjects } from "../../domains/delivery/service";
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
}

export interface BoardSection {
  readonly key: string;
  readonly title: string;
  readonly href: string;
  /** Empty when the member cannot read the domain, or nothing exists yet. */
  readonly metrics: readonly BoardMetric[];
  /** 0-100, only where a real denominator exists. */
  readonly progress?: number;
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

  const [feed, deals, proposals, plans, campaigns, targets, territories, accounts, signals, leads, projects, playbooks] =
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
    ]);

  // Open deals only, and their value. "How many deals exist" is a database
  // fact; "what is still in play and what is it worth" is the question someone
  // opens this product with.
  const open = deals.ok ? deals.value.filter((d) => d.closedAt === null) : [];
  const worth = open.reduce((sum, d) => sum + (d.amount?.amount ?? 0), 0);

  // Attainment, and ONLY when it can be stated without lying about the period.
  // Targets carry their own period string; summing across different periods
  // would produce a number that is arithmetically fine and means nothing. If
  // the workspace's active targets do not agree on one period, the card is
  // omitted rather than shown with a quietly wrong denominator.
  // "committed", not "draft" - a draft target is a proposal, and measuring
  // attainment against one would report progress toward a number nobody has
  // agreed to yet.
  const active = targets.ok ? targets.value.filter((t) => t.status === "committed") : [];
  const periods = new Set(active.map((t) => t.period));
  const onePeriod = periods.size === 1 ? [...periods][0] : null;
  const quota = active.reduce((sum, t) => sum + (t.targetAmount?.amount ?? 0), 0);
  const won = deals.ok
    ? deals.value.filter((d) => d.status === "won").reduce((s, d) => s + (d.amount?.amount ?? 0), 0)
    : 0;

  const sections: BoardSection[] = [
    {
      key: "today",
      title: BOARD_TEXT.today,
      href: "/",
      metrics: feed.ok
        ? [
            { label: BOARD_TEXT.tierToday, value: String(feed.value.counts.today), tone: "bad" },
            { label: BOARD_TEXT.tierWeek, value: String(feed.value.counts.week), tone: "warn" },
            { label: BOARD_TEXT.tierWatch, value: String(feed.value.counts.watch) },
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
    {
      key: "adjudicate",
      title: BOARD_TEXT.adjudicate,
      href: "/copilot",
      // Proposals awaiting a person, under ADR-003: the agent proposes and a
      // human decides, so this is work owed by a person, not by the system.
      metrics: count(proposals, BOARD_TEXT.pending),
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

  // Only when the denominator is honest.
  if (onePeriod && quota > 0) {
    sections.unshift({
      key: "quota",
      title: BOARD_TEXT.quota(onePeriod),
      href: "/planning",
      metrics: [
        { label: BOARD_TEXT.quotaWon, value: BOARD_TEXT.wan(won), tone: "warn" },
        { label: BOARD_TEXT.quotaTarget, value: BOARD_TEXT.wan(quota) },
      ],
      progress: Math.min(100, Math.round((won / quota) * 100)),
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
  readonly pending: readonly { id: string; title: string; source: string }[];
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
