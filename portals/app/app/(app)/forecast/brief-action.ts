"use server";

import { AtlasClient } from "../../agent/atlas/client";
import { RunosClient } from "../../agent/runos/client";
import { runReadOnlyAdvisor } from "../../domains/copilot/read-only-advisor";
import { fail, ok, violation } from "../../domains/shared/result";
import { canRunAdvisor } from "../../domains/copilot/lib/advisor-gate";
import {
  FORECAST_BRIEF_CAPABILITY,
  admitForecastBrief,
  forecastBriefQuestion,
  type ForecastBrief,
  type ForecastBriefInput,
} from "../../domains/copilot/lib/forecast-brief";
import type { UnverifiedReason } from "../../domains/pipeline/lib/unverified";
import type { OpportunityRecord } from "../../domains/pipeline/store";
import { getCopilotStore, getPlanningStore, getSalesPlanStore } from "../../domains/shared/registry";
import { readAttainmentPlan } from "../../domains/planning/attainment-plan";
import { getAuthzStore } from "../../authz/store";
import { resolveAppSession, tenantIdOf, type AppSession } from "../lib/session";
import { getMessages } from "../lib/i18n/server";
import { periodRange } from "../../domains/shared/period";
import { forecastScopeKey, parseForecastScope } from "../lib/forecast-scope";
import { forecastBoard } from "./board";

// 预测会简报 (deal batch 9e) - one press on 预测检视台.
//
// The same board the page renders (forecast/board.ts) goes to the model as
// figures; the narrative comes back and is ADMITTED (lib/forecast-brief.ts)
// before anyone sees it. Through runAdvisor: gated on pipeline.forecast
// (the console's own feature), one yucer.advisor.runs, and the same board
// answers from the cache. It proposes nothing.

export type ForecastBriefResult =
  | {
      ok: true;
      summary: readonly string[];
      questions: readonly { owner: string; dealId: string | null; dealName: string | null; text: string }[];
      dropped: number;
      cached: boolean;
    }
  | { ok: false; error: string };

async function readBriefComparison(session: AppSession, period: string, scope: string, currency: string, observedAt: string, revisionId?: string | null): Promise<ForecastBriefInput["comparison"]> {
  try {
    const plan = await readAttainmentPlan({ workspaceId: session.workspaceId, sub: session.user.sub, holder: session.authz,
      entitlement: session.entitlement, scope: session.scope, store: getSalesPlanStore(), targets: getPlanningStore(), now: () => new Date(observedAt) },
      Number(period.replace(/^Y/, "").slice(0, 4)), revisionId);
    const target = plan.targets.find(t => t.scope === scope && t.period === period && t.currency === currency);
    return { scope, revisionId: target?.revision?.id ?? null, version: target?.revision?.version ?? null,
      target: target?.target ?? null, currency, observedAt };
  } catch (error) {
    if (revisionId) throw error;
    return undefined;
  }
}

function forecastOwners(deals: readonly OpportunityRecord[]) {
  const owners = new Map<string, { commit: number; bestCase: number }>();
  for (const o of deals) {
    if (o.status !== "open" || !o.ownerSub) continue;
    const held = owners.get(o.ownerSub) ?? { commit: 0, bestCase: 0 };
    if (o.forecastCategory === "commit") held.commit += o.amount?.amount ?? 0;
    if (o.forecastCategory === "best_case") held.bestCase += o.amount?.amount ?? 0;
    owners.set(o.ownerSub, held);
  }
  return owners;
}

export async function briefForecast(periodRaw: string, scopeRaw: string, planRevision?: string | null): Promise<ForecastBriefResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };
  const gate = canRunAdvisor(session.authz, session.entitlement, FORECAST_BRIEF_CAPABILITY);
  if (!gate.allowed) return { ok: false, error: gate.reason ?? "denied" };
  const tenantId = tenantIdOf(session);
  if (!tenantId) return { ok: false, error: "no_active_tenant" };

  const { POSITION_TEXT, FORECAST_UNVERIFIED_TEXT: U } = await getMessages();
  if (!periodRange(periodRaw)) return { ok: false, error: "period_unparsed" };
  const period = periodRaw;
  const scope = parseForecastScope(scopeRaw);
  if (planRevision && scope.scopeType === "owner") return { ok: false, error: "plan_denied" };
  const board = await forecastBoard(session, period, scope, POSITION_TEXT.rivalWords);
  if (!board.ok) return { ok: false, error: board.violations[0]?.code ?? "denied" };
  if (!board.score.ok) return { ok: false, error: board.score.violations[0]?.code ?? "denied" };
  const reportingCurrency = board.score.value.current.currency;
  const scopeKey = forecastScopeKey(scope);
  const observedAt = new Date().toISOString();
  let comparison: ForecastBriefInput["comparison"];
  try {
    comparison = await readBriefComparison(session, period, scopeKey, reportingCurrency, observedAt, planRevision);
  } catch { return { ok: false, error: "plan_denied" }; }

  const names = new Map(
    (await getAuthzStore().listMembers(session.workspaceId)).map((m) => [m.sub, m.displayName ?? m.sub] as const),
  );
  const ownerOf = new Map(board.inView.map((p) => [p.opportunity.id, p.opportunity.ownerSub ?? null] as const));
  const dealName = new Map(board.inView.map((p) => [p.opportunity.id, p.opportunity.name] as const));
  const reason = (r: UnverifiedReason) =>
    r.kind === "exit_unmet"
      ? U.exitUnmet(r.names.join(U.sep))
      : r.kind === "exit_unknown"
        ? U.exitUnknown(r.names.join(U.sep))
        : r.kind === "exit_unreadable"
          ? U.exitUnreadable
          : U.risk(r.score);

  const owners = forecastOwners(board.inView.map(p => p.opportunity));
  const current = board.score.value.current;
  const lastCall = [...board.points].reverse().find((p) => p.callAmount != null)?.callAmount?.amount ?? null;
  const change = board.change?.ok ? board.change.value : null;
  const input: ForecastBriefInput = {
    period,
    comparison,
    totals: {
      commit: current.commitAmount.amount,
      bestCase: current.bestCaseAmount.amount,
      pipeline: current.pipelineAmount.amount,
      closed: current.closedAmount.amount,
    },
    call: lastCall,
    change: change
      ? {
          since: change.since.toISOString().slice(0, 10),
          commit: { total: change.commit.total, byKind: change.commit.byKind, unexplained: change.commit.unexplained },
          bestCase: { total: change.bestCase.total, byKind: change.bestCase.byKind, unexplained: change.bestCase.unexplained },
        }
      : null,
    unverified: (board.unverified ?? []).map((u) => ({
      category: u.category,
      total: u.total,
      unverified: u.unverified,
      deals: u.deals.map((d) => ({
        id: d.id,
        name: d.name,
        ownerSub: ownerOf.get(d.id) ?? null,
        amount: d.amount,
        lacks: d.reasons.map(reason),
      })),
    })),
    owners: [...owners].map(([sub, v]) => ({ sub, name: names.get(sub) ?? sub, ...v })),
  };
  const question = forecastBriefQuestion(input);

  const copilotCtx = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: getCopilotStore(),
  };
  const run = await runReadOnlyAdvisor<ForecastBrief>(copilotCtx, {
    capability: FORECAST_BRIEF_CAPABILITY,
    kind: "forecast_brief",
    subject: { type: "forecast_scope", id: `${period}|${scopeKey}|${comparison?.revisionId ?? "live"}` },
    question, tenantId, subjectToken: (await session.accessToken()) ?? undefined, scope: session.scope,
    admit: answer => {
      const brief = admitForecastBrief(answer, input);
      return brief ? ok(brief) : fail(violation("brief_empty", "the brief did not match the board", "answer"));
    },
  }, { atlasClient: new AtlasClient(), runosClient: new RunosClient() });
  if (!run.ok) return { ok: false, error: run.violations[0]?.code ?? "denied" };
  const brief = run.value.content;
  return {
    ok: true,
    summary: brief.summary,
    questions: brief.questions.map((q) => ({
      owner: names.get(q.ownerSub) ?? q.ownerSub,
      dealId: q.dealId,
      dealName: q.dealId ? (dealName.get(q.dealId) ?? null) : null,
      text: q.text,
    })),
    dropped: brief.dropped,
    cached: run.value.cached,
  };
}
