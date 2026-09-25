import { fail, ok, violation, type RuleResult } from "../shared/result";
import { endpointFor } from "../../agent/atlas/endpoints";
import { denied } from "../pipeline/service";
import { defaultAdvisorMeter, type AdvisorMeter } from "../../usage/lib/advisor-runs";
import { canRunAdvisor } from "./lib/advisor-gate";
import { CAPABILITY_SPEC, type Capability } from "./lib/capability";
import {
  inputFingerprint,
  runIdOf,
  type BriefingKind,
  type BriefingSubject,
} from "./lib/briefing";
import type { CopilotContext } from "./service";

// runAdvisor() - THE ONE DOOR an advisor capability reaches the model through
// (YC-042 §04 / §08; deal batch 0b). Five things happen here and nowhere else:
//
//   1. GATE      the capability's host feature and copilot.use (YC-042 §03).
//   2. FINGERPRINT  capability + subject + input -> the run id. Same input,
//                same run: a cache hit costs no model call and no charge.
//   3. ADMIT     the platform's answer for yucer.advisor.runs (TD-035: still
//                the pool read until C2 names an admit field). Refused means
//                the caller shows its rule-only part - the product does not
//                decide quota, it presents what the platform said.
//   4. METER     charged at the start, keyed by the run id, before the model.
//   5. CALL      the caller's generation, handed the Atlas tags (featureId =
//                the capability, businessId / applicationId = the run id).
//
// The result is cached under the fingerprint (agent_briefing, incr/0083) so
// the next identical ask is served from the row. Rules never come through
// here: they are local functions, free, and the fallback when a run is not
// admitted (YC-042 §05).

export interface AdvisorAtlasTags {
  readonly featureId: string;
  readonly businessId: string;
  readonly applicationId: string;
}

export interface AdvisorRunRequest<T> {
  readonly capability: Capability;
  readonly kind: BriefingKind;
  readonly subject: { readonly type: BriefingSubject; readonly id: string };
  /** Everything the generation reads. Serialised canonically for the fingerprint. */
  readonly input: unknown;
  /** Called only on a miss, after admission and the charge. */
  readonly generate: (run: {
    readonly runId: string;
    readonly atlas: AdvisorAtlasTags;
  }) => Promise<RuleResult<T>>;
}

export interface AdvisorRunOutcome<T> {
  readonly content: T;
  readonly runId: string;
  /** True when the same input had already been run: no model call, no charge. */
  readonly cached: boolean;
}

export async function runAdvisor<T>(
  ctx: CopilotContext,
  req: AdvisorRunRequest<T>,
  deps: { readonly meter?: AdvisorMeter } = {},
): Promise<RuleResult<AdvisorRunOutcome<T>>> {
  const gate = canRunAdvisor(ctx.holder, ctx.entitlement, req.capability);
  if (!gate.allowed) return denied(gate);

  const inputHash = inputFingerprint({
    capability: req.capability,
    kind: req.kind,
    subjectType: req.subject.type,
    subjectId: req.subject.id,
    input: req.input,
  });
  const runId = runIdOf(inputHash);
  const key = { subjectType: req.subject.type, subjectId: req.subject.id, kind: req.kind, inputHash };

  const hit = await ctx.store.findBriefing(ctx.workspaceId, key);
  if (hit) return ok({ content: hit.content as T, runId, cached: true });

  const meter = deps.meter ?? defaultAdvisorMeter();
  if (!meter.admit(ctx.entitlement).ok) {
    return fail(violation("advisor_not_admitted", "the platform did not admit this advisor run", "capability"));
  }
  await meter.record(ctx.workspaceId, runId);

  const generated = await req.generate({
    runId,
    atlas: { featureId: req.capability, businessId: runId, applicationId: runId },
  });
  if (!generated.ok) return generated;

  await ctx.store.saveBriefing(ctx.workspaceId, {
    ...key,
    capability: req.capability,
    content: generated.value,
    // The ROUTE, not a model name: the product routes by endpoint and the
    // operator decides which model serves it (agent/atlas/endpoints.ts).
    model: routeOf(req.capability),
  });
  return ok({ content: generated.value, runId, cached: false });
}

function routeOf(capability: Capability): string {
  return endpointFor(CAPABILITY_SPEC[capability].task);
}
