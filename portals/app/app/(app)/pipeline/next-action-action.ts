"use server";

import { AtlasClient } from "../../agent/atlas/client";
import { RunosClient } from "../../agent/runos/client";
import { runAdvisor } from "../../domains/copilot/advisor";
import { runCopilotTurn } from "../../domains/copilot/turn-service";
import { canRunAdvisor } from "../../domains/copilot/lib/advisor-gate";
import { PLAN_STEP_ACTION_TYPE } from "../../domains/copilot/lib/action";
import { NEXT_ACTION_CAPABILITY, verifyNextAction } from "../../domains/copilot/lib/next-action";
import { getCopilotStore } from "../../domains/shared/registry";
import { ADVISOR_RUN_TURN_METER } from "../../usage/lib/copilot-turns";
import { resolveAppSession, tenantIdOf } from "../lib/session";
import { situationFrameFor } from "./deal-situation-data";
import { nextActionDue, nextActionFrameFor, nextActionRun } from "./next-action-data";

// 下一步最佳动作 (deal batch 8c) - asked by the deal's deck when the deal's
// data has had no run today and no next action waits for a decision.
//
// Through runAdvisor: the deal's feature, one yucer.advisor.runs, the same
// inputs answer from the cache. The turn may propose; the rule admits exactly
// one plan step of ours, due within two weeks, whose reason names one goal
// (lib/next-action.ts). It lands in 本单参谋, where a person decides it.

export type NextActionResult =
  | { ok: true; proposed: number; cached: boolean }
  | { ok: false; error: string };

export async function proposeNextAction(opportunityId: string): Promise<NextActionResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };
  const gate = canRunAdvisor(session.authz, session.entitlement, NEXT_ACTION_CAPABILITY);
  if (!gate.allowed) return { ok: false, error: gate.reason ?? "denied" };
  const tenantId = tenantIdOf(session);
  if (!tenantId) return { ok: false, error: "no_active_tenant" };

  const now = new Date();
  const situation = await situationFrameFor(session, opportunityId, now);
  const frame = situation ? await nextActionFrameFor(session, situation, now) : null;
  if (!frame) return { ok: true, proposed: 0, cached: false };
  // Checked again here, not only in the deck: two tabs must not file two.
  if (!(await nextActionDue(session, frame, now))) return { ok: true, proposed: 0, cached: true };

  const copilotCtx = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: getCopilotStore(),
  };
  const openStatements = frame.input.openCommitments.map((c) => c.statement);
  let taken = 0;
  const run = await runAdvisor(copilotCtx, {
    ...nextActionRun(frame),
    generate: async ({ runId, atlas }) => {
      const turn = await runCopilotTurn(
        copilotCtx,
        {
          question: frame.question,
          tenantId,
          subject: { type: "opportunity", id: opportunityId, summary: frame.input.dealName },
          autopilotActive: false,
          capability: NEXT_ACTION_CAPABILITY,
          admitProposal: (p) => {
            const ok =
              p.actionType === PLAN_STEP_ACTION_TYPE && verifyNextAction(p.payload, frame.input.goals, now, openStatements, taken);
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
