import { test } from "node:test";
import assert from "node:assert/strict";
import { filterWinLossRows, summarizeWinLoss, winLossRows, type WinLossRow, type WinLossFilter } from "./winloss-workspace";
const filter: WinLossFilter = { period:"2026Q1", view:"analysis", status:"all", outcome:"all", dates:"period", reason:"", region:"", query:"" };
const row = (id:string, over:Partial<WinLossRow>={}):WinLossRow => ({ id,name:id,number:id,accountId:"a",accountName:null,ownerSub:"u",regionId:"r",planId:null,campaignId:null,outcome:"won",amount:10.12,currency:"CNY",closedAt:"2026-01-01T00:00:00.000Z",reviewId:null,reviewerSub:null,reviewedAt:null,reasonId:null,reasonName:null,lessons:null,stale:false,...over });
test("period uses actual close boundaries; review dates do not move deals between quarters",()=>{
 const rows=[row("q1",{reviewedAt:"2026-06-01"}),row("q2",{closedAt:"2026-04-01T00:00:00Z"}),row("unknown",{closedAt:null})];
 assert.deepEqual(filterWinLossRows(rows,filter).map(r=>r.id),["q1"]);
 assert.deepEqual(filterWinLossRows(rows,{...filter,dates:"undated"}).map(r=>r.id),["unknown"]);
});
test("win rate excludes abandonment; no decided outcome is not zero percent",()=>{
 assert.equal(summarizeWinLoss([row("w"),row("l",{outcome:"lost"}),row("a",{outcome:"abandoned"})]).winRate,0.5);
 assert.equal(summarizeWinLoss([row("a",{outcome:"abandoned"})]).winRate,null);
});
test("pending, unclassified and changed outcomes are separate; stale reviews do not explain a new result",()=>{
 const rows=[row("pending"),row("empty",{reviewId:"e"}),row("stale",{reviewId:"s",reasonId:"why",stale:true}),row("known",{reviewId:"k",reasonId:"why",reasonName:"Fit"}),row("unavailable",{reviewId:"u",reasonId:"deleted"})];
 const s=summarizeWinLoss(rows);
 assert.equal(s.pending,1);assert.equal(s.unclassified,1);assert.equal(s.stale,1);
 assert.deepEqual(s.reasons.map(r=>[r.id,r.count,r.name]),[["deleted",1,null],["why",1,"Fit"]]);
 assert.deepEqual(filterWinLossRows(rows,{...filter,reason:"unclassified"}).map(r=>r.id),["empty"]);
 assert.deepEqual(filterWinLossRows(rows,{...filter,reason:"stale"}).map(r=>r.id),["stale"]);
 for(const reason of s.reasons) assert.equal(filterWinLossRows(rows,{...filter,reason:reason.id}).filter(r=>!r.stale).length,reason.count);
});
test("amounts remain separate by currency, missing is not zero, decimal cents remain exact",()=>{
 const s=summarizeWinLoss([row("1",{amount:0.1}),row("2",{amount:0.2}),row("missing",{amount:null}),row("zero",{amount:0}),row("usd",{currency:"USD",amount:20})]);
 assert.deepEqual(s.money,[{currency:"CNY",known:3,missing:1,amount:"30"},{currency:"USD",known:1,missing:0,amount:"2000"}]);
});
test("region, outcome and customer query compose into the same drilldown sample",()=>{
 const rows=[row("mine",{accountName:"Acme",reviewId:"r",reasonId:"fit"}),row("other",{regionId:"else"}),row("lost",{outcome:"lost"})];
 assert.deepEqual(filterWinLossRows(rows,{...filter,region:"r",outcome:"won",query:"ACME",status:"reviewed",reason:"fit"}).map(r=>r.id),["mine"]);
});
test("row projection deduplicates opportunity UUID and keeps missing historic reason without inventing a current reason",()=>{
 const d={id:"d",name:"Deal",opportunityNo:"O",accountId:"a",ownerSub:"u",territoryId:null,planId:null,campaignId:null,status:"lost",amount:null,currency:"CNY",closedAt:new Date("2026-02-01")} as Parameters<typeof winLossRows>[0][number];
 const r={id:"r",opportunityId:"d",outcome:"won",primaryReasonId:"gone",lessons:"Old win",reviewerSub:"u",reviewedAt:new Date("2026-03-01")} as Parameters<typeof winLossRows>[1][number];
 const rows=winLossRows([d,d],[r],[]);assert.equal(rows.length,1);assert.equal(rows[0].stale,true);assert.equal(rows[0].reasonId,"gone");assert.equal(rows[0].reasonName,null);
});
