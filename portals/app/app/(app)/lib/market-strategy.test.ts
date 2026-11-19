import { test } from "node:test";
import assert from "node:assert/strict";
import { marketMatch, marketViews, strategyResults, strategyViews, type MarketAccount } from "./market-strategy";
import { captureStrategyPublication, type PlanRecord, type SegmentRecord, type CampaignRecord } from "../../domains/strategy/store";
import type { OpportunityRecord } from "../../domains/pipeline/store";
import { money } from "../../domains/shared/money";

const account: MarketAccount = { id:"a",name:"A",accountNo:"A1",industry:"software",region:null,customerSize:"large",segmentId:null };
const criteria = { industries:["software"],regions:[],sizes:["large"] };
test("customer matching separates missing data from a known mismatch and an undefined market",()=>{
  assert.equal(marketMatch(account,criteria),"match");
  assert.equal(marketMatch(account,{...criteria,regions:["east"]}),"missing");
  assert.equal(marketMatch({...account,industry:"retail"},{...criteria,regions:["east"]}),"miss");
  assert.equal(marketMatch(account,{industries:[],regions:[]}),"undefined");
});
const plan:PlanRecord={id:"p",workspaceId:"w",name:"P",planNo:"P1",period:"2026H2",objective:null,ownerSub:null,solutionIds:[],status:"active",approvedAt:null};
test("strategy shows only linked catalog references and does not expose hidden ids", () => {
  const selected = { ...plan, solutionIds: ["sol"] };
  const ref = { id: "sol", solutionCode: "S1", name: "Retail", status: "retired" as const };
  const visible = strategyViews([selected], [], [], [], [ref, { ...ref, id: "other" }])[0];
  assert.deepEqual(visible.solutions, [ref]);
  const hidden = strategyViews([selected], [], [], [], null)[0];
  assert.equal(hidden.solutions, null);
  assert.equal("solutionIds" in hidden, false);
});
const segment:SegmentRecord={id:"m",workspaceId:"w",name:"M",segmentCode:"M1",priority:0,status:"active",criteria};
test("strategy matching uses saved market criteria, and deduplicates customers and solutions", () => {
  const ref = { id: "sol", solutionCode: "S1", name: "Retail", status: "active" as const };
  const target = { segmentId: "m", marketName: segment.name, intent: "focus" as const, approach: null, criteria, solutionIds: [ref.id] };
  const selected = { ...plan, solutionIds: [ref.id], targetMarkets: [target, { ...target, segmentId: "m2" }] };
  const markets = marketViews([{ ...segment, criteria: { industries: ["retail"], regions: [] } }, { ...segment, id: "m2" }], [selected], [account]);
  assert.equal(markets[0].matched, 0);
  const view = strategyViews([selected], markets, [], [], [ref], [account])[0];
  assert.equal(view.customerCount, 1);
  assert.deepEqual(view.targetMarkets?.map(m => m.matched), [1, 1]);
  assert.deepEqual(view.solutions, [ref]);
  assert.deepEqual(view.targetMarkets?.[0].solutions, [ref]);

  assert.equal(strategyViews([selected], markets, [], [], [ref], null)[0].customerCount, null);
  const hidden = strategyViews([selected], null, null, null, [ref], [account])[0];
  assert.equal(hidden.marketIds, null);
  assert.equal(hidden.targetMarkets, null);
  assert.equal(hidden.solutions, null);
  assert.equal(hidden.results, null);
});
const campaign={id:"c",planId:"p"} as CampaignRecord;
const deal=(id:string,patch:Partial<OpportunityRecord>={}):OpportunityRecord=>({id,planId:"p",campaignId:"c",status:"open",currency:"CNY",amount:money(100),...patch} as OpportunityRecord);
test("explicit attribution deduplicates deals, separates currencies and excludes conflicting chains",()=>{
  const d=deal("d");
  const r=strategyResults("p",[d,d,deal("e",{planId:null,status:"won",currency:"USD",amount:money(50,"USD")}),deal("x",{planId:"other"}),deal("no",{planId:null,campaignId:null})],[campaign]);
  assert.equal(r.conflicts,1);
  assert.deepEqual(r.results.map(r=>[r.currency,r.open,r.won,r.openCount,r.wonCount]),[["CNY",100,0,1,0],["USD",0,50,0,1]]);
});
test("an unreadable campaign chain is not assumed to validate attribution; zero and no price differ",()=>{
  const hidden=strategyResults("p",[deal("hidden")],null);
  assert.deepEqual(hidden.results,[]);
  assert.equal(hidden.attributionIncomplete,true);
  const r=strategyResults("p",[deal("zero",{campaignId:null,amount:money(0)}),deal("blank",{campaignId:null,amount:null})],null);
  assert.equal(r.results[0].openCount,2);
  assert.equal(r.results[0].unpriced,1);
});


test("published views freeze reference names and never serialize hidden snapshots", () => {
  const ref = { id: "sol", solutionCode: "S1", name: "Original solution", status: "active" as const };
  const target = { segmentId: "m", marketName: "Original market", intent: "focus" as const, approach: "Pilot", criteria, solutionIds: [ref.id] };
  const original = { ...plan, solutionIds: [ref.id], targetMarkets: [target], ownerSub: "owner" };
  const published = { ...original, publishedSnapshot: captureStrategyPublication(original, [ref], new Date("2026-11-14"), false, "Original owner") };
  const markets = marketViews([{ ...segment, name: "Renamed market" }], [], [account]);
  const visible = strategyViews([{ ...published, name: "Changed live field" }], markets, [], [], [{ ...ref, name: "Renamed solution" }], [account])[0];
  assert.equal(visible.name, original.name);
  assert.equal(visible.publishedOwnerName, "Original owner");
  assert.equal(visible.targetMarkets?.[0].marketName, "Original market");
  assert.equal(visible.solutions?.[0].name, "Original solution");
  assert.equal("publishedSnapshot" in visible, false);
  const hidden = strategyViews([published], null, null, null, null, null)[0];
  assert.equal(hidden.solutions, null);
  assert.equal(hidden.targetMarkets, null);
  assert.equal(JSON.stringify(hidden).includes("Original solution"), false);
  assert.equal(JSON.stringify(hidden).includes("Original market"), false);
  assert.equal("publishedSnapshot" in hidden, false);
});

test("market references retain the published strategy and its market-specific approach", () => {
  const target = { segmentId: segment.id, marketName: segment.name, intent: "focus" as const, approach: "Start with a store pilot", criteria, solutionIds: [] };
  const original = { ...plan, objective: "Improve retail operations", targetMarkets: [target] };
  const published = { ...original, versionNo: 2, publishedSnapshot: captureStrategyPublication(original, [], new Date("2026-11-14")) };
  const changed = { ...published, name: "Later draft name", objective: "Unpublished direction", period: "2027", targetMarkets: [{ ...target, segmentId: "another-market", approach: "Unpublished approach" }] };
  const market = marketViews([segment], [changed], [account])[0];
  const reference = market.plans![0];
  assert.equal(reference.name, original.name);
  assert.equal(reference.period, original.period);
  assert.equal(reference.objective, original.objective);
  assert.equal(reference.approach, target.approach);
  assert.equal(reference.intent, "focus");
  assert.equal(reference.versionNo, 2);
  assert.equal(reference.planNo, plan.planNo);
  assert.equal("publishedSnapshot" in reference, false);
  assert.equal(JSON.stringify(reference).includes("Unpublished"), false);
  assert.equal(marketViews([segment], null, [account])[0].plans, null);
});

test("duplicate market selections do not repeat or inflate adopting strategy cards", () => {
  const target = { segmentId: segment.id, marketName: segment.name, intent: null, approach: null, criteria, solutionIds: [] };
  const market = marketViews([segment], [{ ...plan, targetMarkets: [target, target] }], [account])[0];
  assert.equal(market.plans!.length, 1);
  assert.equal(market.plans![0].intent, null);
});
