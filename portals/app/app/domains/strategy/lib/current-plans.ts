import type { PlanRecord } from "../store";

/** One overview entry per lineage. A revision draft never displaces a publication. */
export function currentStrategyPlans<T extends Pick<PlanRecord,"id"|"lineageId"|"versionNo"|"status">>(plans: readonly T[]): T[] {
  const groups = new Map<string,T[]>();
  for (const p of plans) {const key=p.lineageId ?? p.id;groups.set(key,[...(groups.get(key) ?? []),p]);}
  return [...groups.values()].flatMap(rows=>{
    const published=rows.filter(p=>p.versionNo != null).sort((a,b)=>(b.versionNo ?? 0)-(a.versionNo ?? 0));
    return published[0] ? [published[0]] : [rows.find(p=>p.status==="draft") ?? rows[0]!];
  });
}

