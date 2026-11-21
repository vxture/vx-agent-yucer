import { runAdvisor, type AdvisorRunRequest } from "./advisor";
import { runCopilotTurn, type TurnDeps } from "./turn-service";
import type { CopilotContext } from "./service";
import type { AdvisorMeter } from "../../usage/lib/advisor-runs";
import { ADVISOR_RUN_TURN_METER } from "../../usage/lib/copilot-turns";
import type { RuleResult } from "../shared/result";

/** A brief or review reads facts and returns an admitted draft, never a write.
 * OBO tool results can depend on the member and scope even for identical page
 * figures, so both belong in this cache key. Credentials never do. */
export async function runReadOnlyAdvisor<T>(
  ctx: CopilotContext,
  input: Readonly<{
    capability: AdvisorRunRequest<T>["capability"];
    kind: AdvisorRunRequest<T>["kind"];
    subject: AdvisorRunRequest<T>["subject"] & { summary?: string };
    question: string;
    tenantId: string;
    subjectToken?: string;
    scope: unknown;
    admit: (answer: string) => RuleResult<T>;
  }>,
  deps: TurnDeps & { advisorMeter?: AdvisorMeter },
) {
  return runAdvisor<T>(ctx, {
    capability: input.capability,
    kind: input.kind,
    subject: input.subject,
    input: { question: input.question, workspaceId: ctx.workspaceId, tenantId: input.tenantId, actor: ctx.sub,
      scope: input.scope, permissions: [...ctx.holder.permissions].sort() },
    generate: async ({ runId, atlas }) => {
      const turn = await runCopilotTurn(ctx, {
        question: input.question,
        tenantId: input.tenantId,
        subjectToken: input.subjectToken,
        subject: input.subject.type === "forecast_scope" ? undefined : { ...input.subject, type: input.subject.type },
        capability: input.capability,
        autopilotActive: false,
        draftOnly: true,
        readOnlyTools: true,
        advisorRun: { featureId: atlas.featureId, runId },
      }, { ...deps, meter: ADVISOR_RUN_TURN_METER });
      return turn.ok ? input.admit(turn.value.answer) : turn;
    },
  }, { meter: deps.advisorMeter });
}
