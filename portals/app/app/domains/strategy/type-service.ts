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

export async function listStrategyOptions(ctx:StrategyContext):Promise<RuleResult<import("./lib/strategy-result").StrategyOption[]>> {
 const gate=can(ctx.holder,ctx.entitlement,"strategy.type.view","data");if(!gate.allowed)return denied(gate);
 return ok(await ctx.store.listStrategyOptions(ctx.workspaceId));
}
export async function saveStrategyOption(ctx:StrategyContext,input:import("./lib/strategy-result").StrategyOption):Promise<RuleResult<null>> {
 const gate=can(ctx.holder,ctx.entitlement,"strategy.type.update","data");if(!gate.allowed)return denied(gate);
 if(!input || !["value","path"].includes(input.kind) || !/^[a-z][a-z0-9-]{0,63}$/.test(input.code) || typeof input.name!=="string" || !input.name.trim() || input.name.length>64 || typeof input.enabled!=="boolean" || !Number.isSafeInteger(input.sortOrder) || input.sortOrder<0 || input.sortOrder>9999)return fail(violation("strategy_type_invalid","invalid strategy option","option"));
 const rows=await ctx.store.listStrategyOptions(ctx.workspaceId);
 const existing=rows.find(o=>o.kind===input.kind && o.code===input.code);
 await ctx.store.saveStrategyOption(ctx.workspaceId,{...input,id:existing?.id ?? crypto.randomUUID(),name:input.name.trim()});return ok(null);
}
