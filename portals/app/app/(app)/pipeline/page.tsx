import { EmptyState, StatusBadge, ViewLayout } from "@vxture/design-ui";
import { resolveAppSession } from "../lib/session";
import Link from "next/link";
import { ModuleHeadline } from "../components/module-headline";
import { createDeal } from "./stage-action";
import { PeriodTabs } from "../components/period-tabs";
import { HeadlineCard } from "../components/headline-card";
import { byProduct } from "../../domains/catalog/lib/pricing";
import { PipelineBoard, type PipelineRow } from "../components/pipeline-board";
import {
  getAccountStore,
  getCatalogStore,
  getPipelineStore,
} from "../../domains/shared/registry";
import { importanceScheme, listAccounts } from "../../domains/account/service";
import { dealPriorityOf } from "../../domains/account/lib/importance";
import { NewEntryLink } from "../components/form-page";
import {
  forecastHistory,
  listPipeline,
  listStageDefinitions,
} from "../../domains/pipeline/service";
import { toStageCatalog } from "../../domains/pipeline/store";
import { DEFAULT_STAGE_DEFINITIONS } from "../../domains/pipeline/lib/stage";
import { inPeriod } from "../../domains/pipeline/lib/forecast";
import { can } from "../../authz/decide";

import { getMessages } from "../lib/i18n/server";
import { cachedFeed } from "../lib/board";
import { offeredPeriods, resolvePeriod } from "../lib/periods";
import {
  listOpportunityLines,
  listProducts as listCatalogProducts,
  pricingPolicy,
} from "../../domains/catalog/service";
import { loadFailureText } from "../lib/load-failure";
import { DEFAULT_PRICING_POLICY } from "../../domains/catalog/lib/pricing-policy";
// D6 pipeline page.
//
// Dynamic, never cached: the rows are workspace-scoped and gate-filtered, and a
// cached render is a render of somebody else's answer.

export const dynamic = "force-dynamic";

/** Where the filter lands when the URL says nothing. Matches the demo's data. */

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const { BOARD_TEXT, PIPELINE_TEXT, SHELL_TEXT, LOAD_ERROR } =
    await getMessages();
  const params = await searchParams;
  const period = resolvePeriod(params.period);
  const session = await resolveAppSession();
  if (!session) return null;
  // Unreachable: (app)/layout.tsx already renders the shared SignIn
  // screen and never mounts this page when there is no session. Kept
  // only because TypeScript needs it to narrow `session` below.

  const ctx = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: session.stores.pipeline(),
  };
  // Same session, different port. The context carries the store because the
  // gate is decided from the session and the DATA comes from the port - two
  // domains reading the same request need two contexts, not one with a union.
  const catalogCtx = { ...ctx, store: getCatalogStore() };
  // 计价规则 (incr/0044): what the board's totals are in when a row says nothing.
  const policy = await pricingPolicy(catalogCtx);
  const currency = policy.ok ? policy.value.defaultCurrency : DEFAULT_PRICING_POLICY.defaultCurrency;

  const [result, history, lines, products, accounts, feed, stageRows] =
    await Promise.all([
      // includeClosed, or the "closed" tile reports zero on a workspace that has
      // closed 2.7M - the same false zero that hit the quota card, in a third
      // place. The board rolls all four categories from this one list, and a
      // closed deal is precisely what the closed category counts.
      listPipeline(ctx, { includeClosed: true }),
      // The series, not the latest point. See forecastHistory: this read is the
      // only thing that makes forecast_snapshot's immutability pay for itself.
      // The workspace's series for the one line the headline keeps; the
      // trajectory, scope, accuracy and submit are /forecast's (batch 9a).
      forecastHistory(ctx, period, { scopeType: "workspace", territoryId: null, ownerSub: null }),
      // THROUGH THE SERVICE, not the store handle. Both of these used to call
      // getCatalogStore() straight from the page, which skips BOTH gates - the
      // same defect PR #26 fixed on the account detail page. The catalogue read
      // service exists now, so there is no reason left to reach past it.
      listOpportunityLines(catalogCtx),
      listCatalogProducts(catalogCtx),
      // Two cross-domain reads, for the new-deal form's two pickers. Through the
      // services, so both gates run - a page reaching a store handle directly is
      // the defect PR #26 fixed on the account page.
      listAccounts({ ...ctx, store: session.stores.account() }),
      // The SAME memoised call the shell's board and the home screen make, so
      // the most expensive read in the product still happens once per request.
      cachedFeed({
        workspaceId: session.workspaceId,
        sub: session.user.sub,
        holder: session.authz,
        entitlement: session.entitlement,
      }),
      listStageDefinitions(ctx),
    ]);
  const scheme = await importanceScheme({ ...ctx, store: session.stores.account() });
  const stageDefinitions = stageRows.ok ? toStageCatalog(stageRows.value) : DEFAULT_STAGE_DEFINITIONS;

  if (!result.ok) {
    // The gate's own message, not a generic error: "you need the pro tier" and
    // "something broke" are different things to tell someone.
    return (
      <EmptyState
        title={SHELL_TEXT.loadFailed}
        description={loadFailureText(result.violations, LOAD_ERROR)}
      />
    );
  }

  // THE PERIOD SELECTOR NOW MOVES THE PAGE, not just the trajectory beneath it
  // (TD-014). It shipped controlling only the snapshot series, so switching to
  // 2026Q4 redrew the chart and left the tiles and the table reporting the whole
  // book - a control that appeared to filter and did not.
  //
  // A won deal belongs to the period it closed in, an open one to the period it
  // is expected to close in; `inPeriod` holds that rule. `resolvePeriod` only
  // ever returns a label the control offers, so the null branch is unreachable here
  // - it is written as a fallback to the unfiltered list rather than a throw,
  // because a page that cannot filter should still render the deals.
  const window = inPeriod(result.value, period);
  const inWindow = window ? window.kept : result.value;
  const undated = window?.undated ?? 0;

  // WHICH accounts have no reachable economic buyer. The same memoised feed
  // the shell and the home screen read, so this costs nothing extra - and it
  // is a set rather than a count because a count cannot mark a row.
  const unreachable = new Set(feed.ok ? feed.value.unreachableAccountIds : []);

  // COUNTED OFF THE SAME ARRAY the board is built from, so a badge and the
  // columns under it cannot describe different deals.
  //
  // NO CLOSE DATE is a real gap rather than a tidiness complaint: a deal with
  // no expected close cannot enter a period forecast at all (ADR-021), so it
  // is invisible to the number somebody is measured on.
  const openDeals = inWindow.filter((o) => o.status === "open");
  const openCount = openDeals.length;
  const noCloseDate = openDeals.filter((o) => o.expectedCloseAt == null).length;
  const unowned = openDeals.filter((o) => !o.ownerSub).length;

  // 优先级 (incr/0090, R11): each deal's customer tier x its importance,
  // looked up in the matrix. The scheme is the account domain's, through its
  // gate; a refusal leaves the column blank rather than failing the list.
  const accountById = new Map((accounts.ok ? accounts.value : []).map((a) => [a.id, a] as const));
  const rows: PipelineRow[] = inWindow.map((o) => ({
    ...(o as (typeof result.value)[number]),
    ...(() => {
      if (!scheme.ok) return { priority: null, priorityFrom: null };
      const rec = o as (typeof result.value)[number];
      const read = dealPriorityOf(rec, (rec.accountId ? accountById.get(rec.accountId) : null) ?? null, scheme.value);
      return {
        priority: read.priority,
        priorityFrom:
          read.accountLevel && read.dealLevel
            ? { tier: read.accountLevel.name, importance: read.dealLevel.name }
            : null,
      };
    })(),
    accountName:
      (o as (typeof result.value)[number]).accountName ??
      (o as (typeof result.value)[number]).accountId,
    buyerUnreachable: unreachable.has(
      (o as (typeof result.value)[number]).accountId,
    ),
  }));

  // What the page opens with. The number alone is a label; what it MEANS this
  // week is the delta against the last time anyone forecast - which is exactly
  // what the trajectory is for and what a single tile cannot say.
  const points = history.ok ? history.value : [];
  const last = points[points.length - 1];
  const prev = points[points.length - 2];
  const commit = last?.commitAmount.amount ?? 0;
  const delta = last && prev ? commit - prev.commitAmount.amount : 0;
  const sinceDays =
    last && prev
      ? Math.max(
          1,
          Math.round(
            (last.snapshotAt.getTime() - prev.snapshotAt.getTime()) /
              86_400_000,
          ),
        )
      : 0;

  const openIds = new Set(
    result.value.filter((o) => o.status === "open").map((o) => o.id),
  );
  // The two catalogue reads are gated now, so they return a RuleResult. A
  // refusal degrades to an empty split rather than failing the page: the
  // product breakdown is a decomposition OF the totals above it, and a reader
  // who may see the totals but not the lines should still get the totals.
  const lineRows = lines.ok ? lines.value : [];
  const productRows = products.ok ? products.value : [];
  const openLines = lineRows.filter((l) => openIds.has(l.opportunityId));
  const split = [...byProduct(openLines)]
    .sort((a, b) => b[1].amount - a[1].amount)
    .map(([id, agg]) => ({
      name: productRows.find((p) => p.id === id)?.name ?? id,
      amount: agg.amount,
    }));
  // Signed-off lines are not awaiting anything. A badge that never clears is a
  // badge people stop reading.
  const awaiting = openLines.filter(
    (l) => l.needsApproval && !l.approved,
  ).length;

  return (
    <ViewLayout>
      {/* The page's name, at the height every other page's sits at. This was the
          last page still opening on a hand-rolled heading inside a card, which
          is what made it look a size and a height apart from the rest. */}
      {/* THE MODULE HEADER (design_yucer_100). No fold: the deals below are a
          BOARD grouped by stage with a count on every column, so a stage
          breakdown up here would redraw what the page already is - the third
          condition of the fold criterion. What the board cannot say is how
          much of the open book has no date and how much has nobody chasing
          it, so those are badges. */}
      <ModuleHeadline
        moduleKey="pipeline"
        action={
          can(session.authz, session.entitlement, "pipeline.opportunity.create", "ui")
            .allowed ? <NewEntryLink href="/pipeline/new" /> : null
        }
        tags={
          <>
            <StatusBadge tone="success">{PIPELINE_TEXT.tagOpen(openCount)}</StatusBadge>
            {noCloseDate > 0 ? (
              <StatusBadge tone="warning">{PIPELINE_TEXT.tagNoDate(noCloseDate)}</StatusBadge>
            ) : null}
            {unowned > 0 ? (
              <StatusBadge tone="warning">{PIPELINE_TEXT.tagUnowned(unowned)}</StatusBadge>
            ) : null}
          </>
        }
      />

      {/* Then the statement. This card still opens with a FIGURE rather than a
          noun - the whole card is the disclosure that decomposes it, so the
          number is the thing being explained and has to lead.

          NOT an <h1> any more: the module header above owns that, and two of them on
          one page is a document with two subjects. It keeps the size, because
          its weight on the page was never coming from the tag. */}
      <HeadlineCard
        split={split}
        awaiting={awaiting}
        headline={
          <div className="min-w-0">
            <p className="text-heading-2 text-foreground tabular-nums">
              {PIPELINE_TEXT.lead(BOARD_TEXT.wan(commit))}
            </p>
            <p className="text-muted-foreground mt-2xs text-body-sm">
              {/* The forecast itself - trajectory, scope, accuracy, the
                  snapshot - is /forecast's (batch 9a); this line leads there. */}
              {points.length < 2
                ? PIPELINE_TEXT.leadNoHistory
                : delta === 0
                  ? PIPELINE_TEXT.leadFlat
                  : PIPELINE_TEXT.leadDelta(
                      `${delta > 0 ? "+" : "-"}${BOARD_TEXT.wan(Math.abs(delta))}`,
                      sinceDays,
                    )}
              {" · "}
              <Link href={`/forecast?period=${encodeURIComponent(period)}`} className="text-primary hover:underline">
                {PIPELINE_TEXT.toForecast}
              </Link>
            </p>
          </div>
        }
        /* The page's top-level filter. It governs every figure below, so it
           stays visible in the collapsed state - the fold hides the
           decomposition, not the controls. */
        filter={
          <PeriodTabs
            value={period}
            periods={offeredPeriods().quarters}
            yearLabel={offeredPeriods().year}
          />
        }
      />

      {/* The gate, not the raw permission. Reading permissions.has() directly
          skips the ENTITLEMENT half entirely, so a workspace whose subscription
          lapsed would still render the board as writable - and the two gates
          are ordered precisely so the tier answer comes first. */}
      {/* ABOVE the board, for the same reason the target form sits above its
          table: on a fresh workspace the board is empty, and a create form
          tucked under a list nobody can populate is a doorway behind a locked
          door. */}
{/* Creation left for /pipeline/new on 2026-09-05 (owner ruling). The
          doorway stays ABOVE the board for the reason the form sat there: on a
          fresh workspace the board is empty, and a doorway under a list nobody
          can populate is a doorway behind a locked door. */}
      <PipelineBoard
        currency={currency}
        rows={rows}
        undated={undated}
        stageDefinitions={stageDefinitions}
        readOnly={
          !can(
            session.authz,
            session.entitlement,
            "pipeline.opportunity.advance",
            "ui",
          ).allowed
        }
      />
      {/* Only rendered when the workspace bought win/loss. The list is the debt
          the "must review on close" rule creates; without it the rule is a
          sentence in a document. */}
      {/* Its own section, after the board it is derived from. */}
    </ViewLayout>
  );
}
