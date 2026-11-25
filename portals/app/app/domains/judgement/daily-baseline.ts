import { createHash } from "node:crypto";
import Redis from "ioredis";
import { isDeployedStage } from "../../lib/deploy-stage";
import { judgementVersion, type TopicFeed } from "./topic-feed";
export interface DailyBaseline { version: "daily-judgement/1"; date: string; generatedAt: string; findings: {id:string;version:string}[] }
export interface BaselineStore { has?(key:string):Promise<boolean>; ensure(key:string, value:DailyBaseline):Promise<DailyBaseline> }
const hash=(v:unknown)=>createHash("sha256").update(JSON.stringify(v)).digest("hex");
export const businessDate=(now:Date)=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Shanghai",year:"numeric",month:"2-digit",day:"2-digit"}).format(now);
export const dailyKey=(workspaceId:string,actorSub:string,scope:string,accessVersion:string,date:string)=>`yucer:daily:1:${hash([workspaceId,actorSub,scope,accessVersion,date])}`;
let redis:Redis|null=null;
const local=new Map<string,DailyBaseline>();
const store:BaselineStore={
  async has(key){
    if(process.env.REDIS_URL){
      redis??=new Redis(process.env.REDIS_URL,{protocol:2,maxRetriesPerRequest:1,connectTimeout:2000});
      return (await redis.exists(key))===1;
    }
    if(isDeployedStage())throw Error("baseline_unavailable");
    return local.has(key);
  },
  async ensure(key,value){
  if(process.env.REDIS_URL){
    redis??=new Redis(process.env.REDIS_URL,{protocol:2,maxRetriesPerRequest:1,connectTimeout:2000});
    await redis.set(key,JSON.stringify(value),"EX",3*86400,"NX");
    const text=await redis.get(key);if(!text)throw Error("baseline_unavailable");
    const row=JSON.parse(text) as DailyBaseline;
    if(row.version!=="daily-judgement/1" || row.date!==value.date || !Array.isArray(row.findings))throw Error("baseline_unavailable");
    return row;
  }
  if(isDeployedStage())throw Error("baseline_unavailable");
  if(local.size>1000)local.clear();
  if(!local.has(key))local.set(key,value);
  return local.get(key)!;
}};
/** This ordering baseline stores fingerprints only. Full private results live
 * in scheduled-feed and require current access and source revision checks. */
export async function dailyJudgementBaseline(owner:{workspaceId:string;sub:string;accessVersion:string}, feed:TopicFeed, now=new Date(), persistence:BaselineStore=store, date=businessDate(now)) {
  const current:DailyBaseline={version:"daily-judgement/1",date,generatedAt:now.toISOString(),findings:feed.judgements.map(j=>({id:hash(j.id),version:judgementVersion(j)}))};
  const baseline=await persistence.ensure(dailyKey(owner.workspaceId,owner.sub,feed.scope,owner.accessVersion,current.date),current);
  const originals=new Map(baseline.findings.map((j,i)=>[j.id,{...j,position:i}]));
  const rank={today:0,week:1,watch:2};
  const ordered=[...feed.judgements].sort((a,b)=>rank[a.urgency]-rank[b.urgency] || (originals.get(hash(a.id))?.position??Infinity)-(originals.get(hash(b.id))?.position??Infinity));
  const ids=new Set(current.findings.map(j=>j.id));
  const changes=feed.judgements.filter(j=>originals.get(hash(j.id))?.version!==judgementVersion(j)).length+baseline.findings.filter(j=>!ids.has(j.id)).length;
  return {date:baseline.date,generatedAt:baseline.generatedAt,revalidatedAt:now.toISOString(),changes,judgements:ordered};
}

export async function hasDailyJudgementBaseline(owner:{workspaceId:string;sub:string;accessVersion:string},scope:string,now=new Date(),persistence:BaselineStore=store) {
  return await persistence.has?.(dailyKey(owner.workspaceId,owner.sub,scope,owner.accessVersion,businessDate(now))) ?? false;
}
