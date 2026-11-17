import { can } from "../../authz/decide";
import { denied } from "../pipeline/service";
import { fail, ok, violation, type RuleResult } from "../shared/result";
import type { StrategyContext } from "./service";
import { validStrategyType, type StrategyType } from "./lib/strategy-type";

export async function listStrategyTypes(ctx: StrategyContext): Promise<RuleResult<StrategyType[]>> {
  const gate = can(ctx.holder, ctx.entitlement, "strategy.type.view", "data");
  if (!gate.allowed) return denied(gate);
  return ok(await ctx.store.listStrategyTypes(ctx.workspaceId));
}

export async function saveStrategyType(ctx: StrategyContext, input: StrategyType): Promise<RuleResult<null>> {
  const gate = can(ctx.holder, ctx.entitlement, "strategy.type.update", "data");
  if (!gate.allowed) return denied(gate);
  if (!validStrategyType(input)) return fail(violation("strategy_type_invalid", "invalid strategy type", "strategyType"));
  await ctx.store.saveStrategyType(ctx.workspaceId, {
    code:input.code,name:input.name.trim(),description:input.description.trim(),
    theme:input.theme,enabled:input.enabled,sortOrder:input.sortOrder,
  });
  return ok(null);
}
