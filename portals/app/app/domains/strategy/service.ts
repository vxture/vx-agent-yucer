import { strategyResultIssues, validStrategyResult, goalExpectations, strategyToday, alignResultRelations, resultRelationsMatch } from "./lib/strategy-result";
import { businessRecordMissing, nextBusinessCode, saveBusinessRecord, type BusinessWrite } from "../shared/business-code";
import { parseStrategyPeriod } from "./lib/plan-period";
import { nextStrategyNumber } from "./lib/plan-number";
// D1 strategy and D3 campaign application service.
//
// campaignReturn() is the function this whole product exists to make possible.
// The README's thesis is that a broken chain leaves "how much of this quarter's
// pipeline actually came from the segment we decided to attack" unanswerable.
// This answers it with a join, because attribution was captured at creation and
// frozen - not by asking anyone to tally it.

import type { MemberRecord } from "../../authz/store";
import type { Entitlement } from "../../entitlement/types";
import { can, type PermissionHolder } from "../../authz/decide";
import { fail, ok, violation, type RuleResult } from "../shared/result";
import { denied } from "../pipeline/service";
import { planMove } from "../catalog/lib/lifecycle";
import { listProductReferences, listSolutionReferences } from "../catalog/service";
import type { CatalogStore } from "../catalog/store";
import { sumMoney, type Money } from "../shared/money";
import {
  canCompleteCampaign,
  executionProgress,
  planCampaignTransition,
  planStrategyTransition,
  validateCampaignWindow,
  type CampaignStatus,
  type PlanStatus,
  planExecution,
  planNewPlan,
  planPlanEdit,
  type PlanEdit,
  type TargetMarket,
  type TargetMarketDraft,
  TARGET_MARKET_INTENTS,
  type ExecutionDraft,
  type NewPlanDraft,
  planSegment,
  type SegmentDraft,
  planSegmentRemoval,
  type SegmentStatus,
} from "./lib/lifecycle";
import { checkCampaignLinks, planCampaignEdit, planNewCampaign, type CampaignDraft, type NewCampaignDraft } from "./lib/campaign";
import {
  StrategyVersionError,
  type PlanWriteGuard,
  PlanMarketUnavailableError,
  PlanSolutionUnavailableError,
  PlanProductUnavailableError,
  SegmentReferencedError,
  type CampaignRecord,
  type ExecutionRecord,
  type PlanRecord,
  type SegmentCoverageSnapshotInput,
  type SegmentRecord,
  type StrategyStore,
  type TerritoryAttainmentSnapshotInput,
} from "./store";
import type { MoveDirection } from "../shared/ordering";

export interface StrategyContext {
  workspaceId: string;
  sub: string;
  holder: PermissionHolder;
  entitlement: Entitlement;
  store: StrategyStore;
  catalog?: Pick<CatalogStore, "listSolutions"> & Partial<Pick<CatalogStore, "listProducts" | "listStatusConfigs">>;
  memberDirectory?: { listMembers(workspaceId: string): Promise<readonly Pick<MemberRecord, "sub" | "status" | "displayName">[]> };
}

async function validatePlanOwner(ctx: StrategyContext, owner: string | null, existing: string | null = null): Promise<RuleResult<null>> {
  if (!owner || owner === existing) return ok(null);
  if (!ctx.memberDirectory) return fail(violation("member_directory_unavailable", "member directory unavailable", "ownerSub", true));
  try {
    const members = await ctx.memberDirectory.listMembers(ctx.workspaceId);
    return members.some(m => m.sub === owner && m.status === "active") ? ok(null)
      : fail(violation("owner_not_selectable", "owner must be an active workspace member", "ownerSub"));
  } catch { return fail(violation("member_directory_unavailable", "member directory unavailable", "ownerSub", true)); }
}

async function validatePlanSolutions(
  ctx: StrategyContext,
  ids: readonly string[],
  existing: readonly string[] = [],
): Promise<RuleResult<readonly string[]>> {
  if (!Array.isArray(ids) || ids.some(id => typeof id !== "string" || !id)) {
    return fail(violation("solution_not_selectable", "invalid solution selection", "solutionIds"));
  }
  const gate = can(ctx.holder, ctx.entitlement, "catalog.solution.view", "data");
  if (!gate.allowed) return denied(gate);
  const selected = [...new Set(ids)];
  const added = selected.filter(id => !existing.includes(id));
  if (!added.length) return ok(selected);
  if (ctx.catalog) {
    try {
      const refs = await listSolutionReferences({ ...ctx, store: ctx.catalog });
      if (!refs.ok) return refs;
      const available = new Set(refs.value.filter(s => s.status === "active").map(s => s.id));
      if (added.every(id => available.has(id))) return ok(selected);
      return fail(violation("solution_not_selectable", "solution unavailable for selection", "solutionIds"));
    } catch {
      // Preserve the draft when the source cannot be read.
    }
  }
  return fail(violation("solution_catalog_unavailable", "solution catalogue unavailable", "solutionIds", true));
}

async function validatePlanProducts(
  ctx: StrategyContext,
  ids: readonly string[],
  existing: readonly string[] = [],
): Promise<RuleResult<readonly string[]>> {
  if (!Array.isArray(ids) || ids.some(id => typeof id !== "string" || !id)) {
    return fail(violation("product_not_selectable", "invalid product selection", "productIds"));
  }
  const gate = can(ctx.holder, ctx.entitlement, "catalog.product.view", "data");
  if (!gate.allowed) return denied(gate);
  const selected = [...new Set(ids)];
  const added = selected.filter(id => !existing.includes(id));
  if (!added.length) return ok(selected);
  if (ctx.catalog?.listProducts && ctx.catalog.listStatusConfigs) {
    try {
      const refs = await listProductReferences({ ...ctx, store: { listProducts: ctx.catalog.listProducts.bind(ctx.catalog), listStatusConfigs: ctx.catalog.listStatusConfigs.bind(ctx.catalog) } });
      if (!refs.ok) return refs;
      const available = new Set(refs.value.filter(s => s.status === "active").map(s => s.id));
      if (added.every(id => available.has(id))) return ok(selected);
      return fail(violation("product_not_selectable", "product unavailable for selection", "productIds"));
    } catch {
      // Preserve the draft when the source cannot be read.
    }
  }
  return fail(violation("product_catalog_unavailable", "product catalogue unavailable", "productIds", true));
}

function marketUnavailable() {
  return violation("market_not_selectable", "invalid or unavailable target market", "targetMarkets");
}

async function validateTargetMarkets(
  ctx: StrategyContext,
  input: readonly TargetMarketDraft[] | undefined,
  existing: readonly TargetMarket[] = [],
): Promise<RuleResult<readonly TargetMarket[] | undefined>> {
  if (input === undefined) return ok(undefined);
  const gate = can(ctx.holder, ctx.entitlement, "strategy.segment.view", "data");
  if (!gate.allowed) return denied(gate);
  if (!Array.isArray(input)) return fail(marketUnavailable());
  const segments = new Map((await ctx.store.listSegments(ctx.workspaceId)).map(s => [s.id, s]));
  const prior = new Map(existing.map(t => [t.segmentId, t]));
  const chosen = new Map<string, TargetMarket>();
  // Validate the catalogue once even when many targets were edited. Compare
  // additions per market so a retired solution cannot move to a new target.
  const addedProducts = new Set<string>();
  let changedProducts = false;
  let availableProductDefaults: Set<string> | undefined;
  const addedSolutions = new Set<string>();
  let changedSolutions = false;
  let availableDefaults: Set<string> | undefined;
  for (const target of input as readonly TargetMarketDraft[]) {
    if (!target || typeof target.segmentId !== "string" || chosen.has(target.segmentId)) return fail(marketUnavailable());
    const held = prior.get(target.segmentId);
    const segment = segments.get(target.segmentId);
    if (!segment || (!held && segment.status !== "active")) return fail(marketUnavailable());
    if (target.intent === null ? !held : !TARGET_MARKET_INTENTS.includes(target.intent)) return fail(marketUnavailable());
    if (target.approach !== null && (typeof target.approach !== "string" || target.approach.length > 4000)) {
      return fail(marketUnavailable());
    }
    const ids = target.solutionIds;
    if (ids !== undefined && (!Array.isArray(ids) || ids.some(id => typeof id !== "string" || !id))) {
      return fail(violation("solution_not_selectable", "invalid solution selection", "solutionIds"));
    }
    // New targets copy current market defaults once. Existing drafts and
    // publications retain their own selection, including an explicit empty one.
    let solutionIds = ids === undefined ? [...(held?.solutionIds ?? segment.solutionIds ?? [])] : [...new Set(ids)];
    if (ids === undefined && !held && solutionIds.length) {
      if (!availableDefaults) {
        if (!ctx.catalog) return fail(violation("solution_catalog_unavailable", "solution catalogue unavailable", "solutionIds", true));
        const refs = await listSolutionReferences({ ...ctx, store: ctx.catalog });
        if (!refs.ok) return refs;
        availableDefaults = new Set(refs.value.filter(s => s.status === "active").map(s => s.id));
      }
      solutionIds = solutionIds.filter(id => availableDefaults!.has(id));
    }
    if (ids !== undefined || (!held && solutionIds.length)) changedSolutions = true;
    for (const id of solutionIds) if (!held?.solutionIds.includes(id)) addedSolutions.add(id);
    const productInput = target.productIds;
    if (productInput !== undefined && (!Array.isArray(productInput) || productInput.some(id => typeof id !== "string" || !id))) {
      return fail(violation("product_not_selectable", "invalid product selection", "productIds"));
    }
    // New targets copy current market defaults once. Existing drafts and
    // publications retain their own selection, including an explicit empty one.
    let productIds = productInput === undefined ? [...(held?.productIds ?? segment.productIds ?? [])] : [...new Set(productInput)];
    if (productInput === undefined && !held && productIds.length) {
      if (!availableProductDefaults) {
        if (!ctx.catalog?.listProducts || !ctx.catalog.listStatusConfigs) return fail(violation("product_catalog_unavailable", "product catalogue unavailable", "productIds", true));
        const refs = await listProductReferences({ ...ctx, store: { listProducts: ctx.catalog.listProducts.bind(ctx.catalog), listStatusConfigs: ctx.catalog.listStatusConfigs.bind(ctx.catalog) } });
        if (!refs.ok) return refs;
        availableProductDefaults = new Set(refs.value.filter(s => s.status === "active").map(s => s.id));
      }
      productIds = productIds.filter(id => availableProductDefaults!.has(id));
    }
    if (productInput !== undefined || (!held && productIds.length)) changedProducts = true;
    for (const id of productIds) if (!held?.productIds?.includes(id)) addedProducts.add(id);
    chosen.set(segment.id, {
      segmentId: segment.id, intent: target.intent, approach: target.approach?.trim() || null, solutionIds, productIds,
      marketName: held?.marketName ?? segment.name,
      criteria: held?.criteria ?? segment.criteria,
    });
  }
  if (changedSolutions || existing.some(t => !chosen.has(t.segmentId) && t.solutionIds.length > 0)) {
    const solutions = await validatePlanSolutions(ctx, [...addedSolutions]);
    if (!solutions.ok) return solutions;
  }
  if (changedProducts || existing.some(t => !chosen.has(t.segmentId) && (t.productIds?.length ?? 0) > 0)) {
    const products = await validatePlanProducts(ctx, [...addedProducts]);
    if (!products.ok) return products;
  }
  return ok([...chosen.values()]);
}

async function persistPlanSelection<T>(write: () => Promise<T>): Promise<RuleResult<T>> {
  try {
    return ok(await write());
  } catch (error) {
    if (error instanceof PlanMarketUnavailableError) return fail(marketUnavailable());
    if (error instanceof PlanProductUnavailableError) return fail(violation("product_not_selectable", "product unavailable for selection", "productIds"));
    if (!(error instanceof PlanSolutionUnavailableError)) throw error;
    return fail(violation("solution_not_selectable", "solution unavailable for selection", "solutionIds"));
  }
}

export async function listPlans(
  ctx: StrategyContext,
  filter: { period?: string; status?: PlanStatus } = {},
): Promise<RuleResult<PlanRecord[]>> {
  const gate = can(ctx.holder, ctx.entitlement, "strategy.plan.view", "data");
  if (!gate.allowed) return denied(gate);
  return ok(await ctx.store.listPlans(ctx.workspaceId, filter));
}

/**
 * Bring a plan into existence.
 *
 * `strategy.plan.create` has been in the action catalogue since batch 1 with
 * nothing behind it (TD-016). The port had list, get and update, and
 * `/strategy` renders the list and moves plans through their lifecycle - so a
 * plan could be approved, activated, closed and archived, and could not be
 * created. Every plan in every workspace would have had to arrive by db-init.
 *
 * It is upstream of more than itself: `sales_target.plan_id` and
 * `campaign.plan_id` both point here, so with no plan there is nothing for a
 * target or a campaign to hang off.
 *
 * A NEW PLAN IS A DRAFT and the status is not an argument - `transitionPlan`
 * below owns every move after this one, including the approval that stamps
 * `approved_at`.
 */

async function catalogResult(ctx:StrategyContext,input:PlanEdit):Promise<PlanEdit> {
  if(!input.result)return input;
  const [products,solutions]=await Promise.all([ctx.catalog?.listProducts&&ctx.catalog?.listStatusConfigs?listProductReferences({...ctx,store:{listProducts:ctx.catalog.listProducts.bind(ctx.catalog),listStatusConfigs:ctx.catalog.listStatusConfigs.bind(ctx.catalog)}}):null,ctx.catalog?listSolutionReferences({...ctx,store:ctx.catalog}):null]);
  const result={...input.result,offerings:input.result.offerings.map(o=>({...o,novelty:((o.kind==="product"?(products?.ok?products.value:[]):(solutions?.ok?solutions.value:[])).find(row=>row.id===o.id)?.novelty??"unknown") as import("./lib/strategy-result").Novelty}))};
  return {...input,result};
}
async function validateResult(ctx:StrategyContext,input:import("./lib/lifecycle").PlanEdit,previous?:PlanRecord):Promise<RuleResult<true>> {
  if(input.result===undefined){
    if(previous?.result && input.expectations!==undefined && JSON.stringify(input.expectations)!==JSON.stringify(previous.expectations))return fail(violation("expectations_invalid","edit goals together","expectations"));
    return ok(true);
  }
  if(!validStrategyResult(input.result))return fail(violation("strategy_result_invalid","invalid result","result"));
  if(!resultRelationsMatch(input.result,input,previous))return fail(violation("strategy_result_invalid","result references unselected relations","result"));
  const issues=strategyResultIssues(input.result,{today:strategyToday(),previous:previous?.result});
  if(issues.length)return fail(violation("strategy_result_invalid","invalid goal date",issues[0].field));
  for(const m of input.result.milestones){
    if(m.ownerSub && m.ownerSub!==previous?.result?.milestones.find(old=>old.id===m.id)?.ownerSub){const owner=await validatePlanOwner(ctx,m.ownerSub);if(!owner.ok)return owner;}
  }
  const options=await ctx.store.listStrategyOptions(ctx.workspaceId);
  for(const [kind,ids] of [["value",input.result.valuePropositionId?[input.result.valuePropositionId]:[]],["path",input.result.pathIds]] as const){
    if(ids.some(id=>!options.some(o=>o.id===id && o.kind===kind && (o.enabled || previous?.result?.valuePropositionId===id || previous?.result?.pathIds.includes(id)))))return fail(violation("strategy_option_unavailable","option unavailable","result"));
  }
  if(input.expectations!==undefined){
    const currency=input.expectations.find(e=>e.metric==="revenue")?.currency ?? "CNY";
    if(JSON.stringify(goalExpectations(input.result,currency))!==JSON.stringify(input.expectations))return fail(violation("expectations_invalid","goal projection differs","expectations"));
  }
  return ok(true);
}
export async function createPlan(
  ctx: StrategyContext,
  input: NewPlanDraft,
  options: { autoNumber?: boolean } = {},
): Promise<RuleResult<PlanRecord>> {
  const gate = can(ctx.holder, ctx.entitlement, "strategy.plan.create", "data");
  if (!gate.allowed) return denied(gate);

  input=await catalogResult(ctx,input) as NewPlanDraft;
  const resultCheck=await validateResult(ctx,input);if(!resultCheck.ok)return resultCheck;
  const autoNumber = options.autoNumber === true;
  const codes = autoNumber ? (await ctx.store.listPlans(ctx.workspaceId)).map(p => p.planNo) : [];
  const plan = planNewPlan(autoNumber ? { ...input, planNo: nextStrategyNumber(input.period, codes) } : input);
  if (!plan.ok) return plan as RuleResult<PlanRecord>;

  const type = await validateStrategyType(ctx, input.strategyTypeId);
  if (!type.ok) return type;
  const owner = await validatePlanOwner(ctx, plan.value.ownerSub);
  if (!owner.ok) return owner;
  const selection = input.solutionIds === undefined ? ok(undefined) : await validatePlanSolutions(ctx, input.solutionIds);
  if (!selection.ok) return selection;
  const products = input.productIds === undefined ? ok(undefined) : await validatePlanProducts(ctx, input.productIds);
  if (!products.ok) return products;
  const targets = await validateTargetMarkets(ctx, input.targetMarkets);
  if (!targets.ok) return targets;
  let planNo = plan.value.planNo;
  // A preview is not a reservation. The unique index decides; auto numbering
  // retries only a code collision, never a failed relation or unknown write.
  for (let attempt = 0; attempt < (autoNumber ? 10 : 1); attempt++) {
    const persisted = await persistPlanSelection(() => ctx.store.createPlan(ctx.workspaceId, {
      ...plan.value, planNo, createdBySub: ctx.sub, solutionIds: selection.value, productIds: products.value, targetMarkets: targets.value,
    }));
    if (!persisted.ok) return persisted;
    if (persisted.value) return ok(persisted.value);
    if (autoNumber) {
      codes.push(planNo, ...(await ctx.store.listPlans(ctx.workspaceId)).map(p => p.planNo));
      planNo = nextStrategyNumber(input.period, codes);
    }
  }
  return fail(violation("plan_no_taken", "strategy number already exists", "planNo"));
}

export async function editPlan(
  ctx: StrategyContext,
  id: string,
  input: PlanEdit,
  guard: PlanWriteGuard = {},
): Promise<RuleResult<PlanRecord>> {
  return applyPlanEdit(ctx, id, () => ok(input), guard);
}

async function applyPlanEdit(
  ctx: StrategyContext,
  id: string,
  resolveInput: (plan: PlanRecord) => RuleResult<PlanEdit>,
  guard: PlanWriteGuard,
): Promise<RuleResult<PlanRecord>> {
  const gate = can(ctx.holder, ctx.entitlement, "strategy.plan.update", "data");
  if (!gate.allowed) return denied(gate);

  const plan = await ctx.store.getPlan(ctx.workspaceId, id);
  if (!plan) return fail(violation("not_found", `plan ${id} was not found`, "id"));

  // Published content is stable. Only a draft accepts content/relation writes.
  if (plan.status !== "draft") {
    return fail(violation("plan_settled", `plan ${plan.planNo} is ${plan.status}`, "status"));
  }

  if(guard.expectedEditToken !== undefined && guard.expectedEditToken !== (plan.editToken ?? 1))return fail(violation("strategy_draft_conflict","draft changed; reload before saving","editToken"));
  const resolved = resolveInput(plan);
  if (!resolved.ok) return resolved;
  const raw = resolved.value;
  const input = await catalogResult(ctx,raw.result === undefined && plan.result ? {...raw,result:alignResultRelations(plan.result,raw,plan)} : raw);
  const resultCheck=await validateResult(ctx,input,plan);if(!resultCheck.ok)return resultCheck;
  const edit = planPlanEdit(input, plan.period);
  if (!edit.ok) return edit as RuleResult<PlanRecord>;

  if (input.expectations) {
    const lineage = plan.lineageId ?? plan.id;
    const history = (await ctx.store.listPlans(ctx.workspaceId)).filter(p => (p.lineageId ?? p.id) === lineage);
    if (input.expectations.some(e => history.some(p => p.expectations?.some(old => old.id === e.id && old.metric !== e.metric)))) {
      return fail(violation("expectations_invalid", "an objective identity cannot change metric", "expectations"));
    }
  }
  const type = await validateStrategyType(ctx, input.strategyTypeId, plan.strategyTypeId);
  if (!type.ok) return type;
  const owner = await validatePlanOwner(ctx, edit.value.ownerSub, plan.ownerSub);
  if (!owner.ok) return owner;
  const selection = input.solutionIds === undefined ? ok(undefined) : await validatePlanSolutions(ctx, input.solutionIds, plan.solutionIds);
  if (!selection.ok) return selection;
  const products = input.productIds === undefined ? ok(undefined) : await validatePlanProducts(ctx, input.productIds, plan.productIds);
  if (!products.ok) return products;
  const targets = await validateTargetMarkets(ctx, input.targetMarkets, plan.targetMarkets);
  if (!targets.ok) return targets;
  const { solutionIds: _solutions, productIds: _products, targetMarkets: _targets, ...fields } = edit.value;
  const patch = { ...fields,
    ...(selection.value === undefined ? {} : { solutionIds: selection.value }),
    ...(products.value === undefined ? {} : { productIds: products.value }),
    ...(targets.value === undefined ? {} : { targetMarkets: targets.value }),
  };
  const applied = await persistPlanSelection(() => ctx.store.updatePlan(ctx.workspaceId, id, patch, {...guard,expectedStatus:"draft"}));
  if (!applied.ok) return applied;
  if (!applied.value) {
    const latest = await ctx.store.getPlan(ctx.workspaceId, id);
    if (latest && latest.status !== "draft") {
      return fail(violation("plan_settled", `plan ${latest.planNo} is ${latest.status}`, "status"));
    }
    if(latest)return fail(violation("strategy_draft_conflict","draft changed; reload before saving","editToken"));
    return fail(violation("not_found", `plan ${id} was not found`, "id"));
  }
  return ok((await ctx.store.getPlan(ctx.workspaceId,id))!);
}

export async function transitionPlan(
  ctx: StrategyContext,
  id: string,
  to: PlanStatus,
  opts: { at?: Date; expectedEditToken?: number } = {},
): Promise<RuleResult<{ status: PlanStatus }>> {
  const action = to === "approved" ? "strategy.plan.approve" : "strategy.plan.update";
  const gate = can(ctx.holder, ctx.entitlement, action, "data");
  if (!gate.allowed) return denied(gate);

  const plan = await ctx.store.getPlan(ctx.workspaceId, id);
  if (!plan) return fail(violation("not_found", `plan ${id} was not found`, "id"));

  const next = planStrategyTransition(plan, to, opts);
  if (!next.ok) return next as RuleResult<{ status: PlanStatus }>;

  if(to === "approved") {
    const result=await publishStrategy(ctx,id,opts.expectedEditToken ?? plan.editToken ?? 1,opts.at);
    return result.ok ? ok({status:result.value.status}) : result;
  }
  if(plan.status==="draft" && to==="archived") {
    const result=await discardStrategyDraft(ctx,id,opts.expectedEditToken ?? plan.editToken ?? 1);
    return result.ok ? ok({status:result.value.status}) : result;
  }
  const applied = await ctx.store.updatePlan(ctx.workspaceId, id, next.value,{expectedEditToken:opts.expectedEditToken ?? plan.editToken ?? 1,expectedStatus:plan.status});
  if (!applied) return fail(violation("strategy_draft_conflict", "strategy changed; reload before moving", "editToken"));
  return ok({ status: next.value.status });
}

async function versionResult<T>(write:()=>Promise<T>):Promise<RuleResult<T>> {
  try{return ok(await write());}catch(error){
    if(error instanceof StrategyVersionError)return fail(violation(error.code,"strategy version operation refused",undefined,true));
    throw error;
  }
}
export async function reviseStrategy(ctx:StrategyContext,baseId:string):Promise<RuleResult<PlanRecord>> {
  const gate=can(ctx.holder,ctx.entitlement,"strategy.plan.update","data");if(!gate.allowed)return denied(gate);
  return versionResult(()=>ctx.store.createRevision(ctx.workspaceId,baseId,ctx.sub));
}
export async function discardStrategyDraft(ctx:StrategyContext,id:string,expectedEditToken:number):Promise<RuleResult<PlanRecord>> {
  const gate=can(ctx.holder,ctx.entitlement,"strategy.plan.update","data");if(!gate.allowed)return denied(gate);
  if(!Number.isSafeInteger(expectedEditToken)||expectedEditToken<1)return fail(violation("strategy_draft_conflict","invalid edit token","editToken"));
  return versionResult(()=>ctx.store.discardDraft(ctx.workspaceId,id,expectedEditToken,ctx.sub));
}
export async function publishStrategy(ctx:StrategyContext,id:string,expectedEditToken:number,at=new Date()):Promise<RuleResult<PlanRecord>> {
  const gate=can(ctx.holder,ctx.entitlement,"strategy.plan.approve","data");if(!gate.allowed)return denied(gate);
  if(!Number.isSafeInteger(expectedEditToken)||expectedEditToken<1)return fail(violation("strategy_draft_conflict","invalid edit token","editToken"));
  const plan=await ctx.store.getPlan(ctx.workspaceId,id);
  if(!plan)return fail(violation("strategy_not_found","strategy not found","id"));
  // Idempotent retries preserve the original publisher, timestamp and version.
  if(plan.versionNo)return ok(plan);
  if(plan.status!=="draft")return fail(violation("draft_required","only a draft can be published","status"));
  if(!parseStrategyPeriod(plan.period))return fail(violation("period_invalid","set execution dates before publication","period"));
  if((plan.editToken ?? 1)!==expectedEditToken)return fail(violation("strategy_draft_conflict","draft changed; reload before publishing","editToken"));
  if(plan.basePlanId && !plan.changeReason?.trim())return fail(violation("strategy_reason_required","describe the revision before publishing","changeReason"));
  if(plan.result){
    const issues=strategyResultIssues(plan.result,{publish:true});
    if(!plan.strategyTypeId || !plan.ownerSub || !plan.objective?.trim() || plan.objective.length>100 || !plan.targetMarkets?.length || issues.length)return fail(violation("strategy_incomplete","complete required strategy fields before publishing",issues[0]?.field ?? "result"));
    const owner=await validatePlanOwner(ctx,plan.ownerSub);if(!owner.ok)return owner;
  }
  if((plan.targetMarkets?.length ?? 0)>0){const marketGate=can(ctx.holder,ctx.entitlement,"strategy.segment.view","data");if(!marketGate.allowed)return denied(marketGate);}
  const ids=new Set([...plan.solutionIds,...(plan.targetMarkets ?? []).flatMap(t=>t.solutionIds)]);
  let solutions: import("../catalog/service").SolutionReference[]=[];
  if(ids.size){
    const catalogGate=can(ctx.holder,ctx.entitlement,"catalog.solution.view","data");if(!catalogGate.allowed)return denied(catalogGate);
    if(!ctx.catalog)return fail(violation("solution_catalog_unavailable","solution catalogue unavailable",undefined,true));
    try{
      const refs=await listSolutionReferences({...ctx,store:ctx.catalog});if(!refs.ok)return refs;
      solutions=refs.value.filter(s=>ids.has(s.id));
      if(solutions.length!==ids.size)return fail(violation("solution_not_selectable","a linked solution cannot be read","solutionIds"));
    }catch{return fail(violation("solution_catalog_unavailable","solution catalogue unavailable",undefined,true));}
  }
  const productIds=new Set([...(plan.productIds ?? []),...(plan.targetMarkets ?? []).flatMap(t=>t.productIds ?? [])]);
  let products: import("../catalog/service").ProductReference[]=[];
  if(productIds.size){
    const productGate=can(ctx.holder,ctx.entitlement,"catalog.product.view","data");if(!productGate.allowed)return denied(productGate);
    if(!ctx.catalog?.listProducts || !ctx.catalog.listStatusConfigs)return fail(violation("product_catalog_unavailable","product catalogue unavailable",undefined,true));
    try{
      const refs=await listProductReferences({...ctx,store:{listProducts:ctx.catalog.listProducts.bind(ctx.catalog),listStatusConfigs:ctx.catalog.listStatusConfigs.bind(ctx.catalog)}});if(!refs.ok)return refs;
      products=refs.value.filter(p=>productIds.has(p.id));
      if(products.length!==productIds.size)return fail(violation("product_not_selectable","a linked product cannot be read","productIds"));
    }catch{return fail(violation("product_catalog_unavailable","product catalogue unavailable",undefined,true));}
  }
  let ownerName:string|null=null;
  try{ownerName=(await ctx.memberDirectory?.listMembers(ctx.workspaceId))?.find(m=>m.sub===plan.ownerSub)?.displayName ?? null;}catch{/* Display cache is optional. */}
  return versionResult(()=>ctx.store.publishPlan(ctx.workspaceId,id,{expectedEditToken,actorSub:ctx.sub,at,solutions,products,ownerName}));
}

export async function listCampaigns(
  ctx: StrategyContext,
  filter: { planId?: string; status?: CampaignStatus } = {},
): Promise<RuleResult<CampaignRecord[]>> {
  const gate = can(ctx.holder, ctx.entitlement, "campaign.view", "data");
  if (!gate.allowed) return denied(gate);
  return ok(await ctx.store.listCampaigns(ctx.workspaceId, filter));
}

/**
 * Move a campaign along its lifecycle.
 *
 * Completing is special-cased: a campaign with outstanding executions cannot be
 * completed, because that marks demand generation as done that never happened.
 * Explicitly skipped work does not block it - skipping is a decision, pending is
 * an omission.
 */
export async function transitionCampaign(
  ctx: StrategyContext,
  id: string,
  to: CampaignStatus,
): Promise<RuleResult<{ status: CampaignStatus }>> {
  const gate = can(ctx.holder, ctx.entitlement, "campaign.upsert", "data");
  if (!gate.allowed) return denied(gate);

  const campaign = await ctx.store.getCampaign(ctx.workspaceId, id);
  if (!campaign) return fail(violation("not_found", `campaign ${id} was not found`, "id"));

  const window = validateCampaignWindow(campaign.startsAt, campaign.endsAt);
  if (!window.ok) return window as RuleResult<{ status: CampaignStatus }>;

  const next = planCampaignTransition(campaign, to);
  if (!next.ok) return next as RuleResult<{ status: CampaignStatus }>;

  if (to === "completed") {
    const executions = await ctx.store.listExecutions(ctx.workspaceId, id);
    const complete = canCompleteCampaign(executions);
    if (!complete.ok) return complete as RuleResult<{ status: CampaignStatus }>;
  }

  const applied = await ctx.store.updateCampaign(ctx.workspaceId, id, next.value);
  if (!applied) return fail(violation("not_found", `campaign ${id} was not found`, "id"));
  return ok({ status: next.value.status });
}

export interface CampaignReturn {
  campaign: CampaignRecord;
  progress: ReturnType<typeof executionProgress>;
  /**
   * The rows the progress is computed from.
   *
   * This read has always loaded them and thrown them away after summarising.
   * Nothing could edit an execution (TD-016), so a list of them had nowhere to
   * go - and `canCompleteCampaign` refuses to complete a campaign while any is
   * outstanding, which made a campaign with one pending item permanently
   * uncompletable.
   */
  executions: ExecutionRecord[];
  /** Opportunities whose frozen campaign_id points at this campaign. */
  attributedCount: number;
  wonCount: number;
  /** Total of everything attributed, open and closed. */
  attributedAmount: Money;
  /** Total of the won subset. */
  wonAmount: Money;
  /** wonAmount over budget, or null when no budget was set. */
  returnOnBudget: number | null;
}

/**
 * What a campaign actually produced.
 *
 * This is the join the product's thesis rests on. It is only possible because
 * opportunity.campaign_id was captured once, at conversion, and frozen by the
 * column locks - if attribution were editable, this number would measure
 * whoever last edited it rather than where the demand came from.
 */
/**
 * Create or edit one execution on a campaign.
 *
 * `campaign.execution.upsert` shipped in batch 1 with nothing behind it, and
 * this one was not merely unfinished - it was LOCKING something.
 * `canCompleteCampaign` refuses to complete a campaign while any execution is
 * outstanding, and nothing could move an execution to done or skipped. Measured
 * on the demo before this was written: camp_demo_1 (done/done/pending) was
 * refused with `executions_outstanding`; camp_demo_3 (done) completed. The lock
 * was real and the key did not exist.
 *
 * The campaign is read first: the upsert key carries no workspace of its own,
 * and the freeze rule needs the campaign's status.
 */
export async function upsertExecution(
  ctx: StrategyContext,
  campaignId: string,
  input: ExecutionDraft,
): Promise<RuleResult<ExecutionRecord>> {
  const gate = can(ctx.holder, ctx.entitlement, "campaign.execution.upsert", "data");
  if (!gate.allowed) return denied(gate);

  const campaign = await ctx.store.getCampaign(ctx.workspaceId, campaignId);
  if (!campaign) {
    return fail(violation("not_found", `campaign ${campaignId} was not found`, "campaignId"));
  }

  const plan = planExecution(input, campaign);
  if (!plan.ok) return plan as RuleResult<ExecutionRecord>;

  const written = await ctx.store.upsertExecution(ctx.workspaceId, campaignId, plan.value);
  if (!written) {
    return fail(violation("not_found", `execution ${input.id} is not on this campaign`, "id"));
  }
  return ok(written);
}

/** What the link rule needs to know, read in this workspace only. */
async function campaignLinkFacts(ctx: StrategyContext, input: { planId: string | null }) {
  return {
    plan: input.planId ? await ctx.store.getPlan(ctx.workspaceId, input.planId) : null,
    segmentIds: (await ctx.store.listSegments(ctx.workspaceId)).map((x) => x.id),
  };
}

/**
 * Create a campaign. A new campaign is always a draft; the number is the anchor
 * attribution quotes, so a taken number is refused by name.
 */
export async function createCampaign(
  ctx: StrategyContext,
  input: NewCampaignDraft,
): Promise<RuleResult<CampaignRecord>> {
  const gate = can(ctx.holder, ctx.entitlement, "campaign.upsert", "data");
  if (!gate.allowed) return denied(gate);
  const plan = planNewCampaign(input);
  if (!plan.ok) return plan as RuleResult<CampaignRecord>;
  const links = checkCampaignLinks(plan.value, await campaignLinkFacts(ctx, plan.value));
  if (!links.ok) return links as RuleResult<CampaignRecord>;
  const created = await ctx.store.createCampaign(ctx.workspaceId, plan.value);
  if (!created) {
    return fail(violation("campaign_no_taken", `campaign ${plan.value.campaignNo} already exists`, "campaignNo"));
  }
  return ok(created);
}

/** Edit a campaign that has not settled. The number and the status do not move here. */
export async function editCampaign(
  ctx: StrategyContext,
  id: string,
  input: CampaignDraft,
): Promise<RuleResult<{ id: string }>> {
  const gate = can(ctx.holder, ctx.entitlement, "campaign.upsert", "data");
  if (!gate.allowed) return denied(gate);
  const current = await ctx.store.getCampaign(ctx.workspaceId, id);
  if (!current) return fail(violation("not_found", `campaign ${id} was not found`, "id"));
  const plan = planCampaignEdit(current, input);
  if (!plan.ok) return plan as RuleResult<{ id: string }>;
  // The plan it already hangs under is kept even if that plan has since moved on.
  const links = checkCampaignLinks(plan.value, await campaignLinkFacts(ctx, plan.value), { planId: current.planId, segmentId: current.segmentId });
  if (!links.ok) return links as RuleResult<{ id: string }>;
  const applied = await ctx.store.updateCampaign(ctx.workspaceId, id, plan.value);
  if (!applied) return fail(violation("not_found", `campaign ${id} was not found`, "id"));
  return ok({ id });
}

/**
 * Remove one execution from a campaign.
 *
 * Skipping was the only way out of an item added by mistake, and a skipped item
 * stays on the campaign as a decision somebody made. A COMPLETED campaign's
 * items are the record it was completed on, so they stay: same freeze as
 * editing one.
 */
export async function removeExecution(
  ctx: StrategyContext,
  campaignId: string,
  id: string,
): Promise<RuleResult<{ removed: true }>> {
  const gate = can(ctx.holder, ctx.entitlement, "campaign.execution.upsert", "data");
  if (!gate.allowed) return denied(gate);

  const campaign = await ctx.store.getCampaign(ctx.workspaceId, campaignId);
  if (!campaign) {
    return fail(violation("not_found", `campaign ${campaignId} was not found`, "campaignId"));
  }
  if (campaign.status === "completed") {
    return fail(
      violation(
        "campaign_completed",
        "this campaign is complete; its executions are the record it was completed on",
        "status",
      ),
    );
  }
  const removed = await ctx.store.removeExecution(ctx.workspaceId, campaignId, id);
  if (!removed) return fail(violation("not_found", `execution ${id} is not on this campaign`, "id"));
  return ok({ removed: true });
}

/**
 * 战略诊断's reads: the newest segment coverage and territory attainment
 * snapshots. Gated on strategy.plan.view - the screen's own gate, now checked
 * at the data layer too (the page used to query Prisma directly, past both).
 */
export async function strategyDiagnosticSnapshots(
  ctx: StrategyContext,
  limit = 500,
): Promise<RuleResult<{ segments: SegmentCoverageSnapshotInput[]; territories: TerritoryAttainmentSnapshotInput[] }>> {
  const gate = can(ctx.holder, ctx.entitlement, "strategy.plan.view", "data");
  if (!gate.allowed) return denied(gate);
  const [segments, territories] = await Promise.all([
    ctx.store.listSegmentCoverageSnapshots(ctx.workspaceId, limit),
    ctx.store.listTerritoryAttainmentSnapshots(ctx.workspaceId, limit),
  ]);
  return ok({ segments, territories });
}

export async function listSegments(
  ctx: StrategyContext,
): Promise<RuleResult<SegmentRecord[]>> {
  const gate = can(ctx.holder, ctx.entitlement, "strategy.segment.view", "data");
  if (!gate.allowed) return denied(gate);
  return ok(await ctx.store.listSegments(ctx.workspaceId));
}

export async function upsertSegment(
  ctx: StrategyContext,
  input: SegmentDraft,
  mode?: BusinessWrite,
): Promise<RuleResult<SegmentRecord>> {
  const gate = can(ctx.holder, ctx.entitlement, "strategy.segment.upsert", "data");
  if (!gate.allowed) return denied(gate);

  const segments = await ctx.store.listSegments(ctx.workspaceId);
  const existing = mode === "create" ? undefined : segments.find(s => mode ? s.id === mode.editId : s.segmentCode === input.segmentCode.trim());
  if (mode !== "create" && mode && !existing) return businessRecordMissing();
  const codes = segments.map(s => s.segmentCode);
  const checked = planSegment({ ...input, segmentCode: existing?.segmentCode ?? (mode === "create" ? nextBusinessCode("MKT", codes) : input.segmentCode) });
  if (!checked.ok) return checked as RuleResult<SegmentRecord>;

  const solutions = input.solutionIds === undefined ? ok(undefined) : await validatePlanSolutions(ctx, input.solutionIds, existing?.solutionIds);
  if (!solutions.ok) return solutions;
  const products = input.productIds === undefined ? ok(undefined) : await validatePlanProducts(ctx, input.productIds, existing?.productIds);
  if (!products.ok) return products;
  const saved = await persistPlanSelection(() => saveBusinessRecord("MKT", codes, mode, code => ctx.store.upsertSegment(ctx.workspaceId, {
    ...checked.value,
    segmentCode: code ?? checked.value.segmentCode,
    ...(solutions.value === undefined ? {} : {solutionIds:solutions.value}),
    ...(products.value === undefined ? {} : {productIds:products.value}),
  }, mode)));
  return saved.ok ? saved.value : saved;
}

/**
 * Pause, resume or retire a segment.
 *
 * A VERB OF ITS OWN rather than a save with a different status: upsertSegment
 * takes the whole draft, so routing a status change through it would make
 * every caller resend criteria it has no business touching - and a caller
 * that got them wrong would silently re-cut the market.
 *
 * Existing strategies retain their own selection snapshots.
 */
export async function setSegmentStatus(
  ctx: StrategyContext,
  input: { segmentId: string; status: SegmentStatus },
): Promise<RuleResult<SegmentRecord>> {
  const gate = can(ctx.holder, ctx.entitlement, "strategy.segment.upsert", "data");
  if (!gate.allowed) return denied(gate);

  const segments = await ctx.store.listSegments(ctx.workspaceId);
  const current = segments.find((g) => g.id === input.segmentId);
  if (!current) return fail(violation("not_found", "no such segment", "segmentId"));
  if (current.status === input.status) {
    return fail(violation("status_unchanged", `already ${current.status}`, "status"));
  }

  return upsertSegment(ctx, {
    segmentCode: current.segmentCode,
    name: current.name,
    priority: current.priority,
    status: input.status,
    criteria: current.criteria,
  });
}

/**
 * Move a segment one place up or down.
 *
 * PRIORITY IS THE ORDER - the column has existed since batch 1 and nothing
 * ever moved it, so the list was ordered by a number nobody could change.
 * planMove's dense renumbering is what makes the first move work on rows that
 * all share a priority.
 */
export async function moveSegment(
  ctx: StrategyContext,
  input: { segmentId: string; direction: MoveDirection },
): Promise<RuleResult<true>> {
  const gate = can(ctx.holder, ctx.entitlement, "strategy.segment.upsert", "data");
  if (!gate.allowed) return denied(gate);

  const segments = await ctx.store.listSegments(ctx.workspaceId);
  const moving = segments.find((g) => g.id === input.segmentId);
  if (!moving) return fail(violation("not_found", "no such segment", "segmentId"));

  // Active cuts and shelved ones are two lists on screen; a move lands beside
  // a row the reader can see.
  const group = (g: SegmentRecord) => (g.status === "active" ? "live" : "shelved");
  const plan = planMove(
    segments.map((g) => ({ id: g.id, movable: group(g) === group(moving) })),
    input.segmentId,
    input.direction,
  );
  if (!plan.ok) return plan as RuleResult<true>;

  await ctx.store.setSegmentOrder(ctx.workspaceId, plan.value);
  return ok(true);
}

/** Retire instead if the market is still used by customers, campaigns, or strategic plans. */
export async function removeSegment(
  ctx: StrategyContext,
  input: { segmentId: string; accountsCarrying: number },
): Promise<RuleResult<true>> {
  const gate = can(ctx.holder, ctx.entitlement, "strategy.segment.upsert", "data");
  if (!gate.allowed) return denied(gate);

  const segments = await ctx.store.listSegments(ctx.workspaceId);
  const current = segments.find((g) => g.id === input.segmentId);
  if (!current) return fail(violation("not_found", "no such segment", "segmentId"));

  const campaigns = await ctx.store.listCampaigns(ctx.workspaceId);
  const aimed = campaigns.filter((c) => c.segmentId === current.id).length;
  const strategies = (await ctx.store.listPlans(ctx.workspaceId)).filter(p => p.targetMarkets?.some(m => m.segmentId === current.id)).length;
  const plan = planSegmentRemoval({ campaigns: aimed, accounts: input.accountsCarrying, strategies });
  if (!plan.ok) return plan as RuleResult<true>;

  let removed: boolean;
  try {
    removed = await ctx.store.removeSegment(ctx.workspaceId, input.segmentId);
  } catch (error) {
    if (!(error instanceof SegmentReferencedError)) throw error;
    return planSegmentRemoval({ campaigns: 0, accounts: 0, strategies: 1 });
  }
  if (!removed) return fail(violation("not_found", "no such segment", "segmentId"));
  return ok(true);
}

export async function campaignReturn(
  ctx: StrategyContext,
  campaignId: string,
): Promise<RuleResult<CampaignReturn>> {
  const gate = can(ctx.holder, ctx.entitlement, "campaign.execution.view", "data");
  if (!gate.allowed) return denied(gate);

  const campaign = await ctx.store.getCampaign(ctx.workspaceId, campaignId);
  if (!campaign) return fail(violation("not_found", `campaign ${campaignId} was not found`, "id"));

  const [executions, attributed] = await Promise.all([
    ctx.store.listExecutions(ctx.workspaceId, campaignId),
    ctx.store.attributedOpportunities(ctx.workspaceId, campaignId),
  ]);

  const all = attributed.map((o) => o.amount).filter((m): m is Money => m != null);
  const won = attributed
    .filter((o) => o.status === "won")
    .map((o) => o.amount)
    .filter((m): m is Money => m != null);

  const allTotal = sumMoney(all, campaign.currency);
  if (!allTotal.ok) return allTotal as RuleResult<CampaignReturn>;
  const wonTotal = sumMoney(won, campaign.currency);
  if (!wonTotal.ok) return wonTotal as RuleResult<CampaignReturn>;

  // Return is measured against WON revenue, not against pipeline. A campaign
  // that generated a lot of unclosed pipeline has not returned anything yet, and
  // reporting it as if it had is how marketing spend gets justified twice.
  const budget = campaign.budgetAmount;
  const returnOnBudget =
    budget && budget.amount > 0 ? wonTotal.value.amount / budget.amount : null;

  return ok({
    campaign,
    progress: executionProgress(executions),
    executions,
    attributedCount: attributed.length,
    wonCount: attributed.filter((o) => o.status === "won").length,
    attributedAmount: allTotal.value,
    wonAmount: wonTotal.value,
    returnOnBudget,
  });
}

async function validateStrategyType(ctx: StrategyContext, id: unknown, existing?: string | null): Promise<RuleResult<null>> {
  if (id === undefined || id === null || id === existing) return ok(null);
  if (typeof id !== "string" || !(await ctx.store.listStrategyTypes(ctx.workspaceId)).some(t=>t.id===id && t.enabled))
    return fail(violation("strategy_type_unavailable", "select an enabled workspace strategy type", "strategyTypeId"));
  return ok(null);
}
