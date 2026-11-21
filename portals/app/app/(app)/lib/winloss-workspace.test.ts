import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveWinLossQuery, winLossHref } from "./winloss-workspace";
test("review analysis drilldown preserves period, region, outcome and query",()=>{
 const f=resolveWinLossQuery({period:"2026Q2",view:"analysis",region:"r/1",outcome:"lost",q:"a&b"});assert.ok(f);
 const url=new URL(winLossHref(f,{view:"list",reason:"why&1"}),"http://local");
 assert.equal(url.pathname,"/winloss");assert.equal(url.searchParams.get("period"),"2026Q2");assert.equal(url.searchParams.get("region"),"r/1");assert.equal(url.searchParams.get("reason"),"why&1");assert.equal(url.searchParams.get("q"),"a&b");
});
test("duplicate or invalid query selectors do not silently broaden the sample",()=>{
 for(const q of [{period:"all"},{period:["2026Q1","2026Q2"]},{view:"other"},{dates:"all"},{outcome:"open"},{status:"lost"}]) assert.equal(resolveWinLossQuery(q),null);
});
