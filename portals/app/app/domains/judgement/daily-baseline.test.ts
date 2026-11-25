import { test } from "node:test";
import assert from "node:assert/strict";
import {businessDate,dailyKey,dailyJudgementBaseline,hasDailyJudgementBaseline,type DailyBaseline,type BaselineStore} from "./daily-baseline";
import type {TopicFeed} from "./topic-feed";
const owner={workspaceId:"one",sub:"alice",accessVersion:"role-1"};
const finding=(id:string,claim:string)=>({id,claim,subjectType:"account",subjectId:id,subjectName:claim,source:"rule",urgency:"today",tags:[],facts:[],citations:[],analyses:[]}) as TopicFeed["judgements"][number];
const feed=(rows:TopicFeed["judgements"]):TopicFeed=>({judgements:rows,scope:"mine",scanned:rows.length,dataAvailable:true});
test("daily baseline is stable but never redelivers revoked or superseded text",async()=>{
 const rows=new Map<string,DailyBaseline>();const store:BaselineStore={ensure:async(k,v)=>{if(!rows.has(k))rows.set(k,v);return rows.get(k)!;}};
 const first=await dailyJudgementBaseline(owner,feed([finding("a","old"),finding("b","private")]),new Date("2026-11-23T23:00:00Z"),store);
 const next=await dailyJudgementBaseline(owner,feed([finding("c","new"),finding("a","current")]),new Date("2026-11-24T01:00:00Z"),store);
 assert.equal(first.generatedAt,next.generatedAt);assert.equal(next.date,"2026-11-24");assert.equal(next.changes,3);
 assert.deepEqual(next.judgements.map(j=>j.claim),["current","new"]);assert.ok(!JSON.stringify(rows.values().next().value).includes("private"));
 assert.notEqual(dailyKey("one","alice","mine","role-1",next.date),dailyKey("one","alice","mine","role-2",next.date));
 for(const key of [dailyKey("two","alice","mine","role-1",next.date),dailyKey("one","bob","mine","role-1",next.date),dailyKey("one","alice","all","role-1",next.date)])assert.notEqual(key,dailyKey("one","alice","mine","role-1",next.date));
});
test("business day uses Shanghai midnight",()=>{assert.equal(businessDate(new Date("2026-11-24T16:01:00Z")),"2026-11-25");});

test("scheduled work skips a completed day only for the same private scope and access",async()=>{
 const existing=new Set([dailyKey("one","alice","mine","role-1","2026-11-24")]);
 const persistence:BaselineStore={has:async key=>existing.has(key),ensure:async(_key,value)=>value};
 const now=new Date("2026-11-24T01:00:00Z");
 assert.equal(await hasDailyJudgementBaseline(owner,"mine",now,persistence),true);
 assert.equal(await hasDailyJudgementBaseline(owner,"all",now,persistence),false);
 assert.equal(await hasDailyJudgementBaseline({...owner,accessVersion:"role-2"},"mine",now,persistence),false);
});
