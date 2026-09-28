"use server";

import { AtlasClient } from "../../agent/atlas/client";
import { RunosClient } from "../../agent/runos/client";
import { runAdvisor } from "../../domains/copilot/advisor";
import { runCopilotTurn } from "../../domains/copilot/turn-service";
import { canRunAdvisor } from "../../domains/copilot/lib/advisor-gate";
import {
  FORECAST_BRIEF_CAPABILITY,
  admitForecastBrief,
  forecastBriefQuestion,
  type ForecastBrief,
  type ForecastBriefInput,
} from "../../domains/copilot/lib/forecast-brief";
import type { UnverifiedReason } from "../../domains/pipeline/lib/unverified";
import { getCopilotStore } from "../../domains/shared/registry";
import { getAuthzStore } from "../../authz/store";
import { ADVISOR_RUN_TURN_METER } from "../../usage/lib/copilot-turns";
import { resolveAppSession, tenantIdOf } from "../lib/session";
import { getMessages } from "../lib/i18n/server";
import { resolvePeriod } from "../lib/periods";
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

export async function briefForecast(periodRaw: string, scopeRaw: string): Promise<ForecastBriefResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };
  const gate = canRunAdvisor(session.authz, session.entitlement, FORECAST_BRIEF_CAPABILITY);
  if (!gate.allowed) return { ok: false, error: gate.reason ?? "denied" };
  const tenantId = tenantIdOf(session);
  if (!tenantId) return { ok: false, error: "no_active_tenant" };

  const { POSITION_TEXT, FORECAST_UNVERIFIED_TEXT: U } = await getMessages();
  const period = resolvePeriod(periodRaw);
  const scope = parseForecastScope(scopeRaw);
  const board = await forecastBoard(session, period, scope, POSITION_TEXT.rivalWords);
  if (!board.ok) return { ok: false, error: board.violations[0]?.code ?? "denied" };
  if (!board.score.ok) return { ok: false, error: board.score.violations[0]?.code ?? "denied" };

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

  const owners = new Map<string, { commit: number; bestCase: number }>();
  for (const p of board.inView) {
    const o = p.opportunity;
    if (o.status !== "open" || !o.ownerSub) continue;
    const held = owners.get(o.ownerSub) ?? { commit: 0, bestCase: 0 };
    if (o.forecastCategory === "commit") held.commit += o.amount?.amount ?? 0;
    if (o.forecastCategory === "best_case") held.bestCase += o.amount?.amount ?? 0;
    owners.set(o.ownerSub, held);
  }
  const current = board.score.value.current;
  const lastCall = [...board.points].reverse().find((p) => p.callAmount != null)?.callAmount?.amount ?? null;
  const change = board.change?.ok ? board.change.value : null;
  const input: ForecastBriefInput = {
    period,
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
  const run = await runAdvisor<{ brief: ForecastBrief | null }>(copilotCtx, {
    capability: FORECAST_BRIEF_CAPABILITY,
    kind: "forecast_brief",
    subject: { type: "forecast_scope", id: `${period}|${forecastScopeKey(scope)}` },
    input: { question },
    generate: async ({ runId, atlas }) => {
      const turn = await runCopilotTurn(
        copilotCtx,
        {
          question,
          tenantId,
          autopilotActive: false,
          capability: FORECAST_BRIEF_CAPABILITY,
          // A briefing, not a proposal: nothing this turn suggests is filed.
          admitProposal: () => false,
          advisorRun: { featureId: atlas.featureId, runId },
        },
        { atlasClient: new AtlasClient(), runosClient: new RunosClient(), meter: ADVISOR_RUN_TURN_METER },
      );
      return turn.ok ? { ok: true as const, value: { brief: admitForecastBrief(turn.value.answer, input) } } : turn;
    },
  });
  if (!run.ok) return { ok: false, error: run.violations[0]?.code ?? "denied" };
  const brief = run.value.content.brief;
  if (!brief) return { ok: false, error: "brief_empty" };
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
