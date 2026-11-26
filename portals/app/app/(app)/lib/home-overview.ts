import { cache } from "react";
import { can } from "../../authz/decide";
import { attainment, listTargets } from "../../domains/planning/service";
import { listPipeline } from "../../domains/pipeline/service";
import { readFocusWorkspace } from "../../domains/planning/focus-read";
import { openOpportunityOverview, overviewPeriod, publishedOverviewMetric, overviewMarginRate } from "../../domains/judgement/lib/home-overview";
import { judgementRecordHref } from "../../domains/judgement/lib/record-link";
import { getPlanningStore } from "../../domains/shared/registry";
import { focusContext } from "../named/context";
import { resolveAppSession } from "./session";
import { cachedFeed } from "./board";

export const loadHomeOverview = cache(async () => {
  const session = await resolveAppSession();
  if (!session) return null;
  const now = new Date(), year = now.getUTCFullYear();
  const ctx = { workspaceId: session.workspaceId, sub: session.user.sub, holder: session.authz, entitlement: session.entitlement };
  const canAsk = can(ctx.holder, ctx.entitlement, "copilot.ask", "ui").allowed;
  const [targets, deals, focus, changes] = await Promise.allSettled([
    listTargets({ ...ctx, store: getPlanningStore() }),
    listPipeline({ ...ctx, store: session.stores.pipeline() }),
    readFocusWorkspace(focusContext(session), { year }),
    cachedFeed({ ...ctx, stores: session.stores }),
  ]);
  const selected = overviewPeriod(targets.status === "fulfilled" && targets.value.ok ? targets.value.value : [], session.scope, session.user.sub, now);
  const measured = targets.status === "fulfilled" && targets.value.ok && selected.targets.length
    ? await attainment({ ...ctx, store: getPlanningStore() }, selected.period).catch(() => null) : null;
  const rows = measured?.ok ? measured.value : [];
  const revenue = publishedOverviewMetric(rows, selected.targets, "revenue"), newCustomers = publishedOverviewMetric(rows, selected.targets, "new_logo");
  const pipelineTarget = publishedOverviewMetric(rows, selected.targets, "pipeline"), margin = publishedOverviewMetric(rows, selected.targets, "margin");
  const targetAllowed = can(ctx.holder, ctx.entitlement, "planning.target.view", "data").allowed && can(ctx.holder, ctx.entitlement, "planning.attainment.view", "data").allowed;
  const targetState = !targetAllowed ? "denied" : targets.status === "rejected" || !targets.value.ok || (selected.targets.length && !measured?.ok) ? "unavailable" : null;
  const pipelineAllowed = can(ctx.holder, ctx.entitlement, "pipeline.view", "data").allowed;
  const pipeline = deals.status === "fulfilled" && deals.value.ok ? openOpportunityOverview(deals.value.value) : null;
  const namedAllowed = can(ctx.holder, ctx.entitlement, "planning.target.view", "data").allowed && can(ctx.holder, ctx.entitlement, "account.view", "data").allowed;
  const named = focus.status === "fulfilled" ? focus.value : null;
  const changesAllowed = can(ctx.holder, ctx.entitlement, "account.view", "data").allowed;
  const findings = changes.status === "fulfilled" && changes.value.ok ? changes.value.value : null;
  return {
    observedAt: now.toISOString(), period: selected.period, scope: session.scope.kind === "workspace" ? "workspace" as const : "visible" as const, canAsk,
    targetScope: session.scope.kind === "workspace" ? "company" as const : "personal" as const,
    changes: { state: !changesAllowed ? "denied" : findings ? findings.scanned || findings.judgements.length ? "ready" : "insufficient" : "unavailable", findings: changesAllowed ? findings?.judgements.slice(0, 4).map(f => ({id: f.id, claim: f.claim, urgency: f.urgency, subjectName: f.subjectName, subjectType: f.subjectType, href: judgementRecordHref(f)})) ?? [] : [] },
    revenue: { ...revenue, state: targetState ?? revenue.state }, newCustomers: { ...newCustomers, state: targetState ?? newCustomers.state },
    pipelineTarget: { ...pipelineTarget, state: targetState ?? pipelineTarget.state },
    margin: { ...margin, state: targetState ?? margin.state, rate: targetAllowed ? overviewMarginRate(selected.targets) : null },
    pipeline: { state: !pipelineAllowed ? "denied" : pipeline ? "ready" : "unavailable", count: pipeline?.count ?? null, missingAmounts: pipeline?.missingAmounts ?? null, amounts: pipeline?.amounts ?? [] },
    named: { state: !namedAllowed ? "denied" : !named ? "unavailable" : named.revision ? "ready" : "missing", count: named?.revision ? named.rows.length : null,
      covered: named?.revision ? named.rows.filter(r => r.coverage.state === "ready" && r.coverage.coveredRoles > 0).length : null,
      coverageUnavailable: named?.rows.some(r => r.coverage.state !== "ready") ?? true },
  };
});
export type HomeOverview = NonNullable<Awaited<ReturnType<typeof loadHomeOverview>>>;
