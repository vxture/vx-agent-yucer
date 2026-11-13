import { test } from "node:test";
import assert from "node:assert/strict";
import { marketMatch, marketViews, strategyResults, strategyViews, type MarketAccount } from "./market-strategy";
import type { PlanRecord, SegmentRecord, CampaignRecord } from "../../domains/strategy/store";
import type { OpportunityRecord } from "../../domains/pipeline/store";
import { money } from "../../domains/shared/money";

const account: MarketAccount = { id:"a",name:"A",accountNo:"A1",industry:"software",region:null,customerSize:"large",segmentCode:null };
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
const segment:SegmentRecord={id:"m",workspaceId:"w",name:"M",segmentCode:"M1",planId:"p",priority:0,status:"active",criteria};
test("overlapping market customers are deduplicated in strategy coverage; unavailable reads stay null",()=>{
  const markets=marketViews([segment,{...segment,id:"m2"}],[plan],[account]);
  assert.equal(strategyViews([plan],markets,[],[])[0].customerCount,1);
  assert.equal(strategyViews([plan],marketViews([segment],[plan],null),[],[])[0].customerCount,null);
  assert.equal(strategyViews([plan],null,null,null)[0].marketIds,null);
  assert.equal(strategyViews([plan],null,null,null)[0].results,null);
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
