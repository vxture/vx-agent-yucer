import { randomUUID } from "node:crypto";
import { can } from "../../authz/decide";
import { fail, ok, violation, type RuleResult } from "../shared/result";
import {
  validCooperation,
  type CooperationAssertion,
  type CooperationInput,
} from "./lib/cooperation";
import type { AccountContext } from "./service";
import { listPipeline } from "../pipeline/service";
import type { PipelineStore } from "../pipeline/store";

export async function readCooperationHistory(
  ctx: AccountContext,
): Promise<RuleResult<CooperationAssertion[]>> {
  if (!can(ctx.holder, ctx.entitlement, "account.view", "data").allowed)
    return fail(violation("denied", "account access required"));
  return ok(await ctx.store.listCooperationHistory(ctx.workspaceId));
}

/** Shared by the original customer form and controlled agent tools. */
export async function recordCooperationHistory(
  ctx: AccountContext & { pipeline?: PipelineStore },
  accountId: string,
  input: CooperationInput,
  now: () => Date = () => new Date(),
): Promise<RuleResult<CooperationAssertion>> {
  if (!can(ctx.holder, ctx.entitlement, "account.upsert", "data").allowed)
    return fail(violation("denied", "account write access required"));
  const account = await ctx.store.getAccount(ctx.workspaceId, accountId);
  if (!account) return fail(violation("not_found", "account unavailable"));
  const at = now().toISOString();
  if (!validCooperation(input, at))
    return fail(
      violation(
        "invalid_cooperation",
        "check cooperation history and evidence",
      ),
    );
  // Attribution is a separately verified historical fact, never the current owner.
  // MVP entry records history only; imported attribution must use its owning workflow.
  if (input.acquisitionOwnerSub || input.acquisitionTerritoryId)
    return fail(
      violation(
        "attribution_unverified",
        "historical attribution requires verified source",
      ),
    );
  if (ctx.pipeline) {
    const known = await listPipeline(
      { ...ctx, store: ctx.pipeline },
      { accountId, includeClosed: true },
    );
    if (known.ok) {
      const first = known.value
        .filter((d) => d.status === "won" && d.closedAt)
        .map((d) => d.closedAt!.toISOString().slice(0, 10))
        .sort()[0];
      if (
        (input.state === "never" &&
          known.value.some((d) => d.status === "won")) ||
        (first && input.state === "dated" && input.firstDate! > first)
      )
        return fail(
          violation(
            "cooperation_conflict",
            "history contradicts a recorded win",
          ),
        );
    }
  }
  const row: CooperationAssertion = {
    ...input,
    evidence: input.evidence.trim(),
    id: randomUUID(),
    accountId,
    recordedAt: at,
    recordedBy: ctx.sub,
  };
  return ok(await ctx.store.appendCooperationHistory(ctx.workspaceId, row));
}
