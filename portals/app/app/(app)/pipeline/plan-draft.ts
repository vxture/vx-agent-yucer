import { AtlasClient } from "../../agent/atlas/client";
import { RunosClient } from "../../agent/runos/client";
import { runAdvisor } from "../../domains/copilot/advisor";
import { runCopilotTurn } from "../../domains/copilot/turn-service";
import { PLAN_STEP_ACTION_TYPE } from "../../domains/copilot/lib/action";
import { PLAN_CAPABILITY, planQuestion, verifyPlanStep } from "../../domains/copilot/lib/plan-draft";
import { getOpportunityDetail, listExitCriteria, listStageDefinitions } from "../../domains/pipeline/service";
import { listCommitments } from "../../domains/account/field-service";
import { getCopilotStore, getFieldStore } from "../../domains/shared/registry";
import { ADVISOR_RUN_TURN_METER } from "../../usage/lib/copilot-turns";
import { tenantIdOf, type AppSession } from "../lib/session";
import { exitSnapshotFor } from "./exit-snapshot";

// 推进计划生成 (deal batch 5c, YC-066 §04): 3-6 dated steps toward the current
// stage's unmet exit criteria, then the next stage's. Filed as plan_step
// proposals under 推进计划; each accepted step becomes a commitment.
//
// Two triggers, both from the design: a person pressing 生成计划草案, and a
// deal entering a new stage (scheduled after the move's response). Through
// runAdvisor: gated on the deal's feature, one yucer.advisor.runs, and the
// same goals + open promises on the same day answer from the cache.

export type PlanDraftResult =
  | { ok: true; proposed: number; cached: boolean }
  | { ok: false; error: string };

export async function draftPlan(session: AppSession, opportunityId: string): Promise<PlanDraftResult> {
  const tenantId = tenantIdOf(session);
  if (!tenantId) return { ok: false, error: "no_active_tenant" };
  const base = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
  };
  const pipelineCtx = { ...base, store: session.stores.pipeline() };
  const [deal, criteria, stages, snapshot] = await Promise.all([
    getOpportunityDetail(pipelineCtx, opportunityId),
    listExitCriteria(pipelineCtx),
    listStageDefinitions(pipelineCtx),
    exitSnapshotFor(session, opportunityId),
  ]);
  if (!deal.ok) return { ok: false, error: deal.violations[0]?.code ?? "denied" };
  if (deal.value.status !== "open") return { ok: false, error: "plan_deal_closed" };

  // The goals: what this stage has not got us yet, then what the next asks.
  const open = (stages.ok ? stages.value : []).filter((s) => !s.isTerminal).sort((a, b) => a.sortOrder - b.sortOrder);
  const here = open.findIndex((s) => s.stageCode === deal.value.stage);
  const next = here >= 0 ? open[here + 1] : undefined;
  const nextNames = next && criteria.ok ? criteria.value.filter((c) => c.stageCode === next.stageCode).map((c) => c.name) : [];
  const goals = [...new Set([...(snapshot?.unmet ?? []), ...nextNames])];
  if (goals.length === 0) return { ok: false, error: "plan_no_goals" };

  const commitments = await listCommitments({ ...base, store: getFieldStore() }, { opportunityId });
  const openPromises = (commitments.ok ? commitments.value : []).filter((c) => c.status === "open");
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const question = planQuestion({
    dealName: deal.value.name,
    opportunityId,
    stageName: stages.ok ? (stages.value.find((s) => s.stageCode === deal.value.stage)?.name ?? deal.value.stage) : deal.value.stage,
    goals,
    openCommitments: openPromises.map((c) => ({ direction: c.direction, statement: c.statement, dueAt: c.dueAt.toISOString().slice(0, 10) })),
    today,
  });

  const copilotCtx = { ...base, store: getCopilotStore() };
  let taken = 0;
  const run = await runAdvisor(copilotCtx, {
    capability: PLAN_CAPABILITY,
    kind: "plan_draft",
    subject: { type: "opportunity", id: opportunityId },
    input: { question },
    generate: async ({ runId, atlas }) => {
      const turn = await runCopilotTurn(
        copilotCtx,
        {
          question,
          tenantId,
          subject: { type: "opportunity", id: opportunityId, summary: deal.value.name },
          autopilotActive: false,
          capability: PLAN_CAPABILITY,
          admitProposal: (p) => {
            const ok =
              p.actionType === PLAN_STEP_ACTION_TYPE &&
              verifyPlanStep(p.payload, goals, now, openPromises.map((c) => c.statement), taken);
            if (ok) taken += 1;
            return ok;
          },
          advisorRun: { featureId: atlas.featureId, runId },
        },
        { atlasClient: new AtlasClient(), runosClient: new RunosClient(), meter: ADVISOR_RUN_TURN_METER },
      );
      return turn.ok ? { ok: true as const, value: { proposed: turn.value.proposals.length } } : turn;
    },
  });
  if (!run.ok) return { ok: false, error: run.violations[0]?.code ?? "denied" };
  return { ok: true, proposed: run.value.content.proposed, cached: run.value.cached };
}
