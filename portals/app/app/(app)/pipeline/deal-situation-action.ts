"use server";

import { AtlasClient } from "../../agent/atlas/client";
import { RunosClient } from "../../agent/runos/client";
import { runAdvisor } from "../../domains/copilot/advisor";
import { runCopilotTurn } from "../../domains/copilot/turn-service";
import { canRunAdvisor } from "../../domains/copilot/lib/advisor-gate";
import { SITUATION_CAPABILITY, admitSituation, type Situation } from "../../domains/copilot/lib/deal-situation";
import { getCopilotStore } from "../../domains/shared/registry";
import { ADVISOR_RUN_TURN_METER } from "../../usage/lib/copilot-turns";
import { resolveAppSession, tenantIdOf } from "../lib/session";
import { citedNotes, situationFrameFor, situationRun, type SituationRun } from "./deal-situation-data";

// 局势简报 · 风险解读 · 卡点诊断 (deal batch 8b) - written when the deck finds
// nothing written for the deal's data as it stands.
//
// "底层数据变化后重算，不按访问重算" (YC-066): the run is keyed on its input,
// so a visit with unchanged data is served from the cache (the deck reads it
// without calling here at all), and a changed deal is written once. Through
// runAdvisor: the deal's feature, one yucer.advisor.runs, admitted by
// lib/deal-situation.ts. It proposes nothing.

export type SituationResult =
  | {
      ok: true;
      situation: Situation;
      cited: Record<string, { date: string; text: string }>;
      stallHolder: string | null;
      cached: boolean;
    }
  | { ok: false; error: string };

export async function briefDealSituation(opportunityId: string): Promise<SituationResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };
  const gate = canRunAdvisor(session.authz, session.entitlement, SITUATION_CAPABILITY);
  if (!gate.allowed) return { ok: false, error: gate.reason ?? "denied" };
  const tenantId = tenantIdOf(session);
  if (!tenantId) return { ok: false, error: "no_active_tenant" };

  const frame = await situationFrameFor(session, opportunityId);
  if (!frame) return { ok: false, error: "not_found" };

  const copilotCtx = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: getCopilotStore(),
  };
  const run = await runAdvisor<SituationRun>(copilotCtx, {
    ...situationRun(frame),
    generate: async ({ runId, atlas }) => {
      const turn = await runCopilotTurn(
        copilotCtx,
        {
          question: frame.question,
          tenantId,
          subject: { type: "opportunity", id: opportunityId, summary: frame.input.dealName },
          autopilotActive: false,
          capability: SITUATION_CAPABILITY,
          // A finding, not a proposal: nothing this turn suggests is filed.
          admitProposal: () => false,
          advisorRun: { featureId: atlas.featureId, runId },
        },
        { atlasClient: new AtlasClient(), runosClient: new RunosClient(), meter: ADVISOR_RUN_TURN_METER },
      );
      return turn.ok ? { ok: true as const, value: { situation: admitSituation(turn.value.answer, frame.input) } } : turn;
    },
  });
  if (!run.ok) return { ok: false, error: run.violations[0]?.code ?? "denied" };
  const situation = run.value.content.situation;
  if (!situation) return { ok: false, error: "situation_empty" };
  return { ok: true, situation, cited: citedNotes(frame, situation), stallHolder: frame.stallHolder, cached: run.value.cached };
}
